'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import EventTabs from '@/app/components/EventTabs';
import { loadEventAccess, canUse } from '@/app/libs/event-admin';
import {
  computeSidePoints,
  matchThruStatus,
  parseLineupIds,
  scoresFromRegs,
} from '@/app/libs/league-match';
import { eventPlaySummary } from '@/app/libs/format-presets';
import { isListable } from '@/app/libs/event-emails';
import { isNamedTeam } from '@/app/libs/league-roster';

export default function LeagueLeaderboard({
  eventId,
  initialRoundId,
  initialView,
  showEventTabs = true,
}: {
  eventId: string;
  initialRoundId?: number | null;
  initialView?: 'tonight' | 'season';
  showEventTabs?: boolean;
}) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get('view');
  const roundParam = Number(searchParams.get('round') || '');
  const view: 'tonight' | 'season' =
    viewParam === 'season' || viewParam === 'tonight'
      ? viewParam
      : initialView || 'tonight';

  const [event, setEvent] = useState<any>(null);
  const [rounds, setRounds] = useState<any[]>([]);
  const [allMatches, setAllMatches] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [lineups, setLineups] = useState<any[]>([]);
  const [regs, setRegs] = useState<any[]>([]);
  const [playerScores, setPlayerScores] = useState<
    Record<string, Record<number, number>>
  >({});
  const [isManager, setIsManager] = useState(false);
  const [loading, setLoading] = useState(true);

  const holes = Number(event?.number_of_holes) === 18 ? 18 : 9;
  const pointsPerHole = Number(event?.points_per_hole ?? 1);
  const halved = Number(event?.halved_points ?? 0.5);
  const bonus = Number(event?.match_win_bonus ?? 1);

  const selectedRoundId = useMemo(() => {
    const wanted =
      Number.isFinite(roundParam) && roundParam > 0
        ? roundParam
        : initialRoundId;
    if (wanted && rounds.some((r) => Number(r.id) === Number(wanted))) {
      return Number(wanted);
    }
    return rounds[0]?.id != null ? Number(rounds[0].id) : null;
  }, [roundParam, initialRoundId, rounds]);

  const setQuery = (next: { view?: 'tonight' | 'season'; round?: number | null }) => {
    const q = new URLSearchParams(searchParams.toString());
    const nextView = next.view ?? view;
    q.set('view', nextView);
    const rid = next.round !== undefined ? next.round : selectedRoundId;
    if (nextView === 'tonight' && rid != null) q.set('round', String(rid));
    else if (nextView === 'season') q.delete('round');
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  useEffect(() => {
    const load = async () => {
      const id = parseInt(eventId, 10);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const access = await loadEventAccess(supabase, id, user);
        setIsManager(
          !!(
            access.isCreator ||
            access.isPlatform ||
            access.allowed ||
            (access.allowed && canUse(access.perms, 'manage'))
          )
        );
      } else {
        setIsManager(false);
      }

      const { data: ev } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', id)
        .single();
      if (
        ev?.event_kind === 'league' &&
        !String(ev.scoring_type || '').trim()
      ) {
        ev.scoring_type = 'match_play';
        await supabase
          .from('tournaments')
          .update({ scoring_type: 'match_play' })
          .eq('id', id);
      }
      setEvent(ev);
      const { data: roundsData } = await supabase
        .from('event_rounds')
        .select('*')
        .eq('event_id', id)
        .order('sort_order', { ascending: true });
      setRounds(roundsData || []);
      const { data: matchRows } = await supabase
        .from('league_matches')
        .select('*')
        .eq('event_id', id);
      setAllMatches(matchRows || []);
      const { data: allResults } = await supabase
        .from('league_week_results')
        .select('*')
        .eq('event_id', id);
      setResults(allResults || []);
      const { data: regData } = await supabase
        .from('event_registrations')
        .select('*')
        .eq('event_id', id);
      setRegs(regData || []);
      setLoading(false);
    };
    load();
  }, [eventId, supabase]);

  useEffect(() => {
    const loadWeek = async () => {
      if (view !== 'tonight' || selectedRoundId == null) return;
      const id = parseInt(eventId, 10);
      const { data: lu } = await supabase
        .from('league_lineups')
        .select('*')
        .eq('event_id', id)
        .eq('round_id', selectedRoundId);
      setLineups(lu || []);
      const ids = (lu || []).flatMap((row) =>
        parseLineupIds(row.registration_ids)
      );
      const loaded: Record<string, Record<number, number>> = {};
      if (ids.length) {
        const { data: scores } = await supabase
          .from('scores')
          .select('*')
          .eq('round_id', selectedRoundId)
          .in('registration_id', ids);
        for (const s of scores || []) {
          const rid = String(s.registration_id);
          if (!loaded[rid]) loaded[rid] = {};
          loaded[rid][s.hole] = s.score;
        }
      }
      setPlayerScores(loaded);
    };
    loadWeek();
  }, [eventId, selectedRoundId, view, supabase]);

  const tonightMatches = useMemo(
    () =>
      allMatches.filter(
        (m) => Number(m.round_id) === Number(selectedRoundId)
      ),
    [allMatches, selectedRoundId]
  );

  const seasonRows = useMemo(() => {
    const names = new Set<string>();
    for (const r of regs) {
      if (!isListable(r) || !isNamedTeam(r.team_name)) continue;
      names.add(String(r.team_name).trim());
    }
    for (const m of allMatches) {
      if (m.home_team) names.add(String(m.home_team));
      if (m.away_team) names.add(String(m.away_team));
    }
    for (const row of results) {
      if (row.team_name) names.add(String(row.team_name));
    }
    const byTeam = new Map<
      string,
      { team: string; total: number; w: number; l: number; t: number }
    >();
    for (const name of names) {
      byTeam.set(name, { team: name, total: 0, w: 0, l: 0, t: 0 });
    }
    for (const row of results) {
      const cur = byTeam.get(row.team_name) || {
        team: row.team_name,
        total: 0,
        w: 0,
        l: 0,
        t: 0,
      };
      cur.total += Number(row.total || 0);
      byTeam.set(row.team_name, cur);
    }
    const matchesByRound = new Map<string, any[]>();
    for (const row of results) {
      const key = `${row.round_id}`;
      if (!matchesByRound.has(key)) matchesByRound.set(key, []);
      matchesByRound.get(key)!.push(row);
    }
    for (const row of results) {
      const cur = byTeam.get(row.team_name);
      if (!cur) continue;
      const bonusPts = Number(row.bonus || 0);
      if (bonusPts > 0) {
        cur.w += 1;
        continue;
      }
      const peers = (matchesByRound.get(String(row.round_id)) || []).filter(
        (p) => p.team_name !== row.team_name
      );
      const oppWin = peers.some((p) => Number(p.bonus || 0) > 0);
      if (oppWin) cur.l += 1;
      else cur.t += 1;
    }
    return Array.from(byTeam.values()).sort(
      (a, b) => b.total - a.total || a.team.localeCompare(b.team)
    );
  }, [results, regs, allMatches]);

  const weekRows = useMemo(() => {
    const luMap: Record<string, string[]> = {};
    for (const row of lineups) {
      luMap[row.team_name] = parseLineupIds(row.registration_ids);
    }
    const submitted: Record<string, number> = {};
    for (const r of results.filter(
      (x) => Number(x.round_id) === Number(selectedRoundId)
    )) {
      submitted[r.team_name] = Number(r.total || 0);
    }
    return tonightMatches.map((m) => {
      const homeScores = scoresFromRegs(luMap[m.home_team] || [], playerScores);
      const awayScores = m.away_team
        ? scoresFromRegs(luMap[m.away_team] || [], playerScores)
        : {};
      const status = m.away_team
        ? matchThruStatus(
            m.home_team,
            m.away_team,
            homeScores,
            awayScores,
            holes
          )
        : { header: 'Bye', thru: 0, final: false };
      let homePts = submitted[m.home_team];
      let awayPts = m.away_team ? submitted[m.away_team] : undefined;
      if (m.away_team && homePts == null && awayPts == null) {
        const liveHome = computeSidePoints(
          homeScores,
          awayScores,
          holes,
          pointsPerHole,
          halved,
          bonus
        );
        const liveAway = computeSidePoints(
          awayScores,
          homeScores,
          holes,
          pointsPerHole,
          halved,
          bonus
        );
        if (status.thru > 0) {
          homePts = liveHome.total;
          awayPts = liveAway.total;
        }
      }
      return {
        ...m,
        status: status.header,
        thru: status.thru,
        homePts: homePts ?? null,
        awayPts: awayPts ?? null,
      };
    });
  }, [
    tonightMatches,
    lineups,
    playerScores,
    results,
    selectedRoundId,
    holes,
    pointsPerHole,
    halved,
    bonus,
  ]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        Loading leaderboard...
      </div>
    );
  }

  const summary = eventPlaySummary(event);
  const selectedRound = rounds.find(
    (r) => Number(r.id) === Number(selectedRoundId)
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
        {showEventTabs && isManager ? (
          <EventTabs eventId={eventId} variant="dayof" active="leaderboard" />
        ) : (
          <div className="flex flex-wrap items-center gap-3 mb-6 text-sm">
            <Link
              href={`/event/${eventId}`}
              className="text-gray-400 hover:text-white"
            >
              ← Event
            </Link>
            <span className="text-gray-600">·</span>
            <Link
              href="/dashboard/play"
              className="text-gray-400 hover:text-white"
            >
              My Events
            </Link>
          </div>
        )}
        <h1 className="text-4xl font-bold mb-2">{event?.name}</h1>
        {summary ? (
          <p className="text-gray-400 mb-6">{summary}</p>
        ) : (
          <p className="text-gray-400 mb-6">League standings</p>
        )}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            type="button"
            onClick={() => setQuery({ view: 'tonight' })}
            className={`px-4 py-2 rounded-2xl text-sm font-medium ${
              view === 'tonight'
                ? 'bg-white text-black'
                : 'bg-gray-700 text-gray-300'
            }`}
          >
            Tonight
          </button>
          <button
            type="button"
            onClick={() => setQuery({ view: 'season' })}
            className={`px-4 py-2 rounded-2xl text-sm font-medium ${
              view === 'season'
                ? 'bg-white text-black'
                : 'bg-gray-700 text-gray-300'
            }`}
          >
            Season
          </button>
        </div>

        {view === 'tonight' && rounds.length > 1 && (
          <div className="mb-6 w-full sm:w-64">
            <label className="block text-sm text-gray-400 mb-2">Week</label>
            <select
              value={selectedRoundId ?? ''}
              onChange={(e) =>
                setQuery({
                  view: 'tonight',
                  round: parseInt(e.target.value, 10),
                })
              }
              className="w-full bg-gray-800 border border-gray-600 rounded-2xl px-5 py-3"
            >
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {view === 'season' ? (
          <div className="bg-gray-800 rounded-3xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-400 border-b border-gray-700">
                  <th className="px-5 py-3">Team</th>
                  <th className="px-5 py-3">W-L-T</th>
                  <th className="px-5 py-3 text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {seasonRows.map((row, i) => (
                  <tr key={row.team} className="border-b border-gray-800">
                    <td className="px-5 py-3">
                      {i + 1}. {row.team}
                    </td>
                    <td className="px-5 py-3 text-gray-400">
                      {row.w}-{row.l}-{row.t}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold">
                      {Number(row.total).toFixed(1)}
                    </td>
                  </tr>
                ))}
                {seasonRows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-5 py-8 text-gray-500">
                      No teams yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-3">
            {selectedRound && (
              <p className="text-sm text-teal-400">
                {selectedRound.name}
              </p>
            )}
            {weekRows.map((m) => (
              <div key={m.id} className="bg-gray-800 rounded-2xl px-5 py-4">
                {m.away_team ? (
                  <>
                    <div className="font-semibold">
                      {m.home_team} vs {m.away_team}
                    </div>
                    <div className="text-sm text-emerald-400 mt-1">
                      {m.status}
                    </div>
                    <div className="text-sm text-gray-400 mt-1">
                      Week points:{' '}
                      {m.homePts != null ? Number(m.homePts).toFixed(1) : '—'} /{' '}
                      {m.awayPts != null ? Number(m.awayPts).toFixed(1) : '—'}
                    </div>
                  </>
                ) : (
                  <div className="text-gray-400">{m.home_team} — bye</div>
                )}
              </div>
            ))}
            {weekRows.length === 0 && (
              <p className="text-gray-400">No matches this week.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
