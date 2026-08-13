'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

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

function isCheckedInForRound(reg: any, roundId: number | 'all') {
  if (roundId === 'all') return !!reg.checked_in;
  const map = reg.round_checkins || {};
  if (map[String(roundId)] != null) return !!map[String(roundId)];
  if (map[roundId as number] != null) return !!map[roundId as number];
  return !!reg.checked_in;
}

function lockKey(roundId: number | 'all') {
  return roundId === 'all' ? 'all' : String(roundId);
}

function isScoresLocked(reg: any, roundId: number | 'all') {
  const map = reg?.scores_locked_by_round || {};
  return map[lockKey(roundId)] === true;
}

function defaultHoles(numHoles: number) {
  return Array.from({ length: numHoles }, (_, i) => ({
    hole: i + 1,
    par: 4,
    yardage: 400,
    handicap: i + 1,
  }));
}

function yardsFromScorecardHole(h: any): number {
  if (h.yardage != null || h.yards != null) {
    return Number(h.yardage ?? h.yards) || 0;
  }
  const tees = h.tees;
  if (!tees || typeof tees !== 'object') return 0;

  for (const key of Object.keys(tees)) {
    const y = Number(tees[key]?.yards ?? tees[key]?.yardage ?? 0);
    if (y > 0) return y;
  }
  return 0;
}

function getHolesFromCourseData(courseData: any, numHoles: number = 18) {
  if (!courseData) return defaultHoles(numHoles);

  const root = courseData.course || courseData.data || courseData;
  let raw: any[] = [];

  if (Array.isArray(root.scorecard) && root.scorecard.length > 0) {
    raw = root.scorecard;
  } else if (Array.isArray(root.holes) && root.holes.length > 0) {
    raw = root.holes;
  } else if (root.tees) {
    const tees = root.tees;
    const male = tees.male || tees.Men || tees.men;
    const list = Array.isArray(male)
      ? male
      : Array.isArray(tees)
        ? tees
        : [];
    const tee = list[0];
    if (tee?.holes) raw = tee.holes;
    else if (tee?.scorecard) raw = tee.scorecard;
  }

  if (!raw.length) return defaultHoles(numHoles);

  const holes = raw.map((h: any, i: number) => {
    const par = Number(h.par ?? h.Par ?? 0);
    const handicap = Number(h.handicap ?? h.Handicap ?? 0);
    const yardage = yardsFromScorecardHole(h);

    return {
      hole: Number(h.hole ?? h.Hole ?? i + 1),
      par: par > 0 ? par : 4,
      yardage: yardage > 0 ? yardage : 400,
      handicap: handicap > 0 ? handicap : i + 1,
    };
  });

  const sliced = holes.slice(0, numHoles);
  return sliced.length ? sliced : defaultHoles(numHoles);
}

function getPairingLabel(reg: any, roundId: number | 'all') {
  if (roundId !== 'all') {
    const map = reg.round_pairings || {};
    const entry = map[String(roundId)] || map[roundId as number];
    if (entry?.hole && entry?.slot) return `${entry.hole} - ${entry.slot}`;
  }
  if (reg.pairing_hole && reg.pairing_slot) {
    return `${reg.pairing_hole} - ${reg.pairing_slot}`;
  }
  return '';
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

type RowMode = 'open' | 'locked' | 'editing';

export default function EventScoringPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [event, setEvent] = useState<any>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [rounds, setRounds] = useState<any[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState<number | 'all'>('all');
  const [playerScores, setPlayerScores] = useState<
    Record<string, Record<number, number>>
  >({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [rowMode, setRowMode] = useState<Record<string, RowMode>>({});
    const [savingEvent, setSavingEvent] = useState(false);

  const teamMembersRef = useRef<Record<string, string[]>>({});
  const rowModeRef = useRef(rowMode);
  rowModeRef.current = rowMode;

  const numHoles = useMemo(() => {
    const n = Number(event?.number_of_holes || 18);
    return n === 9 ? 9 : 18;
  }, [event]);

  const holes = useMemo(
    () => getHolesFromCourseData(event?.course_data, numHoles),
    [event?.course_data, numHoles]
  );

  const selectedRound = useMemo(() => {
    if (selectedRoundId === 'all') return null;
    return rounds.find((r) => r.id === selectedRoundId) || null;
  }, [rounds, selectedRoundId]);

  const isTeamEvent = (event?.max_teammates || 1) > 1;

  const scoredRegs = useMemo(() => {
    return registrations.filter((r) => {
      if (!isCheckedInForRound(r, selectedRoundId)) return false;

      if (selectedRoundId === 'all') return true;
      const ids: number[] = r.selected_round_ids || [];
      if (!ids.length) return rounds.length <= 1;
      return ids.includes(selectedRoundId as number);
    });
  }, [registrations, selectedRoundId, rounds.length]);

  // Rebuild lock state from DB whenever regs / round change
  // Keeps "editing" rows as-is so live reloads don't kick you out of edit mode
  useEffect(() => {
    if (!scoredRegs.length) return;

    const grouped = scoredRegs.reduce((acc: any, reg) => {
      const key =
        isTeamEvent && reg.team_name
          ? reg.team_name
          : reg.player_name || 'Unknown';
      if (!acc[key]) acc[key] = [];
      acc[key].push(reg);
      return acc;
    }, {});

    setRowMode((prev) => {
      const next: Record<string, RowMode> = { ...prev };

      Object.entries(grouped).forEach(([teamKey, members]: any) => {
        if (prev[teamKey] === 'editing') return;

        const locked = (members as any[]).some((m) =>
          isScoresLocked(m, selectedRoundId)
        );
        next[teamKey] = locked ? 'locked' : 'open';
      });

      return next;
    });
  }, [scoredRegs, selectedRoundId, isTeamEvent]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const id = parseInt(eventId);

      const { data: eventData } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', id)
        .single();
      setEvent(eventData);

      const { data: roundsData } = await supabase
        .from('event_rounds')
        .select('*')
        .eq('event_id', id)
        .order('sort_order', { ascending: true });

      setRounds(roundsData || []);
      if (roundsData && roundsData.length > 0) {
        setSelectedRoundId(roundsData[0].id);
      }

      const { data: regData } = await supabase
        .from('event_registrations')
        .select('*')
        .eq('event_id', id);
      setRegistrations(regData || []);

      setLoading(false);
    };

    fetchData();
  }, [eventId]);

  useEffect(() => {
    if (registrations.length === 0) return;

    const regIds = registrations.map((r) => String(r.id));

    const loadScores = async () => {
      let query = supabase
        .from('scores')
        .select('*')
        .in('registration_id', regIds);

      if (selectedRoundId !== 'all') {
        query = query.eq('round_id', selectedRoundId);
      }

      const { data: scoreData, error } = await query;

      if (error) {
        console.error('Failed to load scores:', error);
        return;
      }

      const skipRegIds = new Set<string>();
      Object.entries(rowModeRef.current).forEach(([teamKey, mode]) => {
        if (mode === 'editing') {
          (teamMembersRef.current[teamKey] || []).forEach((id) =>
            skipRegIds.add(id)
          );
        }
      });

      setPlayerScores((prev) => {
        const loaded: Record<string, Record<number, number>> = { ...prev };

        regIds.forEach((id) => {
          if (!skipRegIds.has(id)) loaded[id] = {};
        });

        (scoreData || []).forEach((score: any) => {
          const rid = String(score.registration_id);
          if (skipRegIds.has(rid)) return;
          if (!loaded[rid]) loaded[rid] = {};
          loaded[rid][score.hole] = score.score;
        });

        return loaded;
      });
    };

    loadScores();

    const channel = supabase
      .channel(`admin-scores-${eventId}-${String(selectedRoundId)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scores' },
        () => loadScores()
      )
      .subscribe();

    const poll = setInterval(loadScores, 3000);

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [registrations, selectedRoundId, eventId]);

  const updateTeamScore = (
    teamKey: string,
    memberIds: string[],
    hole: number,
    score: number
  ) => {
    teamMembersRef.current[teamKey] = memberIds;

    setPlayerScores((prev) => {
      const next = { ...prev };
      for (const id of memberIds) {
        next[id] = { ...(next[id] || {}), [hole]: score };
      }
      return next;
    });
  };

  const saveTeamScores = async (memberIds: string[], teamKey: string) => {
    let sourceId = memberIds[0];
    for (const id of memberIds) {
      const s = playerScores[id];
      if (s && Object.values(s).some((v) => Number(v) > 0)) {
        sourceId = id;
        break;
      }
    }

    const sourceScores = playerScores[sourceId] || {};
    const holeEntries = Object.entries(sourceScores).filter(
      ([, score]) => Number(score) > 0
    );

    if (holeEntries.length === 0) {
      alert('No scores entered for this team.');
      return;
    }

    setSavingKey(teamKey);
    const key = lockKey(selectedRoundId);

    try {
      for (const regId of memberIds) {
        // Clear existing holes for this reg (+ round when scoped)
        for (const [hole] of holeEntries) {
          let del = supabase
            .from('scores')
            .delete()
            .eq('registration_id', regId)
            .eq('hole', parseInt(hole, 10));

          if (selectedRoundId !== 'all') {
            del = del.eq('round_id', selectedRoundId);
          }

          await del;
        }

        const rows = holeEntries.map(([hole, score]) => ({
          registration_id: regId,
          hole: parseInt(hole, 10),
          score: Number(score),
          ...(selectedRoundId !== 'all' ? { round_id: selectedRoundId } : {}),
        }));

        const { error: insErr } = await supabase.from('scores').insert(rows);
        if (insErr) throw insErr;

        // Persist lock on each registration in the team
        const reg = registrations.find((r) => String(r.id) === regId);
        const existing = (reg?.scores_locked_by_round || {}) as Record<
          string,
          boolean
        >;
        const updatedMap = { ...existing, [key]: true };

        const { error: lockErr } = await supabase
          .from('event_registrations')
          .update({ scores_locked_by_round: updatedMap })
          .eq('id', regId);

        if (lockErr) throw lockErr;
      }

      // Update local regs so refresh / navigation keeps lock
      setRegistrations((prev) =>
        prev.map((r) => {
          if (!memberIds.includes(String(r.id))) return r;
          return {
            ...r,
            scores_locked_by_round: {
              ...(r.scores_locked_by_round || {}),
              [key]: true,
            },
          };
        })
      );

      setRowMode((prev) => ({ ...prev, [teamKey]: 'locked' }));
      alert(
        `Score submitted for ${teamKey}${
          selectedRound ? ` · ${selectedRound.name}` : ''
        }`
      );
    } catch (err: any) {
      console.error(err);
      alert('Failed to save scores: ' + (err.message || 'Unknown error'));
    } finally {
      setSavingKey(null);
    }
  };

  const saveEvent = async () => {
    if (event?.is_locked) return;

    const ok = window.confirm(
      'Save this event? Scores and results will be locked for players. Unlock later from Platform / support.'
    );
    if (!ok) return;

    setSavingEvent(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('tournaments')
        .update({
          is_locked: true,
          locked_at: new Date().toISOString(),
          locked_by: user?.id ?? null,
        })
        .eq('id', parseInt(eventId));

      if (error) {
        alert(error.message);
        return;
      }

      setEvent((prev: any) =>
        prev
          ? {
              ...prev,
              is_locked: true,
              locked_at: new Date().toISOString(),
              locked_by: user?.id ?? null,
            }
          : prev
      );
    } finally {
      setSavingEvent(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        Loading scoring...
      </div>
    );
  }

  const headerTeeTime = selectedRound
    ? formatRoundTime(selectedRound.start_time)
    : null;

  const frontCount = Math.min(9, numHoles);
  const backCount = Math.max(0, numHoles - 9);

  const renderHoleInput = (
    hole: number,
    par: number,
    scores: Record<number, number>,
    teamKey: string,
    memberIds: string[],
    canEdit: boolean
  ) => {
    const score = scores[hole];
    const has = score != null && Number(score) > 0;

    return (
      <td key={hole} className="text-center py-2 px-1">
        {canEdit ? (
          <input
            type="number"
            min={0}
            max={20}
            value={has ? score : ''}
            onChange={(e) => {
              updateTeamScore(
                teamKey,
                memberIds,
                hole,
                parseInt(e.target.value, 10) || 0
              );
            }}
            className="w-11 bg-gray-700 border border-gray-600 text-center py-2 rounded-xl focus:outline-none focus:border-emerald-500 no-spinner"
          />
        ) : (
          <div className="flex justify-center">
            <ScoreMark score={has ? Number(score) : null} par={par} />
          </div>
        )}
      </td>
    );
  };

  return (
     <div className="min-h-screen bg-gray-900 text-white p-6 md:p-10">
      <div className="max-w-[1400px] mx-auto">
        <button
          onClick={() => router.back()}
          className="mb-6 text-gray-400 hover:text-white"
        >
          ← Back
        </button>

        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-8">
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <h1 className="text-4xl font-bold">{event?.name}</h1>
              {event?.is_locked && (
                <span className="text-xs px-3 py-1 rounded-full bg-emerald-900/50 text-emerald-400 border border-emerald-500/40">
                  Saved
                </span>
              )}
            </div>
            <p className="text-gray-400 mt-1">
              {event?.is_locked ? 'Final Scoring' : 'Live Scoring'} · {numHoles}{' '}
              holes
              {event?.course ? ` · ${event.course}` : ''}
              {headerTeeTime ? ` · ${headerTeeTime}` : ''}
            </p>
            {selectedRound && (
              <p className="text-sm text-teal-400 mt-1">
                Round: {selectedRound.name}
                {headerTeeTime ? ` (${headerTeeTime})` : ''}
              </p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              ○ under par · ▢ over par · Submitted stays locked after leave /
              refresh
            </p>
            {!event?.is_locked ? (
              <button
                type="button"
                onClick={saveEvent}
                disabled={savingEvent}
                className="mt-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 px-5 py-2.5 rounded-2xl text-sm font-semibold"
              >
                {savingEvent ? 'Saving…' : 'Save Event'}
              </button>
            ) : (
              <p className="mt-3 text-sm text-gray-500">
                Event is saved. Contact support or use Platform to unlock.
              </p>
            )}
          </div>

          {rounds.length > 0 && (
            <div className="w-full lg:w-72">
              <label className="block text-sm text-gray-400 mb-2">
                Score by round
              </label>
              <select
                value={
                  selectedRoundId === 'all' ? 'all' : String(selectedRoundId)
                }
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedRoundId(v === 'all' ? 'all' : parseInt(v, 10));
                  // Clear UI modes; effect re-applies locked from DB
                  setRowMode({});
                }}
                className="w-full bg-gray-800 border border-gray-600 rounded-2xl px-5 py-4"
              >
                <option value="all">All rounds</option>
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
          )}
        </div>

        {scoredRegs.length === 0 ? (
          <div className="bg-gray-800 rounded-3xl p-16 text-center text-gray-400">
            No players checked in
            {selectedRoundId !== 'all' ? ' for this round' : ''}.
            <br />
            Check players in first, then enter scores.
          </div>
        ) : (
          <div className="bg-gray-800 rounded-3xl p-4 md:p-6 overflow-x-auto">
            <table className="w-full border-collapse min-w-[1100px]">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-900">
                  <th className="text-left py-4 px-6 font-medium w-52">
                    Team / Player
                  </th>
                  {Array.from({ length: frontCount }, (_, i) => (
                    <th
                      key={i}
                      className="text-center py-4 px-4 font-medium text-sm"
                    >
                      {i + 1}
                    </th>
                  ))}
                  <th className="text-center py-4 px-6 font-medium text-emerald-400 border-l-2 border-r-2 border-emerald-500">
                    {numHoles > 9 ? 'Out' : 'Total'}
                  </th>
                  {Array.from({ length: backCount }, (_, i) => (
                    <th
                      key={i + 9}
                      className="text-center py-4 px-4 font-medium text-sm"
                    >
                      {i + 10}
                    </th>
                  ))}
                  {numHoles > 9 && (
                    <th className="text-center py-4 px-6 font-medium text-emerald-400">
                      In
                    </th>
                  )}
                  <th className="text-center py-4 px-6 font-medium">Gross</th>
                  {event?.use_handicaps && (
                    <th className="text-center py-4 px-6 font-medium text-emerald-400">
                      Net
                    </th>
                  )}
                  <th className="w-40"></th>
                </tr>
              </thead>

              <tbody>
                {(() => {
                  const grouped = scoredRegs.reduce((acc: any, reg) => {
                    const key =
                      isTeamEvent && reg.team_name
                        ? reg.team_name
                        : reg.player_name || 'Unknown';
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(reg);
                    return acc;
                  }, {});

                  const entries = Object.entries(grouped).sort(
                    ([, aMembers]: any, [, bMembers]: any) => {
                      const aLabel = getPairingLabel(
                        aMembers[0],
                        selectedRoundId
                      );
                      const bLabel = getPairingLabel(
                        bMembers[0],
                        selectedRoundId
                      );
                      return aLabel.localeCompare(bLabel);
                    }
                  );

                  return entries.map(([teamKey, teamMembers]: any) => {
                    const memberIds: string[] = teamMembers.map((m: any) =>
                      String(m.id)
                    );
                    teamMembersRef.current[teamKey] = memberIds;

                    const mode: RowMode = rowMode[teamKey] || 'open';
                    const canEdit = mode === 'open' || mode === 'editing';

                    const scores: Record<number, number> = {};
                    memberIds.forEach((id) => {
                      const s = playerScores[id] || {};
                      Object.entries(s).forEach(([hole, val]) => {
                        const h = parseInt(hole, 10);
                        if (Number(val) > 0) scores[h] = Number(val);
                      });
                    });

                    const front9 = Array.from(
                      { length: frontCount },
                      (_, i) => scores[i + 1] || 0
                    ).reduce((a, b) => a + b, 0);

                    const back9 = Array.from(
                      { length: backCount },
                      (_, i) => scores[i + 10] || 0
                    ).reduce((a, b) => a + b, 0);

                    const gross = front9 + back9;
                    let net = gross;
                    if (event?.use_handicaps) {
                      const avgHandicap =
                        teamMembers.reduce(
                          (sum: number, r: any) => sum + (r.handicap || 0),
                          0
                        ) / teamMembers.length;
                      net = Math.round(gross - avgHandicap);
                    }

                    const pairing = getPairingLabel(
                      teamMembers[0],
                      selectedRoundId
                    );

                    return (
                      <tr
                        key={teamKey}
                        className="border-b border-gray-700 hover:bg-gray-700/50"
                      >
                        <td className="py-3 px-6 font-medium">
                          {teamKey}
                          {pairing && (
                            <div className="text-xs text-teal-400 mt-0.5">
                              {pairing}
                            </div>
                          )}
                          {isTeamEvent && (
                            <div className="text-xs text-gray-400">
                              {teamMembers.length} players
                            </div>
                          )}
                          {mode === 'locked' && (
                            <div className="text-xs text-emerald-400 mt-0.5">
                              Submitted
                            </div>
                          )}
                          {mode === 'editing' && (
                            <div className="text-xs text-amber-400 mt-0.5">
                              Editing
                            </div>
                          )}
                        </td>

                        {Array.from({ length: frontCount }, (_, i) =>
                          renderHoleInput(
                            i + 1,
                            holes[i]?.par || 4,
                            scores,
                            teamKey,
                            memberIds,
                            canEdit
                          )
                        )}

                        <td className="text-center py-3 px-6 font-semibold text-emerald-400 text-lg border-l-2 border-r-2 border-emerald-500">
                          {front9 || '—'}
                        </td>

                        {Array.from({ length: backCount }, (_, i) =>
                          renderHoleInput(
                            i + 10,
                            holes[i + 9]?.par || 4,
                            scores,
                            teamKey,
                            memberIds,
                            canEdit
                          )
                        )}

                        {numHoles > 9 && (
                          <td className="text-center py-3 px-6 font-semibold text-emerald-400 text-lg">
                            {back9 || '—'}
                          </td>
                        )}

                        <td className="text-center py-3 px-6 font-bold text-2xl text-white">
                          {gross || '—'}
                        </td>

                        {event?.use_handicaps && (
                          <td className="text-center py-3 px-6 font-bold text-2xl text-emerald-400">
                            {net || '—'}
                          </td>
                        )}

                        <td className="text-center py-3 px-4">
                          {savingKey === teamKey ? (
                            <span className="text-sm text-gray-400">
                              Saving...
                            </span>
                          ) : mode === 'locked' ? (
                            <button
                              type="button"
                              onClick={() =>
                                setRowMode((prev) => ({
                                  ...prev,
                                  [teamKey]: 'editing',
                                }))
                              }
                              className="bg-blue-600 hover:bg-blue-700 px-5 py-2.5 rounded-2xl text-sm font-medium"
                            >
                              Edit
                            </button>
                          ) : (
                            <div className="flex flex-col sm:flex-row gap-2 justify-center items-center">
                              <button
                                type="button"
                                onClick={() => {
                                  const label =
                                    mode === 'editing'
                                      ? `Resubmit score for ${teamKey}?`
                                      : `Submit score for ${teamKey}?`;
                                  if (!confirm(label)) return;
                                  saveTeamScores(memberIds, teamKey);
                                }}
                                className="bg-green-600 hover:bg-green-700 px-4 py-2.5 rounded-2xl text-sm font-medium"
                              >
                                Submit
                              </button>
                              {mode === 'editing' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRowMode((prev) => ({
                                      ...prev,
                                      [teamKey]: 'locked',
                                    }))
                                  }
                                  className="text-xs text-gray-400 hover:text-white"
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}