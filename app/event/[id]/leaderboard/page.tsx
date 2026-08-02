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
    Record<number, Record<number, number>>
  >({});
  const [selectedFlight, setSelectedFlight] = useState<string | 'all'>('all');
  const [showNet, setShowNet] = useState(false);
  const [loading, setLoading] = useState(true);

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

  // Real-time score refresh
  useEffect(() => {
    if (!eventId) return;

    const channel = supabase
      .channel(`leaderboard-scores-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scores',
        },
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

  const loadScores = async () => {
    if (registrations.length === 0) {
      setPlayerScores({});
      return;
    }

    let query = supabase
      .from('scores')
      .select('*')
      .in(
        'registration_id',
        registrations.map((r) => r.id)
      );

    if (selectedRoundId !== 'all') {
      query = query.eq('round_id', selectedRoundId);
    }

    const { data: scoreData, error } = await query;

    if (error) {
      console.error('Failed to load scores:', error);
      const { data: fallback } = await supabase
        .from('scores')
        .select('*')
        .in(
          'registration_id',
          registrations.map((r) => r.id)
        );

      const loaded: Record<number, Record<number, number>> = {};
      (fallback || []).forEach((score: any) => {
        if (!loaded[score.registration_id]) loaded[score.registration_id] = {};
        loaded[score.registration_id][score.hole] = score.score;
      });
      setPlayerScores(loaded);
      return;
    }

    const loaded: Record<number, Record<number, number>> = {};
    (scoreData || []).forEach((score: any) => {
      if (!loaded[score.registration_id]) loaded[score.registration_id] = {};
      loaded[score.registration_id][score.hole] = score.score;
    });
    setPlayerScores(loaded);
  };

  useEffect(() => {
    loadScores();
  }, [registrations, selectedRoundId]);

  const leaderboardRows = useMemo(() => {
    let filtered = checkedInRegs;

    // Flight filter
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

    const rows = Object.keys(grouped).map((teamName) => {
      const teamMembers = grouped[teamName];
      const scores: Record<number, number> = {};

      // Team score = min score per hole across members (scramble-friendly)
      // For individual events there's only one member
      teamMembers.forEach((reg: any) => {
        const regScores = playerScores[reg.id] || {};
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

      return {
        teamName,
        teamMembers,
        scores,
        front9,
        back9,
        total,
        holesPlayed,
        pairing: getPairingLabel(teamMembers[0], selectedRoundId),
      };
    });

    // Sort: teams with scores first, then by total ascending
    rows.sort((a, b) => {
      if (a.holesPlayed === 0 && b.holesPlayed > 0) return 1;
      if (b.holesPlayed === 0 && a.holesPlayed > 0) return -1;
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

        {/* Flight filters + Gross/Net */}
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

        {checkedInRegs.length === 0 ? (
          <div className="bg-gray-800 rounded-3xl p-16 text-center text-gray-400">
            No players checked in
            {selectedRoundId !== 'all' ? ' for this round' : ''} yet.
            <br />
            Check players in, then enter scores on the Scoring page.
          </div>
        ) : (
          <div className="bg-gray-800 rounded-3xl p-4 md:p-6 overflow-x-auto">
            <table className="w-full border-collapse min-w-[1100px]">
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
                    {showNet ? 'Net' : 'Total'}
                  </th>
                </tr>
              </thead>

              <tbody>
                {(() => {
                  let rank = 1;
                  return leaderboardRows.map((row, index) => {
                    const prevTotal =
                      index > 0 ? leaderboardRows[index - 1].total : null;
                    if (row.total !== prevTotal) rank = index + 1;

                    const position =
                      row.holesPlayed === 0
                        ? '—'
                        : rank === 1
                          ? '1'
                          : leaderboardRows[index - 1]?.total === row.total
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
                          return (
                            <td
                              key={hole}
                              className="text-center py-5 px-2 font-medium text-gray-300"
                            >
                              {row.scores[hole] || '—'}
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
                        <td className="text-center py-5 px-6 font-bold text-2xl text-white">
                          {row.holesPlayed > 0 ? row.total : '—'}
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
          {selectedRound ? ` for ${selectedRound.name}` : ''}.
        </p>
      </div>
    </div>
  );
}