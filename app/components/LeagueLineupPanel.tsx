'use client';

import { useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { isListableReg } from '@/app/libs/event-emails';
import { parseLineupIds } from '@/app/libs/league-match';
import { applyAutoCheckinForRound } from '@/app/libs/league-auto-checkin';
import {
  captainOfTeam,
  isCaptainOfTeam,
  teamMembers,
} from '@/app/libs/league-roster';

export default function LeagueLineupPanel({
  event,
  rounds,
  registrations,
  isAdmin,
  user,
  filterTeam,
}: {
  event: any;
  rounds: any[];
  registrations: any[];
  isAdmin: boolean;
  user: { id: string; email?: string | null } | null;
  filterTeam?: string | null;
}) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const [roundId, setRoundId] = useState<number | null>(
    rounds[0]?.id != null ? Number(rounds[0].id) : null
  );
  const [lineups, setLineups] = useState<Record<string, string[]>>({});
  const [lockedTeams, setLockedTeams] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);

  const need = Math.max(1, Number(event?.players_per_match) || 2);
  const eventId = Number(event?.id);

  const teams = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const r of registrations || []) {
      if (!isListableReg(r)) continue;
      const name = String(r.team_name || '').trim();
      if (!name || name.toLowerCase() === 'individual') continue;
      if (filterTeam && name !== filterTeam) continue;
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(r);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, members]) => ({ name, members }));
  }, [registrations, filterTeam]);

  const isCaptainOf = (teamName: string) =>
    isCaptainOfTeam(teamMembers(registrations, teamName), user);

  useEffect(() => {
    if (roundId == null && rounds[0]?.id != null) {
      setRoundId(Number(rounds[0].id));
    }
  }, [rounds, roundId]);

  useEffect(() => {
    const load = async () => {
      if (!eventId || roundId == null) return;
      const { data } = await supabase
        .from('league_lineups')
        .select('*')
        .eq('event_id', eventId)
        .eq('round_id', roundId);
      const next: Record<string, string[]> = {};
      for (const row of data || []) {
        next[row.team_name] = parseLineupIds(row.registration_ids);
      }
      setLineups(next);

      const allIds = Object.values(next).flat();
      const locked = new Set<string>();
      if (allIds.length) {
        const { data: scoreRows } = await supabase
          .from('scores')
          .select('registration_id')
          .eq('round_id', roundId)
          .in('registration_id', allIds);
        const scored = new Set(
          (scoreRows || []).map((s) => String(s.registration_id))
        );
        for (const [team, ids] of Object.entries(next)) {
          if (ids.some((id) => scored.has(String(id)))) locked.add(team);
        }
      }
      setLockedTeams(locked);
    };
    load();
  }, [eventId, roundId, supabase]);

  const save = async (team: string, ids: string[]) => {
    const unique = ids.filter(Boolean);
    if (unique.length !== need) return;
    if (new Set(unique).size !== need) {
      alert('Pick different players.');
      return;
    }
    setSaving(team);
    const { error } = await supabase.from('league_lineups').upsert(
      {
        event_id: eventId,
        round_id: roundId,
        team_name: team,
        registration_ids: unique,
      },
      { onConflict: 'event_id,round_id,team_name' }
    );
    if (error) {
      setSaving(null);
      alert(error.message);
      return;
    }
    await applyAutoCheckinForRound(supabase, event, Number(roundId));
    setSaving(null);
  };

  const setSlot = (team: string, index: number, value: string) => {
    const cur = [...(lineups[team] || [])];
    while (cur.length < need) cur.push('');
    cur[index] = value;
    const next = cur.slice(0, need);
    setLineups((prev) => ({ ...prev, [team]: next }));
    if (next.filter(Boolean).length === need) {
      save(team, next);
    }
  };

  if (!rounds.length) {
    return (
      <p className="text-sm text-gray-400">Add a week before setting lineups.</p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm text-gray-400 mb-2">Week</label>
        <select
          value={roundId ?? ''}
          onChange={(e) => setRoundId(parseInt(e.target.value, 10))}
          className="w-full bg-gray-800 border border-gray-600 rounded-2xl px-5 py-4"
        >
          {rounds.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      {teams.map((team) => {
        const locked = lockedTeams.has(team.name);
        const canEdit = !locked && (isAdmin || isCaptainOf(team.name));
        const captainId = captainOfTeam(team.members)?.id;
        const selected = [...(lineups[team.name] || [])];
        while (selected.length < need) selected.push('');
        return (
          <div key={team.name} className="bg-gray-900 rounded-2xl px-5 py-4">
            <div className="font-medium mb-1">{team.name}</div>
            <div className="text-xs text-gray-500 mb-3">
              {need} players this week
              {locked ? ' · locked (scores submitted)' : ''}
              {saving === team.name ? ' · saving…' : ''}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: need }, (_, i) => (
                <select
                  key={i}
                  disabled={!canEdit}
                  value={selected[i] || ''}
                  onChange={(e) => setSlot(team.name, i, e.target.value)}
                  className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 disabled:opacity-50"
                >
                  <option value="">Player {i + 1}</option>
                  {team.members.map((m) => {
                    const id = String(m.id);
                    const taken =
                      selected.includes(id) && selected[i] !== id;
                    return (
                      <option key={id} value={id} disabled={taken}>
                        {m.player_name || 'Player'}
                        {String(captainId) === String(m.id) ? ' (C)' : ''}
                      </option>
                    );
                  })}
                </select>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
