'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import {
  computeSidePoints,
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

const MARK = 'inline-flex items-center justify-center w-10 h-10 box-border';

function ScoreMark({
  score,
  par,
}: {
  score: number | null | undefined;
  par: number;
}) {
  if (score == null || score <= 0) {
    return <span className={`${MARK} text-gray-500`}>—</span>;
  }
  const diff = score - par;
  if (diff <= -2) {
    return (
      <span className={`${MARK} rounded-full border-2 border-emerald-400`}>
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full border-2 border-emerald-300 text-emerald-300 font-semibold text-sm">
          {score}
        </span>
      </span>
    );
  }
  if (diff === -1) {
    return (
      <span
        className={`${MARK} rounded-full border-2 border-emerald-400 text-emerald-300 font-semibold text-sm`}
      >
        {score}
      </span>
    );
  }
  if (diff === 0) {
    return (
      <span className={`${MARK} text-white font-semibold text-sm`}>{score}</span>
    );
  }
  if (diff === 1) {
    return (
      <span
        className={`${MARK} border-2 border-orange-400 text-orange-300 font-semibold text-sm`}
      >
        {score}
      </span>
    );
  }
  return (
    <span className={`${MARK} border-2 border-red-400`}>
      <span className="inline-flex items-center justify-center w-6 h-6 border-2 border-red-300 text-red-300 font-semibold text-sm">
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
  embedded = false,
}: {
  eventId: string;
  initialRoundId?: number | null;
  initialView?: 'tonight' | 'season';
  embedded?: boolean;
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
  const [loading, setLoading] = useState(true);
  const [openMatchId, setOpenMatchId] = useState<string | number | null>(null);

  const holes = Number(event?.number_of_holes) === 18 ? 18 : 9;
  const pointsPerHole = Number(event?.points_per_hole ?? 1);
  const halved = Number(event?.halved_points ?? 0.5);
  const bonus = Number(event?.match_win_bonus ?? 1);
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
    const today = new Date().toISOString().slice(0, 10);
    const todayRound = rounds.find(
      (r) => String(r.date || '').slice(0, 10) === today
    );
    if (todayRound?.id != null) return Number(todayRound.id);
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
    const teamKey = (s: any) => String(s || '').trim();
    const names = new Set<string>();
    for (const r of regs) {
      if (!isListable(r) || !isNamedTeam(r.team_name)) continue;
      names.add(teamKey(r.team_name));
    }
    for (const m of allMatches) {
      if (m.home_team) names.add(teamKey(m.home_team));
      if (m.away_team) names.add(teamKey(m.away_team));
    }
    for (const row of results) {
      if (row.team_name) names.add(teamKey(row.team_name));
    }

    const weekPts = new Map<string, Map<string, number>>();
    const weekBonus = new Map<string, Map<string, number>>();
    for (const row of results) {
      const team = teamKey(row.team_name);
      if (!team) continue;
      names.add(team);
      const rid = String(row.round_id);
      const ptsMap = weekPts.get(team) || new Map<string, number>();
      ptsMap.set(rid, (ptsMap.get(rid) || 0) + Number(row.total || 0));
      weekPts.set(team, ptsMap);
      const bMap = weekBonus.get(team) || new Map<string, number>();
      bMap.set(rid, (bMap.get(rid) || 0) + Number(row.bonus || 0));
      weekBonus.set(team, bMap);
    }

    const roundIds = rounds.map((r) => String(r.id));
    const extraRoundIds = new Set<string>();
    for (const byRound of weekPts.values()) {
      for (const rid of byRound.keys()) {
        if (!roundIds.includes(rid)) extraRoundIds.add(rid);
      }
    }
    const allRoundIds = [...roundIds, ...extraRoundIds];

    const rows: {
      team: string;
      total: number;
      w: number;
      l: number;
      t: number;
    }[] = [];
    for (const name of names) {
      if (!name) continue;
      const byRound = weekPts.get(name) || new Map<string, number>();
      const bByRound = weekBonus.get(name) || new Map<string, number>();
      let total = 0;
      let w = 0;
      let l = 0;
      let t = 0;
      for (const rid of allRoundIds) {
        total += Number(byRound.get(rid) || 0);
        const b = Number(bByRound.get(rid) || 0);
        if (!(byRound.has(rid) || bByRound.has(rid))) continue;
        if (b > 0) w += 1;
        else {
          let oppWin = false;
          for (const [other, ob] of weekBonus) {
            if (other === name) continue;
            if (Number(ob.get(rid) || 0) > 0) {
              oppWin = true;
              break;
            }
          }
          if (oppWin) l += 1;
          else t += 1;
        }
      }
      rows.push({ team: name, total, w, l, t });
    }
    return rows.sort(
      (a, b) => b.total - a.total || a.team.localeCompare(b.team)
    );
  }, [results, regs, allMatches, rounds]);

  const seasonRanks = useMemo(() => {
    let rank = 1;
    return seasonRows.map((row, i) => {
      if (i > 0 && seasonRows[i - 1].total !== row.total) rank = i + 1;
      const tied =
        (i > 0 && seasonRows[i - 1].total === row.total) ||
        (i + 1 < seasonRows.length && seasonRows[i + 1].total === row.total);
      return {
        ...row,
        rank,
        position: tied ? `T${rank}` : String(rank),
      };
    });
  }, [seasonRows]);

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
    const submitted: Record<string, number> = {};
    for (const r of results) {
      if (Number(r.round_id) !== Number(selectedRoundId)) continue;
      submitted[String(r.team_name)] = Number(r.total || 0);
    }
    return tonightMatches.map((m) => {
      const homeIds = luMap[m.home_team] || [];
      const awayIds = m.away_team ? luMap[m.away_team] || [] : [];
      const homeScores = scoresFromRegs(homeIds, playerScores);
      const awayScores = m.away_team
        ? scoresFromRegs(awayIds, playerScores)
        : {};
      const board = m.away_team
        ? matchPlayBoardStatus(homeScores, awayScores, holes)
        : null;
      const liveHome = m.away_team
        ? computeSidePoints(
            homeScores,
            awayScores,
            holes,
            pointsPerHole,
            halved,
            bonus
          )
        : null;
      const liveAway = m.away_team
        ? computeSidePoints(
            awayScores,
            homeScores,
            holes,
            pointsPerHole,
            halved,
            bonus
          )
        : null;
      const homeSubmitted = submitted[m.home_team];
      const awaySubmitted = m.away_team ? submitted[m.away_team] : undefined;
      return {
        ...m,
        homeScores,
        awayScores,
        homeNames: namesFor(homeIds),
        awayNames: namesFor(awayIds),
        board,
        homePts:
          homeSubmitted != null
            ? homeSubmitted
            : liveHome && board && board.thru > 0
              ? liveHome.holePoints
              : null,
        awayPts:
          awaySubmitted != null
            ? awaySubmitted
            : liveAway && board && board.thru > 0
              ? liveAway.holePoints
              : null,
      };
    });
  }, [
    tonightMatches,
    lineups,
    playerScores,
    regs,
    holes,
    results,
    selectedRoundId,
    pointsPerHole,
    halved,
    bonus,
  ]);

  const openMatch = useMemo(
    () => weekRows.find((m) => m.id === openMatchId) || null,
    [weekRows, openMatchId]
  );

  if (loading) {
    return (
      <div
        className={
          embedded
            ? 'text-gray-400 py-8 text-center'
            : 'min-h-screen bg-gray-900 text-white flex items-center justify-center'
        }
      >
        Loading leaderboard...
      </div>
    );
  }

  const summary = eventPlaySummary(event);
  const selectedRound = rounds.find(
    (r) => Number(r.id) === Number(selectedRoundId)
  );

  return (
    <div
      className={
        embedded
          ? 'text-white'
          : 'min-h-screen bg-gray-900 text-white p-6 md:p-10'
      }
    >
      <div className={embedded ? '' : 'max-w-3xl mx-auto'}>
        {!embedded && (
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
        {!embedded && (
          <>
            <h1 className="text-4xl font-bold mb-2">{event?.name}</h1>
            {summary ? (
              <p className="text-gray-400 mb-6">{summary}</p>
            ) : (
              <p className="text-gray-400 mb-6">League standings</p>
            )}
          </>
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

        {view === 'season' ? (
          <div className="bg-gray-800 rounded-3xl overflow-hidden">
            {seasonRanks.length === 0 ? (
              <p className="text-gray-500 p-8 text-center">No teams yet.</p>
            ) : (
              <ul className="divide-y divide-gray-800">
                {seasonRanks.map((row) => (
                  <li
                    key={row.team}
                    className="flex items-center justify-between px-5 py-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-sm font-bold ${
                          row.rank === 1
                            ? 'bg-amber-500 text-black'
                            : row.rank === 2
                              ? 'bg-gray-400 text-black'
                              : row.rank === 3
                                ? 'bg-amber-800 text-white'
                                : 'bg-gray-800 text-gray-400'
                        }`}
                      >
                        {row.position}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{row.team}</p>
                        <p className="text-xs text-gray-500">
                          {row.w}-{row.l}-{row.t}
                        </p>
                      </div>
                    </div>
                    <span className="text-2xl font-bold tabular-nums ml-3">
                      {fmtPts(row.total)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : openMatch?.away_team && openMatch.board ? (
          <MatchScorecardPanel
            homeTeam={openMatch.home_team}
            awayTeam={openMatch.away_team}
            homeNames={openMatch.homeNames}
            awayNames={openMatch.awayNames}
            board={openMatch.board}
            holes={holes}
            courseHoles={courseHoles}
            homeScores={openMatch.homeScores}
            awayScores={openMatch.awayScores}
            onBack={() => setOpenMatchId(null)}
          />
        ) : (
          <div className="space-y-3">
            {selectedRound && (
              <p className="text-sm text-teal-400">{selectedRound.name}</p>
            )}
            {weekRows.map((m) =>
              m.away_team && m.board ? (
                <TonightMatchCard
                  key={m.id}
                  homeTeam={m.home_team}
                  awayTeam={m.away_team}
                  board={m.board}
                  homePts={m.homePts}
                  awayPts={m.awayPts}
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
    </div>
  );
}

function fmtPts(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return '';
  const x = Number(n);
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
}

function sideCaption(status: string, board: MatchPlayBoard) {
  if (!status) return '';
  if (board.final || !(board.thru > 0)) return status;
  return `${status} · thru ${board.thru}`;
}

function MatchSideButton({
  team,
  status,
  pts,
  winning,
  even,
  onOpen,
}: {
  team: string;
  status: string;
  pts: number | null;
  winning: boolean;
  even: boolean;
  onOpen: () => void;
}) {
  const started = !!status;
  const winLook = winning && !even && started;
  const ptsLabel = pts != null ? `${fmtPts(pts)} pts` : '';
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full min-w-0 rounded-2xl px-3 py-3 text-left ${
        winLook
          ? 'border-2 border-emerald-400 bg-emerald-500/20'
          : 'border border-gray-600 bg-transparent'
      }`}
    >
      <div
        className={`font-semibold truncate ${
          winLook ? 'text-white' : 'text-gray-200'
        }`}
      >
        {team}
      </div>
      <div
        className={`text-sm mt-1 tabular-nums ${
          winLook
            ? 'text-emerald-300 font-semibold'
            : 'text-gray-400'
        }`}
      >
        {status || '\u00a0'}
      </div>
      {ptsLabel ? (
        <div
          className={`text-sm mt-0.5 tabular-nums ${
            winLook ? 'text-white' : 'text-gray-400'
          }`}
        >
          {ptsLabel}
        </div>
      ) : null}
    </button>
  );
}

function TonightMatchCard({
  homeTeam,
  awayTeam,
  board,
  homePts,
  awayPts,
  onOpen,
}: {
  homeTeam: string;
  awayTeam: string;
  board: MatchPlayBoard;
  homePts: number | null;
  awayPts: number | null;
  onOpen: () => void;
}) {
  const even = board.leader === 'even';
  return (
    <div className="grid grid-cols-2 gap-2">
      <MatchSideButton
        team={homeTeam}
        status={sideCaption(board.homeStatus, board)}
        pts={homePts}
        winning={board.leader === 'home'}
        even={even}
        onOpen={onOpen}
      />
      <MatchSideButton
        team={awayTeam}
        status={sideCaption(board.awayStatus, board)}
        pts={awayPts}
        winning={board.leader === 'away'}
        even={even}
        onOpen={onOpen}
      />
    </div>
  );
}

function MatchScorecardPanel({
  homeTeam,
  awayTeam,
  homeNames,
  awayNames,
  board,
  holes,
  courseHoles,
  homeScores,
  awayScores,
  onBack,
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
  onBack: () => void;
}) {
  const holeNums = Array.from({ length: holes }, (_, i) => i + 1);
  const teamCol = '7.5rem';
  const holeCol = '2.5rem';
  const tableWidth = `calc(${teamCol} + ${holes} * ${holeCol})`;
  const teamCell =
    'w-[7.5rem] max-w-[7.5rem] px-2 py-2 text-left align-middle overflow-hidden';
  const holeCell = 'w-10 min-w-10 max-w-10 p-0 text-center align-middle';

  const sideRow = (
    team: string,
    names: string,
    myScores: Record<number, number>,
    oppScores: Record<number, number>,
    status: string
  ) => (
    <tr>
      <td className={`${teamCell} font-medium`}>
        <div className="truncate">{team}</div>
        {status ? (
          <div className={`text-sm mt-0.5 truncate ${statusTone(status)}`}>
            {status}
          </div>
        ) : null}
        {names ? (
          <div className="text-xs text-gray-400 mt-0.5 truncate">{names}</div>
        ) : null}
      </td>
      {holeNums.map((h) => {
        const score = Number(myScores[h] || 0);
        const opp = Number(oppScores[h] || 0);
        const par = courseHoles[h - 1]?.par || 4;
        return (
          <td
            key={h}
            className={`${holeCell} ${holeFill(holeMark(score, opp))}`}
          >
            <div className="flex items-center justify-center">
              <ScoreMark score={score > 0 ? score : null} par={par} />
            </div>
          </td>
        );
      })}
    </tr>
  );

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="text-sm text-gray-400 hover:text-white mb-4"
      >
        ← Back
      </button>
      <h2 className="text-xl font-bold mb-4">
        {homeTeam} vs {awayTeam}
      </h2>
      <div className="overflow-x-auto -mx-1 px-1">
          <table
            className="border-collapse"
            style={{ tableLayout: 'fixed', width: tableWidth }}
          >
            <colgroup>
              <col style={{ width: teamCol }} />
              {holeNums.map((h) => (
                <col key={h} style={{ width: holeCol }} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-gray-700 bg-gray-900">
                <th className={`${teamCell} font-medium`}>Team</th>
                {holeNums.map((h) => (
                  <th
                    key={h}
                    className={`${holeCell} font-medium text-sm text-gray-300`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
              <tr className="text-xs text-gray-500 border-b border-gray-700">
                <td className={teamCell}>Par</td>
                {holeNums.map((h) => (
                  <td key={h} className={holeCell}>
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
                <td className="p-0 h-2" />
                {holeNums.map((h) => (
                  <td key={h} className="p-0 h-2 w-10 min-w-10 max-w-10" />
                ))}
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
  );
}
