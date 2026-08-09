'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { useMemo } from 'react'; // if not already imported with useState/useEffect
import QRCode from 'qrcode';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  PDFDownloadLink,
  Image,
} from '@react-pdf/renderer';
const flyerStyles = StyleSheet.create({
  page: {
    padding: 28,
    fontFamily: 'Helvetica',
    backgroundColor: '#111827',
    color: '#f3f4f6',
  },
  brand: {
    fontSize: 11,
    color: '#22c55e',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#ffffff',
  },
  row: {
    fontSize: 12,
    marginBottom: 6,
    color: '#e5e7eb',
  },
  label: {
    color: '#9ca3af',
  },
  box: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#1f2937',
    borderRadius: 8,
  },
  desc: {
    fontSize: 11,
    lineHeight: 1.5,
    color: '#d1d5db',
    marginTop: 16,
  },
  qrWrap: {
    marginTop: 20,
    alignItems: 'center',
  },
  qr: {
    width: 120,
    height: 120,
    backgroundColor: '#fff',
    padding: 8,
  },
  qrHint: {
    marginTop: 10,
    fontSize: 10,
    color: '#9ca3af',
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    fontSize: 9,
    color: '#6b7280',
    textAlign: 'center',
  },
});

function EventFlyerPDF({
  event,
  qrDataUrl,
  registerUrl,
}: {
  event: any;
  qrDataUrl: string | null;
  registerUrl: string;
}) {
  const dateStr = event?.date
    ? new Date(event.date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  const price =
    (event?.pricing_mode || 'event') === 'per_round'
      ? 'Per-round pricing — see registration'
      : event?.price != null
        ? `$${Number(event.price).toFixed(2)} per player`
        : '';

  const imageUrl = event?.image_url || null;

  return (
    <Document>
      <Page size="LETTER" style={flyerStyles.page}>
        <Text style={flyerStyles.brand}>Fried Egg Events</Text>
        <Text style={flyerStyles.title}>{event?.name || 'Golf Event'}</Text>

        {imageUrl ? (
  <View
    style={{
      width: '100%',
      height: 220,
      marginBottom: 14,
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <Image
      src={imageUrl}
      style={{
        maxWidth: '100%',
        maxHeight: 220,
        objectFit: 'contain',
      }}
    />
  </View>
) : null}

        <View style={flyerStyles.box}>
          {dateStr ? (
            <Text style={flyerStyles.row}>
              <Text style={flyerStyles.label}>Date: </Text>
              {dateStr}
            </Text>
          ) : null}
          {event?.course ? (
            <Text style={flyerStyles.row}>
              <Text style={flyerStyles.label}>Course: </Text>
              {event.course}
            </Text>
          ) : null}
          {event?.location ? (
            <Text style={flyerStyles.row}>
              <Text style={flyerStyles.label}>Location: </Text>
              {event.location}
            </Text>
          ) : null}
          {price ? (
            <Text style={flyerStyles.row}>
              <Text style={flyerStyles.label}>Price: </Text>
              {price}
            </Text>
          ) : null}
          {event?.number_of_holes ? (
            <Text style={flyerStyles.row}>
              <Text style={flyerStyles.label}>Format: </Text>
              {event.number_of_holes}-hole
              {event.event_type ? ` · ${event.event_type}` : ''}
            </Text>
          ) : null}
        </View>

        {event?.description ? (
          <Text style={flyerStyles.desc}>
            {String(event.description).slice(0, 400)}
          </Text>
        ) : null}

        <View style={flyerStyles.qrWrap}>
          {qrDataUrl ? (
            <Image src={qrDataUrl} style={flyerStyles.qr} />
          ) : null}
          <Text style={flyerStyles.qrHint}>Scan to register</Text>
          <Text style={flyerStyles.qrHint}>{registerUrl}</Text>
        </View>

        <Text style={flyerStyles.footer}>friedeggevents.app</Text>
      </Page>
    </Document>
  );
}

export default function EventDetailPage() {
  const [agreedToWaiver, setAgreedToWaiver] = useState(true);
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = params.id as string;
  const [platformFee, setPlatformFee] = useState(3.0);

  const [event, setEvent] = useState<any>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [rounds, setRounds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const [mode, setMode] = useState<'join' | 'create' | ''>('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [additionalPlayers, setAdditionalPlayers] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [isOrganizerOnly, setIsOrganizerOnly] = useState(false);
  const [selectedPaidRoundIds, setSelectedPaidRoundIds] = useState<number[]>([]);

  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const [isEventAdmin, setIsEventAdmin] = useState(false);
const [flyerQrDataUrl, setFlyerQrDataUrl] = useState<string | null>(null);
  

  // ---------- Discount state ----------
  const [discountCode, setDiscountCode] = useState('');
  const [discountLoading, setDiscountLoading] = useState(false);
  const [appliedDiscount, setAppliedDiscount] = useState<null | {
    code: string;
    discount_code_id: number;
    discount_type: string;
    amount: number;
    amount_saved: number;
    label: string;
    one_player_only: boolean;
  }>(null);
  const [discountError, setDiscountError] = useState('');

  const [waitlistName, setWaitlistName] = useState('');
const [waitlistEmail, setWaitlistEmail] = useState('');
const [waitlistPhone, setWaitlistPhone] = useState('');
const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
const [waitlistDone, setWaitlistDone] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const draftKey = `registration_draft_${eventId}`;
  const paymentHandledKey = `payment_handled_${eventId}`;
  const lastPaymentKey = `last_payment_${eventId}`;

  const isValidEmail = (email: string) => {
    const cleaned = (email || '').trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned);
  };

 const fetchData = async () => {
  setLoading(true);

  const { data: eventData } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', parseInt(eventId))
    .single();

  if (eventData) setEvent(eventData);

  const { data: regData } = await supabase
    .from('event_registrations')
    .select('*')
    .eq('event_id', parseInt(eventId));

  setRegistrations(regData || []);

  const { data: roundsData } = await supabase
    .from('event_rounds')
    .select('*')
    .eq('event_id', parseInt(eventId))
    .order('sort_order', { ascending: true });

  setRounds(roundsData || []);

  const { data: feeData } = await supabase
    .from('platform_settings')
    .select('platform_fee')
    .eq('id', 1)
    .single();

  if (feeData?.platform_fee !== undefined && feeData?.platform_fee !== null) {
    setPlatformFee(Number(feeData.platform_fee));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  setCurrentUser(user);

  if (user && eventData) {
    const isCreator = eventData.created_by === user.id;
    const { data: adminRow } = await supabase
      .from('event_admins')
      .select('id')
      .eq('event_id', parseInt(eventId))
      .or(`user_id.eq.${user.id},email.eq.${user.email}`)
      .maybeSingle();

    setIsEventAdmin(isCreator || !!adminRow);
  } else {
    setIsEventAdmin(false);
  }

  setLoading(false);
};

useEffect(() => {
  fetchData();
}, [eventId]);

useEffect(() => {
  if (!eventId || typeof window === 'undefined') return;
  const url = `${window.location.origin}/event/${eventId}`;
  QRCode.toDataURL(url, { width: 280, margin: 1, errorCorrectionLevel: 'M' })
    .then(setFlyerQrDataUrl)
    .catch((e) => console.error('Flyer QR failed', e));
}, [eventId]);

  // Force single player when a discount is applied
  useEffect(() => {
    if (appliedDiscount?.one_player_only) {
      setAdditionalPlayers([]);
      setIsOrganizerOnly(false);
    }
  }, [appliedDiscount]);

  const handleShare = async () => {
    const url = `${window.location.origin}/event/${eventId}`;
    const title = event?.name || 'Fried Egg Events';
    const text = `Join me at ${title}!`;

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      alert('Link copied to clipboard!');
    } catch {
      prompt('Copy this link:', url);
    }
  };

  // Handle payment success / cancel
  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    const type = searchParams.get('type');
    const regIdParam = searchParams.get('registration_id');

    if (paymentStatus === 'cancelled' && type === 'registration') {
      try {
        sessionStorage.removeItem(paymentHandledKey);
        const raw = sessionStorage.getItem(draftKey);
        if (raw) {
          const draft = JSON.parse(raw);
          setMode(draft.mode || '');
          setIsOrganizerOnly(!!draft.isOrganizerOnly);
          if (draft.mode === 'join') setSelectedTeam(draft.teamName || '');
          if (draft.mode === 'create') setNewTeamName(draft.teamName || '');

          setAdditionalPlayers(
            (draft.players || [])
              .filter((p: any) => !p.user_id)
              .map((p: any) => ({
                name: p.player_name || '',
                email: p.player_email || '',
              }))
          );

          const ids: number[] = draft.selected_round_ids || [];
          setSelectedPaidRoundIds(ids);
          setAgreedToWaiver(true);

          // Restore discount if present
          if (draft.discount) {
            setAppliedDiscount({
              code: draft.discount.code,
              discount_code_id: draft.discount.discount_code_id,
              discount_type: 'fixed',
              amount: draft.discount.amount_saved,
              amount_saved: draft.discount.amount_saved,
              label: draft.discount.code,
              one_player_only: true,
            });
            setDiscountCode(draft.discount.code);
          }

          setShowRegisterModal(true);
        }
      } catch (e) {
        console.error('Failed to restore registration draft:', e);
      }
      return;
    }

    if (paymentStatus === 'success' && type === 'registration') {
      if (typeof window !== 'undefined') {
        if (sessionStorage.getItem(paymentHandledKey) === '1') {
          return;
        }
        sessionStorage.setItem(paymentHandledKey, '1');
      }

      const handleRegistrationSuccess = async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          console.error('Payment success: no user');
          return;
        }

        let myReg: any = null;
        let paidThisCheckout: any[] = [];
        let checkoutNetAmount: number | null = null;
        let draftDiscount: any = null;

        const raw = sessionStorage.getItem(draftKey);
        

                if (raw) {
          const draft = JSON.parse(raw);
          checkoutNetAmount =
            draft.totalCost != null ? Number(draft.totalCost) : null;
          draftDiscount = draft.discount || null;

          sessionStorage.setItem(
            lastPaymentKey,
            JSON.stringify({
              totalCost: draft.totalCost,
              players: draft.players || [],
              selected_round_ids: draft.selected_round_ids || [],
              discount: draft.discount || null,
              registration_ids: draft.registration_ids || [],
            })
          );

          const ids: string[] = (draft.registration_ids || []).map(String);

          if (!ids.length) {
            alert(
              'Payment succeeded but registration ids were missing. Contact support if you were charged.'
            );
            return;
          }

          // Rows were created unpaid before Checkout — mark them paid (no second insert)
          const { data: updated, error: updateErr } = await supabase
            .from('event_registrations')
            .update({ paid: true, payment_method: 'card' })
            .in('id', ids)
            .select('*');

          if (updateErr) {
            alert(
              'Payment received but updating registration failed: ' +
                updateErr.message
            );
            return;
          }

          sessionStorage.removeItem(draftKey);

          myReg =
            (updated || []).find((r: any) => r.user_id === user.id) ||
            (updated || [])[0] ||
            null;

          paidThisCheckout = updated || [];

          // Save Stripe payment_intent + amount_paid
          const sessionId = searchParams.get('session_id');
          if (sessionId) {
            try {
              await fetch('/api/confirm-registration-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  session_id: sessionId,
                  registration_ids: ids,
                }),
              });
            } catch (e) {
              console.error('confirm-registration-payment failed', e);
            }
          }

          // ---------- Redeem the discount code ----------
          if (draftDiscount && paidThisCheckout.length > 0) {
            const primary =
              paidThisCheckout.find((r: any) => r.user_id === user.id) ||
              paidThisCheckout[0];

            try {
              await fetch('/api/discount-codes/redeem', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  discount_code_id: draftDiscount.discount_code_id,
                  event_id: parseInt(eventId),
                  registration_id: primary.id,
                  user_id: user.id,
                  player_email: primary.player_email,
                  amount_saved: draftDiscount.amount_saved,
                }),
              });
            } catch (redeemErr) {
              console.error('Discount redeem failed:', redeemErr);
            }
          }
        } else {
          const lastRaw = sessionStorage.getItem(lastPaymentKey);
          if (lastRaw) {
            try {
              const last = JSON.parse(lastRaw);
              checkoutNetAmount =
                last.totalCost != null ? Number(last.totalCost) : null;
            } catch {}
          }

          const { data: regs, error: findErr } = await supabase
            .from('event_registrations')
            .select('*')
            .eq('event_id', parseInt(eventId))
            .eq('user_id', user.id)
            .order('id', { ascending: false })
            .limit(1);

          if (findErr || !regs?.[0]) {
            console.error('Find registration error:', findErr);
            alert(
              'Payment succeeded but we could not find your registration.'
            );
            return;
          }

          myReg = regs[0];

          const { error: updateErr } = await supabase
            .from('event_registrations')
            .update({ paid: true })
            .eq('id', myReg.id);

          if (updateErr) {
            alert(
              'Payment succeeded but updating paid status failed: ' +
                updateErr.message
            );
          }

          paidThisCheckout = [myReg];
        }

        const { data: feeData } = await supabase
          .from('platform_settings')
          .select('platform_fee')
          .eq('id', 1)
          .single();

        if (feeData?.platform_fee) {
          setPlatformFee(Number(feeData.platform_fee));
        }

        setShowSuccessMessage(true);

        const { data: refreshed } = await supabase
          .from('event_registrations')
          .select('*')
          .eq('event_id', parseInt(eventId));
        setRegistrations(refreshed || []);

        let eventData = event;
        if (!eventData) {
          const { data } = await supabase
            .from('tournaments')
            .select('*')
            .eq('id', parseInt(eventId))
            .single();
          eventData = data;
        }

        if (myReg && eventData) {
          const selectedIds: number[] = myReg.selected_round_ids || [];
          let signedUpRounds: any[] = [];

          if (selectedIds.length > 0) {
            const { data: roundRows } = await supabase
              .from('event_rounds')
              .select('*')
              .in('id', selectedIds)
              .order('sort_order', { ascending: true });
            signedUpRounds = roundRows || [];
          }

          const playerCountThisPayment = Math.max(1, paidThisCheckout.length);

          const { data: liveFeeData } = await supabase
            .from('platform_settings')
            .select('platform_fee')
            .eq('id', 1)
            .single();

          const feePerPlayer = Number(liveFeeData?.platform_fee) || 0;
          const isPerRoundMode =
            (eventData.pricing_mode || 'event') === 'per_round';

          let netAmount =
            checkoutNetAmount != null && !Number.isNaN(checkoutNetAmount)
              ? checkoutNetAmount
              : 0;

          let roundsSummary: any[] = [];

          if (netAmount <= 0) {
            if (isPerRoundMode) {
              netAmount = signedUpRounds.reduce((sum, r) => {
                return (
                  sum +
                  (Number(r.price || 0) + feePerPlayer) * playerCountThisPayment
                );
              }, 0);
            } else {
              const baseWithFee = (Number(eventData.price) || 0) + feePerPlayer;
              const optionalRounds = signedUpRounds.filter(
                (r) => r.pay_separately
              );
              const optionalPerPlayer = optionalRounds.reduce(
                (sum, r) => sum + Number(r.price || 0) + feePerPlayer,
                0
              );
              netAmount =
                (baseWithFee + optionalPerPlayer) * playerCountThisPayment;
            }
          }

          roundsSummary = signedUpRounds.map((r) => {
            const time = r.start_time ? String(r.start_time).slice(0, 5) : '';
            if (isPerRoundMode || r.pay_separately) {
              return {
                label: `${r.name}${time ? ` at ${time}` : ''}`,
                price:
                  (Number(r.price || 0) + feePerPlayer) * playerCountThisPayment,
              };
            }
            return `${r.name}${time ? ` at ${time}` : ''} (included)`;
          });

          const netCents = Math.round(netAmount * 100);
          const totalCents = Math.ceil((netCents + 30) / (1 - 0.029));
          const processingFee = (totalCents - netCents) / 100;
          const totalPaid = totalCents / 100;

          const eventDateStr = new Date(
            eventData.date + 'T12:00:00'
          ).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          });

          const rosterNames = paidThisCheckout
            .map((p) => p.player_name)
            .filter(Boolean);

          const payer =
            paidThisCheckout.find((p) => p.id === myReg.id) ||
            paidThisCheckout.find((p) => p.user_id === user.id) ||
            myReg;

          if (payer?.player_email) {
            await fetch('/api/send-registration-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: payer.player_email,
                name: payer.player_name,
                eventName: eventData.name,
                eventDate: eventDateStr,
                location: eventData.location,
                course: eventData.course,
                eventId: eventData.id,
                teamName: payer.team_name || null,
                isTeam: !!payer.team_name,
                pricingMode: isPerRoundMode ? 'per_round' : 'event',
                eventPrice: isPerRoundMode ? 0 : netAmount,
                platformFee: 0,
                processingFee,
                totalPaid,
                playerCount: playerCountThisPayment,
                rounds: roundsSummary,
                discountCode: draftDiscount?.code || null,
    discountAmount: draftDiscount?.amount_saved || 0,
              }),
            });
          }

          const emailedTeammates = new Set<string>();
          for (const person of paidThisCheckout) {
            if (!person) continue;
            if (person.id === payer?.id) continue;
            if (person.user_id && person.user_id === user.id) continue;

            const to = (person.player_email || '').trim().toLowerCase();
            if (!to || emailedTeammates.has(to)) continue;
            emailedTeammates.add(to);

            await fetch('/api/send-teammate-registration-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: person.player_email,
                name: person.player_name,
                eventName: eventData.name,
                eventDate: eventDateStr,
                location: eventData.location,
                course: eventData.course,
                teamName: person.team_name || null,
                teammates: rosterNames,
              }),
            });
          }

          const roundsLabel = signedUpRounds
            .map((r) => {
              const time = r.start_time ? String(r.start_time).slice(0, 5) : '';
              return `${r.name}${time ? ` (${time})` : ''}`;
            })
            .join(', ');

          await fetch('/api/send-organizer-registration-notice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              eventId: eventData.id,
              eventName: eventData.name,
              createdBy: eventData.created_by,
              contactEmail: eventData.contact_email,
              playerName: myReg.player_name,
              playerEmail: myReg.player_email,
              teamName: myReg.team_name || null,
              rounds: roundsLabel || null,
              eventFee: netAmount,
              totalPaid,
              teammates: paidThisCheckout
                .filter((t) => t.id !== myReg.id)
                .map((t: any) => ({
                  name: t.player_name,
                  email: t.player_email,
                })),
            }),
          });

          sessionStorage.removeItem(lastPaymentKey);
        }

        await fetchData();

        try {
          const url = new URL(window.location.href);
          url.searchParams.delete('payment');
          url.searchParams.delete('type');
          window.history.replaceState({}, '', url.pathname + url.search);
        } catch {}
      };

      handleRegistrationSuccess();
    }

    if (paymentStatus === 'success' && type === 'addon' && regIdParam) {
      const addonKey = `addon_handled_${regIdParam}`;
      if (typeof window !== 'undefined') {
        if (sessionStorage.getItem(addonKey) === '1') return;
        sessionStorage.setItem(addonKey, '1');
      }
      const regId = parseInt(regIdParam);
      supabase
        .from('event_registrations')
        .update({ paid_addons: true })
        .eq('id', regId)
        .then(() => setShowSuccessModal(true));
    }
  }, [searchParams, eventId]);

  // ==================== CALCULATIONS ====================
  const isIndividual = event?.max_teammates === 1 || !event?.max_teammates;
  const maxTeamSize = event?.max_teammates || 1;

  const registrationOpen = event?.registration_open_date
    ? new Date() >=
      new Date(
        event.registration_open_date +
          'T' +
          (event.registration_open_time || '00:00:00')
      )
    : false;

  const isPerRound = (event?.pricing_mode || 'event') === 'per_round';
const maxPlayers =
  event?.max_players != null && Number(event.max_players) > 0
    ? Number(event.max_players)
    : null;

// Per-round: each selected round is a seat (1 person × 3 rounds = 3)
// Event pricing: 1 seat per registration row
const registeredCount = registrations.reduce((sum, r) => {
  if (!isPerRound) return sum + 1;
  const ids: number[] = Array.isArray(r.selected_round_ids)
    ? r.selected_round_ids
    : [];
  // If somehow empty, still count 1 so the player isn't invisible
  return sum + Math.max(ids.length, 1);
}, 0);

const isSoldOut =
  maxPlayers != null && registeredCount >= maxPlayers;

const spotsLeft =
  maxPlayers != null ? Math.max(0, maxPlayers - registeredCount) : null;

  const includedRounds = isPerRound
    ? []
    : rounds.filter((r) => !r.pay_separately);
  const selectableRounds = isPerRound
    ? rounds
    : rounds.filter((r) => r.pay_separately);

  const pricePerPlayer = isPerRound ? 0 : Number(event?.price) || 0;
  const feePerPlayer = platformFee;

  const hasIncompleteAdditionalPlayers = additionalPlayers.some(
    (p) => !(p.name || '').trim() || !isValidEmail(p.email || '')
  );

  const completeAdditionalPlayers = additionalPlayers.filter(
    (p) => (p.name || '').trim() && isValidEmail(p.email || '')
  );

  const totalPlayers = isOrganizerOnly
    ? completeAdditionalPlayers.length
    : 1 + completeAdditionalPlayers.length;

  const selectedRoundsCostPerPlayer = selectedPaidRoundIds.reduce(
    (sum, id) => {
      const round =
        selectableRounds.find((r) => r.id === id) ||
        rounds.find((r) => r.id === id);
      if (!round) return sum;
      return sum + Number(round.price || 0) + feePerPlayer;
    },
    0
  );

  // Discount is applied per player
  const discountPerPlayer = appliedDiscount
    ? Number(appliedDiscount.amount_saved)
    : 0;

  const totalCost = isPerRound
    ? totalPlayers *
      Math.max(0, selectedRoundsCostPerPlayer - discountPerPlayer)
    : totalPlayers *
      Math.max(
        0,
        pricePerPlayer +
          feePerPlayer +
          selectedRoundsCostPerPlayer -
          discountPerPlayer
      );

  const getSelectedRoundIds = () => {
    if (isPerRound) return [...selectedPaidRoundIds];
    const autoIds = includedRounds.map((r) => r.id);
    return [...autoIds, ...selectedPaidRoundIds];
  };

    // Rounds the player is about to join (for capacity checks)
  const capacityRoundIds: number[] = isPerRound
    ? selectedPaidRoundIds
    : rounds.map((r) => r.id);

  const regsForCapacity = (roundId?: number) => {
    if (roundId == null) return registrations;
    return registrations.filter((r) => {
      const ids: number[] = r.selected_round_ids || [];
      // No round list stored → treat as on all rounds
      if (!ids.length) return true;
      return ids.includes(roundId);
    });
  };

  const maxTeamsForRound = (roundId: number) => {
    const round = rounds.find((r) => r.id === roundId);
    if (round?.max_teams != null && Number(round.max_teams) > 0) {
      return Number(round.max_teams);
    }
    // Fallback: derive from max_players ÷ team size
    if (round?.max_players != null && Number(round.max_players) > 0) {
      return Math.max(1, Math.floor(Number(round.max_players) / maxTeamSize));
    }
    return null; // unlimited
  };

  const teamCountForRound = (roundId: number) => {
    const names = new Set(
      regsForCapacity(roundId)
        .map((r) => r.team_name)
        .filter(Boolean)
    );
    return names.size;
  };

  // True if ANY selected round is at max teams (can't create a new team)
  const teamsFull = capacityRoundIds.some((rid) => {
    const maxT = maxTeamsForRound(rid);
    if (maxT == null) return false;
    return teamCountForRound(rid) >= maxT;
  });

  const existingTeams = Array.from(
    new Set(registrations.map((r) => r.team_name).filter(Boolean))
  );

  const getSpotsLeft = (team: string) => {
    // Spots left on this team (by player count), using event-wide regs
    // so a team full on one round isn't joinable as a loophole
    const count = registrations.filter((r) => r.team_name === team).length;
    return Math.max(0, maxTeamSize - count);
  };

  const updateExtraPlayer = (
    index: number,
    field: 'name' | 'email',
    value: string
  ) => {
    const updated = [...additionalPlayers];
    updated[index][field] = value;
    setAdditionalPlayers(updated);
  };

  const removeExtraPlayer = (index: number) => {
    setAdditionalPlayers(additionalPlayers.filter((_, i) => i !== index));
  };

  const togglePaidRound = (roundId: number) => {
    setSelectedPaidRoundIds((prev) =>
      prev.includes(roundId)
        ? prev.filter((id) => id !== roundId)
        : [...prev, roundId]
    );
  };

  const getPlayerName = (user: any) => {
    return (
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      user?.email?.split('@')[0] ||
      'Player'
    );
  };

  // ---------- Discount helpers ----------
  const applyDiscountCode = async () => {
    if (!discountCode.trim()) {
      setDiscountError('Enter a code');
      return;
    }

    setDiscountLoading(true);
    setDiscountError('');

    try {
      const basePerPlayer = isPerRound
        ? selectedRoundsCostPerPlayer
        : pricePerPlayer + feePerPlayer + selectedRoundsCostPerPlayer;

      const res = await fetch('/api/discount-codes/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: discountCode.trim(),
          eventId: parseInt(eventId),
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
      setDiscountError('');
    } catch (err) {
      console.error(err);
      setDiscountError('Could not validate code');
      setAppliedDiscount(null);
    } finally {
      setDiscountLoading(false);
    }
  };

  const clearDiscount = () => {
    setAppliedDiscount(null);
    setDiscountCode('');
    setDiscountError('');
  };
  const handleJoinWaitlist = async () => {
  if (!waitlistName.trim() || !waitlistEmail.trim()) {
    return alert('Name and email are required');
  }
  if (!isValidEmail(waitlistEmail)) {
    return alert('Enter a valid email');
  }

  setWaitlistSubmitting(true);
  try {
    const { error } = await supabase.from('event_waitlist').insert({
      event_id: parseInt(eventId),
      name: waitlistName.trim(),
      email: waitlistEmail.trim().toLowerCase(),
      phone: waitlistPhone.trim() || null,
    });

    if (error) throw error;

// Notify organizers (non-blocking)
fetch('/api/send-waitlist-notice', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    eventId: parseInt(eventId),
    name: waitlistName.trim(),
    email: waitlistEmail.trim().toLowerCase(),
    phone: waitlistPhone.trim() || null,
  }),
}).catch((e) => console.error('Waitlist notice failed:', e));

setWaitlistDone(true);
setWaitlistName('');
setWaitlistEmail('');
setWaitlistPhone('');
  } catch (e: any) {
    console.error(e);
    alert(e.message || 'Could not join waitlist');
  } finally {
    setWaitlistSubmitting(false);
  }
};

  const handleRegisterClick = async () => {
  if (isSoldOut) {
    alert('This event is sold out. You can join the waitlist instead.');
    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
    if (!user) {
      router.push(`/login?redirect=/event/${eventId}`);
      return;
    }
    setCurrentUser(user);
    setShowRegisterModal(true);
    setIsOrganizerOnly(false);
    setMode('');
    setSelectedTeam('');
    setNewTeamName('');
    setAdditionalPlayers([]);
    setSelectedPaidRoundIds([]);
    setAgreedToWaiver(true);

    // Reset discount
    setDiscountCode('');
    setAppliedDiscount(null);
    setDiscountError('');
  };

    const handleRegister = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      alert('Please log in to register');
      return;
    }

    if (mode === 'create' && teamsFull) {
      alert(
        'No new teams available for the selected round(s). Join an existing team instead.'
      );
      return;
    }

    setSubmitting(true);

    try {
      const finalTeamName = mode === 'create' ? newTeamName : selectedTeam;
      const selectedRoundIds = getSelectedRoundIds();
      const playerName = getPlayerName(user);

      if (!isIndividual && !finalTeamName) {
        alert('Please select or create a team name');
        setSubmitting(false);
        return;
      }

      if (isPerRound && selectedPaidRoundIds.length === 0) {
        alert('Please select at least one round');
        setSubmitting(false);
        return;
      }

      const incomplete = additionalPlayers.filter(
        (p) => !(p.name || '').trim() || !isValidEmail(p.email || '')
      );
      if (incomplete.length > 0) {
        alert(
          'Please enter a name and a valid email (e.g. name@email.com) for every additional player, or remove the empty slots.'
        );
        setSubmitting(false);
        return;
      }

      const completeAdditional = additionalPlayers.filter(
        (p) => (p.name || '').trim() && isValidEmail(p.email || '')
      );

      const players: any[] = [];

      if (isIndividual) {
        players.push({
          player_name: playerName,
          player_email: user.email || '',
          user_id: user.id,
        });
      } else {
        if (!isOrganizerOnly) {
          players.push({
            player_name: playerName,
            player_email: user.email || '',
            user_id: user.id,
          });
        }
        for (const p of completeAdditional) {
          players.push({
            player_name: p.name.trim(),
            player_email: p.email.trim(),
            user_id: null,
          });
        }
        if (players.length === 0) {
          alert('Add at least one player to the team');
          setSubmitting(false);
          return;
        }
      }

            sessionStorage.removeItem(paymentHandledKey);

      // Create unpaid rows first so Stripe metadata has registration ids
      const regRows = players.map((p: any) => ({
        event_id: parseInt(eventId),
        user_id: p.user_id || null,
        player_name: p.player_name,
        player_email: p.player_email || null,
        team_name: isIndividual ? null : finalTeamName,
        paid: false,
        checked_in: false,
        addons_selected: {},
        selected_round_ids: selectedRoundIds,
        discount_code: appliedDiscount?.code || null,
        discount_amount: appliedDiscount?.amount_saved || 0,
      }));

      const { data: insertedRegs, error: insertErr } = await supabase
        .from('event_registrations')
        .insert(regRows)
        .select('id');

      if (insertErr || !insertedRegs?.length) {
        throw new Error(
          insertErr?.message || 'Could not create registration rows'
        );
      }

      const registrationIds = insertedRegs.map((r: any) => r.id);
      const primaryRegistrationId = registrationIds[0];

      const draft = {
        eventId: parseInt(eventId),
        mode,
        isIndividual,
        isOrganizerOnly,
        teamName: isIndividual ? null : finalTeamName,
        selected_round_ids: selectedRoundIds,
        players,
        totalCost,
        registration_ids: registrationIds,
        discount: appliedDiscount
          ? {
              code: appliedDiscount.code,
              discount_code_id: appliedDiscount.discount_code_id,
              amount_saved: appliedDiscount.amount_saved,
            }
          : null,
      };

      sessionStorage.setItem(draftKey, JSON.stringify(draft));

      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL || window.location.origin;

      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: totalCost,
          player_name: playerName,
          email: user.email,
          description: `Registration for ${event.name}`,
          event_name: event.name,
          event_id: event.id,
          type: 'registration',
          registration_id: primaryRegistrationId,
          registration_ids: registrationIds.join(','),
          success_url: `${baseUrl}/event/${eventId}?payment=success&type=registration&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${baseUrl}/event/${eventId}?payment=cancelled&type=registration`,
        }),
      });

      const data = await response.json();
      const url = data.url;

      if (!response.ok || !url) {
        await supabase
          .from('event_registrations')
          .delete()
          .in('id', registrationIds);
        alert(data.error || 'Failed to create payment link');
        return;
      }

      window.location.href = url;
      setShowRegisterModal(false);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error starting registration');
    } finally {
      setSubmitting(false);
    }
  };
  const viewRegisteredPlayers = () => {
    router.push(`/event/${eventId}/players`);
  };

  if (loading)
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
        Loading event...
      </div>
    );
  if (!event)
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
        Event not found
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-20">
      <div className="max-w-4xl mx-auto px-6 pt-8">
        <button
          onClick={() => router.push('/')}
          className="mb-8 flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          ← Back to All Events
        </button>
        {isEventAdmin && event && (
  <div className="flex items-center gap-2 justify-center">
    <PDFDownloadLink
      document={
        <EventFlyerPDF
          event={event}
          qrDataUrl={flyerQrDataUrl}
          registerUrl={
            typeof window !== 'undefined'
              ? `${window.location.origin}/event/${eventId}`
              : `https://friedeggevents.app/event/${eventId}`
          }
        />
      }
      fileName={`${String(event.name || 'event')
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-|-$/g, '')}-flyer.pdf`}
      className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 px-5 py-3 rounded-2xl font-semibold text-sm"
    >
      {({ loading }) => (loading ? 'Preparing…' : '📄 Create Flyer')}
    </PDFDownloadLink>
    <span
      title="Create a PDF flyer for this event"
      className="text-gray-400 text-sm cursor-help select-none"
      aria-label="Create a PDF flyer for this event"
    >
      ⓘ
    </span>
  </div>
)}

        {showSuccessMessage && (
          <div className="mb-8 bg-green-900/50 border border-green-600 rounded-3xl p-8 text-center">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-3xl font-bold text-green-400 mb-2">
              Registration Complete!
            </h2>
            <p className="text-gray-300 mb-6">
              Congratulations! You are registered for{' '}
              <strong>{event?.name}</strong>.
              <br />A confirmation email has been sent.
            </p>
            <button
              onClick={viewRegisteredPlayers}
              className="bg-green-600 hover:bg-green-700 px-8 py-4 rounded-2xl font-semibold text-lg"
            >
              View Registered Players
            </button>
          </div>
        )}

        <div className="bg-gray-800 rounded-3xl overflow-hidden">
          <div className="relative h-80 bg-gray-900">
            {event.image_url ? (
              <img
                src={event.image_url}
                alt={event.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                <span className="text-6xl opacity-30">🏌️</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-10">
              <h1 className="text-5xl font-bold mb-3 text-white">
                {event.name}
              </h1>
              <p className="text-2xl text-gray-200">
                {event.course} • {event.location}
              </p>
              {event.event_type && (
                <p className="text-lg text-blue-400 mt-2">
                  Event Type: {event.event_type}
                </p>
              )}
            </div>
          </div>
          

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 p-10 border-b border-gray-700">
            <div>
              <p className="text-gray-500 text-sm mb-1">DATE</p>
              <p className="text-2xl font-semibold">
                {(() => {
                  if (!event.date) return 'TBD';
                  const dateOnly = String(event.date).split('T')[0];
                  const [year, month, day] = dateOnly.split('-').map(Number);
                  const d = new Date(year, month - 1, day);
                  return d.toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  });
                })()}
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-sm mb-1">REGISTRATION OPENS</p>
              <p className="text-xl font-medium">
                {new Date(event.registration_open_date).toLocaleDateString()} at{' '}
                {event.registration_open_time || '00:00'}
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-sm mb-1">
                {(event.pricing_mode || 'event') === 'per_round'
                  ? 'From (per player)'
                  : 'Price per Player'}
              </p>
              <p className="text-xl font-medium">
                {(event.pricing_mode || 'event') === 'per_round'
                  ? rounds.length > 0
                    ? `$${(
                        Math.min(...rounds.map((r) => Number(r.price) || 0)) +
                        platformFee
                      ).toFixed(2)}`
                    : 'TBD'
                  : event.price
                    ? `$${(Number(event.price) + platformFee).toFixed(2)}`
                    : 'TBD'}
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-sm mb-1">MAX PLAYERS</p>
              <p className="text-xl font-medium">
                {event.max_teammates || event.max_players || 'N/A'}
              </p>
            </div>
          </div>

          {rounds.length > 0 && (
            <div className="p-10 border-b border-gray-700">
              <p className="text-gray-500 text-sm mb-3">
                ROUNDS ({rounds.length})
              </p>
              <div className="space-y-3">
                {rounds.map((round) => (
                  <div
                    key={round.id}
                    className="bg-gray-900 px-5 py-4 rounded-2xl flex justify-between items-center"
                  >
                    <div>
                      <span className="font-medium">{round.name}</span>
                      {round.start_time && (
                        <span className="text-gray-400 ml-3">
                          {String(round.start_time).slice(0, 5)}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-400">
                      Max {round.max_players} players
                      {(event.pricing_mode || 'event') === 'per_round' ||
                      round.pay_separately
                        ? ` · $${(Number(round.price || 0) + platformFee).toFixed(2)}`
                        : ' · Included'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          

          {event.flights && event.flights.length > 0 && (
            <div className="p-10 border-b border-gray-700">
              <p className="text-gray-500 text-sm mb-3">FLIGHTS</p>
              <div className="flex flex-wrap gap-3">
                {event.flights.map((flight: any, index: number) => (
                  <div
                    key={index}
                    className="bg-gray-900 px-5 py-2 rounded-2xl text-sm"
                  >
                    {flight.name} ({flight.range})
                  </div>
                ))}
              </div>
            </div>
          )}

          {event.description && (
            <div className="p-10 border-b border-gray-700">
              <p className="text-gray-500 text-sm mb-3">ABOUT THIS EVENT</p>
              <p className="text-gray-300 leading-relaxed text-lg">
                {event.description}
              </p>
            </div>
          )}
          
          <div className="p-10 space-y-4">
            {maxPlayers != null && (
              <p className="text-sm text-gray-400 text-center">
                {isSoldOut
                  ? 'Sold out'
                  : `${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left · ${registeredCount}/${maxPlayers}`}
              </p>
            )}

            {isSoldOut ? (
              <div className="bg-gray-800 border border-amber-500/40 rounded-3xl p-6 space-y-4 max-w-md w-full">
                <div>
                  <h3 className="text-xl font-semibold text-amber-300">
                    Sold Out
                  </h3>
                  <p className="text-sm text-gray-400 mt-1">
                    Join the waitlist and we’ll reach out if a spot opens.
                  </p>
                </div>

                {waitlistDone ? (
                  <p className="text-emerald-400 font-medium">
                    You’re on the waitlist. We’ll email you if a spot opens.
                  </p>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="Full name"
                      value={waitlistName}
                      onChange={(e) => setWaitlistName(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={waitlistEmail}
                      onChange={(e) => setWaitlistEmail(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
                    />
                    <input
                      type="tel"
                      placeholder="Phone (optional)"
                      value={waitlistPhone}
                      onChange={(e) => setWaitlistPhone(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
                    />
                    <button
                      type="button"
                      onClick={handleJoinWaitlist}
                      disabled={waitlistSubmitting}
                      className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 py-4 rounded-2xl font-semibold"
                    >
                      {waitlistSubmitting ? 'Submitting…' : 'Join Waitlist'}
                    </button>
                  </>
                )}
              </div>
            ) : registrationOpen ? (
  <div className="flex flex-col sm:flex-row gap-3 w-full">
    <button
      onClick={handleRegisterClick}
      className="flex-1 bg-green-600 hover:bg-green-700 py-4 px-6 rounded-2xl text-lg font-semibold"
    >
      Register
    </button>
    <button
      onClick={viewRegisteredPlayers}
      className="flex-1 bg-blue-600 hover:bg-blue-700 py-4 px-6 rounded-2xl text-lg font-semibold"
    >
      View Registered Players
    </button>
    <button
      onClick={handleShare}
      className="flex-1 bg-gray-700 hover:bg-gray-600 py-4 px-6 rounded-2xl text-lg font-semibold"
    >
      Share Event
    </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-3 w-full">
                <button className="w-full sm:flex-1 bg-gray-700 hover:bg-gray-600 py-4 px-6 rounded-2xl text-lg font-semibold">
                  Notify Me When Registration Opens
                </button>
                <button
                  onClick={handleShare}
                  className="w-full sm:w-auto bg-gray-700 hover:bg-gray-600 py-4 px-6 rounded-2xl text-base font-semibold whitespace-nowrap"
                >
                  Share Event
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showAuthModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-3xl p-10 w-full max-w-md">
            <h2 className="text-3xl font-bold mb-8 text-center">
              Sign in to Register
            </h2>
            <div className="space-y-4">
              <button
                onClick={() =>
                  router.push(`/login?redirect=/event/${eventId}`)
                }
                className="w-full bg-blue-600 hover:bg-blue-700 py-4 rounded-2xl text-lg font-semibold"
              >
                Sign In
              </button>
              <button
                onClick={() =>
                  router.push(`/signup?redirect=/event/${eventId}`)
                }
                className="w-full bg-gray-700 hover:bg-gray-600 py-4 rounded-2xl text-lg font-semibold"
              >
                Create Account
              </button>
            </div>
            <button
              onClick={() => setShowAuthModal(false)}
              className="w-full mt-6 py-4 text-gray-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showRegisterModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-10">
              <h2 className="text-3xl font-bold mb-6">
                Register for {event.name}
              </h2>

              {rounds.length > 0 && (
                <div className="bg-gray-900 rounded-2xl p-5 mb-6">
                  <p className="text-sm text-gray-400 mb-4 font-medium">
                    {(event.pricing_mode || 'event') === 'per_round'
                      ? 'Select round(s) to play'
                      : 'Rounds'}
                  </p>

                  {(event.pricing_mode || 'event') !== 'per_round' &&
                    includedRounds.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs text-teal-300 mb-2">
                          Included in registration
                        </p>
                        <ul className="text-sm text-gray-300 space-y-1">
                          {includedRounds.map((r) => (
                            <li key={r.id}>
                              {r.name}
                              {r.start_time
                                ? ` · ${String(r.start_time).slice(0, 5)}`
                                : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                  {selectableRounds.length > 0 && (
                    <div className="space-y-3">
                      {(event.pricing_mode || 'event') !== 'per_round' && (
                        <p className="text-xs text-gray-500 mb-1">
                          Optional (extra charge)
                        </p>
                      )}
                      {selectableRounds.map((round) => {
                        const checked = selectedPaidRoundIds.includes(round.id);
                        return (
                          <label
                            key={round.id}
                            className={`flex items-center justify-between gap-4 p-4 rounded-2xl cursor-pointer border transition-colors ${
                              checked
                                ? 'border-teal-500 bg-teal-950/40'
                                : 'border-gray-700 hover:border-gray-600'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => togglePaidRound(round.id)}
                                className="w-5 h-5 accent-teal-600"
                              />
                              <div>
                                <div className="font-medium">{round.name}</div>
                                {round.start_time && (
                                  <div className="text-xs text-gray-400">
                                    {String(round.start_time).slice(0, 5)}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="text-sm font-medium text-teal-300">
                              $
                              {(Number(round.price || 0) + platformFee).toFixed(
                                2
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {isIndividual ? (
                <div className="space-y-8">
                  {/* Discount Code (Individual) */}
                  <div className="bg-gray-900 p-5 rounded-2xl">
                    <label className="block text-sm text-gray-400 mb-2">
                      Discount Code
                    </label>

                    {appliedDiscount ? (
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-emerald-400">
                            {appliedDiscount.code} applied
                          </p>
                          <p className="text-sm text-gray-400">
                            {appliedDiscount.label} · −$
                            {appliedDiscount.amount_saved.toFixed(2)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={clearDiscount}
                          className="text-sm text-red-400 hover:text-red-300"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row gap-3">
  <input
    type="text"
    value={discountCode}
    onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
    placeholder="Enter code"
    className="w-full sm:flex-1 bg-gray-700 border border-gray-600 rounded-xl px-4 py-3 uppercase"
  />
  <button
    type="button"
    onClick={applyDiscountCode}
    disabled={discountLoading || !discountCode.trim()}
    className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700 disabled:bg-gray-600 px-5 py-3 rounded-xl font-medium shrink-0"
  >
    {discountLoading ? '…' : 'Apply'}
  </button>
</div>
                    )}

                    {discountError && (
                      <p className="text-red-400 text-sm mt-2">{discountError}</p>
                    )}
                  </div>

                  <div className="bg-gray-900 p-6 rounded-2xl text-center">
                    <p className="text-xl">Individual Event</p>
                    <p className="text-3xl font-semibold mt-2">
                      ${totalCost.toFixed(2)}
                    </p>
                    {appliedDiscount && (
                      <p className="text-sm text-emerald-400 mt-1">
                        Discount applied
                      </p>
                    )}
                  </div>

                  <button
                    onClick={handleRegister}
                    disabled={
                      submitting ||
                      ((event.pricing_mode || 'event') === 'per_round' &&
                        selectedPaidRoundIds.length === 0)
                    }
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 py-5 rounded-2xl text-xl font-semibold"
                  >
                    {submitting
                      ? 'Processing Payment...'
                      : `Complete Registration — $${totalCost.toFixed(2)}`}
                  </button>
                </div>
              ) : (
                <div className="space-y-8">
                  <div>
                    <label className="block text-sm text-gray-400 mb-4">
                      How would you like to register?
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={() => setMode('join')}
                        className={`p-6 rounded-2xl border text-center font-medium transition-colors ${
                          mode === 'join'
                            ? 'border-blue-500 bg-blue-950'
                            : 'border-gray-700 hover:border-gray-600'
                        }`}
                      >
                        Join Existing Team
                      </button>
                                            <button
                        type="button"
                        onClick={() => {
                          if (teamsFull) {
                            alert(
                              'No new teams available — join an existing team with open spots.'
                            );
                            return;
                          }
                          setMode('create');
                        }}
                        disabled={teamsFull}
                        className={`p-6 rounded-2xl border text-center font-medium transition-colors ${
                          mode === 'create'
                            ? 'border-blue-500 bg-blue-950'
                            : 'border-gray-700 hover:border-gray-600'
                        } disabled:opacity-40 disabled:cursor-not-allowed`}
                      >
                                               Create New Team
                        {teamsFull ? ' (full)' : ''}
                      </button>
                    </div>

                    {teamsFull && (
                      <p className="text-amber-400 text-sm mt-3">
                        Max teams reached for the selected round(s). Join a team
                        that still has open spots.
                      </p>
                    )}
                  </div>

{mode === 'join' && (
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        Select Team
                      </label>
                      <select
                        value={selectedTeam}
                        onChange={(e) => setSelectedTeam(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
                      >
                        <option value="">Choose a team</option>
                        {existingTeams.map((team) => {
                          const spots = getSpotsLeft(team);
                          return (
                            <option
                              key={team}
                              value={team}
                              disabled={spots <= 0}
                            >
                              {team} ({spots} spot{spots !== 1 ? 's' : ''} left)
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}

                  {mode === 'create' && (
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        New Team Name
                      </label>
                      <input
                        type="text"
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                        placeholder="Enter team name"
                        className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
                      />
                    </div>
                  )}
                  

                  <div className="flex items-center gap-3 bg-gray-900 p-4 rounded-2xl">
                    <input
                      type="checkbox"
                      id="organizer-only"
                      checked={isOrganizerOnly}
                      onChange={(e) => setIsOrganizerOnly(e.target.checked)}
                      disabled={!!appliedDiscount}
                      className="w-5 h-5 accent-blue-600"
                    />
                    <label
                      htmlFor="organizer-only"
                      className="text-sm cursor-pointer"
                    >
                      I am not playing — just registering the team
                    </label>
                  </div>

                  {!isOrganizerOnly && (
                    <div className="bg-emerald-900/30 border border-emerald-500 p-5 rounded-2xl">
                      <p className="text-sm text-emerald-400 mb-1">
                        You are playing as the first player
                      </p>
                      <p className="font-medium text-white">
                        {getPlayerName(currentUser)}
                      </p>
                    </div>
                  )}

                  

                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <label className="text-sm text-gray-400">
                        Additional Players
                      </label>
                      <span className="text-xs text-gray-500">
                        {completeAdditionalPlayers.length} complete /{' '}
                        {additionalPlayers.length} added
                      </span>
                    </div>

                    {appliedDiscount && (
                      <p className="text-amber-400 text-sm mb-3">
                        Discount codes apply to one player only. Additional
                        teammates must register separately.
                      </p>
                    )}

                    {additionalPlayers.map((player, index) => {
  const nameValue = player.name || '';
  const emailValue = player.email || '';
  const nameOk = nameValue.trim().length > 0;
  const emailOk = isValidEmail(emailValue);

  return (
    <div key={index} className="bg-gray-900 p-5 rounded-2xl mb-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400">
          Player {index + 1}
        </span>
        <button
          type="button"
          onClick={() => removeExtraPlayer(index)}
          className="w-9 h-9 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-xl text-lg font-bold"
        >
          −
        </button>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">
          Player Name *
        </label>
        <input
          type="text"
          value={nameValue}
          onChange={(e) =>
            updateExtraPlayer(index, 'name', e.target.value)
          }
          placeholder="John Smith"
          className={`w-full bg-gray-700 border rounded-xl px-4 py-3 ${
            nameOk ? 'border-gray-600' : 'border-red-500'
          }`}
        />
        {!nameOk && (
          <p className="text-red-400 text-xs mt-1">Name is required</p>
        )}
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">
          Email *
        </label>
        <input
          type="email"
          value={emailValue}
          onChange={(e) =>
            updateExtraPlayer(index, 'email', e.target.value)
          }
          placeholder="name@email.com"
          className={`w-full bg-gray-700 border rounded-xl px-4 py-3 ${
            emailOk ? 'border-gray-600' : 'border-red-500'
          }`}
        />
        {!emailOk && (
          <p className="text-red-400 text-xs mt-1">
            Enter a valid email (name@email.com)
          </p>
        )}
      </div>
    </div>
  );
})}

                    <button
                      onClick={() => {
                        let maxAdditional = maxTeamSize;
                        if (mode === 'join' && selectedTeam) {
                          const spotsLeft = getSpotsLeft(selectedTeam);
                          maxAdditional = isOrganizerOnly
                            ? spotsLeft
                            : spotsLeft - 1;
                        } else if (mode === 'create') {
                          maxAdditional = isOrganizerOnly
                            ? maxTeamSize
                            : maxTeamSize - 1;
                        }

                        if (additionalPlayers.length < maxAdditional) {
                          setAdditionalPlayers([
                            ...additionalPlayers,
                            { name: '', email: '' },
                          ]);
                        }
                      }}
                      disabled={
                        !!appliedDiscount ||
                        (mode === 'join' && !selectedTeam) ||
                        (mode === 'create' && !newTeamName) ||
                        additionalPlayers.length >=
                          (mode === 'join' && selectedTeam
                            ? isOrganizerOnly
                              ? getSpotsLeft(selectedTeam)
                              : getSpotsLeft(selectedTeam) - 1
                            : isOrganizerOnly
                              ? maxTeamSize
                              : maxTeamSize - 1)
                      }
                      className="w-full py-4 border border-dashed border-gray-600 rounded-2xl text-gray-400 hover:text-white disabled:opacity-50"
                    >
                      + Add Another Player
                    </button>
                  </div>

                  {/* Discount Code (Team) */}
                  <div className="bg-gray-900 p-5 rounded-2xl">
                    <label className="block text-sm text-gray-400 mb-2">
                      Discount Code
                    </label>

                    {appliedDiscount ? (
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-emerald-400">
                            {appliedDiscount.code} applied
                          </p>
                          <p className="text-sm text-gray-400">
                            {appliedDiscount.label} · −$
                            {appliedDiscount.amount_saved.toFixed(2)} per player
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={clearDiscount}
                          className="text-sm text-red-400 hover:text-red-300"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row gap-3">
  <input
    type="text"
    value={discountCode}
    onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
    placeholder="Enter code"
    className="w-full sm:flex-1 bg-gray-700 border border-gray-600 rounded-xl px-4 py-3 uppercase"
  />
  <button
    type="button"
    onClick={applyDiscountCode}
    disabled={discountLoading || !discountCode.trim()}
    className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700 disabled:bg-gray-600 px-5 py-3 rounded-xl font-medium shrink-0"
  >
    {discountLoading ? '…' : 'Apply'}
  </button>
</div>
                    )}

                    {discountError && (
                      <p className="text-red-400 text-sm mt-2">{discountError}</p>
                    )}
                  </div>

                  <div className="bg-gray-900 p-6 rounded-2xl">
                    <div className="flex justify-between text-xl font-semibold">
                      <span>Total Cost</span>
                      <span>${totalCost.toFixed(2)}</span>
                    </div>
                    {appliedDiscount && (
                      <p className="text-sm text-emerald-400 mt-1">
                        Discount applied (−$
                        {appliedDiscount.amount_saved.toFixed(2)} per player)
                      </p>
                    )}
                    {hasIncompleteAdditionalPlayers && (
                      <p className="text-amber-400 text-sm mt-3">
                        Fill in name and a valid email for all additional
                        players to continue.
                      </p>
                    )}
                  </div>

                  <button
                    onClick={handleRegister}
                    disabled={
                      submitting ||
                      mode === '' ||
                      (mode === 'create' && !newTeamName) ||
                      (mode === 'join' && !selectedTeam) ||
                      (isPerRound && selectedPaidRoundIds.length === 0) ||
                      hasIncompleteAdditionalPlayers
                    }
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 py-5 rounded-2xl text-xl font-semibold"
                  >
                    {submitting
                      ? 'Processing Payment...'
                      : `Complete Registration — $${totalCost.toFixed(2)}`}
                  </button>
                </div>
              )}

              <button
                onClick={() => {
                  sessionStorage.removeItem(draftKey);
                  setShowRegisterModal(false);
                }}
                className="w-full mt-6 py-4 text-gray-400 hover:text-white text-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100]">
          <div className="bg-gray-900 rounded-3xl p-10 max-w-md w-full mx-4 text-center">
            <div className="mx-auto w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6">
              <span className="text-4xl">✅</span>
            </div>

            <h2 className="text-3xl font-semibold mb-2">
              Add-ons Paid Successfully
            </h2>
            <p className="text-gray-400 mb-8">
              Your add-ons have been paid.
              <br />
              <strong>Awaiting Admin Check-In</strong>
            </p>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => {
                  setShowSuccessModal(false);
                  window.location.href = `/event/${eventId}#scoring`;
                }}
                className="bg-blue-600 hover:bg-blue-700 py-4 rounded-2xl font-medium"
              >
                Scorecard
              </button>

              <button
                onClick={() => {
                  setShowSuccessModal(false);
                  window.location.href = `/event/${eventId}#leaderboard`;
                }}
                className="bg-emerald-600 hover:bg-emerald-700 py-4 rounded-2xl font-medium"
              >
                Leaderboard
              </button>
            </div>

            <button
              onClick={() => setShowSuccessModal(false)}
              className="mt-6 text-gray-400 hover:text-white text-sm"
            >
              Back to Event
            </button>
          </div>
        </div>
      )}
    </div>
  );
}