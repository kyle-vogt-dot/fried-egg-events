'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import QRCode from 'qrcode';

function formatToPar(toPar: number | null | undefined) {
  if (toPar == null) return '—';
  if (toPar === 0) return 'E';
  if (toPar > 0) return `+${toPar}`;
  return String(toPar);
}

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

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

/** Pars from event.course_data; fallback par 4 */
function getParMap(courseData: any, numHoles: number): Record<number, number> {
  const map: Record<number, number> = {};
  for (let i = 1; i <= numHoles; i++) map[i] = 4;
  if (!courseData) return map;

  const root = courseData.course || courseData.data || courseData;
  let raw: any[] = [];
  if (Array.isArray(root.scorecard) && root.scorecard.length) raw = root.scorecard;
  else if (Array.isArray(root.holes) && root.holes.length) raw = root.holes;
  else if (Array.isArray(courseData.scorecard)) raw = courseData.scorecard;

  raw.forEach((h: any, i: number) => {
    const hole = Number(h.hole ?? h.Hole ?? i + 1);
    const par = Number(h.par ?? h.Par ?? 0);
    if (hole >= 1 && hole <= numHoles && par > 0) map[hole] = par;
  });
  return map;
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
  if (diff === 0) return <span className={`${base} text-white`}>{score}</span>;
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

type EventItem = {
  event: any;
  regs: any[];
  isCheckedIn: boolean;
  isLocked: boolean;
};

export default function MyEventsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [rounds, setRounds] = useState<any[]>([]);

  // Expanded upcoming/past detail
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState<'details' | 'invite'>('details');
  const [inviteQr, setInviteQr] = useState<string | null>(null);

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
        .or(`user_id.eq.${user.id},player_email.eq.${user.email}`)
        .eq('paid', true);

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

  const { live, upcoming, past } = useMemo(() => {
    const byEvent = new Map<number, any[]>();
    for (const reg of registrations) {
      if (!byEvent.has(reg.event_id)) byEvent.set(reg.event_id, []);
      byEvent.get(reg.event_id)!.push(reg);
    }

    const liveList: EventItem[] = [];
    const upcomingList: EventItem[] = [];
    const pastList: EventItem[] = [];

    for (const event of events) {
      const regs = byEvent.get(event.id) || [];
      const eventDate = (event.date || '').slice(0, 10);
      const isCheckedIn = regs.some((r: any) => r.checked_in);
      const isLocked = !!event.is_locked;
      const item: EventItem = { event, regs, isCheckedIn, isLocked };

      // Locked / finished → past
      if (isLocked || eventDate < today) {
        pastList.push(item);
        continue;
      }

      // Day-of + checked in → live
      if (eventDate === today && isCheckedIn) {
        liveList.push(item);
        continue;
      }

      // Future, or today not checked in → upcoming
      upcomingList.push(item);
    }

    const byDate = (a: EventItem, b: EventItem) =>
      (a.event.date || '').localeCompare(b.event.date || '');

    upcomingList.sort(byDate);
    liveList.sort(byDate);
    pastList.sort((a, b) => byDate(b, a));

    return { live: liveList, upcoming: upcomingList, past: pastList };
  }, [events, registrations, today]);

  const selectedItem = useMemo(() => {
    if (selectedId == null) return null;
    return (
      [...live, ...upcoming, ...past].find((x) => x.event.id === selectedId) ||
      null
    );
  }, [selectedId, live, upcoming, past]);

  // Invite QR for selected event + first team
  useEffect(() => {
    if (!selectedItem || detailTab !== 'invite') {
      setInviteQr(null);
      return;
    }
    const team =
      selectedItem.regs.find((r) => r.team_name)?.team_name || '';
    const origin =
      typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/event/${selectedItem.event.id}${
      team ? `?joinTeam=${encodeURIComponent(team)}` : ''
    }`;
    QRCode.toDataURL(url, { width: 280, margin: 1, errorCorrectionLevel: 'M' })
      .then(setInviteQr)
      .catch(() => setInviteQr(null));
  }, [selectedItem, detailTab]);

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

  const loadLeaderboardRows = async (
    event: any,
    roundId: number | null
  ) => {
    const eventId = event.id;
    const { data: regs } = await supabase
      .from('event_registrations')
      .select('*')
      .eq('event_id', eventId)
      .eq('paid', true);

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

    const numHoles = Number(event.number_of_holes) === 9 ? 9 : 18;
    const parMap = getParMap(event.course_data, numHoles);
    const teamMode = (event.max_teammates || 1) > 1;
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
        Object.entries(g.scores).forEach(([hStr, sc]) => {
          if (sc > 0) {
            total += sc;
            holesPlayed += 1;
            parSum += parMap[Number(hStr)] || 4;
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
    await loadLeaderboardRows(event, firstRoundId);
    setLbLoading(false);
  };

  const openDetail = (id: number) => {
    setSelectedId(id);
    setDetailTab('details');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-xl text-gray-400">Loading your events…</p>
      </div>
    );
  }

  const EventCard = ({
    item,
    badge,
    onClick,
  }: {
    item: EventItem;
    badge?: string;
    onClick?: () => void;
  }) => {
    const { event, regs } = item;
    const teams = [
      ...new Set(regs.map((r: any) => r.team_name).filter(Boolean)),
    ];
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left bg-gray-800 rounded-3xl overflow-hidden border border-gray-700 hover:border-gray-500 transition-colors"
      >
        <div className="relative h-36 bg-gray-900">
          {event.image_url ? (
            <img
              src={event.image_url}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-5xl opacity-30">
              🏌️
            </div>
          )}
          {badge && (
            <span className="absolute top-3 right-3 text-xs px-3 py-1 rounded-full bg-black/70 text-gray-200 border border-gray-600">
              {badge}
            </span>
          )}
        </div>
        <div className="p-5">
          <h3 className="text-xl font-semibold mb-1">{event.name}</h3>
          <p className="text-sm text-gray-400">
            {formatDate(event.date)}
            {event.course ? ` · ${event.course}` : ''}
          </p>
          {teams.length > 0 && (
            <p className="text-sm text-gray-500 mt-2">
              Team: {teams.join(', ')}
            </p>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-12">
        <div>
          <h1 className="text-4xl font-bold mb-2">My Events</h1>
          <p className="text-gray-400">
            Live rounds, upcoming registrations, and past results.
          </p>
        </div>

        {/* ——— LIVE ——— */}
        {live.length > 0 && (
          <section>
            <h2 className="text-sm uppercase tracking-wide text-emerald-400 mb-4 font-semibold">
              Live now
            </h2>
            <div className="space-y-4">
              {live.map((item) => {
                const teams = [
                  ...new Set(
                    item.regs.map((r: any) => r.team_name).filter(Boolean)
                  ),
                ];
                const eventRounds = rounds.filter(
                  (r) => r.event_id === item.event.id
                );
                return (
                  <div
                    key={item.event.id}
                    className="rounded-3xl border-2 border-emerald-500/50 bg-gradient-to-br from-emerald-950/40 to-gray-800 overflow-hidden"
                  >
                    <div className="flex flex-col md:flex-row">
                      <div className="md:w-48 h-40 md:h-auto bg-gray-900 shrink-0">
                        {item.event.image_url ? (
                          <img
                            src={item.event.image_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-5xl opacity-40">
                            🏌️
                          </div>
                        )}
                      </div>
                      <div className="flex-1 p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                          <p className="text-xs text-emerald-400 font-semibold mb-1">
                            LIVE
                          </p>
                          <h3 className="text-2xl font-bold">
                            {item.event.name}
                          </h3>
                          <p className="text-sm text-gray-400 mt-1">
                            {item.event.course}
                            {teams.length
                              ? ` · ${teams.join(', ')}`
                              : ''}
                          </p>
                          {eventRounds.length > 0 && (
                            <p className="text-sm text-teal-400 mt-2">
                              {eventRounds
                                .map((r) => {
                                  const t = formatRoundTime(r.start_time);
                                  return `${r.name}${t ? ` (${t})` : ''}`;
                                })
                                .join(' · ')}
                            </p>
                          )}
                        </div>
                                                <div className="flex flex-col sm:flex-row gap-3">
                          <Link
                            href={`/event/${item.event.id}/live${
                              teams[0]
                                ? `?team=${encodeURIComponent(String(teams[0]))}`
                                : ''
                            }`}
                            className="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-center font-medium text-sm"
                          >
                            Live Scoring
                          </Link>
                          <button
                            type="button"
                            onClick={() => openLeaderboard(item.event)}
                            className="px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-center font-medium text-sm"
                          >
                            Leaderboard
                          </button>
                    
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ——— UPCOMING ——— */}
        <section>
          <h2 className="text-sm uppercase tracking-wide text-gray-400 mb-4 font-semibold">
            Upcoming
          </h2>
          {upcoming.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="mb-4">No upcoming events.</p>
              <Link
                href="/"
                className="inline-block bg-emerald-600 hover:bg-emerald-700 px-6 py-3 rounded-2xl font-medium text-white"
              >
                Browse Events
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {upcoming.map((item) => (
                <EventCard
                  key={item.event.id}
                  item={item}
                  onClick={() => openDetail(item.event.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* ——— PAST ——— */}
        <section>
          <h2 className="text-sm uppercase tracking-wide text-gray-400 mb-4 font-semibold">
            Past
          </h2>
          {past.length === 0 ? (
            <p className="text-gray-500 py-6">No past events yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {past.map((item) => (
                <EventCard
                  key={item.event.id}
                  item={item}
                  badge={item.isLocked ? 'Saved' : 'Past'}
                  onClick={() => openDetail(item.event.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ——— DETAIL SHEET ——— */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-gray-800 rounded-t-3xl md:rounded-3xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="relative h-40 bg-gray-900">
              {selectedItem.event.image_url ? (
                <img
                  src={selectedItem.event.image_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-5xl opacity-30">
                  🏌️
                </div>
              )}
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="absolute top-4 right-4 bg-black/60 text-white text-sm px-3 py-1.5 rounded-full"
              >
                Close
              </button>
            </div>

            <div className="p-6">
              <h2 className="text-2xl font-bold">{selectedItem.event.name}</h2>
              <p className="text-gray-400 text-sm mt-1">
                {formatDate(selectedItem.event.date)}
                {selectedItem.event.course
                  ? ` · ${selectedItem.event.course}`
                  : ''}
              </p>

              {/* Sub-tabs */}
              <div className="flex gap-2 mt-6 mb-4">
                <button
                  type="button"
                  onClick={() => setDetailTab('details')}
                  className={`px-4 py-2 rounded-xl text-sm font-medium ${
                    detailTab === 'details'
                      ? 'bg-white text-black'
                      : 'bg-gray-700 text-gray-300'
                  }`}
                >
                  Your details
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('invite')}
                  className={`px-4 py-2 rounded-xl text-sm font-medium ${
                    detailTab === 'invite'
                      ? 'bg-white text-black'
                      : 'bg-gray-700 text-gray-300'
                  }`}
                >
                  Invite / QR
                </button>
              </div>

              {detailTab === 'details' && (
                <div className="space-y-4">
                  {selectedItem.regs.map((reg: any) => {
                    const roundNames = getRoundNames(reg);
                    const eventRounds = rounds.filter((r) =>
                      (reg.selected_round_ids || []).map(String).includes(String(r.id))
                    );
                    return (
                      <div
                        key={reg.id}
                        className="bg-gray-900 rounded-2xl p-4 border border-gray-700"
                      >
                        {reg.team_name && (
                          <p className="font-medium text-emerald-400 mb-1">
                            {reg.team_name}
                          </p>
                        )}
                        <p className="text-sm text-gray-300">
                          {reg.player_name}
                          {reg.paid ? (
                            <span className="text-gray-500"> · Paid</span>
                          ) : null}
                        </p>
                        {roundNames.length > 0 && (
                          <p className="text-sm text-gray-500 mt-1">
                            {roundNames.join(', ')}
                          </p>
                        )}
                        {eventRounds.map((r) => {
                          const t = formatRoundTime(r.start_time);
                          return (
                            <p key={r.id} className="text-xs text-teal-400 mt-0.5">
                              {r.name}
                              {t ? ` · ${t}` : ''}
                            </p>
                          );
                        })}
                      </div>
                    );
                  })}

                  <div className="flex flex-col gap-3 pt-2">
                    <Link
                      href={`/event/${selectedItem.event.id}`}
                      className="px-5 py-3 rounded-2xl bg-gray-700 hover:bg-gray-600 text-center font-medium text-sm"
                    >
                      Event page / add players
                    </Link>
                    {(selectedItem.isLocked ||
                      (selectedItem.event.date || '').slice(0, 10) < today ||
                      selectedItem.isCheckedIn) && (
                      <button
                        type="button"
                        onClick={() => openLeaderboard(selectedItem.event)}
                        className="px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-center font-medium text-sm"
                      >
                        Leaderboard
                      </button>
                    )}
                    {selectedItem.isCheckedIn &&
                      !selectedItem.isLocked &&
                      (selectedItem.event.date || '').slice(0, 10) === today && (
                        <Link
                          href={`/event/${selectedItem.event.id}/live${
                            selectedItem.regs.find((r: any) => r.team_name)
                              ?.team_name
                              ? `?team=${encodeURIComponent(
                                  String(
                                    selectedItem.regs.find(
                                      (r: any) => r.team_name
                                    )?.team_name
                                  )
                                )}`
                              : ''
                          }`}
                          className="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-center font-medium text-sm"
                        >
                          Live Scoring
                        </Link>
                      )}
                  </div>
                </div>
              )}

              {detailTab === 'invite' && (
                <div className="text-center space-y-4">
                  <p className="text-sm text-gray-400">
                    Share this QR so someone can open the event and join your
                    team (open spots only).
                  </p>
                  {inviteQr ? (
                    <img
                      src={inviteQr}
                      alt="Invite QR"
                      className="mx-auto w-48 h-48 rounded-2xl bg-white p-2"
                    />
                  ) : (
                    <p className="text-gray-500 text-sm">Generating QR…</p>
                  )}
                  <p className="text-xs text-gray-500 break-all px-2">
                    {typeof window !== 'undefined'
                      ? `${window.location.origin}/event/${selectedItem.event.id}${
                          selectedItem.regs.find((r) => r.team_name)?.team_name
                            ? `?joinTeam=${encodeURIComponent(
                                selectedItem.regs.find((r) => r.team_name)
                                  ?.team_name || ''
                              )}`
                            : ''
                        }`
                      : ''}
                  </p>
                  <p className="text-xs text-amber-400/90">
                    Full team-invite registration page (open slots only) is
                    next on the list.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ——— LEADERBOARD MODAL ——— */}
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
                    await loadLeaderboardRows(lbEvent, id);
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
                <p className="text-center text-gray-400 py-10">No scores yet.</p>
              ) : (
                <ul className="divide-y divide-gray-700">
                  {lbRows.map((row, i) => (
                    <li key={row.name}>
                      <button
                        type="button"
                        onClick={() => setScorecardTeam(row.name)}
                        className="w-full flex items-center justify-between py-4 text-left hover:bg-gray-700/50 rounded-xl px-2"
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

      {/* ——— SCORECARD ——— */}
      {scorecardTeam && lbEvent && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 md:p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-2xl font-bold">{scorecardTeam}</h2>
                <p className="text-sm text-gray-400 mt-1">
                  {lbEvent.name}
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
                className="text-gray-400 hover:text-white text-sm"
              >
                Close
              </button>
            </div>

            {(() => {
              const row = lbRows.find((r) => r.name === scorecardTeam);
              const scoresMap = row?.scores || {};
              const numHoles =
                Number(lbEvent.number_of_holes) === 9 ? 9 : 18;
              const parMap = getParMap(lbEvent.course_data, numHoles);
              const front = Array.from(
                { length: Math.min(9, numHoles) },
                (_, i) => i + 1
              );
              const back =
                numHoles > 9
                  ? Array.from({ length: numHoles - 9 }, (_, i) => i + 10)
                  : [];

              const sumHoles = (holes: number[]) =>
                holes.reduce(
                  (sum, h) => sum + (scoresMap[h] > 0 ? scoresMap[h] : 0),
                  0
                );
              const outTotal = sumHoles(front);
              const inTotal = sumHoles(back);
              const grandTotal = outTotal + inTotal;
              const outPar = front.reduce((s, h) => s + (parMap[h] || 4), 0);
              const inPar = back.reduce((s, h) => s + (parMap[h] || 4), 0);
              const totalPar = outPar + inPar;
              const toPar =
                row && row.holesPlayed > 0 ? grandTotal - totalPar : null;

              return (
                <>
                  <div className="overflow-x-auto -mx-1 px-1 pb-2">
                    <table className="border-collapse text-sm min-w-[640px] w-full">
                      <thead>
                        <tr className="bg-gray-950">
                          <th className="text-left py-2.5 px-2 font-semibold text-gray-300 sticky left-0 bg-gray-950 z-10">
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
                          {numHoles > 9 && (
                            <th className="text-center py-2.5 px-2 font-semibold text-emerald-400 bg-gray-900/80">
                              IN
                            </th>
                          )}
                          <th className="text-center py-2.5 px-2 font-semibold text-white bg-gray-900">
                            TOT
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t border-gray-700">
                          <td className="py-2 px-2 font-semibold text-gray-400 sticky left-0 bg-gray-800 z-10">
                            PAR
                          </td>
                          {front.map((h) => (
                            <td
                              key={`p-${h}`}
                              className="text-center py-2 px-1.5 text-gray-400"
                            >
                              {parMap[h] || 4}
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
                              {parMap[h] || 4}
                            </td>
                          ))}
                          {numHoles > 9 && (
                            <td className="text-center py-2 px-2 font-semibold text-emerald-400/80 bg-gray-900/40">
                              {inPar}
                            </td>
                          )}
                          <td className="text-center py-2 px-2 font-semibold text-gray-300 bg-gray-900/60">
                            {totalPar}
                          </td>
                        </tr>
                        <tr className="border-t border-gray-700">
                          <td className="py-2.5 px-2 font-semibold text-white sticky left-0 bg-gray-800 z-10">
                            SCORE
                          </td>
                          {front.map((h) => (
                            <td
                              key={`s-${h}`}
                              className="text-center py-2.5 px-1"
                            >
                              <div className="flex justify-center">
                                <ScoreMark
                                  score={
                                    scoresMap[h] > 0 ? scoresMap[h] : null
                                  }
                                  par={parMap[h] || 4}
                                />
                              </div>
                            </td>
                          ))}
                          <td className="text-center py-2.5 px-2 font-bold text-emerald-400 bg-gray-900/40">
                            {outTotal || '—'}
                          </td>
                          {back.map((h) => (
                            <td
                              key={`s-${h}`}
                              className="text-center py-2.5 px-1"
                            >
                              <div className="flex justify-center">
                                <ScoreMark
                                  score={
                                    scoresMap[h] > 0 ? scoresMap[h] : null
                                  }
                                  par={parMap[h] || 4}
                                />
                              </div>
                            </td>
                          ))}
                          {numHoles > 9 && (
                            <td className="text-center py-2.5 px-2 font-bold text-emerald-400 bg-gray-900/40">
                              {inTotal || '—'}
                            </td>
                          )}
                          <td className="text-center py-2.5 px-2 font-bold text-white text-lg bg-gray-900/60">
                            {grandTotal || '—'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
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