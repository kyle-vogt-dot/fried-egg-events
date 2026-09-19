'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import EventTabs from '@/app/components/EventTabs';
import { loadEventAccess, canUse } from '@/app/libs/event-admin';
import {
  holeMark,
  matchPlayBoardStatus,
  parseLineupIds,
  scoresFromRegs,
  type MatchPlayBoard,
} from '@/app/libs/league-match';
import { eventPlaySummary } from '@/app/libs/format-presets';
import { isListable } from '@/app/libs/event-emails';
import { isNamedTeam } from '@/app/libs/league-roster';

function defaultHoles(numHoles: number) {
  return Array.from({ length: numHoles }, (_, i) => ({
    hole: i + 1,
    par: 4,
  }));
}

function getHolesFromCourseData(courseData: any, numHoles: number) {
  if (!courseData) return defaultHoles(numHoles);
  const root = courseData.course || courseData.data || courseData;
  let raw: any[] = [];
  if (Array.isArray(root?.scorecard) && root.scorecard.length > 0) {
    raw = root.scorecard;
  } else if (Array.isArray(root?.holes) && root.holes.length > 0) {
    raw = root.holes;
  }
  if (!raw.length) return defaultHoles(numHoles);
  const holes = raw.map((h: any, i: number) => ({
    hole: Number(h.hole ?? h.Hole ?? i + 1),
    par: Number(h.par ?? h.Par ?? 0) > 0 ? Number(h.par ?? h.Par) : 4,
  }));
  const sliced = holes.slice(0, numHoles);
  return sliced.length ? sliced : defaultHoles(numHoles);
}

function ScoreMark({
  score,
  par,
}: {
  score: number | null | undefined;
  par: number;
}) {
  if (score == null || score <= 0) {
    return <span className="text-gray-500">—</span>;
  }
  const diff = score - par;
  if (diff <= -2) {
    return (
      <span className="inline-flex items-center justify-center w-10 h-10 rounded-full border-2 border-emerald-400">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full border-2 border-emerald-300 text-emerald-300 font-semibold text-sm">
          {score}
        </span>
      </span>
    );
  }
  if (diff === -1) {
    return (
      <span className="inline-flex items-center justify-center w-10 h-10 rounded-full border-2 border-emerald-400 text-emerald-300 font-semibold text-sm">
        {score}
      </span>
    );
  }
  if (diff === 0) {
    return (
      <span className="inline-flex items-center justify-center w-10 h-10 text-white font-semibold text-sm">
        {score}
      </span>
    );
  }
  if (diff === 1) {
    return (
      <span className="inline-flex items-center justify-center w-10 h-10 border-2 border-orange-400 text-orange-300 font-semibold text-sm">
        {score}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center w-10 h-10 border-2 border-red-400">
      <span className="inline-flex items-center justify-center w-7 h-7 border-2 border-red-300 text-red-300 font-semibold text-sm">
        {score}
      </span>
    </span>
  );
}

function holeFill(mark: 'W' | 'L' | 'H' | null) {
  if (mark === 'W') return 'bg-emerald-500/20';
  if (mark === 'H') return 'bg-amber-500/20';
  return '';
}

function statusTone(label: string) {
  if (!label) return 'text-gray-600';
  if (label === 'AS') return 'text-gray-300';
  if (label.includes('DN')) return 'text-gray-400';
  return 'text-emerald-400';
}

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
  const [openMatchId, setOpenMatchId] = useState<string | number | null>(null);

  const holes = Number(event?.number_of_holes) === 18 ? 18 : 9;
  const courseHoles = useMemo(
    () => getHolesFromCourseData(event?.course_data, holes),
    [event?.course_data, holes]
  );

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
    const namesFor = (ids: string[]) =>
      ids
        .map((id) => regs.find((r) => String(r.id) === String(id))?.player_name)
        .filter(Boolean)
        .join(' · ');
    return tonightMatches.map((m) => {
      const homeIds = luMap[m.home_team] || [];
      const awayIds = m.away_team ? luMap[m.away_team] || [] : [];
      const homeScores = scoresFromRegs(homeIds, playerScores);
      const awayScores = m.away_team
        ? scoresFromRegs(awayIds, playerScores)
        : {};
      return {
        ...m,
        homeScores,
        awayScores,
        homeNames: namesFor(homeIds),
        awayNames: namesFor(awayIds),
        board: m.away_team
          ? matchPlayBoardStatus(homeScores, awayScores, holes)
          : null,
      };
    });
  }, [tonightMatches, lineups, playerScores, regs, holes]);

  const openMatch = useMemo(
    () => weekRows.find((m) => m.id === openMatchId) || null,
    [weekRows, openMatchId]
  );

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
            {weekRows.map((m) =>
              m.away_team && m.board ? (
                <TonightMatchCard
                  key={m.id}
                  homeTeam={m.home_team}
                  awayTeam={m.away_team}
                  homeNames={m.homeNames}
                  awayNames={m.awayNames}
                  board={m.board}
                  holes={holes}
                  homeScores={m.homeScores}
                  awayScores={m.awayScores}
                  onOpen={() => setOpenMatchId(m.id)}
                />
              ) : (
                <div
                  key={m.id}
                  className="w-full bg-gray-800 rounded-2xl px-5 py-4 text-gray-400"
                >
                  {m.home_team} — bye
                </div>
              )
            )}
            {weekRows.length === 0 && (
              <p className="text-gray-400">No matches this week.</p>
            )}
          </div>
        )}
      </div>

      {view === 'tonight' && openMatch?.away_team && openMatch.board && (
        <MatchScorecardModal
          homeTeam={openMatch.home_team}
          awayTeam={openMatch.away_team}
          homeNames={openMatch.homeNames}
          awayNames={openMatch.awayNames}
          board={openMatch.board}
          holes={holes}
          courseHoles={courseHoles}
          homeScores={openMatch.homeScores}
          awayScores={openMatch.awayScores}
          onClose={() => setOpenMatchId(null)}
        />
      )}
    </div>
  );
}

function TonightMatchCard({
  homeTeam,
  awayTeam,
  homeNames,
  awayNames,
  board,
  holes,
  homeScores,
  awayScores,
  onOpen,
}: {
  homeTeam: string;
  awayTeam: string;
  homeNames: string;
  awayNames: string;
  board: MatchPlayBoard;
  holes: number;
  homeScores: Record<number, number>;
  awayScores: Record<number, number>;
  onOpen: () => void;
}) {
  const wash =
    board.leader === 'home'
      ? 'linear-gradient(90deg, rgba(16,185,129,0.20) 0%, rgba(16,185,129,0.06) 42%, rgba(31,41,55,0) 62%)'
      : board.leader === 'away'
        ? 'linear-gradient(90deg, rgba(31,41,55,0) 38%, rgba(16,185,129,0.06) 58%, rgba(16,185,129,0.20) 100%)'
        : undefined;
  const arrow =
    board.arrow === 'left' ? '←' : board.arrow === 'right' ? '→' : '—';

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left bg-gray-800 rounded-2xl px-4 sm:px-5 py-4 overflow-hidden"
      style={{
        backgroundColor: 'rgb(31 41 55)',
        backgroundImage: wash,
      }}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5">
        <div className="font-semibold truncate">{homeTeam}</div>
        <div className="flex items-center justify-center gap-2 sm:gap-3 tabular-nums whitespace-nowrap text-sm font-semibold">
          <span className={statusTone(board.homeStatus)}>
            {board.homeStatus || '\u00a0'}
          </span>
          <span className="text-gray-500 font-normal">{arrow}</span>
          {!board.final && board.thru > 0 ? (
            <span className="text-gray-400 font-normal text-xs sm:text-sm">
              thru {board.thru}
            </span>
          ) : null}
          <span className={statusTone(board.awayStatus)}>
            {board.awayStatus || '\u00a0'}
          </span>
        </div>
        <div className="font-semibold truncate text-right">{awayTeam}</div>
        <div className="text-xs text-gray-400 truncate">{homeNames || ' '}</div>
        <div />
        <div className="text-xs text-gray-400 truncate text-right">
          {awayNames || ' '}
        </div>
      </div>
      <div className="mt-3 flex gap-0.5" aria-hidden>
        {Array.from({ length: holes }, (_, i) => {
          const h = i + 1;
          const both =
            Number(homeScores[h] || 0) > 0 && Number(awayScores[h] || 0) > 0;
          return (
            <div
              key={h}
              className={`h-1.5 flex-1 rounded-full ${
                both ? 'bg-emerald-500/80' : 'bg-gray-700'
              }`}
            />
          );
        })}
      </div>
    </button>
  );
}

function MatchScorecardModal({
  homeTeam,
  awayTeam,
  homeNames,
  awayNames,
  board,
  holes,
  courseHoles,
  homeScores,
  awayScores,
  onClose,
}: {
  homeTeam: string;
  awayTeam: string;
  homeNames: string;
  awayNames: string;
  board: MatchPlayBoard;
  holes: number;
  courseHoles: { hole: number; par: number }[];
  homeScores: Record<number, number>;
  awayScores: Record<number, number>;
  onClose: () => void;
}) {
  const arrow =
    board.arrow === 'left' ? '←' : board.arrow === 'right' ? '→' : '—';
  const holeNums = Array.from({ length: holes }, (_, i) => i + 1);

  const sideRow = (
    team: string,
    names: string,
    myScores: Record<number, number>,
    oppScores: Record<number, number>,
    status: string
  ) => (
    <tr>
      <td className="py-2 px-3 font-medium align-middle min-w-[8rem]">
        <div>{team}</div>
        {status ? (
          <div className={`text-sm mt-0.5 ${statusTone(status)}`}>{status}</div>
        ) : null}
        {names ? (
          <div className="text-xs text-gray-400 mt-0.5">{names}</div>
        ) : null}
      </td>
      {holeNums.map((h) => {
        const score = Number(myScores[h] || 0);
        const opp = Number(oppScores[h] || 0);
        const par = courseHoles[h - 1]?.par || 4;
        return (
          <td
            key={h}
            className={`text-center py-2 px-1 ${holeFill(holeMark(score, opp))}`}
          >
            <div className="flex justify-center">
              <ScoreMark score={score > 0 ? score : null} par={par} />
            </div>
          </td>
        );
      })}
    </tr>
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-5 md:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-bold">
              {homeTeam} vs {awayTeam}
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              <span className={statusTone(board.homeStatus)}>
                {board.homeStatus || '—'}
              </span>
              <span className="mx-2 text-gray-500">{arrow}</span>
              {!board.final && board.thru > 0 ? (
                <span className="mr-2">thru {board.thru}</span>
              ) : null}
              <span className={statusTone(board.awayStatus)}>
                {board.awayStatus || '—'}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white text-sm"
          >
            Close
          </button>
        </div>
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full border-collapse min-w-[520px]">
            <thead>
              <tr className="border-b border-gray-700 bg-gray-900">
                <th className="text-left py-2 px-3 font-medium">Team</th>
                {holeNums.map((h) => (
                  <th
                    key={h}
                    className="text-center py-2 px-1 font-medium text-sm text-gray-300"
                  >
                    {h}
                  </th>
                ))}
              </tr>
              <tr className="text-xs text-gray-500 border-b border-gray-700">
                <td className="py-1 px-3">Par</td>
                {holeNums.map((h) => (
                  <td key={h} className="text-center py-1">
                    {courseHoles[h - 1]?.par || 4}
                  </td>
                ))}
              </tr>
            </thead>
            <tbody>
              {sideRow(
                homeTeam,
                homeNames,
                homeScores,
                awayScores,
                board.homeStatus
              )}
              <tr aria-hidden>
                <td colSpan={holes + 1} className="p-0 h-2 bg-transparent" />
              </tr>
              {sideRow(
                awayTeam,
                awayNames,
                awayScores,
                homeScores,
                board.awayStatus
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
