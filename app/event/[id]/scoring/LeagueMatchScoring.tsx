'use client';

import { useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import EventTabs from '@/app/components/EventTabs';
import BackButton from '@/app/components/BackButton';
import {
  computeSidePoints,
  holeMark,
  matchThruStatus,
  parseLineupIds,
  scoresFromRegs,
  sideStatusLabel,
} from '@/app/libs/league-match';
import { eventPlaySummary } from '@/app/libs/format-presets';

function formatRoundTime(startTime: string | null | undefined) {
  if (!startTime) return null;
  const parts = String(startTime).slice(0, 5).split(':');
  if (parts.length < 2) return String(startTime);
  let h = parseInt(parts[0], 10);
  const m = parts[1];
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

function defaultHoles(numHoles: number) {
  return Array.from({ length: numHoles }, (_, i) => ({
    hole: i + 1,
    par: 4,
    yardage: 400,
    handicap: i + 1,
  }));
}

function getHolesFromCourseData(courseData: any, numHoles: number = 18) {
  if (!courseData) return defaultHoles(numHoles);
  const root = courseData.course || courseData.data || courseData;
  let raw: any[] = [];
  if (Array.isArray(root?.scorecard) && root.scorecard.length > 0) {
    raw = root.scorecard;
  } else if (Array.isArray(root?.holes) && root.holes.length > 0) {
    raw = root.holes;
  }
  if (!raw.length) return defaultHoles(numHoles);
  const holes = raw.map((h: any, i: number) => {
    const par = Number(h.par ?? h.Par ?? 0);
    const handicap = Number(h.handicap ?? h.Handicap ?? 0);
    return {
      hole: Number(h.hole ?? h.Hole ?? i + 1),
      par: par > 0 ? par : 4,
      yardage: 400,
      handicap: handicap > 0 ? handicap : i + 1,
    };
  });
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

export default function LeagueMatchScoring({
  eventId,
  initialRoundId,
}: {
  eventId: string;
  initialRoundId?: number | null;
}) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const [event, setEvent] = useState<any>(null);
  const [rounds, setRounds] = useState<any[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState<number | null>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [lineups, setLineups] = useState<Record<string, string[]>>({});
  const [regs, setRegs] = useState<any[]>([]);
  const [weekResults, setWeekResults] = useState<any[]>([]);
  const [draft, setDraft] = useState<
    Record<string, { home: Record<number, number>; away: Record<number, number> }>
  >({});
  const [saving, setSaving] = useState<string | null>(null);
  const [savingHole, setSavingHole] = useState<string | null>(null);
  const [editCell, setEditCell] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const holesCount = Number(event?.number_of_holes) === 18 ? 18 : 9;
  const holes = useMemo(
    () => getHolesFromCourseData(event?.course_data, holesCount),
    [event?.course_data, holesCount]
  );
  const frontCount = Math.min(9, holesCount);
  const backCount = Math.max(0, holesCount - 9);
  const need = Math.max(1, Number(event?.players_per_match) || 2);
  const pointsPerHole = Number(event?.points_per_hole ?? 1);
  const halved = Number(event?.halved_points ?? 0.5);
  const bonus = Number(event?.match_win_bonus ?? 1);

  useEffect(() => {
    const load = async () => {
      const id = parseInt(eventId, 10);
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
      setRounds(roundsData || []);
      if (roundsData?.[0]?.id) {
        const match = initialRoundId
          ? roundsData.find((r) => Number(r.id) === Number(initialRoundId))
          : null;
        setSelectedRoundId(Number((match || roundsData[0]).id));
      }
      const { data: regData } = await supabase
        .from('event_registrations')
        .select('*')
        .eq('event_id', id);
      setRegs(regData || []);
      setLoading(false);
    };
    load();
  }, [eventId, supabase, initialRoundId]);

  useEffect(() => {
    const loadWeek = async () => {
      if (!selectedRoundId) return;
      const id = parseInt(eventId, 10);
      const { data: matchRows } = await supabase
        .from('league_matches')
        .select('*')
        .eq('event_id', id)
        .eq('round_id', selectedRoundId);
      setMatches(matchRows || []);
      const { data: lineupRows } = await supabase
        .from('league_lineups')
        .select('*')
        .eq('event_id', id)
        .eq('round_id', selectedRoundId);
      const lu: Record<string, string[]> = {};
      for (const row of lineupRows || []) {
        lu[row.team_name] = parseLineupIds(row.registration_ids);
      }
      setLineups(lu);

      const allIds = Object.values(lu).flat();
      const loaded: Record<string, Record<number, number>> = {};
      if (allIds.length) {
        const { data: scores } = await supabase
          .from('scores')
          .select('*')
          .eq('round_id', selectedRoundId)
          .in('registration_id', allIds);
        for (const s of scores || []) {
          const rid = String(s.registration_id);
          if (!loaded[rid]) loaded[rid] = {};
          loaded[rid][s.hole] = s.score;
        }
      }

      const nextDraft: Record<
        string,
        { home: Record<number, number>; away: Record<number, number> }
      > = {};
      for (const m of matchRows || []) {
        nextDraft[m.id] = {
          home: scoresFromRegs(lu[m.home_team] || [], loaded),
          away: m.away_team
            ? scoresFromRegs(lu[m.away_team] || [], loaded)
            : {},
        };
      }
      setDraft(nextDraft);

      const { data: resultRows } = await supabase
        .from('league_week_results')
        .select('*')
        .eq('event_id', id)
        .eq('round_id', selectedRoundId);
      setWeekResults(resultRows || []);
    };
    loadWeek();
  }, [eventId, selectedRoundId, supabase]);

  const selectedRound = useMemo(
    () => rounds.find((r) => Number(r.id) === Number(selectedRoundId)),
    [rounds, selectedRoundId]
  );

  const submittedTeams = useMemo(() => {
    const s = new Set<string>();
    for (const r of weekResults) s.add(String(r.team_name));
    return s;
  }, [weekResults]);

  const namesFor = (ids: string[]) =>
    ids
      .map((id) => regs.find((r) => String(r.id) === String(id))?.player_name)
      .filter(Boolean)
      .join(' · ');

  const persistHole = async (ids: string[], hole: number, score: number) => {
    if (!selectedRoundId || !ids.length) return;
    for (const regId of ids) {
      await supabase
        .from('scores')
        .delete()
        .eq('registration_id', regId)
        .eq('hole', hole)
        .eq('round_id', selectedRoundId);
      if (score > 0) {
        await supabase.from('scores').insert({
          registration_id: regId,
          hole,
          score,
          round_id: selectedRoundId,
        });
      }
    }
  };

  const setHole = async (
    match: any,
    side: 'home' | 'away',
    hole: number,
    score: number
  ) => {
    const team = side === 'home' ? match.home_team : match.away_team;
    const ids = lineups[team] || [];
    setDraft((prev) => ({
      ...prev,
      [match.id]: {
        home: { ...(prev[match.id]?.home || {}) },
        away: { ...(prev[match.id]?.away || {}) },
        [side]: { ...(prev[match.id]?.[side] || {}), [hole]: score },
      },
    }));
    if (!ids.length) return;
    const key = `${match.id}-${side}-${hole}`;
    setSavingHole(key);
    try {
      await persistHole(ids, hole, score);
    } finally {
      setSavingHole(null);
    }
  };

  const submitMatch = async (match: any) => {
    if (!selectedRoundId) {
      alert('Pick a week before submitting.');
      return;
    }
    if (!match.away_team) return;
    const homeIds = lineups[match.home_team] || [];
    const awayIds = lineups[match.away_team] || [];
    if (homeIds.length < need || awayIds.length < need) {
      alert('Both teams need a full lineup.');
      return;
    }
    const card = draft[match.id] || { home: {}, away: {} };
    setSaving(match.id);
    try {
      const homePts = computeSidePoints(
        card.home,
        card.away,
        holesCount,
        pointsPerHole,
        halved,
        bonus
      );
      const awayPts = computeSidePoints(
        card.away,
        card.home,
        holesCount,
        pointsPerHole,
        halved,
        bonus
      );
      const rows = [
        {
          event_id: parseInt(eventId, 10),
          round_id: selectedRoundId,
          team_name: match.home_team,
          hole_points: homePts.holePoints,
          bonus: homePts.bonus,
          total: homePts.total,
        },
        {
          event_id: parseInt(eventId, 10),
          round_id: selectedRoundId,
          team_name: match.away_team,
          hole_points: awayPts.holePoints,
          bonus: awayPts.bonus,
          total: awayPts.total,
        },
      ];
      const { error } = await supabase
        .from('league_week_results')
        .upsert(rows, { onConflict: 'event_id,round_id,team_name' });
      if (error) throw error;
      setWeekResults((prev) => {
        const others = prev.filter(
          (r) =>
            r.team_name !== match.home_team && r.team_name !== match.away_team
        );
        return [...others, ...rows];
      });
      alert('Match submitted.');
    } catch (e: any) {
      alert(e.message || 'Failed to submit match');
    } finally {
      setSaving(null);
    }
  };

  const colCount =
    2 + frontCount + backCount + (holesCount > 9 ? 2 : 0);

  const fmtPts = (n: number) => {
    const x = Number(n || 0);
    return Number.isInteger(x) ? String(x) : x.toFixed(1);
  };

  const holeCell = (
    match: any,
    side: 'home' | 'away',
    hole: number,
    myScores: Record<number, number>,
    oppScores: Record<number, number>,
    canEdit: boolean
  ) => {
    const par = holes[hole - 1]?.par || 4;
    const score = Number(myScores[hole] || 0);
    const opp = Number(oppScores[hole] || 0);
    const mark = holeMark(score, opp);
    const has = score > 0;
    const cellKey = `${match.id}-${side}-${hole}`;
    const editing = editCell === cellKey;
    return (
      <td
        key={`${side}-${hole}`}
        className={`text-center py-2 px-1 ${holeFill(mark)}`}
      >
        {!canEdit ? (
          <span className="text-gray-600">—</span>
        ) : editing ? (
          <input
            type="number"
            min={0}
            max={20}
            autoFocus
            value={has ? score : ''}
            onChange={(e) =>
              setHole(match, side, hole, parseInt(e.target.value, 10) || 0)
            }
            onBlur={() => setEditCell(null)}
            className="w-11 bg-gray-700 border border-gray-600 text-center py-2 rounded-xl focus:outline-none focus:border-emerald-500 no-spinner"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditCell(cellKey)}
            className="w-full flex justify-center"
          >
            <ScoreMark score={has ? score : null} par={par} />
          </button>
        )}
      </td>
    );
  };

  const renderTeamRow = ({
    match,
    side,
    teamName,
    myScores,
    oppScores,
    statusLabel,
    points,
    lineupIds,
    spacerBefore,
  }: {
    match: any;
    side: 'home' | 'away';
    teamName: string;
    myScores: Record<number, number>;
    oppScores: Record<number, number>;
    statusLabel: string;
    points: number;
    lineupIds: string[];
    spacerBefore?: boolean;
  }) => {
    const hasLineup = lineupIds.length >= need;
    const front9 = Array.from(
      { length: frontCount },
      (_, i) => Number(myScores[i + 1] || 0)
    ).reduce((a, b) => a + b, 0);
    const back9 = Array.from(
      { length: backCount },
      (_, i) => Number(myScores[i + 10] || 0)
    ).reduce((a, b) => a + b, 0);

    return (
      <>
        {spacerBefore && (
          <tr aria-hidden>
            <td colSpan={colCount} className="p-0 h-2 bg-transparent" />
          </tr>
        )}
        <tr className={hasLineup ? '' : 'opacity-50'}>
          <td className="py-2 px-4 font-medium align-middle">
            <div>{teamName}</div>
            {statusLabel ? (
              <div className="text-sm text-emerald-400 mt-0.5">
                {statusLabel}
              </div>
            ) : null}
            <div className="text-xs text-gray-400 mt-0.5">
              {hasLineup ? namesFor(lineupIds) : 'Set lineup'}
              {hasLineup &&
              savingHole?.startsWith(`${match.id}-${side}`)
                ? ' · saving…'
                : ''}
            </div>
          </td>
          {hasLineup ? (
            <>
              {Array.from({ length: frontCount }, (_, i) =>
                holeCell(match, side, i + 1, myScores, oppScores, true)
              )}
              {holesCount > 9 && (
                <td className="text-center py-2 px-4 font-semibold text-emerald-400 border-l-2 border-r-2 border-emerald-500">
                  {front9 || '—'}
                </td>
              )}
              {Array.from({ length: backCount }, (_, i) =>
                holeCell(match, side, i + 10, myScores, oppScores, true)
              )}
              {holesCount > 9 && (
                <td className="text-center py-2 px-4 font-semibold text-emerald-400">
                  {back9 || '—'}
                </td>
              )}
              <td className="text-center py-2 px-4 font-bold text-lg text-white">
                {fmtPts(points)}
              </td>
            </>
          ) : (
            <td colSpan={colCount - 1} className="py-2 px-4 text-gray-500">
              Set lineup
            </td>
          )}
        </tr>
      </>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        Loading matches...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 md:p-10">
      <div className="max-w-[1400px] mx-auto">
        <BackButton
          href="/events"
          className="mb-6 text-gray-400 hover:text-white"
        />
        <EventTabs eventId={eventId} variant="dayof" active="scoring" />
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold">{event?.name}</h1>
            <p className="text-gray-400 mt-1">
              {eventPlaySummary(event) || `Match play · ${holesCount} holes`}
            </p>
            {selectedRound && (
              <p className="text-sm text-teal-400 mt-1">{selectedRound.name}</p>
            )}
          </div>
          <div className="w-full sm:w-64">
            <label className="block text-sm text-gray-400 mb-2">Week</label>
            <select
              value={selectedRoundId ?? ''}
              onChange={(e) =>
                setSelectedRoundId(parseInt(e.target.value, 10))
              }
              className="w-full bg-gray-800 border border-gray-600 rounded-2xl px-5 py-4"
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
          </div>
        </div>

        {matches.length === 0 ? (
          <p className="text-gray-400">
            No matches for {selectedRound?.name || 'this week'}. Generate a
            schedule on Manage.
          </p>
        ) : (
          <div className="space-y-10">
            {matches.map((m) => {
              if (!m.away_team) {
                return (
                  <div
                    key={m.id}
                    className="bg-gray-800 rounded-3xl p-6 text-gray-400"
                  >
                    {m.home_team} — bye
                  </div>
                );
              }
              const card = draft[m.id] || { home: {}, away: {} };
              const status = matchThruStatus(
                m.home_team,
                m.away_team,
                card.home,
                card.away,
                holesCount
              );
              const homePts = computeSidePoints(
                card.home,
                card.away,
                holesCount,
                pointsPerHole,
                halved,
                bonus
              );
              const awayPts = computeSidePoints(
                card.away,
                card.home,
                holesCount,
                pointsPerHole,
                halved,
                bonus
              );
              const submitted =
                submittedTeams.has(m.home_team) &&
                submittedTeams.has(m.away_team);
              const homePoints = submitted ? homePts.total : homePts.holePoints;
              const awayPoints = submitted ? awayPts.total : awayPts.holePoints;
              return (
                <div key={m.id}>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="font-semibold text-lg">
                      {m.home_team} vs {m.away_team}
                    </div>
                    <button
                      type="button"
                      disabled={saving === m.id}
                      onClick={() => submitMatch(m)}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 px-4 py-3 rounded-2xl text-sm font-semibold"
                    >
                      {saving === m.id ? 'Saving…' : 'Submit match'}
                    </button>
                  </div>
                  <div className="bg-gray-800 rounded-3xl p-4 md:p-5 overflow-x-auto">
                    <table className="w-full border-collapse min-w-[900px]">
                      <thead>
                        <tr className="border-b border-gray-700 bg-gray-900">
                          <th className="text-left py-3 px-4 font-medium w-52">
                            Team
                          </th>
                          {Array.from({ length: frontCount }, (_, i) => (
                            <th
                              key={i}
                              className="text-center py-3 px-2 font-medium text-sm"
                            >
                              {i + 1}
                            </th>
                          ))}
                          {holesCount > 9 && (
                            <th className="text-center py-3 px-4 font-medium text-emerald-400 border-l-2 border-r-2 border-emerald-500">
                              Out
                            </th>
                          )}
                          {Array.from({ length: backCount }, (_, i) => (
                            <th
                              key={i + 9}
                              className="text-center py-3 px-2 font-medium text-sm"
                            >
                              {i + 10}
                            </th>
                          ))}
                          {holesCount > 9 && (
                            <th className="text-center py-3 px-4 font-medium text-emerald-400">
                              In
                            </th>
                          )}
                          <th className="text-center py-3 px-4 font-medium text-emerald-400">
                            Pts
                          </th>
                        </tr>
                        <tr className="text-xs text-gray-500 border-b border-gray-800">
                          <td className="py-1 px-4">Par</td>
                          {Array.from({ length: frontCount }, (_, i) => (
                            <td key={i} className="text-center py-1">
                              {holes[i]?.par || 4}
                            </td>
                          ))}
                          {holesCount > 9 && (
                            <td className="text-center py-1 border-l-2 border-r-2 border-emerald-500/40">
                              {holes
                                .slice(0, 9)
                                .reduce((s, h) => s + (h.par || 4), 0)}
                            </td>
                          )}
                          {Array.from({ length: backCount }, (_, i) => (
                            <td key={i + 9} className="text-center py-1">
                              {holes[i + 9]?.par || 4}
                            </td>
                          ))}
                          {holesCount > 9 && (
                            <td className="text-center py-1">
                              {holes
                                .slice(9, 18)
                                .reduce((s, h) => s + (h.par || 4), 0)}
                            </td>
                          )}
                          <td />
                        </tr>
                        <tr className="text-xs text-gray-500 border-b border-gray-700">
                          <td className="py-1 px-4">Index</td>
                          {Array.from({ length: frontCount }, (_, i) => (
                            <td key={i} className="text-center py-1">
                              {holes[i]?.handicap || i + 1}
                            </td>
                          ))}
                          {holesCount > 9 && (
                            <td className="border-l-2 border-r-2 border-emerald-500/40" />
                          )}
                          {Array.from({ length: backCount }, (_, i) => (
                            <td key={i + 9} className="text-center py-1">
                              {holes[i + 9]?.handicap || i + 10}
                            </td>
                          ))}
                          {holesCount > 9 && <td />}
                          <td />
                        </tr>
                      </thead>
                      <tbody>
                        {renderTeamRow({
                          match: m,
                          side: 'home',
                          teamName: m.home_team,
                          myScores: card.home,
                          oppScores: card.away,
                          statusLabel: sideStatusLabel(
                            status.homeWins,
                            status.awayWins,
                            status.thru
                          ),
                          points: homePoints,
                          lineupIds: lineups[m.home_team] || [],
                        })}
                        {renderTeamRow({
                          match: m,
                          side: 'away',
                          teamName: m.away_team,
                          myScores: card.away,
                          oppScores: card.home,
                          statusLabel: sideStatusLabel(
                            status.awayWins,
                            status.homeWins,
                            status.thru
                          ),
                          points: awayPoints,
                          lineupIds: lineups[m.away_team] || [],
                          spacerBefore: true,
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
