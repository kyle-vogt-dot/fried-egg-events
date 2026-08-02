'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

type Slot = 'A' | 'B';

type TeamRow = {
  team_name: string;
  player_count: number;
  player_names: string[];
  registration_ids: number[];
  registration_rows: any[];
  pairing_hole: number | null;
  pairing_slot: Slot | null;
  first_registered_at: string;
};

function formatPairing(hole: number | null, slot: Slot | null) {
  if (!hole || !slot) return '';
  return `${hole} - ${slot}`;
}

function parsePairing(value: string): { hole: number; slot: Slot } | null {
  const cleaned = value.trim().toUpperCase().replace(/\s+/g, ' ');
  const match = cleaned.match(/^(\d+)\s*-?\s*([AB])$/);
  if (!match) return null;
  const hole = parseInt(match[1], 10);
  const slot = match[2] as Slot;
  if (!hole || (slot !== 'A' && slot !== 'B')) return null;
  return { hole, slot };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatRoundTime(startTime: string | null | undefined) {
  if (!startTime) return '';
  const parts = String(startTime).slice(0, 5).split(':');
  if (parts.length < 2) return String(startTime);
  let h = parseInt(parts[0], 10);
  const m = parts[1];
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

function getRoundPairing(reg: any, roundId: number | null) {
  if (!roundId) {
    return {
      hole: reg.pairing_hole ?? null,
      slot: (reg.pairing_slot === 'A' || reg.pairing_slot === 'B'
        ? reg.pairing_slot
        : null) as Slot | null,
    };
  }
  const map = reg.round_pairings || {};
  const entry = map[String(roundId)] || map[roundId];
  if (entry?.hole && (entry.slot === 'A' || entry.slot === 'B')) {
    return { hole: Number(entry.hole), slot: entry.slot as Slot };
  }
  return { hole: null, slot: null };
}

export default function EventPairingsPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [event, setEvent] = useState<any>(null);
  const [rounds, setRounds] = useState<any[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState<number | null>(null);
  const [allRegs, setAllRegs] = useState<any[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const numHoles = useMemo(() => {
    const n = Number(event?.number_of_holes || 9);
    return n === 18 ? 18 : 9;
  }, [event]);

  const availableSlots = useMemo(() => {
    const slots: string[] = [];
    for (let h = 1; h <= numHoles; h++) {
      slots.push(`${h} - A`);
      slots.push(`${h} - B`);
    }
    return slots;
  }, [numHoles]);

  const selectedRound = useMemo(
    () => rounds.find((r) => r.id === selectedRoundId) || null,
    [rounds, selectedRoundId]
  );

  const buildTeamsForRound = (regs: any[], roundId: number | null) => {
    let filtered = regs;

    if (roundId != null) {
      filtered = regs.filter((r) => {
        const ids: number[] = r.selected_round_ids || [];
        // If no round list stored, include them only when event has a single round
        if (!ids.length) return rounds.length <= 1;
        return ids.includes(roundId);
      });
    }

    const byTeam: Record<string, any[]> = {};
    for (const r of filtered) {
      const key = r.team_name || `Individual:${r.id}`;
      if (!byTeam[key]) byTeam[key] = [];
      byTeam[key].push(r);
    }

    const teamRows: TeamRow[] = Object.entries(byTeam).map(([key, players]) => {
      const first = players[0];
      const { hole, slot } = getRoundPairing(first, roundId);

      const displayName = key.startsWith('Individual:')
        ? first.player_name || 'Individual'
        : key;

      return {
        team_name: displayName,
        player_count: players.length,
        player_names: players.map((p) => p.player_name),
        registration_ids: players.map((p) => p.id),
        registration_rows: players,
        pairing_hole: hole,
        pairing_slot: slot,
        first_registered_at: first.created_at,
      };
    });

    teamRows.sort(
      (a, b) =>
        new Date(a.first_registered_at).getTime() -
        new Date(b.first_registered_at).getTime()
    );

    return teamRows;
  };

  const load = async () => {
    setLoading(true);
    setMessage(null);

    const id = parseInt(eventId);

    const { data: ev } = await supabase
      .from('tournaments')
      .select('*')
      .eq('id', id)
      .single();
    setEvent(ev);

    const { data: roundsData } = await supabase
      .from('event_rounds')
      .select('*')
      .eq('event_id', id)
      .order('sort_order', { ascending: true });

    const roundList = roundsData || [];
    setRounds(roundList);

    const { data: regs } = await supabase
      .from('event_registrations')
      .select('*')
      .eq('event_id', id)
      .eq('paid', true)
      .order('created_at', { ascending: true });

    setAllRegs(regs || []);

    // Default selected round
    let roundId = selectedRoundId;
    if (roundId == null && roundList.length > 0) {
      roundId = roundList[0].id;
      setSelectedRoundId(roundId);
    }

    const teamRows = buildTeamsForRound(regs || [], roundId);
    setTeams(teamRows);

    const nextDraft: Record<string, string> = {};
    for (const t of teamRows) {
      nextDraft[t.team_name] = formatPairing(t.pairing_hole, t.pairing_slot);
    }
    setDraft(nextDraft);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // Rebuild team list when round changes
  useEffect(() => {
    if (loading) return;
    const teamRows = buildTeamsForRound(allRegs, selectedRoundId);
    setTeams(teamRows);

    const nextDraft: Record<string, string> = {};
    for (const t of teamRows) {
      nextDraft[t.team_name] = formatPairing(t.pairing_hole, t.pairing_slot);
    }
    setDraft(nextDraft);
    setMessage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoundId]);

  const applyAssignments = (
    orderedTeams: TeamRow[],
    mode: 'order' | 'random'
  ) => {
    const list = mode === 'random' ? shuffle(orderedTeams) : orderedTeams;
    const next: Record<string, string> = {};

    list.forEach((team, index) => {
      if (index >= availableSlots.length) {
        next[team.team_name] = '';
        return;
      }
      next[team.team_name] = availableSlots[index];
    });

    for (const t of teams) {
      if (!(t.team_name in next)) next[t.team_name] = draft[t.team_name] || '';
    }

    setDraft(next);
    setMessage(
      mode === 'random'
        ? 'Randomized for this round (not saved yet — click Save Pairings)'
        : 'Assigned in registration order for this round (not saved yet — click Save Pairings)'
    );
  };

  const handleManualChange = (teamName: string, value: string) => {
    const parsed = value.trim() === '' ? null : parsePairing(value);

    setDraft((prev) => {
      const next = { ...prev };

      if (!parsed) {
        next[teamName] = value;
        return next;
      }

      const targetLabel = formatPairing(parsed.hole, parsed.slot);

      const occupant = Object.entries(next).find(([name, label]) => {
        if (name === teamName) return false;
        const p = parsePairing(label);
        return p?.hole === parsed.hole && p?.slot === parsed.slot;
      });

      if (occupant) {
        const oldValue = next[teamName] || '';
        next[occupant[0]] = oldValue;
        next[teamName] = targetLabel;
        setMessage(
          `Swapped ${teamName} ↔ ${occupant[0]} (${targetLabel}). Click Save Pairings.`
        );
      } else {
        next[teamName] = targetLabel;
        setMessage(`Set ${teamName} → ${targetLabel}. Click Save Pairings.`);
      }

      return next;
    });
  };

  const savePairings = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const used = new Map<string, string>();
      for (const [teamName, label] of Object.entries(draft)) {
        if (!label.trim()) continue;
        const parsed = parsePairing(label);
        if (!parsed) {
          alert(
            `Invalid pairing for ${teamName}: "${label}". Use format like 1 - A`
          );
          setSaving(false);
          return;
        }
        if (parsed.hole < 1 || parsed.hole > numHoles) {
          alert(`Hole must be 1–${numHoles} (${teamName})`);
          setSaving(false);
          return;
        }
        const key = `${parsed.hole}-${parsed.slot}`;
        if (used.has(key)) {
          alert(
            `Duplicate slot ${formatPairing(parsed.hole, parsed.slot)}: ${used.get(key)} and ${teamName}`
          );
          setSaving(false);
          return;
        }
        used.set(key, teamName);
      }

      const roundKey =
        selectedRoundId != null ? String(selectedRoundId) : null;

      for (const team of teams) {
        const label = (draft[team.team_name] || '').trim();
        const parsed = label ? parsePairing(label) : null;

        for (const reg of team.registration_rows) {
          const existing = { ...(reg.round_pairings || {}) };

          if (roundKey) {
            if (parsed) {
              existing[roundKey] = {
                hole: parsed.hole,
                slot: parsed.slot,
              };
            } else {
              delete existing[roundKey];
            }
          }

          const payload: any = {
            round_pairings: existing,
            // Keep flat fields in sync with the round currently being edited
            // so Registered Players can still read a simple pairing
            pairing_hole: parsed?.hole ?? null,
            pairing_slot: parsed?.slot ?? null,
          };

          const { error } = await supabase
            .from('event_registrations')
            .update(payload)
            .eq('id', reg.id);

          if (error) throw error;

          // Keep local copy in sync for next save
          reg.round_pairings = existing;
          reg.pairing_hole = payload.pairing_hole;
          reg.pairing_slot = payload.pairing_slot;
        }
      }

      setMessage(
        `✅ Pairings saved${
          selectedRound
            ? ` for ${selectedRound.name}`
            : ''
        }`
      );
      await load();
    } catch (err: any) {
      console.error(err);
      alert('Failed to save pairings: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const clearAll = () => {
    const next: Record<string, string> = {};
    for (const t of teams) next[t.team_name] = '';
    setDraft(next);
    setMessage('Cleared all pairings for this round (not saved yet)');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        Loading pairings...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-8">
        <button
          onClick={() => router.back()}
          className="text-gray-400 hover:text-white"
        >
          ← Back
        </button>

        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold">{event?.name}</h1>
            <p className="text-gray-400 mt-1">
              Pairings · {numHoles} holes · up to {numHoles * 2} teams (A/B)
              {selectedRound
                ? ` · ${selectedRound.name}${
                    selectedRound.start_time
                      ? ` (${formatRoundTime(selectedRound.start_time)})`
                      : ''
                  }`
                : ''}
            </p>
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            {rounds.length > 0 && (
              <select
                value={selectedRoundId ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedRoundId(v ? parseInt(v, 10) : null);
                }}
                className="bg-gray-800 border border-gray-600 rounded-2xl px-5 py-3 min-w-[200px]"
              >
                {rounds.map((r) => {
                  const t = formatRoundTime(r.start_time);
                  return (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {t ? ` · ${t}` : ''}
                    </option>
                  );
                })}
              </select>
            )}

            <button
              onClick={() => applyAssignments(teams, 'order')}
              className="bg-gray-700 hover:bg-gray-600 px-5 py-3 rounded-2xl font-medium"
            >
              Auto (order)
            </button>
            <button
              onClick={() => applyAssignments(teams, 'random')}
              className="bg-indigo-600 hover:bg-indigo-700 px-5 py-3 rounded-2xl font-medium"
            >
              Randomize
            </button>
            <button
              onClick={clearAll}
              className="bg-gray-700 hover:bg-gray-600 px-5 py-3 rounded-2xl font-medium"
            >
              Clear
            </button>
            <button
              onClick={savePairings}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 px-5 py-3 rounded-2xl font-medium"
            >
              {saving ? 'Saving...' : 'Save Pairings'}
            </button>
          </div>
        </div>

        {message && (
          <div className="bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4 text-sm text-gray-300">
            {message}
          </div>
        )}

        {teams.length === 0 ? (
          <div className="bg-gray-800 rounded-3xl p-12 text-center text-gray-400">
            No paid teams for this round.
            {rounds.length > 1
              ? ' Switch rounds above, or wait for registrations that include this round.'
              : ' Pairings only use completed (paid) registrations.'}
          </div>
        ) : (
          <div className="bg-gray-800 rounded-3xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400 text-sm">
                    <th className="py-4 px-6">Team</th>
                    <th className="py-4 px-6">Players</th>
                    <th className="py-4 px-6 w-48">Pairing</th>
                    <th className="py-4 px-6">Quick pick</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team) => (
                    <tr
                      key={team.team_name}
                      className="border-b border-gray-700/60"
                    >
                      <td className="py-4 px-6 font-medium">
                        {team.team_name}
                        <div className="text-xs text-gray-500 mt-1">
                          {team.player_names.join(', ')}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-gray-400">
                        {team.player_count}
                      </td>
                      <td className="py-4 px-6">
                        <input
                          value={draft[team.team_name] ?? ''}
                          onChange={(e) =>
                            handleManualChange(team.team_name, e.target.value)
                          }
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (!v) return;
                            const parsed = parsePairing(v);
                            if (parsed) {
                              handleManualChange(
                                team.team_name,
                                formatPairing(parsed.hole, parsed.slot)
                              );
                            }
                          }}
                          placeholder="e.g. 1 - A"
                          className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3"
                        />
                      </td>
                      <td className="py-4 px-6">
                        <select
                          value={draft[team.team_name] || ''}
                          onChange={(e) =>
                            handleManualChange(team.team_name, e.target.value)
                          }
                          className="bg-gray-900 border border-gray-600 rounded-xl px-4 py-3"
                        >
                          <option value="">—</option>
                          {availableSlots.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="text-sm text-gray-500 space-y-1">
          <p>
            • Choose a <strong>round</strong> first — only teams signed up for
            that round are listed.
          </p>
          <p>
            • Pairings are stored <strong>per round</strong> (round 1’s 1-A is
            independent of round 2).
          </p>
          <p>
            • <strong>Auto / Randomize / swap</strong> only affect the selected
            round. Always click <strong>Save Pairings</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}