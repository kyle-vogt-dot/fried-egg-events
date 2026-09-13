'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import Link from 'next/link';
import { isListable } from '@/app/libs/event-emails';

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

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());

const roundIdsOf = (r: any): number[] => {
  const ids: number[] = Array.isArray(r.selected_round_ids)
    ? r.selected_round_ids.map(Number).filter(Boolean)
    : [];
  if (r.round_id) ids.push(Number(r.round_id));
  return Array.from(new Set(ids));
};

type JoinOption = {
  key: string;
  teamName: string;
  roundId: number;
  roundName: string;
  startTime: string | null;
  price: number;
  spotsLeft: number;
};

export default function JoinFromInvitePage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const eventId = params.id;

  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<any>(null);
  const [rounds, setRounds] = useState<any[]>([]);
  const [options, setOptions] = useState<JoinOption[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [inviter, setInviter] = useState<{
    name: string;
    email: string;
  } | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const [discountCode, setDiscountCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<any>(null);
  const [discountError, setDiscountError] = useState('');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const joinQuery = () => {
    const q = new URLSearchParams();
    const regs = searchParams.get('regs') || '';
    const team = searchParams.get('team') || '';
    if (regs) q.set('regs', regs);
    if (team) q.set('team', team);
    const s = q.toString();
    return s ? `?${s}` : '';
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const id = parseInt(eventId);
      const regIds = (searchParams.get('regs') || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const teamParam = (searchParams.get('team') || '').trim();

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

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        const redirect = encodeURIComponent(
          `/event/${eventId}/join${joinQuery()}`
        );
        router.replace(`/login?redirect=${redirect}`);
        return;
      }

      setCurrentUser(user);
      setName(
        user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split('@')[0] ||
          ''
      );
      setEmail(user.email || '');

      let inviterRegs: any[] = [];
      if (regIds.length > 0) {
        const { data } = await supabase
          .from('event_registrations')
          .select('*')
          .in('id', regIds);
        inviterRegs = (data || []).filter(isListable);
      }

      const inv =
        inviterRegs.find((r) => r.player_email) || inviterRegs[0] || null;
      setInviter(
        inv
          ? {
              name: inv.player_name || '',
              email: (inv.player_email || '').trim().toLowerCase(),
            }
          : null
      );

      const { data: allRegs } = await supabase
        .from('event_registrations')
        .select('*')
        .eq('event_id', id);
      const roster = (allRegs || []).filter(isListable);

      const maxTeam = eventData?.max_teammates || 4;
      const isPerRound =
        (eventData?.pricing_mode || 'event') === 'per_round';
      const roundsList = roundsData || [];

      const built: JoinOption[] = [];
      const seen = new Set<string>();

      const addOptionsForTeam = (teamName: string, preferredRids: number[]) => {
        let targets: number[] =
          preferredRids.length > 0
            ? preferredRids
            : roundsList.map((r: any) => Number(r.id));

        // Event with no rounds table: one "Event" option
        if (targets.length === 0) {
          targets = [0];
        }

        // No stored round ids + not per-round → whole event
        if (
          preferredRids.length === 0 &&
          !isPerRound &&
          roundsList.length > 0
        ) {
          targets = [0];
        }

        for (const rid of targets) {
          const key = `${teamName}::${rid}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const round =
            rid === 0
              ? null
              : roundsList.find((r: any) => Number(r.id) === Number(rid));

          if (rid !== 0 && !round && preferredRids.length > 0) continue;

          const onThis = roster.filter((r) => {
            if ((r.team_name || 'Individual') !== teamName) return false;
            if (rid === 0) return true;
            const ids = roundIdsOf(r);
            if (ids.length === 0) return true;
            return ids.includes(Number(rid));
          });

          const price =
            isPerRound && rid !== 0
              ? Number(round?.price || 0)
              : Number(eventData?.price || 0);

          built.push({
            key,
            teamName,
            roundId: Number(rid),
            roundName: round?.name || (rid === 0 ? 'Event' : 'Round'),
            startTime: round?.start_time || eventData?.start_time || null,
            price,
            spotsLeft: Math.max(0, maxTeam - onThis.length),
          });
        }
      };

      for (const reg of inviterRegs) {
        const teamName = reg.team_name || 'Individual';
        addOptionsForTeam(teamName, roundIdsOf(reg));
      }

      if (teamParam) {
        const teamName = decodeURIComponent(teamParam);
        const teamRegs = roster.filter(
          (r) => (r.team_name || '') === teamName
        );
        const ridSet = new Set<number>();
        for (const r of teamRegs) {
          roundIdsOf(r).forEach((n) => ridSet.add(n));
        }
        addOptionsForTeam(teamName, Array.from(ridSet));
      }

      setOptions(built);
      setSelected(
        new Set(built.filter((o) => o.spotsLeft > 0).map((o) => o.key))
      );
      setLoading(false);
    };

    load();
  }, [eventId, searchParams]);

  const selectedOptions = useMemo(
    () => options.filter((o) => selected.has(o.key) && o.spotsLeft > 0),
    [options, selected]
  );

  const total = useMemo(() => {
    const base = selectedOptions.reduce((sum, o) => sum + o.price, 0);
    const discount = appliedDiscount
      ? Number(appliedDiscount.amount_saved) || 0
      : 0;
    return Math.max(0, base - discount);
  }, [selectedOptions, appliedDiscount]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const applyDiscountCode = async () => {
    if (!discountCode.trim() || !event) return;
    setDiscountError('');
    try {
      const basePer = selectedOptions.reduce((s, o) => s + o.price, 0);
      const res = await fetch('/api/discount-codes/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: discountCode.trim(),
          eventId: event.id,
          baseAmount: basePer,
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
  const handleJoin = async () => {
    if (!event) return;
    if (!currentUser) return alert('Please sign in to join');
    if (!name.trim()) return alert('Enter your name');
    if (!isValidEmail(email)) return alert('Enter a valid email');
    if (selectedOptions.length === 0) {
      return alert('Select at least one team / round with an open spot');
    }

    setSubmitting(true);
    try {
      const byTeam = new Map<string, number[]>();
      for (const o of selectedOptions) {
        const team = o.teamName === 'Individual' ? '' : o.teamName;
        const ids = byTeam.get(team) || [];
        if (o.roundId) ids.push(o.roundId);
        byTeam.set(team, ids);
      }

      const rows = Array.from(byTeam.entries()).map(([team, rids]) => ({
        event_id: event.id,
        user_id: currentUser.id,
        player_name: name.trim(),
        player_email: email.trim().toLowerCase(),
        team_name: team || null,
        paid: true,
        payment_method: 'team',
        amount_paid: 0,
        checked_in: false,
        addons_selected: {},
        selected_round_ids: rids,
      }));

      const { error } = await supabase.from('event_registrations').insert(rows);
      if (error) throw error;

      router.push(`/event/${event.id}?joined=1`);
    } catch (e: any) {
      console.error(e);
      alert(e.message || 'Could not join team');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        Loading…
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        Event not found
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 pb-16">
      <div className="max-w-md mx-auto">
        <Link
          href={`/event/${eventId}`}
          className="text-gray-400 hover:text-white text-sm"
        >
          ← Event page
        </Link>

        <h1 className="text-3xl font-bold mt-4">{event.name}</h1>
        <p className="text-gray-400 text-sm mt-1">
          {formatDate(event.date)}
          {event.course ? ` · ${event.course}` : ''}
        </p>
        <p className="text-sm text-teal-400 mt-3">
          Join a team from this invite
          {inviter?.name ? ` · invited by ${inviter.name}` : ''}
        </p>

        {options.length === 0 ? (
          <div className="mt-8 bg-gray-800 rounded-2xl p-6 text-center text-gray-400">
            No open team / round options on this invite.
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {options.map((o) => {
              const t = formatRoundTime(o.startTime);
              const disabled = o.spotsLeft <= 0;
              const checked = selected.has(o.key) && !disabled;
              return (
                <label
                  key={o.key}
                  className={`flex items-start gap-3 p-4 rounded-2xl border cursor-pointer ${
                    disabled
                      ? 'border-gray-700 opacity-50 cursor-not-allowed'
                      : checked
                        ? 'border-emerald-500 bg-emerald-950/30'
                        : 'border-gray-700 bg-gray-800'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1 w-5 h-5 accent-emerald-500"
                    disabled={disabled}
                    checked={checked}
                    onChange={() => toggle(o.key)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-emerald-400">{o.teamName}</p>
                    <p className="text-sm text-teal-300">
                      {o.roundName}
                      {t ? ` · ${t}` : ''}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {o.spotsLeft > 0 ? `${o.spotsLeft} open` : 'Full'}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        <div className="mt-8 space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your full name"
            className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3"
          />
        </div>

        <button
          type="button"
          disabled={submitting || selectedOptions.length === 0}
          onClick={handleJoin}
          className="w-full mt-6 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 py-4 rounded-2xl font-semibold text-lg"
        >
          {submitting ? 'Adding…' : 'Add me to this team'}
        </button>
      </div>
    </div>
  );
}