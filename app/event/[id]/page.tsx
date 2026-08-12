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

  const [sendReceipt, setSendReceipt] = useState(false);
const [receiptName, setReceiptName] = useState('');
const [receiptEmail, setReceiptEmail] = useState('');

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

  // ---------- Sponsors ----------
  const [sponsorPackages, setSponsorPackages] = useState<any[]>([]);
  const [paidSponsors, setPaidSponsors] = useState<any[]>([]);
  const [showSponsorModal, setShowSponsorModal] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState<number | null>(null);
  const [sponsorCompany, setSponsorCompany] = useState('');
  const [sponsorContactName, setSponsorContactName] = useState('');
  const [sponsorContactEmail, setSponsorContactEmail] = useState('');
  const [sponsorWebsite, setSponsorWebsite] = useState('');
  const [sponsorSubmitting, setSponsorSubmitting] = useState(false);
  

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
    const { data: pkgData } = await supabase
    .from('event_sponsor_packages')
    .select('*')
    .eq('event_id', parseInt(eventId))
    .eq('active', true)
    .order('sort_order', { ascending: true });
  setSponsorPackages(pkgData || []);

  const { data: sponsorRows } = await supabase
    .from('event_sponsors')
    .select('id, company_name, logo_url, website_url, package_id')
    .eq('event_id', parseInt(eventId))
    .eq('paid', true)
    .order('created_at', { ascending: true });
  setPaidSponsors(sponsorRows || []);

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
      // Don't force "I'm playing" if they're already on the event
    }
  }, [appliedDiscount]);

  useEffect(() => {
  if (!currentUser) return;
  const n = getPlayerName(currentUser) || '';
  const e = currentUser.email || '';
  setReceiptName((prev) => prev || n);
  setReceiptEmail((prev) => prev || e);
}, [currentUser]);

      // Joining a team: clear slots; if already registered, stay "not playing"
      useEffect(() => {
    if (mode !== 'join') return;
    setAdditionalPlayers([]);
    if (!currentUser) return;

    // Per-round events: user may still register themselves on new rounds
    const perRound = (event?.pricing_mode || 'event') === 'per_round';
    if (perRound) return;

    const already = registrations.some(
      (r) =>
        r.user_id === currentUser.id ||
        (r.player_email &&
          currentUser.email &&
          String(r.player_email).toLowerCase() ===
            String(currentUser.email).toLowerCase())
    );
    if (already) setIsOrganizerOnly(true);
  }, [selectedTeam, mode, currentUser, registrations, event?.pricing_mode]);

  // Browser back from Stripe (no cancel_url) — clean up unpaid draft regs
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const paymentStatus = searchParams.get('payment');
    if (paymentStatus === 'success') return;

    const cleanupAbandonedCheckout = async () => {
      try {
        const raw = sessionStorage.getItem(draftKey);
        if (!raw) return;

        const draft = JSON.parse(raw);
        const ids: (string | number)[] = draft.registration_ids || [];
        if (!ids.length) return;

        const { error: delErr } = await supabase
          .from('event_registrations')
          .delete()
          .in('id', ids)
          .eq('paid', false);

        if (delErr) {
          console.error('Abandoned checkout cleanup failed:', delErr);
          return;
        }

        draft.registration_ids = [];
        sessionStorage.setItem(draftKey, JSON.stringify(draft));
        await fetchData();
      } catch (e) {
        console.error(e);
      }
    };

    cleanupAbandonedCheckout();


    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        cleanupAbandonedCheckout();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [eventId, searchParams, draftKey]);


    const myRegistrations = useMemo(() => {
  if (!currentUser) return [];
  return registrations.filter(
    (r) =>
      r.user_id === currentUser.id ||
      (r.player_email &&
        currentUser.email &&
        String(r.player_email).toLowerCase() ===
          String(currentUser.email).toLowerCase())
  );
}, [registrations, currentUser]);

const alreadyRegistered = myRegistrations.length > 0;

  const myRegisteredRoundIds = useMemo(() => {
    const ids = new Set<number>();
    for (const r of myRegistrations) {
      const list: number[] = Array.isArray(r.selected_round_ids)
        ? r.selected_round_ids
        : [];
      list.forEach((id) => ids.add(Number(id)));
      if (r.round_id) ids.add(Number(r.round_id));
    }
    return Array.from(ids);
  }, [myRegistrations]);

const myRegisteredRoundNames = useMemo(() => {
  if (!myRegistrations.length || !rounds.length) return [] as string[];
  const names = new Set<string>();
  for (const reg of myRegistrations) {
    const ids: number[] =
      reg.selected_round_ids || reg.round_ids || [];
    if (!ids.length && reg.round_id) ids.push(reg.round_id);
    rounds
      .filter((r) => ids.map(String).includes(String(r.id)))
      .forEach((r) => names.add(r.name));
  }
  return Array.from(names);
}, [myRegistrations, rounds]);
  

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

  

    const selectedPackage = sponsorPackages.find((p) => p.id === selectedPackageId);

  const packageSoldOut = (pkg: any) =>
    pkg.max_quantity != null &&
    Number(pkg.times_sold) >= Number(pkg.max_quantity);

  const handleSponsorCheckout = async () => {
    if (!selectedPackage) return alert('Choose a package');
    if (!sponsorCompany.trim()) return alert('Company name is required');
    if (!sponsorContactEmail.trim() || !isValidEmail(sponsorContactEmail)) {
      return alert('Valid contact email is required');
    }
    if (packageSoldOut(selectedPackage)) {
      return alert('That package is sold out');
    }

    setSponsorSubmitting(true);
    try {
            const createRes = await fetch('/api/create-sponsor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: parseInt(eventId),
          package_id: selectedPackage.id,
          company_name: sponsorCompany.trim(),
          contact_name: sponsorContactName.trim() || null,
          contact_email: sponsorContactEmail.trim().toLowerCase(),
          website_url: sponsorWebsite.trim() || null,
          amount_paid: Number(selectedPackage.price),
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok || !createData.id) {
        throw new Error(createData.error || 'Could not create sponsor');
      }
      const row = { id: createData.id };

      const amount = Number(selectedPackage.price);
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          email: sponsorContactEmail.trim().toLowerCase(),
          description: `${selectedPackage.name} – ${event?.name || 'Event'}`,
          event_name: event?.name,
          event_id: eventId,
          type: 'sponsorship',
          player_name: sponsorCompany.trim(),
          registration_id: String(row.id),
          success_url: `${window.location.origin}/event/${eventId}?payment=success&type=sponsorship&session_id={CHECKOUT_SESSION_ID}&sponsor_id=${row.id}`,
          cancel_url: `${window.location.origin}/event/${eventId}?payment=cancelled&type=sponsorship`,
        }),
      });
    

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error('No checkout URL');
    } catch (e: any) {
      console.error(e);
      alert(e.message || 'Could not start sponsorship payment');
    } finally {
      setSponsorSubmitting(false);
    }
  };

  // Handle payment success / cancel
  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    const type = searchParams.get('type');
    const regIdParam = searchParams.get('registration_id');

    if (paymentStatus === 'cancelled' && type === 'registration') {
  (async () => {
    try {
      sessionStorage.removeItem(paymentHandledKey);
      const raw = sessionStorage.getItem(draftKey);

      if (raw) {
        const draft = JSON.parse(raw);
        const ids: (string | number)[] = draft.registration_ids || [];

        // Remove unpaid rows created before Checkout
        if (ids.length > 0) {
          const { error: delErr } = await supabase
            .from('event_registrations')
            .delete()
            .in('id', ids)
            .eq('paid', false);

          if (delErr) {
            console.error('Failed to clean up unpaid regs on cancel:', delErr);
          } else {
            await fetchData(); // refresh counts / sold out
          }
        }
        

        // Restore form so they can try again
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

        const roundIds: number[] = draft.selected_round_ids || [];
        setSelectedPaidRoundIds(roundIds);
        setAgreedToWaiver(true);

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

        // Clear ids so a retry creates fresh rows
        draft.registration_ids = [];
        sessionStorage.setItem(draftKey, JSON.stringify(draft));

        setShowRegisterModal(true);
      }
    } catch (e) {
      console.error('Failed to restore registration draft:', e);
    }
  })();
  return;
}

    // ---------- Sponsorship payment success ----------
        if (paymentStatus === 'success' && type === 'sponsorship') {
      const sponsorId = searchParams.get('sponsor_id');
      const sessionId = searchParams.get('session_id');

      (async () => {
        try {
          if (sessionId && sponsorId) {
            await fetch('/api/confirm-sponsor-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                session_id: sessionId,
                sponsor_id: sponsorId,
              }),
            });
            // Receipt + organizer notice
            await fetch('/api/send-sponsor-emails', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sponsor_id: sponsorId }),
            });
          }
          await fetchData();
          alert('Thank you! Your sponsorship is confirmed.');
        } catch (e) {
          console.error(e);
        }
      })();
      return;
    }

    

    // ---------- Registration payment success ----------
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
            draft.totalCost != null ? Number(draft.totalCost) : null
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


  // Among currently selected paid rounds: which are new vs already on
  const newlySelectedRoundIds = selectedPaidRoundIds.filter(
    (id) => !myRegisteredRoundIds.includes(id)
  );
  const alreadySelectedRoundIds = selectedPaidRoundIds.filter((id) =>
    myRegisteredRoundIds.includes(id)
  );

  // Charge yourself only if: event-priced and not registered, OR per-round with at least one NEW round
  const countingSelf = isPerRound
    ? newlySelectedRoundIds.length > 0
    : !isOrganizerOnly && !alreadyRegistered;

  const selectedTeamMembers = useMemo(() => {
    if (!selectedTeam) return [];
    return registrations.filter((r) => r.team_name === selectedTeam);
  }, [registrations, selectedTeam]);

  const getSpotsLeft = (team: string) => {
    const count = registrations.filter((r) => r.team_name === team).length;
    return Math.max(0, maxTeamSize - count);
  };

  const openSlotsForJoin = selectedTeam ? getSpotsLeft(selectedTeam) : 0;

  // If already registered for this event, never charge them again as player 1
  

  const totalPlayers = countingSelf
    ? 1 + completeAdditionalPlayers.length
    : completeAdditionalPlayers.length;

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

    // Cost of one "seat" across the currently selected rounds
  const costAllSelectedRounds = Math.max(
    0,
    selectedRoundsCostPerPlayer - discountPerPlayer
  );

  // Cost of only NEW rounds (for someone already on some rounds)
  const costNewRoundsOnly = newlySelectedRoundIds.reduce((sum, id) => {
    const round =
      selectableRounds.find((r) => r.id === id) ||
      rounds.find((r) => r.id === id);
    if (!round) return sum;
    const raw = Number(round.price || 0) + feePerPlayer - discountPerPlayer;
    return sum + Math.max(0, raw);
  }, 0);

  const additionalCount = completeAdditionalPlayers.length;

  const totalCost = isPerRound
    ? (countingSelf ? costNewRoundsOnly : 0) +
      additionalCount * costAllSelectedRounds
    : (countingSelf ? 1 : 0) + additionalCount > 0
      ? ((countingSelf ? 1 : 0) + additionalCount) *
        Math.max(
          0,
          pricePerPlayer +
            feePerPlayer +
            selectedRoundsCostPerPlayer -
            discountPerPlayer
        )
      : 0;

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

    // If they're already on this event, default to adding others only
    const alreadyOnEvent = registrations.some(
      (r) =>
        r.user_id === user.id ||
        (r.player_email &&
          user.email &&
          String(r.player_email).toLowerCase() ===
            String(user.email).toLowerCase())
    );
    setIsOrganizerOnly(alreadyOnEvent);

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
                if (!isOrganizerOnly && !alreadyRegistered) {
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

          {paidSponsors.length > 0 && (
            <div className="p-10 border-b border-gray-700">
              <p className="text-gray-500 text-sm mb-4">SPONSORS</p>
              <div className="flex flex-wrap gap-3">
                {paidSponsors.map((s) => (
                  <a
                    key={s.id}
                    href={s.website_url || undefined}
                    target={s.website_url ? '_blank' : undefined}
                    rel="noreferrer"
                    className="bg-gray-900 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-700"
                  >
                    {s.company_name}
                  </a>
                ))}
              </div>
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
                    {sponsorPackages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowSponsorModal(true)}
                    className="flex-1 bg-emerald-700 hover:bg-emerald-600 py-5 rounded-2xl text-xl font-semibold transition-colors"
                  >
                    Become a Sponsor
                  </button>
                )}
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

            {showSponsorModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-8">
            <h2 className="text-2xl font-bold mb-2">Become a Sponsor</h2>
            <p className="text-gray-400 text-sm mb-6">
              Choose a package and complete payment. We’ll list your company on
              the event page.
            </p>

            <div className="space-y-3 mb-6">
              {sponsorPackages.map((pkg) => {
                const soldOut = packageSoldOut(pkg);
                const selected = selectedPackageId === pkg.id;
                return (
                  <button
                    key={pkg.id}
                    type="button"
                    disabled={soldOut}
                    onClick={() => setSelectedPackageId(pkg.id)}
                    className={`w-full text-left p-4 rounded-2xl border transition-colors ${
                      selected
                        ? 'border-emerald-500 bg-emerald-950/40'
                        : 'border-gray-700 hover:border-gray-600'
                    } disabled:opacity-40`}
                  >
                    <div className="flex justify-between gap-3">
                      <span className="font-medium">{pkg.name}</span>
                      <span className="text-emerald-400 font-semibold">
                        ${Number(pkg.price).toFixed(2)}
                      </span>
                    </div>
                    {pkg.description && (
                      <p className="text-sm text-gray-400 mt-1">
                        {pkg.description}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      {soldOut
                        ? 'Sold out'
                        : pkg.max_quantity != null
                          ? `${pkg.times_sold || 0} / ${pkg.max_quantity} sold`
                          : `${pkg.times_sold || 0} sold`}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="space-y-4 mb-6">
              <input
                value={sponsorCompany}
                onChange={(e) => setSponsorCompany(e.target.value)}
                placeholder="Company name *"
                className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
              />
              <input
                value={sponsorContactName}
                onChange={(e) => setSponsorContactName(e.target.value)}
                placeholder="Contact name"
                className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
              />
              <input
                type="email"
                value={sponsorContactEmail}
                onChange={(e) => setSponsorContactEmail(e.target.value)}
                placeholder="Contact email *"
                className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
              />
              <input
                value={sponsorWebsite}
                onChange={(e) => setSponsorWebsite(e.target.value)}
                placeholder="Website (optional)"
                className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
              />
            </div>

            <button
              type="button"
              onClick={handleSponsorCheckout}
              disabled={sponsorSubmitting || !selectedPackageId}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 py-4 rounded-2xl font-semibold text-lg"
            >
              {sponsorSubmitting
                ? 'Processing…'
                : selectedPackage
                  ? `Pay $${Number(selectedPackage.price).toFixed(2)}`
                  : 'Select a package'}
            </button>
            <button
              type="button"
              onClick={() => setShowSponsorModal(false)}
              className="w-full mt-4 py-3 text-gray-400 hover:text-white"
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

              {/* Always show what they’re already on */}
{alreadyRegistered && (
  <div className="mb-6 bg-gray-900 border border-emerald-500/40 rounded-2xl p-6 space-y-4">
    <div className="flex justify-between items-start gap-3">
      <p className="font-medium text-white text-lg">
        You’re already registered
      </p>
      <span className="text-xs px-3 py-1 rounded-full bg-emerald-900/50 text-emerald-400 shrink-0">
        Registered
      </span>
    </div>

    <div className="space-y-3">
      {myRegistrations.map((reg) => {
        const roundNames = (() => {
          const ids: number[] =
            reg.selected_round_ids || reg.round_ids || [];
          if (!ids.length && reg.round_id) ids.push(reg.round_id);
          return rounds
            .filter((r) => ids.map(String).includes(String(r.id)))
            .map((r) => r.name);
        })();

        return (
          <div
            key={reg.id}
            className="border-t border-emerald-500/30 pt-3 first:border-0 first:pt-0"
          >
            <p className="text-sm text-gray-300">
              {reg.team_name ? `Team: ${reg.team_name}` : 'No team'}
              {roundNames.length > 0 ? ` · ${roundNames.join(', ')}` : ''}
            </p>
          </div>
        );
      })}
    </div>
  </div>
)}

{/* Only show the “go to My Events” message when they have nothing left to register for */}
{alreadyRegistered && myRegisteredRoundIds.length >= rounds.length ? (
  <div className="space-y-6">
    <p className="text-gray-400 text-sm text-center">
      You’re registered for every round. To add players to your team, go to{' '}
      <button
        type="button"
        onClick={() => {
          setShowRegisterModal(false);
          router.push('/dashboard/play');
        }}
        className="text-emerald-400 hover:underline font-medium"
      >
        My Events
      </button>
      .
    </p>
    <button
      onClick={() => setShowRegisterModal(false)}
      className="w-full py-4 text-gray-400 hover:text-white text-lg"
    >
      Close
    </button>
  </div>
) : (
                // ---------- NORMAL REGISTRATION FORM ----------
                <>
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
  const alreadyOn = myRegisteredRoundIds.includes(Number(round.id));
  const checked = selectedPaidRoundIds.includes(round.id);

  return (
    <label
      key={round.id}
      className={`flex items-center justify-between gap-4 p-4 rounded-2xl border transition-colors ${
        alreadyOn
          ? 'border-amber-500 bg-amber-950/40 cursor-not-allowed opacity-80'
          : checked
            ? 'border-teal-500 bg-teal-950/40 cursor-pointer'
            : 'border-gray-700 hover:border-gray-600 cursor-pointer'
      }`}
    >
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={alreadyOn || checked}
          disabled={alreadyOn}
          onChange={() => {
            if (!alreadyOn) togglePaidRound(round.id);
          }}
          className="w-5 h-5 accent-teal-600"
        />
        <div>
          <div className="font-medium">
            {round.name}
            {alreadyOn && (
              <span className="ml-2 text-xs text-amber-400">
                Already registered
              </span>
            )}
          </div>
          {round.start_time && (
            <div className="text-xs text-gray-400">
              {String(round.start_time).slice(0, 5)}
            </div>
          )}
        </div>
      </div>
      <div className="text-sm font-medium text-teal-300">
        {alreadyOn
          ? '—'
          : `$${(Number(round.price || 0) + platformFee).toFixed(2)}`}
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

                  {mode === 'join' && selectedTeam && (
                    <div className="mt-4 bg-gray-900 rounded-2xl p-5 space-y-3">
                      <div className="flex justify-between items-center">
                        <p className="text-sm text-gray-400 font-medium">
                          On this team
                        </p>
                        <p className="text-xs text-gray-500">
                          {selectedTeamMembers.length}/{maxTeamSize} ·{' '}
                          {openSlotsForJoin} open
                        </p>
                      </div>
                      {selectedTeamMembers.length === 0 ? (
                        <p className="text-sm text-gray-500">No players yet</p>
                      ) : (
                        <ul className="space-y-2">
                          {selectedTeamMembers.map((m) => (
                            <li
                              key={m.id}
                              className="flex justify-between text-sm bg-gray-800 rounded-xl px-4 py-3"
                            >
                              <span className="font-medium">
                                {m.player_name || 'Player'}
                                {(m.user_id === currentUser?.id ||
                                  (m.player_email &&
                                    currentUser?.email &&
                                    String(m.player_email).toLowerCase() ===
                                      String(currentUser.email).toLowerCase())) && (
                                  <span className="text-emerald-400 text-xs ml-2">
                                    (you)
                                  </span>
                                )}
                              </span>
                              <span className="text-gray-500 text-xs">
                                {m.paid ? 'Paid' : 'Unpaid'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
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

                  
<div>
                                      <div className="flex justify-between items-center mb-3">
                      <label className="text-sm text-gray-400">
                        {mode === 'join' && selectedTeam
                          ? 'Add players to this team'
                          : 'Additional Players'}
                      </label>
                      <span className="text-xs text-gray-500">
                        {completeAdditionalPlayers.length} complete /{' '}
                        {additionalPlayers.length} added
                        {mode === 'join' && selectedTeam
                          ? ` · ${openSlotsForJoin} open`
                          : ''}
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
                          // Only fill open spots — never reserve a slot for "self"
                          // when already registered or organizer-only
                          maxAdditional =
                            alreadyRegistered || isOrganizerOnly
                              ? openSlotsForJoin
                              : Math.max(0, openSlotsForJoin - 1);
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
                            ? alreadyRegistered || isOrganizerOnly
                              ? openSlotsForJoin
                              : Math.max(0, openSlotsForJoin - 1)
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

                  {/* Receipt — just above the button */}
                  <div className="bg-gray-900 rounded-2xl p-4 space-y-4">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="send-receipt"
                        checked={sendReceipt}
                        onChange={(e) => setSendReceipt(e.target.checked)}
                        className="w-5 h-5 accent-blue-600"
                      />
                      <label
                        htmlFor="send-receipt"
                        className="text-sm cursor-pointer"
                      >
                        Please send me a receipt
                      </label>
                    </div>
                    {sendReceipt && (
                      <div className="space-y-3 pt-1">
                        <input
                          type="text"
                          value={receiptName}
                          onChange={(e) => setReceiptName(e.target.value)}
                          placeholder="Name for receipt"
                          className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3"
                        />
                        <input
                          type="email"
                          value={receiptEmail}
                          onChange={(e) => setReceiptEmail(e.target.value)}
                          placeholder="Email for receipt"
                          className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3"
                        />
                      </div>
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
                </>
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