'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import QRCode from 'qrcode';


function isListable(r: any) {
  if (r.refunded === true) return false;
  if (r.paid === true) return true;
  const m = String(r.payment_method || '').toLowerCase();
  return [
    'comp',
    'complimentary',
    'cash',
    'manual',
    'checkin',
    'payment_link',
  ].includes(m);
}

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
function extractHoles(courseData: any): {
  hole: number;
  par: number;
  yardage: number;
}[] {
  if (!courseData) return [];
  const root = courseData.course || courseData.data || courseData;

  const fromArr = (arr: any[]) =>
    arr.map((h: any, i: number) => ({
      hole: Number(h.hole ?? h.Hole ?? i + 1),
      par: Number(h.par ?? h.Par ?? 0),
      yardage: Number(h.yardage ?? h.Yardage ?? h.yards ?? h.Yards ?? 0),
    }));

  if (Array.isArray(root.scorecard) && root.scorecard.length) {
    return fromArr(root.scorecard);
  }
  if (Array.isArray(courseData.scorecard) && courseData.scorecard.length) {
    return fromArr(courseData.scorecard);
  }
  if (Array.isArray(root.holes) && root.holes.length) {
    return fromArr(root.holes);
  }

  const tees = root.tees || courseData.tees;
  if (tees) {
    const list: any[] = [];
    if (Array.isArray(tees)) list.push(...tees);
    else {
      Object.values(tees).forEach((v) => {
        if (Array.isArray(v)) list.push(...v);
      });
    }
    for (const tee of list) {
      const holes = tee.holes || tee.scorecard;
      if (Array.isArray(holes) && holes.length) return fromArr(holes);
    }
  }

  return [];
}

function getParMap(courseData: any, numHoles: number): Record<number, number> {
  const map: Record<number, number> = {};
  for (let i = 1; i <= numHoles; i++) map[i] = 4;
  extractHoles(courseData).forEach((h) => {
    if (h.hole >= 1 && h.hole <= numHoles && h.par > 0) map[h.hole] = h.par;
  });
  return map;
}

function getYardMap(courseData: any, numHoles: number): Record<number, number> {
  const map: Record<number, number> = {};
  extractHoles(courseData).forEach((h) => {
    if (h.hole >= 1 && h.hole <= numHoles && h.yardage > 0) {
      map[h.hole] = h.yardage;
    }
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

  const [teamRoster, setTeamRoster] = useState<any[]>([]);
const [platformFee, setPlatformFee] = useState(3);
const [addPlayersOpen, setAddPlayersOpen] = useState(false);
const [addPlayersContext, setAddPlayersContext] = useState<{
  teamName: string;
  selectedRoundIds: number[];
  regId: number;
} | null>(null);
const [newPlayers, setNewPlayers] = useState<{ name: string; email: string }[]>([]);
const [discountCode, setDiscountCode] = useState('');
const [appliedDiscount, setAppliedDiscount] = useState<any>(null);
const [discountError, setDiscountError] = useState('');
const [submitting, setSubmitting] = useState(false);

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

const isListable = (r: any) => {
  if (r.refunded === true) return false;
  if (r.paid === true) return true;
  const m = String(r.payment_method || '').toLowerCase();
  return [
    'comp',
    'complimentary',
    'cash',
    'manual',
    'checkin',
    'payment_link',
  ].includes(m);
};

const userRegs = (regs || []).filter(isListable);
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

    const regIds = selectedItem.regs
      .map((r: any) => r.id)
      .filter(Boolean)
      .join(',');

    const origin =
      typeof window !== 'undefined' ? window.location.origin : '';

    const url = `${origin}/event/${selectedItem.event.id}/join${
      regIds ? `?regs=${encodeURIComponent(regIds)}` : ''
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
  const isValidEmail = (email: string) => {
  const cleaned = (email || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned);
};

const applyDiscountCode = async () => {
  if (!discountCode.trim() || !selectedItem) {
    setDiscountError('Enter a code');
    return;
  }
  setDiscountError('');
  try {
    const price = Number(selectedItem.event.price) || 0;
    const basePerPlayer = price + platformFee;

    const res = await fetch('/api/discount-codes/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: discountCode.trim(),
        eventId: selectedItem.event.id,
        baseAmount: basePerPlayer,
      }),
    });
    const data = await res.json();
    if (!data.valid) {
      setAppliedDiscount(null);
      setDiscountError(data.error || 'Invalid code');
      return;
    }
    setAppliedDiscount(data);
  } catch {
    setDiscountError('Could not validate code');
    setAppliedDiscount(null);
  }
};

const clearDiscount = () => {
  setAppliedDiscount(null);
  setDiscountCode('');
  setDiscountError('');
};

const handleAddTeammatesCheckout = async () => {
  if (!selectedItem || !currentUser) return;
  

  if (!addPlayersContext) {
    alert('No team/round selected — close and tap Add teammates on a specific round');
    return;
  }

  const complete = newPlayers.filter(
    (p) => (p.name || '').trim() && isValidEmail(p.email || '')
  );
  if (complete.length === 0) {
    alert('Enter a name and valid email for at least one player');
    return;
  }

  const incomplete = newPlayers.some(
    (p) =>
      ((p.name || '').trim() || (p.email || '').trim()) &&
      (!(p.name || '').trim() || !isValidEmail(p.email || ''))
  );
  if (incomplete) {
    alert('Fill in name and a valid email for every player, or remove empty rows');
    return;
  }

  const teamName = addPlayersContext.teamName;
  const selectedRoundIds = addPlayersContext.selectedRoundIds;

  const isPerRound =
    (selectedItem.event.pricing_mode || 'event') === 'per_round';

  let basePerPlayer = 0;
  if (isPerRound) {
    basePerPlayer = selectedRoundIds.reduce((sum, id) => {
      const round = rounds.find((r) => Number(r.id) === Number(id));
      return sum + (Number(round?.price) || 0) + platformFee;
    }, 0);
  } else {
    basePerPlayer =
      (Number(selectedItem.event.price) || 0) + platformFee;
  }

  const discountPer = appliedDiscount
    ? Number(appliedDiscount.amount_saved) || 0
    : 0;
  const perPlayer = Math.max(0, basePerPlayer - discountPer);
  const totalCost = perPlayer * complete.length;

  setSubmitting(true);
  try {
    const regRows = complete.map((p) => ({
      event_id: selectedItem.event.id,
      user_id: null,
      player_name: p.name.trim(),
      player_email: p.email.trim().toLowerCase(),
      team_name: teamName,
      paid: false,
      checked_in: false,
      addons_selected: {},
      selected_round_ids: selectedRoundIds,
      payment_method: 'pending_checkout',
      discount_code: appliedDiscount?.code || null,
      discount_amount: appliedDiscount?.amount_saved || 0,
    }));

    const { data: inserted, error: insertErr } = await supabase
      .from('event_registrations')
      .insert(regRows)
      .select('id');

    if (insertErr || !inserted?.length) {
      throw new Error(insertErr?.message || 'Could not create registrations');
    }

    const registrationIds = inserted.map((r: any) => r.id);
    const draftKey = `registration_draft_${selectedItem.event.id}`;

sessionStorage.setItem(
  draftKey,
  JSON.stringify({
    eventId: selectedItem.event.id,
    mode: 'add_teammates',
    isIndividual: false,
    isOrganizerOnly: true,
    teamName: addPlayersContext?.teamName || null,
    payment_method: 'pending_checkout',
    selected_round_ids: addPlayersContext?.selectedRoundIds || [],
    players: complete.map((p) => ({
      player_name: (p.name || '').trim(),
      player_email: (p.email || '').trim().toLowerCase(),
      user_id: null,
    })),
    totalCost: totalCost, // or whatever you compute
    registration_ids: registrationIds,
    discount: appliedDiscount
      ? {
          code: appliedDiscount.code,
          discount_code_id: appliedDiscount.discount_code_id,
          amount_saved: appliedDiscount.amount_saved,
        }
      : null,
    sendReceipt: true,
    receiptName:
      currentUser?.user_metadata?.full_name ||
      currentUser?.user_metadata?.name ||
      currentUser?.email ||
      '',
    receiptEmail: (currentUser?.email || '').toLowerCase(),
    inviter_email: (currentUser?.email || '').toLowerCase(),
    inviter_name:
      currentUser?.user_metadata?.full_name ||
      currentUser?.user_metadata?.name ||
      currentUser?.email ||
      '',
  })
);

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || window.location.origin;

    const res = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: totalCost,
        player_name: complete[0].name.trim(),
        email: currentUser.email,
        description: `Add teammates – ${selectedItem.event.name}`,
        event_name: selectedItem.event.name,
        event_id: selectedItem.event.id,
        type: 'registration',
        registration_id: registrationIds[0],
        registration_ids: registrationIds.join(','),
        success_url: `${baseUrl}/event/${selectedItem.event.id}?payment=success&type=registration&session_id={CHECKOUT_SESSION_ID}&registration_ids=${registrationIds.join(',')}`,
        cancel_url: `${baseUrl}/dashboard/play?payment=cancelled`,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.url) {
      await supabase
        .from('event_registrations')
        .delete()
        .in('id', registrationIds);
      throw new Error(data.error || 'Checkout failed');
    }

    window.location.href = data.url;
  } catch (e: any) {
    console.error(e);
    alert(e.message || 'Could not start checkout');
  } finally {
    setSubmitting(false);
  }
};


const openDetail = async (id: number) => {
  setSelectedId(id);
  setDetailTab('details');
  setAddPlayersOpen(false);
  setNewPlayers([]);
  setAppliedDiscount(null);
  setDiscountCode('');
  setDiscountError('');

  const isListable = (r: any) => {
    if (r.refunded === true) return false;
    if (r.paid === true) return true;
    const m = String(r.payment_method || '').toLowerCase();
    return [
      'comp',
      'complimentary',
      'cash',
      'manual',
      'checkin',
      'payment_link',
    ].includes(m);
  };

  // Fresh roster for this event
  const { data: allRegs } = await supabase
    .from('event_registrations')
    .select('*')
    .eq('event_id', id)
    .order('created_at', { ascending: true });

  setTeamRoster((allRegs || []).filter(isListable));

  // Refresh THIS user's regs so refunded rounds drop off the cards
  if (currentUser) {
    const { data: myRegs } = await supabase
      .from('event_registrations')
      .select('*')
      .eq('event_id', id)
      .or(
        `user_id.eq.${currentUser.id},player_email.eq.${currentUser.email}`
      );

    const listableMine = (myRegs || []).filter(isListable);

    setRegistrations((prev) => {
      const others = prev.filter((r) => Number(r.event_id) !== Number(id));
      return [...others, ...listableMine];
    });
  }

  const { data: feeData } = await supabase
    .from('platform_settings')
    .select('platform_fee')
    .eq('id', 1)
    .single();
  if (feeData?.platform_fee != null) {
    setPlatformFee(Number(feeData.platform_fee));
  }
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

{detailTab === 'details' && selectedItem && (
  <div className="space-y-5">
    {(() => {
      const maxTeam = selectedItem.event.max_teammates || 4;

      // One card per (team + round) so same team name on different rounds stays separate
      const cards: {
        teamName: string;
        roundId: number;
        regId: number;
      }[] = [];

      for (const myReg of selectedItem.regs.filter(isListable)) {
        const teamName = myReg.team_name || 'Individual';
        const roundIds: number[] = Array.isArray(myReg.selected_round_ids)
          ? myReg.selected_round_ids.map(Number)
          : myReg.round_id
            ? [Number(myReg.round_id)]
            : [];

        if (roundIds.length === 0) {
          cards.push({ teamName, roundId: 0, regId: myReg.id });
        } else {
          for (const rid of roundIds) {
            if (
              !cards.some(
                (c) => c.teamName === teamName && c.roundId === rid
              )
            ) {
              cards.push({ teamName, roundId: rid, regId: myReg.id });
            }
          }
        }
      }

      return cards.map((card) => {
        const teamRounds = card.roundId
          ? rounds.filter((r) => Number(r.id) === card.roundId)
          : [];

        // ONLY people on this team for THIS specific round
        const teammates = teamRoster.filter((r) => {
          if ((r.team_name || 'Individual') !== card.teamName) return false;
          if (!card.roundId) return true;

          const ids: number[] = Array.isArray(r.selected_round_ids)
            ? r.selected_round_ids.map(Number)
            : r.round_id
              ? [Number(r.round_id)]
              : [];

          if (ids.length === 0) return false;
          return ids.includes(card.roundId);
        });

        const spotsLeft = Math.max(0, maxTeam - teammates.length);

        const sortedTeammates = [...teammates].sort((a, b) => {
          const aIsYou =
            a.user_id === currentUser?.id ||
            (a.player_email &&
              currentUser?.email &&
              String(a.player_email).toLowerCase() ===
                String(currentUser.email).toLowerCase());
          const bIsYou =
            b.user_id === currentUser?.id ||
            (b.player_email &&
              currentUser?.email &&
              String(b.player_email).toLowerCase() ===
                String(currentUser.email).toLowerCase());
          if (aIsYou && !bIsYou) return -1;
          if (!aIsYou && bIsYou) return 1;
          return 0;
        });

        return (
          <div
            key={`${card.teamName}-${card.roundId}-${card.regId}`}
            className="bg-gray-900 rounded-2xl p-4 border border-gray-700"
          >
            <div className="mb-3">
              {teamRounds.length > 0 ? (
                <p className="text-xs text-teal-400 mb-1">
                  {teamRounds
                    .map((r) => {
                      const t = formatRoundTime(r.start_time);
                      return `${r.name}${t ? ` · ${t}` : ''}`;
                    })
                    .join('  ·  ')}
                </p>
              ) : null}
              <p className="font-medium text-emerald-400">{card.teamName}</p>
            </div>

            <ul className="space-y-2">
              {sortedTeammates.map((m) => {
                const isYou =
                  m.user_id === currentUser?.id ||
                  (m.player_email &&
                    currentUser?.email &&
                    String(m.player_email).toLowerCase() ===
                      String(currentUser.email).toLowerCase());
                return (
                  <li
                    key={m.id}
                    className={`flex justify-between text-sm bg-gray-800 rounded-xl px-3 py-2 ${
                      m.is_captain ? 'ring-1 ring-amber-400/40' : ''
                    }`}
                  >
                    <span className="flex items-center flex-wrap gap-x-2">
                      {m.player_name || 'Player'}
                      {isYou && (
                        <span className="text-emerald-400 text-xs">(you)</span>
                      )}
                      {m.is_captain && (
                        <span className="text-[10px] uppercase tracking-wide text-amber-400 border border-amber-400/50 rounded-full px-2 py-0.5">
                          Captain
                        </span>
                      )}
                    </span>
                    <span className="text-gray-500 text-xs">
                      {m.paid ? 'Paid' : m.payment_method || 'Comp'}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-gray-500 mt-3">
              {teammates.length}/{maxTeam}
              {spotsLeft > 0 ? ` · ${spotsLeft} open` : ' · Full'}
            </p>

            {spotsLeft > 0 && !selectedItem.isLocked && (
              <button
                type="button"
                onClick={() => {
                  setAddPlayersContext({
                    teamName: card.teamName,
                    selectedRoundIds: card.roundId ? [card.roundId] : [],
                    regId: card.regId,
                  });
                  setAddPlayersOpen(true);
                  setNewPlayers([{ name: '', email: '' }]);
                  clearDiscount();
                }}
                className="w-full mt-3 py-3 rounded-xl border border-dashed border-gray-600 text-gray-300 hover:text-white text-sm"
              >
                + Add teammates ({spotsLeft} open)
              </button>
            )}

            {(() => {
              const myReg =
                teamRoster.find((r) => Number(r.id) === Number(card.regId)) ||
                selectedItem.regs.find(
                  (r) => Number(r.id) === Number(card.regId)
                );
              if (myReg?.is_captain) {
                return (
                  <p className="text-xs text-emerald-400 mt-2">
                    You are team captain
                  </p>
                );
              }
              return (
                <button
                  type="button"
                  className="w-full mt-2 py-2 text-xs text-emerald-400 hover:underline"
                  onClick={async () => {
                    const {
                      data: { session },
                    } = await supabase.auth.getSession();
                    const res = await fetch('/api/set-team-captain', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${session?.access_token || ''}`,
                      },
                      body: JSON.stringify({
                        event_id: selectedItem.event.id,
                        team_name: card.teamName,
                        registration_id: card.regId,
                        round_id: card.roundId || 0,
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      alert(data.error || 'Could not update captain');
                      return;
                    }
                    await openDetail(selectedItem.event.id);
                  }}
                >
                  Make me team captain
                </button>
              );
            })()}
          </div>
          
        );
      });
    })()}

    <div className="flex flex-col gap-3 pt-1">
      <Link
        href={`/event/${selectedItem.event.id}`}
        className="px-5 py-3 rounded-2xl bg-gray-700 hover:bg-gray-600 text-center font-medium text-sm"
      >
        Full event page
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
              selectedItem.regs.find((r: any) => r.team_name)?.team_name
                ? `?team=${encodeURIComponent(
                    String(
                      selectedItem.regs.find((r: any) => r.team_name)
                        ?.team_name
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
                 <p className="text-xs text-gray-500">
  Anyone who scans this will sign in, then can join your open
  team spots for the rounds you&apos;re on.
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
              const yardMap = getYardMap(lbEvent.course_data, numHoles);
              const hasYards = Object.keys(yardMap).length > 0;
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
                        {hasYards && (
                          <tr className="border-t border-gray-700">
                            <td className="py-2 px-2 font-semibold text-gray-500 sticky left-0 bg-gray-800 z-10">
                              YDS
                            </td>
                            {front.map((h) => (
                              <td
                                key={`y-${h}`}
                                className="text-center py-2 px-1.5 text-gray-500 text-xs"
                              >
                                {yardMap[h] || '—'}
                              </td>
                            ))}
                            <td className="bg-gray-900/40" />
                            {back.map((h) => (
                              <td
                                key={`y-${h}`}
                                className="text-center py-2 px-1.5 text-gray-500 text-xs"
                              >
                                {yardMap[h] || '—'}
                              </td>
                            ))}
                            {numHoles > 9 && <td className="bg-gray-900/40" />}
                            <td className="bg-gray-900/60" />
                          </tr>
                        )}
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
{addPlayersOpen && selectedItem && (
  <div className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4">
    <div className="bg-gray-800 rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6">
      <h3 className="text-xl font-bold mb-1">Add teammates</h3>
      <p className="text-sm text-gray-400 mb-5">
        {addPlayersContext ? (
  <>
    {addPlayersContext.teamName}
    {addPlayersContext.selectedRoundIds.length > 0 && (
      <span className="text-teal-400">
        {' · '}
        {addPlayersContext.selectedRoundIds
          .map((id) => {
            const r = rounds.find((x) => Number(x.id) === Number(id));
            if (!r) return '';
            const t = formatRoundTime(r.start_time);
            return `${r.name}${t ? ` ${t}` : ''}`;
          })
          .filter(Boolean)
          .join(', ')}
      </span>
    )}
  </>
) : (
  'Your team'
)}
      </p>

      {newPlayers.map((p, i) => (
        <div key={i} className="bg-gray-900 rounded-2xl p-4 mb-3 space-y-3">
          <div className="flex justify-between">
            <span className="text-sm text-gray-400">New player {i + 1}</span>
            {newPlayers.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setNewPlayers(newPlayers.filter((_, j) => j !== i))
                }
                className="text-red-400 text-sm"
              >
                Remove
              </button>
            )}
          </div>
          <input
            value={p.name}
            onChange={(e) => {
              const next = [...newPlayers];
              next[i] = { ...next[i], name: e.target.value };
              setNewPlayers(next);
            }}
            placeholder="Full name"
            className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3"
          />
          <input
            type="email"
            value={p.email}
            onChange={(e) => {
              const next = [...newPlayers];
              next[i] = { ...next[i], email: e.target.value };
              setNewPlayers(next);
            }}
            placeholder="Email"
            className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3"
          />
        </div>
      ))}

      <button
        type="button"
        onClick={() =>
          setNewPlayers([...newPlayers, { name: '', email: '' }])
        }
        className="w-full py-3 border border-dashed border-gray-600 rounded-xl text-gray-400 text-sm mb-4"
      >
        + Another player
      </button>

      <div className="bg-gray-900 rounded-2xl p-4 mb-4">
        <label className="block text-sm text-gray-400 mb-2">
          Discount code
        </label>
        {appliedDiscount ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-emerald-400">
                {appliedDiscount.code} applied
              </p>
              <p className="text-sm text-gray-400">
                −${Number(appliedDiscount.amount_saved).toFixed(2)} per player
              </p>
            </div>
            <button
              type="button"
              onClick={clearDiscount}
              className="text-sm text-red-400"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              value={discountCode}
              onChange={(e) =>
                setDiscountCode(e.target.value.toUpperCase())
              }
              placeholder="Enter code"
              className="flex-1 bg-gray-700 border border-gray-600 rounded-xl px-4 py-3 uppercase"
            />
            <button
              type="button"
              onClick={applyDiscountCode}
              className="bg-teal-600 hover:bg-teal-700 px-4 py-3 rounded-xl font-medium"
            >
              Apply
            </button>
          </div>
        )}
        {discountError && (
          <p className="text-red-400 text-sm mt-2">{discountError}</p>
        )}
      </div>

      {(() => {
        const complete = newPlayers.filter(
          (p) => (p.name || '').trim() && isValidEmail(p.email || '')
        );

        const isPerRound =
          (selectedItem.event.pricing_mode || 'event') === 'per_round';

        let basePerPlayer = 0;
        if (isPerRound) {
          const ids = addPlayersContext?.selectedRoundIds || [];
          basePerPlayer = ids.reduce((sum, id) => {
            const round = rounds.find((r) => Number(r.id) === Number(id));
            return sum + (Number(round?.price) || 0) + platformFee;
          }, 0);
        } else {
          basePerPlayer =
            (Number(selectedItem.event.price) || 0) + platformFee;
        }

        const discountPer = appliedDiscount
          ? Number(appliedDiscount.amount_saved) || 0
          : 0;
        const total =
          Math.max(0, basePerPlayer - discountPer) * complete.length;

        return (
          <p className="text-center text-lg font-semibold mb-4">
            Total: ${total.toFixed(2)}
            {complete.length > 0 && (
              <span className="text-sm text-gray-400 font-normal">
                {' '}
                ({complete.length} player
                {complete.length !== 1 ? 's' : ''})
              </span>
            )}
          </p>
        );
      })()}

      <button
        type="button"
        disabled={submitting}
        onClick={handleAddTeammatesCheckout}
        className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 py-4 rounded-2xl font-semibold"
      >
        {submitting ? 'Processing…' : 'Register & pay'}
      </button>

      <button
        type="button"
        onClick={() => {
          setAddPlayersOpen(false);
          setNewPlayers([]);
          setAddPlayersContext(null);
          clearDiscount();
        }}
        className="w-full mt-3 py-3 text-gray-400"
      >
        Cancel
      </button>
    </div>
  </div>
)}
    </div>
  );
}