'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

type Tab = 'upcoming' | 'live' | 'past';

function formatToPar(toPar: number | null | undefined) {
  if (toPar == null) return '—';
  if (toPar === 0) return 'E';
  if (toPar > 0) return `+${toPar}`;
  return String(toPar);
}

function ScoreMark({
  score,
  par,
}: {
  score: number | null | undefined;
  par: number;
}) {
  if (score == null || score <= 0) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 text-gray-500 text-sm">
        —
      </span>
    );
  }

  const diff = score - par;
  const base =
    'inline-flex items-center justify-center w-8 h-8 text-sm font-semibold';

  if (diff <= -2) {
    return (
      <span className={`${base} rounded-full border-2 border-emerald-400`}>
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-emerald-300 text-emerald-300 text-xs">
          {score}
        </span>
      </span>
    );
  }
  if (diff === -1) {
    return (
      <span
        className={`${base} rounded-full border-2 border-emerald-400 text-emerald-300`}
      >
        {score}
      </span>
    );
  }
  if (diff === 0) {
    return <span className={`${base} text-white`}>{score}</span>;
  }
  if (diff === 1) {
    return (
      <span
        className={`${base} border-2 border-orange-400 text-orange-300 rounded-sm`}
      >
        {score}
      </span>
    );
  }
  return (
    <span className={`${base} border-2 border-red-400 rounded-sm`}>
      <span className="inline-flex items-center justify-center w-5 h-5 border border-red-300 text-red-300 text-xs">
        {score}
      </span>
    </span>
  );
}

export default function MyEventsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [rounds, setRounds] = useState<any[]>([]);

  // Leaderboard modal
  const [lbOpen, setLbOpen] = useState(false);
  const [lbEvent, setLbEvent] = useState<any>(null);
  const [lbRoundId, setLbRoundId] = useState<number | null>(null);
  const [lbRows, setLbRows] = useState<any[]>([]);
  const [lbLoading, setLbLoading] = useState(false);
  const [scorecardTeam, setScorecardTeam] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login?redirect=/dashboard/play');
        return;
      }
      setCurrentUser(user);

      const { data: regs } = await supabase
        .from('event_registrations')
        .select('*')
        .or(`user_id.eq.${user.id},player_email.eq.${user.email}`);

      const userRegs = regs || [];
      setRegistrations(userRegs);

      if (userRegs.length === 0) {
        setEvents([]);
        setRounds([]);
        setLoading(false);
        return;
      }

      const eventIds = [
        ...new Set(userRegs.map((r: any) => r.event_id).filter(Boolean)),
      ];

      const { data: eventRows } = await supabase
        .from('tournaments')
        .select('*')
        .in('id', eventIds);

      setEvents(eventRows || []);

      const { data: roundRows } = await supabase
        .from('event_rounds')
        .select('*')
        .in('event_id', eventIds)
        .order('sort_order', { ascending: true });

      setRounds(roundRows || []);
      setLoading(false);
    };

    load();
  }, [router, supabase]);

  const today = new Date().toISOString().slice(0, 10);

  const grouped = useMemo(() => {
    const byEvent = new Map<number, any[]>();
    for (const reg of registrations) {
      if (!byEvent.has(reg.event_id)) byEvent.set(reg.event_id, []);
      byEvent.get(reg.event_id)!.push(reg);
    }

    const upcoming: any[] = [];
    const live: any[] = [];
    const past: any[] = [];

    for (const event of events) {
      const regs = byEvent.get(event.id) || [];
      const eventDate = (event.date || '').slice(0, 10);
      const isCheckedIn = regs.some((r: any) => r.checked_in);
      const isLive = eventDate === today && isCheckedIn;
      const isPast = eventDate < today && !isLive;
      const isUpcoming =
        eventDate > today || (eventDate === today && !isCheckedIn);

      const item = { event, regs, isCheckedIn };

      if (isLive) live.push(item);
      else if (isPast) past.push(item);
      else if (isUpcoming) upcoming.push(item);
    }

    const byDate = (a: any, b: any) =>
      (a.event.date || '').localeCompare(b.event.date || '');

    upcoming.sort(byDate);
    live.sort(byDate);
    past.sort((a, b) => byDate(b, a));

    return { upcoming, live, past };
  }, [events, registrations, today]);

  const getRoundNames = (reg: any) => {
    const ids: number[] = Array.isArray(reg.selected_round_ids)
      ? reg.selected_round_ids
      : reg.round_id
        ? [reg.round_id]
        : [];
    return rounds
      .filter((r) => ids.map(String).includes(String(r.id)))
      .map((r) => r.name);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const loadLeaderboardRows = async (
    eventId: number,
    roundId: number | null,
    maxTeammates: number
  ) => {
    const { data: regs } = await supabase
      .from('event_registrations')
      .select('*')
      .eq('event_id', eventId);

    const regList = regs || [];
    if (regList.length === 0) {
      setLbRows([]);
      return;
    }

    const regIds = regList.map((r: any) => String(r.id));
    let query = supabase
      .from('scores')
      .select('*')
      .in('registration_id', regIds);
    if (roundId != null) query = query.eq('round_id', roundId);

    const { data: scoreRows } = await query;

    const byReg: Record<string, Record<number, number>> = {};
    (scoreRows || []).forEach((s: any) => {
      const id = String(s.registration_id);
      if (!byReg[id]) byReg[id] = {};
      if (Number(s.score) > 0) byReg[id][s.hole] = Number(s.score);
    });

    const teamMode = maxTeammates > 1;
    const groups: Record<string, { scores: Record<number, number> }> = {};

    regList.forEach((r: any) => {
      const key =
        teamMode && r.team_name ? r.team_name : r.player_name || 'Player';
      const id = String(r.id);
      const holeMap = byReg[id] || {};
      if (!groups[key]) groups[key] = { scores: {} };
      Object.entries(holeMap).forEach(([hStr, sc]) => {
        const h = Number(hStr);
        const prev = groups[key].scores[h];
        groups[key].scores[h] =
          prev !== undefined ? Math.min(prev, Number(sc)) : Number(sc);
      });
    });

    const rows = Object.entries(groups)
      .map(([name, g]) => {
        let total = 0;
        let parSum = 0;
        let holesPlayed = 0;
        Object.entries(g.scores).forEach(([, sc]) => {
          if (sc > 0) {
            total += sc;
            holesPlayed += 1;
            parSum += 4; // default until course data is wired
          }
        });
        return {
          name,
          total,
          holesPlayed,
          toPar: holesPlayed > 0 ? total - parSum : null,
          scores: g.scores,
        };
      })
      .filter((r) => r.holesPlayed > 0)
      .sort((a, b) => {
        if (a.toPar != null && b.toPar != null && a.toPar !== b.toPar) {
          return a.toPar - b.toPar;
        }
        return a.total - b.total;
      });

    setLbRows(rows);
  };

  const openLeaderboard = async (event: any) => {
    setLbEvent(event);
    setLbOpen(true);
    setLbLoading(true);
    setScorecardTeam(null);

    const eventRounds = rounds.filter((r) => r.event_id === event.id);
    const firstRoundId = eventRounds[0]?.id ?? null;
    setLbRoundId(firstRoundId);

    await loadLeaderboardRows(
      event.id,
      firstRoundId,
      event.max_teammates || 1
    );
    setLbLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-xl text-gray-400">Loading your events…</p>
      </div>
    );
  }

  const list =
    tab === 'upcoming'
      ? grouped.upcoming
      : tab === 'live'
        ? grouped.live
        : grouped.past;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-4xl font-bold mb-2">My Events</h1>
          <p className="text-gray-400">
            Events you’re registered for, live scoring, and past results.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 border-b border-gray-700 pb-1">
          {(
            [
              {
                id: 'upcoming' as const,
                label: 'Upcoming',
                count: grouped.upcoming.length,
              },
              {
                id: 'live' as const,
                label: 'Live',
                count: grouped.live.length,
              },
              {
                id: 'past' as const,
                label: 'Past',
                count: grouped.past.length,
              },
            ]
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-3 rounded-t-xl text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'bg-gray-800 text-white border-b-2 border-emerald-500'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className="ml-2 text-xs bg-gray-700 px-2 py-0.5 rounded-full">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Empty state */}
        {list.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            {tab === 'upcoming' && (
              <>
                <p className="text-lg mb-4">No upcoming events yet.</p>
                <Link
                  href="/"
                  className="inline-block bg-emerald-600 hover:bg-emerald-700 px-6 py-3 rounded-2xl font-medium"
                >
                  Browse Events
                </Link>
              </>
            )}
            {tab === 'live' && (
              <p className="text-lg">
                No live events right now. Check in on the day of the event to
                see live scoring here.
              </p>
            )}
            {tab === 'past' && (
              <p className="text-lg">No past events yet.</p>
            )}
          </div>
        )}

        {/* Event cards */}
        <div className="space-y-5">
          {list.map(({ event, regs, isCheckedIn }) => {
            const teams = [
              ...new Set(
                regs.map((r: any) => r.team_name).filter(Boolean)
              ),
            ];
            const allRoundNames = [
              ...new Set(
                regs.flatMap((r: any) => getRoundNames(r))
              ),
            ];

            return (
              <div
                key={event.id}
                className="bg-gray-800 rounded-3xl p-6 md:p-8 border border-gray-700"
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="flex-1">
                    <h2 className="text-2xl font-semibold mb-1">
                      {event.name}
                    </h2>
                    <p className="text-gray-400 text-sm mb-3">
                      {formatDate(event.date)}
                      {event.course ? ` · ${event.course}` : ''}
                    </p>

                    {teams.length > 0 && (
                      <p className="text-sm text-gray-300 mb-1">
                        <span className="text-gray-500">Team:</span>{' '}
                        {teams.join(', ')}
                      </p>
                    )}
                    {allRoundNames.length > 0 && (
                      <p className="text-sm text-gray-300">
                        <span className="text-gray-500">Rounds:</span>{' '}
                        {allRoundNames.join(', ')}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 shrink-0">
                    {tab === 'upcoming' && (
                      <>
                        <Link
                          href={`/event/${event.id}`}
                          className="px-5 py-3 rounded-2xl bg-gray-700 hover:bg-gray-600 text-center font-medium text-sm"
                        >
                          Event Details
                        </Link>
                        <Link
                          href={`/event/${event.id}`}
                          className="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-center font-medium text-sm"
                        >
                          Add Players
                        </Link>
                      </>
                    )}

                    {tab === 'live' && (
                      <>
                        <Link
                          href={`/event/${event.id}/live`}
                          className="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-center font-medium text-sm"
                        >
                          Live Scoring
                        </Link>
                        <button
                          type="button"
                          onClick={() => openLeaderboard(event)}
                          className="px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-center font-medium text-sm"
                        >
                          Leaderboard
                        </button>
                      </>
                    )}

                    {tab === 'past' && (
                      <>
                        <button
                          type="button"
                          onClick={() => openLeaderboard(event)}
                          className="px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-center font-medium text-sm"
                        >
                          Leaderboard
                        </button>
                  
                      </>
                    )}
                  </div>
                </div>

                {tab === 'live' && !isCheckedIn && (
                  <p className="mt-4 text-amber-400 text-sm">
                    You haven’t been checked in yet. Find the check-in desk or
                    contact the organizer.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Leaderboard Modal */}
      {lbOpen && lbEvent && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-700 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">{lbEvent.name}</h2>
                <p className="text-sm text-gray-400 mt-1">Leaderboard</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLbOpen(false);
                  setScorecardTeam(null);
                }}
                className="text-gray-400 hover:text-white text-sm"
              >
                Close
              </button>
            </div>

            {rounds.filter((r) => r.event_id === lbEvent.id).length > 0 && (
              <div className="px-6 pt-4">
                <select
                  value={lbRoundId ?? ''}
                  onChange={async (e) => {
                    const id = e.target.value
                      ? parseInt(e.target.value, 10)
                      : null;
                    setLbRoundId(id);
                    setLbLoading(true);
                    await loadLeaderboardRows(
                      lbEvent.id,
                      id,
                      lbEvent.max_teammates || 1
                    );
                    setLbLoading(false);
                  }}
                  className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-sm"
                >
                  {rounds
                    .filter((r) => r.event_id === lbEvent.id)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div className="p-6">
              {lbLoading ? (
                <p className="text-center text-gray-400 py-10">Loading…</p>
              ) : lbRows.length === 0 ? (
                <p className="text-center text-gray-400 py-10">
                  No scores yet.
                </p>
              ) : (
                <ul className="divide-y divide-gray-700">
                  {lbRows.map((row, i) => (
                    <li key={row.name}>
                      <button
                        type="button"
                        onClick={() => setScorecardTeam(row.name)}
                        className="w-full flex items-center justify-between py-4 text-left hover:bg-gray-700/50 rounded-xl px-2 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-sm font-bold ${
                              i === 0
                                ? 'bg-amber-500 text-black'
                                : i === 1
                                  ? 'bg-gray-400 text-black'
                                  : i === 2
                                    ? 'bg-amber-800 text-white'
                                    : 'bg-gray-700 text-gray-400'
                            }`}
                          >
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{row.name}</p>
                            <p className="text-xs text-gray-500">
                              {row.holesPlayed} hole
                              {row.holesPlayed === 1 ? '' : 's'}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-2xl font-bold tabular-nums ml-3 ${
                            row.toPar == null
                              ? 'text-gray-500'
                              : row.toPar < 0
                                ? 'text-emerald-400'
                                : row.toPar > 0
                                  ? 'text-orange-400'
                                  : 'text-white'
                          }`}
                        >
                          {formatToPar(row.toPar)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

            {/* Scorecard popup — traditional layout */}
      {scorecardTeam && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 md:p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-2xl font-bold">{scorecardTeam}</h2>
                <p className="text-sm text-gray-400 mt-1">
                  {lbEvent?.name}
                  {lbRoundId
                    ? ` · ${
                        rounds.find((r) => r.id === lbRoundId)?.name || ''
                      }`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScorecardTeam(null)}
                className="text-gray-400 hover:text-white text-sm shrink-0"
              >
                Close
              </button>
            </div>

            {(() => {
              const row = lbRows.find((r) => r.name === scorecardTeam);
              const scoresMap = row?.scores || {};
              const numHoles = 18;

              const front = Array.from({ length: 9 }, (_, i) => i + 1);
              const back = Array.from({ length: 9 }, (_, i) => i + 10);

              const sumHoles = (holes: number[]) =>
                holes.reduce((sum, h) => sum + (scoresMap[h] > 0 ? scoresMap[h] : 0), 0);

              const outTotal = sumHoles(front);
              const inTotal = sumHoles(back);
              const grandTotal = outTotal + inTotal;

              // Default par 4 until course data is wired
              const parFor = (_h: number) => 4;
              const outPar = front.reduce((s, h) => s + parFor(h), 0);
              const inPar = back.reduce((s, h) => s + parFor(h), 0);
              const totalPar = outPar + inPar;

              const toPar =
                row?.holesPlayed > 0 ? grandTotal - totalPar : null;

              return (
                <>
                  <div className="overflow-x-auto -mx-1 px-1 pb-2">
                    <table className="border-collapse text-sm min-w-[640px] w-full">
                      <thead>
                        <tr className="bg-gray-950">
                          <th className="text-left py-2.5 px-2 font-semibold text-gray-300 sticky left-0 bg-gray-950 z-10 min-w-[52px]">
                            HOLE
                          </th>
                          {front.map((h) => (
                            <th
                              key={`h-${h}`}
                              className="text-center py-2.5 px-1.5 font-medium text-gray-300 w-9"
                            >
                              {h}
                            </th>
                          ))}
                          <th className="text-center py-2.5 px-2 font-semibold text-emerald-400 bg-gray-900/80">
                            OUT
                          </th>
                          {back.map((h) => (
                            <th
                              key={`h-${h}`}
                              className="text-center py-2.5 px-1.5 font-medium text-gray-300 w-9"
                            >
                              {h}
                            </th>
                          ))}
                          <th className="text-center py-2.5 px-2 font-semibold text-emerald-400 bg-gray-900/80">
                            IN
                          </th>
                          <th className="text-center py-2.5 px-2 font-semibold text-white bg-gray-900">
                            TOT
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* PAR row */}
                        <tr className="border-t border-gray-700">
                          <td className="py-2 px-2 font-semibold text-gray-400 sticky left-0 bg-gray-800 z-10">
                            PAR
                          </td>
                          {front.map((h) => (
                            <td
                              key={`p-${h}`}
                              className="text-center py-2 px-1.5 text-gray-400"
                            >
                              {parFor(h)}
                            </td>
                          ))}
                          <td className="text-center py-2 px-2 font-semibold text-emerald-400/80 bg-gray-900/40">
                            {outPar}
                          </td>
                          {back.map((h) => (
                            <td
                              key={`p-${h}`}
                              className="text-center py-2 px-1.5 text-gray-400"
                            >
                              {parFor(h)}
                            </td>
                          ))}
                          <td className="text-center py-2 px-2 font-semibold text-emerald-400/80 bg-gray-900/40">
                            {inPar}
                          </td>
                          <td className="text-center py-2 px-2 font-semibold text-gray-300 bg-gray-900/60">
                            {totalPar}
                          </td>
                        </tr>

                        {/* SCORE row */}
                        <tr className="border-t border-gray-700">
                          <td className="py-2.5 px-2 font-semibold text-white sticky left-0 bg-gray-800 z-10">
                            SCORE
                          </td>
                          {front.map((h) => (
                            <td key={`s-${h}`} className="text-center py-2.5 px-1">
                              <div className="flex justify-center">
                                <ScoreMark
                                  score={
                                    scoresMap[h] > 0 ? scoresMap[h] : null
                                  }
                                  par={parFor(h)}
                                />
                              </div>
                            </td>
                          ))}
                          <td className="text-center py-2.5 px-2 font-bold text-emerald-400 text-base bg-gray-900/40">
                            {outTotal || '—'}
                          </td>
                          {back.map((h) => (
                            <td key={`s-${h}`} className="text-center py-2.5 px-1">
                              <div className="flex justify-center">
                                <ScoreMark
                                  score={
                                    scoresMap[h] > 0 ? scoresMap[h] : null
                                  }
                                  par={parFor(h)}
                                />
                              </div>
                            </td>
                          ))}
                          <td className="text-center py-2.5 px-2 font-bold text-emerald-400 text-base bg-gray-900/40">
                            {inTotal || '—'}
                          </td>
                          <td className="text-center py-2.5 px-2 font-bold text-white text-lg bg-gray-900/60">
                            {grandTotal || '—'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-gray-500 mb-4 md:hidden">
                    Swipe sideways to see the full card →
                  </p>

                  <div className="flex justify-between items-center text-sm border-t border-gray-700 pt-4">
                    <span className="text-gray-400">vs par</span>
                    <span
                      className={`text-xl font-bold ${
                        toPar == null
                          ? 'text-gray-400'
                          : toPar < 0
                            ? 'text-emerald-400'
                            : toPar > 0
                              ? 'text-orange-400'
                              : 'text-white'
                      }`}
                    >
                      {formatToPar(toPar)}
                    </span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
         
    </div>
  );
}