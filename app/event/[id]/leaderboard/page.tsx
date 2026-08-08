'use client';

import { useState, useEffect, useMemo } from 'react';
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

function getFlightFromHandicap(handicap: number, flights: any[]) {
  if (!flights || flights.length === 0) return '';

  const sortedFlights = [...flights].sort((a, b) =>
    String(a.range || '').localeCompare(String(b.range || ''))
  );

  for (const flight of sortedFlights) {
    const range = flight.range || '';
    if (range.includes('<') && handicap < parseFloat(range.replace('<', ''))) {
      return flight.name;
    }
    if (range.includes('-')) {
      const [low, high] = range.split('-').map(Number);
      if (handicap >= low && handicap <= high) return flight.name;
    }
  }
  return sortedFlights[sortedFlights.length - 1]?.name || '';
}

function formatToPar(toPar: number | null | undefined) {
  if (toPar == null) return '—';
  if (toPar === 0) return 'E';
  if (toPar > 0) return `+${toPar}`;
  return String(toPar);
}

function getParForHole(courseData: any, hole: number): number {
  const cd = courseData;
  if (!cd) return 4;

  let holes: any[] = [];
  if (Array.isArray(cd.scorecard)) holes = cd.scorecard;
  else if (cd.course?.scorecard) holes = cd.course.scorecard;
  else if (cd.holes) holes = cd.holes;

  if (!holes.length) return 4;

  const holeData =
    holes.find((x: any) => Number(x.Hole || x.hole) === hole) ||
    holes[hole - 1];

  return Number(holeData?.Par || holeData?.par) || 4;
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
  const n = (
    <span className="text-sm font-bold tabular-nums leading-none">{score}</span>
  );

  // Eagle or better — DOUBLE CIRCLE
  if (diff <= -2) {
    return (
      <span className="relative inline-flex items-center justify-center w-10 h-10">
        <span className="absolute inset-0 rounded-full border-2 border-emerald-400" />
        <span className="absolute inset-[4px] rounded-full border-2 border-emerald-400" />
        <span className="relative text-emerald-300">{n}</span>
      </span>
    );
  }

  // Birdie — single circle
  if (diff === -1) {
    return (
      <span className="inline-flex items-center justify-center w-10 h-10 rounded-full border-2 border-emerald-400 text-emerald-300">
        {n}
      </span>
    );
  }

  // Par — plain
  if (diff === 0) {
    return (
      <span className="inline-flex items-center justify-center w-10 h-10 text-white">
        {n}
      </span>
    );
  }

  // Bogey — single square
  if (diff === 1) {
    return (
      <span className="inline-flex items-center justify-center w-10 h-10 border-2 border-orange-400 text-orange-300">
        {n}
      </span>
    );
  }

  // Double bogey or higher — DOUBLE SQUARE
  return (
    <span className="relative inline-flex items-center justify-center w-10 h-10">
      <span className="absolute inset-0 border-2 border-red-400" />
      <span className="absolute inset-[4px] border-2 border-red-400" />
      <span className="relative text-red-300">{n}</span>
    </span>
  );
}

export default function EventLeaderboardPage() {
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
  const [selectedFlight, setSelectedFlight] = useState<string | 'all'>('all');
  const [showNet, setShowNet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [blurHoleInput, setBlurHoleInput] = useState('');
  const [savingBlur, setSavingBlur] = useState(false);
  const [scorecardTeam, setScorecardTeam] = useState<string | null>(null);

  const numHoles = useMemo(() => {
    const n = Number(event?.number_of_holes || 18);
    return n === 9 ? 9 : 18;
  }, [event]);

  const selectedRound = useMemo(() => {
    if (selectedRoundId === 'all') return null;
    return rounds.find((r) => r.id === selectedRoundId) || null;
  }, [rounds, selectedRoundId]);

  const checkedInRegs = useMemo(() => {
    return registrations.filter((r) => {
      if (!isCheckedInForRound(r, selectedRoundId)) return false;
      if (selectedRoundId === 'all') return true;
      const ids: number[] = r.selected_round_ids || [];
      if (!ids.length) return rounds.length <= 1;
      return ids.includes(selectedRoundId as number);
    });
  }, [registrations, selectedRoundId, rounds.length]);

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
      if (eventData?.leaderboard_blur_hole != null) {
        setBlurHoleInput(String(eventData.leaderboard_blur_hole));
      } else {
        setBlurHoleInput('');
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user && eventData) {
        const isCreator = eventData.created_by === user.id;
        const { data: adminRow } = await supabase
          .from('event_admins')
          .select('id')
          .eq('event_id', id)
          .or(`user_id.eq.${user.id},email.eq.${user.email}`)
          .maybeSingle();
        setIsAdmin(isCreator || !!adminRow);
      } else {
        setIsAdmin(false);
      }

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

  const loadScores = async () => {
    if (registrations.length === 0) {
      setPlayerScores({});
      return;
    }

    const regIds = registrations.map((r) => String(r.id));

    let query = supabase.from('scores').select('*').in('registration_id', regIds);

    if (selectedRoundId !== 'all') {
      query = query.eq('round_id', selectedRoundId);
    }

    const { data: scoreData, error } = await query;

    if (error) {
      console.error('Failed to load scores:', error);
      const { data: fallback } = await supabase
        .from('scores')
        .select('*')
        .in('registration_id', regIds);

      const loaded: Record<string, Record<number, number>> = {};
      (fallback || []).forEach((score: any) => {
        const rid = String(score.registration_id);
        if (!loaded[rid]) loaded[rid] = {};
        loaded[rid][score.hole] = score.score;
      });
      setPlayerScores(loaded);
      return;
    }

    const loaded: Record<string, Record<number, number>> = {};
    (scoreData || []).forEach((score: any) => {
      const rid = String(score.registration_id);
      if (!loaded[rid]) loaded[rid] = {};
      loaded[rid][score.hole] = score.score;
    });
    setPlayerScores(loaded);
  };

  useEffect(() => {
    loadScores();
  }, [registrations, selectedRoundId]);

  useEffect(() => {
    if (!eventId) return;

    const channel = supabase
      .channel(`leaderboard-scores-${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scores' },
        () => {
          loadScores();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_registrations',
          filter: `event_id=eq.${parseInt(eventId)}`,
        },
        async () => {
          const { data } = await supabase
            .from('event_registrations')
            .select('*')
            .eq('event_id', parseInt(eventId));
          setRegistrations(data || []);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  const leaderboardRows = useMemo(() => {
    let filtered = checkedInRegs;

    if (selectedFlight !== 'all' && event?.flights?.length) {
      filtered = filtered.filter((r) => {
        const flight =
          r.flight ||
          getFlightFromHandicap(Number(r.handicap) || 0, event.flights);
        return flight === selectedFlight;
      });
    }

    const isTeamEvent = (event?.max_teammates || 1) > 1;

    const grouped = filtered.reduce((acc: any, reg) => {
      const teamKey =
        isTeamEvent && reg.team_name
          ? reg.team_name
          : reg.player_name || 'Unknown';
      if (!acc[teamKey]) acc[teamKey] = [];
      acc[teamKey].push(reg);
      return acc;
    }, {});

    const courseHoles = (() => {
      const cd = event?.course_data;
      if (!cd) return null;
      if (Array.isArray(cd.scorecard)) return cd.scorecard;
      if (cd.course?.scorecard) return cd.course.scorecard;
      return null;
    })();

    const rows = Object.keys(grouped).map((teamName) => {
      const teamMembers = grouped[teamName];
      const scores: Record<number, number> = {};

      teamMembers.forEach((reg: any) => {
        const regScores = playerScores[String(reg.id)] || {};
        Object.keys(regScores).forEach((holeKey) => {
          const hole = Number(holeKey);
          const score = regScores[hole];
          if (score === undefined || score === null) return;
          scores[hole] =
            scores[hole] !== undefined
              ? Math.min(scores[hole], score)
              : score;
        });
      });

      const front9 = Array.from(
        { length: Math.min(9, numHoles) },
        (_, i) => scores[i + 1] || 0
      ).reduce((a, b) => a + b, 0);

      const back9 =
        numHoles > 9
          ? Array.from(
              { length: numHoles - 9 },
              (_, i) => scores[i + 10] || 0
            ).reduce((a, b) => a + b, 0)
          : 0;

      let total = front9 + back9;

      if (showNet && event?.use_handicaps) {
        const avgHandicap =
          teamMembers.reduce(
            (sum: number, r: any) => sum + (Number(r.handicap) || 0),
            0
          ) / teamMembers.length;
        total = Math.round(total - avgHandicap);
      }

      const holesPlayed = Object.keys(scores).filter(
        (h) => scores[Number(h)] != null && scores[Number(h)] > 0
      ).length;

      let parPlayed = 0;
      for (let h = 1; h <= numHoles; h++) {
        if (scores[h] != null && Number(scores[h]) > 0) {
          if (courseHoles && Array.isArray(courseHoles)) {
            const holeData =
              courseHoles[h - 1] ||
              courseHoles.find(
                (x: any) => Number(x.Hole || x.hole) === h
              );
            parPlayed += Number(holeData?.Par || holeData?.par) || 4;
          } else {
            parPlayed += 4;
          }
        }
      }

      const toPar = holesPlayed > 0 ? total - parPlayed : null;

      return {
        teamName,
        teamMembers,
        scores,
        front9,
        back9,
        total,
        holesPlayed,
        toPar,
        pairing: getPairingLabel(teamMembers[0], selectedRoundId),
      };
    });

    rows.sort((a, b) => {
      if (a.holesPlayed === 0 && b.holesPlayed > 0) return 1;
      if (b.holesPlayed === 0 && a.holesPlayed > 0) return -1;
      if (a.toPar != null && b.toPar != null && a.toPar !== b.toPar) {
        return a.toPar - b.toPar;
      }
      if (a.total !== b.total) return a.total - b.total;
      return a.teamName.localeCompare(b.teamName);
    });

    return rows;
  }, [
    checkedInRegs,
    playerScores,
    selectedFlight,
    event,
    numHoles,
    showNet,
    selectedRoundId,
  ]);

  const scorecardRow = useMemo(
    () => leaderboardRows.find((r) => r.teamName === scorecardTeam) || null,
    [leaderboardRows, scorecardTeam]
  );

  const blurHole =
    event?.leaderboard_blur_hole != null &&
    Number(event.leaderboard_blur_hole) > 0
      ? Number(event.leaderboard_blur_hole)
      : null;

  const blurActive = useMemo(() => {
    if (!blurHole) return false;
    return leaderboardRows.some((row) => row.holesPlayed >= blurHole);
  }, [blurHole, leaderboardRows]);

  // Admin / TV board is never blurred — players see blur on Live only
  const showBlurred = false;

  const saveBlurHole = async () => {
    setSavingBlur(true);
    const parsed = parseInt(blurHoleInput, 10);
    const val =
      blurHoleInput.trim() === '' || Number.isNaN(parsed)
        ? null
        : Math.min(numHoles, Math.max(1, parsed));

    const { error } = await supabase
      .from('tournaments')
      .update({ leaderboard_blur_hole: val })
      .eq('id', parseInt(eventId));

    setSavingBlur(false);
    if (error) {
      alert(error.message);
      return;
    }
    setEvent((prev: any) =>
      prev ? { ...prev, leaderboard_blur_hole: val } : prev
    );
    setBlurHoleInput(val != null ? String(val) : '');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        Loading leaderboard...
      </div>
    );
  }

  const headerTeeTime = selectedRound
    ? formatRoundTime(selectedRound.start_time)
    : null;

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
            <h1 className="text-4xl font-bold">{event?.name}</h1>
            <p className="text-gray-400 mt-1">
              Leaderboard · {event?.course || 'No course'} · Live standings
              {headerTeeTime ? ` · ${headerTeeTime}` : ''}
            </p>
            {selectedRound && (
              <p className="text-sm text-teal-400 mt-1">
                Round: {selectedRound.name}
                {headerTeeTime ? ` (${headerTeeTime})` : ''}
              </p>
            )}
          </div>

          {rounds.length > 0 && (
            <div className="w-full lg:w-72">
              <label className="block text-sm text-gray-400 mb-2">
                View by round
              </label>
              <select
                value={
                  selectedRoundId === 'all' ? 'all' : String(selectedRoundId)
                }
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedRoundId(v === 'all' ? 'all' : parseInt(v, 10));
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

        <div className="flex flex-wrap items-center gap-3 mb-8">
          <button
            onClick={() => setSelectedFlight('all')}
            className={`px-5 py-2.5 rounded-3xl font-medium text-sm transition-all ${
              selectedFlight === 'all'
                ? 'bg-white text-black shadow-sm'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            }`}
          >
            All Flights
          </button>

          {(event?.flights || []).map((flight: any, index: number) => (
            <button
              key={index}
              onClick={() => setSelectedFlight(flight.name)}
              className={`px-5 py-2.5 rounded-3xl font-medium text-sm transition-all ${
                selectedFlight === flight.name
                  ? 'bg-white text-black shadow-sm'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              {flight.name}
            </button>
          ))}

          {event?.use_handicaps && (
            <button
              onClick={() => setShowNet(!showNet)}
              className="ml-auto flex items-center gap-2 bg-gray-700 hover:bg-gray-600 rounded-3xl px-2 py-1 text-sm font-medium"
            >
              <span
                className={`px-5 py-2 rounded-3xl transition-all ${
                  !showNet ? 'bg-white text-black' : ''
                }`}
              >
                Gross Score
              </span>
              <span
                className={`px-5 py-2 rounded-3xl transition-all ${
                  showNet ? 'bg-emerald-500 text-white' : ''
                }`}
              >
                Net (HDCP)
              </span>
            </button>
          )}
        </div>

        {isAdmin && (
          <div className="bg-gray-800 border border-indigo-500/30 rounded-2xl p-5 mb-6 flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-2">
                Blur after this many holes
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Everyone sees live standings until any team has scores on this
                many holes (e.g. 13 = first team through 13 holes). Then the
                board blurs for players. Leave blank to disable.
              </p>
              <input
                type="number"
                min={1}
                max={numHoles}
                value={blurHoleInput}
                onChange={(e) => setBlurHoleInput(e.target.value)}
                placeholder={`e.g. 13 (1–${numHoles})`}
                className="w-full sm:w-48 bg-gray-900 border border-gray-600 rounded-xl px-4 py-3"
              />
            </div>
            <button
              type="button"
              onClick={saveBlurHole}
              disabled={savingBlur}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 px-6 py-3 rounded-2xl font-medium"
            >
              {savingBlur ? 'Saving…' : 'Save blur hole'}
            </button>
            {blurActive && (
              <p className="text-sm text-amber-400 sm:ml-2">
                Player leaderboard is blurred (a team has completed {blurHole}{' '}
                holes)
              </p>
            )}
          </div>
        )}

        {checkedInRegs.length === 0 ? (
          <div className="bg-gray-800 rounded-3xl p-16 text-center text-gray-400">
            No players checked in
            {selectedRoundId !== 'all' ? ' for this round' : ''} yet.
            <br />
            Check players in, then enter scores on the Scoring page.
          </div>
        ) : (
          <div className="relative bg-gray-800 rounded-3xl p-4 md:p-6 overflow-x-auto">
            {showBlurred && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-3xl bg-gray-900/70 backdrop-blur-md">
                <div className="text-center px-6">
                  <p className="text-xl font-semibold text-white mb-2">
                    Leaderboard hidden
                  </p>
                  <p className="text-gray-300 text-sm max-w-sm">
                    Standings are blurred once any team has completed {blurHole}{' '}
                    holes. Check back after your round.
                  </p>
                </div>
              </div>
            )}
            <table
              className={`w-full border-collapse min-w-[1100px] ${
                showBlurred ? 'select-none pointer-events-none opacity-40' : ''
              }`}
            >
              <thead>
                <tr className="border-b border-gray-700 bg-gray-900">
                  <th className="text-left py-4 px-6 font-medium w-16">Pos</th>
                  <th className="text-left py-4 px-6 font-medium">Team</th>
                  {Array.from({ length: numHoles }, (_, i) => (
                    <th
                      key={i}
                      className="text-center py-4 px-3 font-medium text-sm w-10"
                    >
                      {i + 1}
                    </th>
                  ))}
                  <th className="text-center py-4 px-6 font-medium text-emerald-400">
                    {numHoles > 9 ? 'Out' : 'Thru'}
                  </th>
                  {numHoles > 9 && (
                    <th className="text-center py-4 px-6 font-medium text-emerald-400">
                      In
                    </th>
                  )}
                  <th className="text-center py-4 px-6 font-medium">
                    {showNet ? 'Net vs par' : 'vs par'}
                  </th>
                </tr>
              </thead>

              <tbody>
                {(() => {
                  let rank = 1;
                  return leaderboardRows.map((row, index) => {
                    const prevToPar =
                      index > 0 ? leaderboardRows[index - 1].toPar : null;
                    if (row.toPar !== prevToPar) rank = index + 1;

                    const position =
                      row.holesPlayed === 0
                        ? '—'
                        : rank === 1
                          ? '1'
                          : leaderboardRows[index - 1]?.toPar === row.toPar
                            ? `T${rank}`
                            : String(rank);

                    return (
                      <tr
                        key={row.teamName}
                        className="border-b border-gray-700 hover:bg-gray-700/50"
                      >
                        <td className="py-5 px-6 font-bold text-lg text-center">
                          {position}
                        </td>
                        <td className="py-5 px-6 font-medium">
                          {row.teamName}
                          {row.pairing && (
                            <div className="text-xs text-teal-400 mt-0.5">
                              {row.pairing}
                            </div>
                          )}
                          {row.teamMembers.length > 1 && (
                            <div className="text-xs text-gray-500 mt-0.5">
                              {row.teamMembers
                                .map((m: any) => m.player_name)
                                .join(', ')}
                            </div>
                          )}
                        </td>

                        {Array.from({ length: numHoles }, (_, i) => {
                          const hole = i + 1;
                          const par = getParForHole(event?.course_data, hole);
                          return (
                            <td
                              key={hole}
                              className="text-center py-3 px-1"
                            >
                              <div className="flex justify-center">
                                <ScoreMark
                                  score={row.scores[hole]}
                                  par={par}
                                />
                              </div>
                            </td>
                          );
                        })}

                        <td className="text-center py-5 px-6 font-semibold text-emerald-400 text-lg">
                          {row.front9 || '—'}
                        </td>
                        {numHoles > 9 && (
                          <td className="text-center py-5 px-6 font-semibold text-emerald-400 text-lg">
                            {row.back9 || '—'}
                          </td>
                        )}
                        <td className="text-center py-5 px-6">
                          <button
                            type="button"
                            onClick={() => setScorecardTeam(row.teamName)}
                            className={`font-bold text-2xl underline-offset-4 hover:underline ${
                              row.toPar == null
                                ? 'text-gray-500'
                                : row.toPar < 0
                                  ? 'text-emerald-400'
                                  : row.toPar > 0
                                    ? 'text-orange-400'
                                    : 'text-white'
                            }`}
                            title="View scorecard"
                          >
                            {formatToPar(row.toPar)}
                          </button>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-sm text-gray-500 mt-6">
          Scores update live when saved on the Scoring page
          {selectedRound ? ` for ${selectedRound.name}` : ''}. Tap a score to
          view the scorecard.
        </p>
      </div>

      {scorecardRow && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 md:p-8">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold">{scorecardRow.teamName}</h2>
                {scorecardRow.pairing && (
                  <p className="text-sm text-teal-400 mt-1">
                    {scorecardRow.pairing}
                  </p>
                )}
                <p className="text-sm text-gray-400 mt-1">
                  {scorecardRow.teamMembers
                    .map((m: any) => m.player_name)
                    .join(', ')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScorecardTeam(null)}
                className="text-gray-400 hover:text-white text-sm"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-6">
              {Array.from({ length: numHoles }, (_, i) => {
                const hole = i + 1;
                const s = scorecardRow.scores[hole];
                const par = getParForHole(event?.course_data, hole);
                return (
                  <div
                    key={hole}
                    className="bg-gray-900 rounded-xl p-3 text-center"
                  >
                    <div className="text-xs text-gray-500">
                      H{hole} · p{par}
                    </div>
                    <div className="mt-1 flex justify-center min-h-[2.25rem] items-center">
                      <ScoreMark score={s} par={par} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between text-sm text-gray-400 border-t border-gray-700 pt-4">
              <span>
                Thru {scorecardRow.holesPlayed} · Out{' '}
                {scorecardRow.front9 || '—'}
                {numHoles > 9 ? ` · In ${scorecardRow.back9 || '—'}` : ''}
              </span>
              <span
                className={
                  scorecardRow.toPar == null
                    ? ''
                    : scorecardRow.toPar < 0
                      ? 'text-emerald-400 font-semibold'
                      : scorecardRow.toPar > 0
                        ? 'text-orange-400 font-semibold'
                        : 'text-white font-semibold'
                }
              >
                {formatToPar(scorecardRow.toPar)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}