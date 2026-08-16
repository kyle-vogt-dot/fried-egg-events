'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import Link from 'next/link';

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
  const [platformFee, setPlatformFee] = useState(3);
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

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const id = parseInt(eventId);
      const regIds = (searchParams.get('regs') || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

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

      const { data: feeData } = await supabase
        .from('platform_settings')
        .select('platform_fee')
        .eq('id', 1)
        .single();
      if (feeData?.platform_fee != null) {
        setPlatformFee(Number(feeData.platform_fee));
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        const redirect = encodeURIComponent(
          `/event/${eventId}/join?regs=${searchParams.get('regs') || ''}`
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

      // Inviter's registrations (from QR regs=)
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

      // Full roster for spot counts
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

      for (const reg of inviterRegs) {
        const teamName = reg.team_name || 'Individual';
        const rids: number[] = Array.isArray(reg.selected_round_ids)
          ? reg.selected_round_ids.map(Number).filter(Boolean)
          : reg.round_id
            ? [Number(reg.round_id)]
            : [];

        // Multi-round: inviter rounds, else all event rounds
        // Single-round / no rounds table: synthetic option (roundId 0)
        let targets: number[] =
          rids.length > 0
            ? rids
            : roundsList.map((r: any) => Number(r.id));

        if (targets.length === 0) {
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

          // Only skip if we expected a real round and couldn't find it
          if (rid !== 0 && !round && rids.length > 0) continue;

          const onThis = roster.filter((r) => {
            if ((r.team_name || 'Individual') !== teamName) return false;
            if (rid === 0) return true; // whole-event roster for this team
            const ids: number[] = Array.isArray(r.selected_round_ids)
              ? r.selected_round_ids.map(Number)
              : r.round_id
                ? [Number(r.round_id)]
                : [];
            if (ids.length === 0) return true; // treat as on the single event
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
    const base = selectedOptions.reduce(
      (sum, o) => sum + o.price + platformFee,
      0
    );
    const discount = appliedDiscount
      ? Number(appliedDiscount.amount_saved) || 0
      : 0;
    return Math.max(0, base - discount);
  }, [selectedOptions, platformFee, appliedDiscount]);

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
      const basePer =
        selectedOptions.reduce((s, o) => s + o.price + platformFee, 0) ||
        platformFee;
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

  const handleCheckout = async () => {
    if (!event) return;
    if (!currentUser) return alert('Please sign in to register');
    if (!name.trim()) return alert('Enter your name');
    if (!isValidEmail(email)) return alert('Enter a valid email');
    if (selectedOptions.length === 0) {
      return alert('Select at least one team / round with an open spot');
    }

    setSubmitting(true);
    try {
      const rows = selectedOptions.map((o) => ({
        event_id: event.id,
        user_id: currentUser.id,
        player_name: name.trim(),
        player_email: email.trim().toLowerCase(),
        team_name: o.teamName === 'Individual' ? null : o.teamName,
        paid: false,
        payment_method: 'pending_checkout',
        checked_in: false,
        addons_selected: {},
        // roundId 0 (single-event) → empty selected_round_ids
        selected_round_ids: o.roundId ? [o.roundId] : [],
        discount_code: appliedDiscount?.code || null,
        discount_amount: appliedDiscount?.amount_saved || 0,
      }));

      const { data: inserted, error } = await supabase
        .from('event_registrations')
        .insert(rows)
        .select('id');

      if (error || !inserted?.length) {
        throw new Error(error?.message || 'Could not create registration');
      }

      const registrationIds = inserted.map((r: any) => r.id);

      const draftKey = `registration_draft_${event.id}`;

      sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          eventId: event.id,
          mode: 'join',
          isIndividual: false,
          isOrganizerOnly: true,
          teamName: selectedOptions[0]?.teamName || null,
          payment_method: 'pending_checkout',
          selected_round_ids: selectedOptions
            .map((o) => o.roundId)
            .filter((id) => id !== 0),
          players: [
            {
              player_name: name.trim(),
              player_email: email.trim().toLowerCase(),
              user_id: currentUser.id,
            },
          ],
          totalCost: total,
          registration_ids: registrationIds,
          discount: appliedDiscount
            ? {
                code: appliedDiscount.code,
                discount_code_id: appliedDiscount.discount_code_id,
                amount_saved: appliedDiscount.amount_saved,
              }
            : null,
          sendReceipt: true,
          receiptName: name.trim(),
          receiptEmail: email.trim().toLowerCase(),
          inviter_email: inviter?.email || null,
          inviter_name: inviter?.name || null,
        })
      );

      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL || window.location.origin;

      if (total <= 0) {
        await supabase
          .from('event_registrations')
          .update({ paid: true, payment_method: 'comp' })
          .in('id', registrationIds);
        router.push(
          `/event/${event.id}?payment=success&type=registration&registration_ids=${registrationIds.join(',')}`
        );
        return;
      }

      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: total,
          player_name: name.trim(),
          email: email.trim().toLowerCase(),
          description: `Join – ${event.name}`,
          event_name: event.name,
          event_id: event.id,
          type: 'registration',
          registration_id: registrationIds[0],
          registration_ids: registrationIds.join(','),
          success_url: `${baseUrl}/event/${event.id}?payment=success&type=registration&session_id={CHECKOUT_SESSION_ID}&registration_ids=${registrationIds.join(',')}`,
          cancel_url: `${baseUrl}/event/${event.id}/join?regs=${encodeURIComponent(
            searchParams.get('regs') || ''
          )}&payment=cancelled`,
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
                      {o.spotsLeft > 0
                        ? `${o.spotsLeft} open · $${(
                            o.price + platformFee
                          ).toFixed(2)}`
                        : 'Full'}
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

        <div className="mt-6 bg-gray-800 rounded-2xl p-4">
          <label className="block text-sm text-gray-400 mb-2">
            Discount code
          </label>
          {appliedDiscount ? (
            <div className="flex justify-between items-center">
              <p className="text-emerald-400 text-sm">
                {appliedDiscount.code} · −$
                {Number(appliedDiscount.amount_saved).toFixed(2)}
              </p>
              <button
                type="button"
                className="text-red-400 text-sm"
                onClick={() => {
                  setAppliedDiscount(null);
                  setDiscountCode('');
                }}
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
                placeholder="Code"
                className="flex-1 bg-gray-700 border border-gray-600 rounded-xl px-4 py-3 uppercase"
              />
              <button
                type="button"
                onClick={applyDiscountCode}
                className="bg-teal-600 px-4 rounded-xl font-medium"
              >
                Apply
              </button>
            </div>
          )}
          {discountError && (
            <p className="text-red-400 text-sm mt-2">{discountError}</p>
          )}
        </div>

        <p className="text-center text-xl font-semibold mt-6">
          Total: ${total.toFixed(2)}
        </p>

        <button
          type="button"
          disabled={submitting || selectedOptions.length === 0}
          onClick={handleCheckout}
          className="w-full mt-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 py-4 rounded-2xl font-semibold text-lg"
        >
          {submitting ? 'Processing…' : 'Register & pay'}
        </button>
      </div>
    </div>
  );
}