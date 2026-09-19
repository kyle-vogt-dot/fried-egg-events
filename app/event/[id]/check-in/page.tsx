'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { loadEventAccess, canUse } from '@/app/libs/event-admin';
import { isListableReg } from '@/app/libs/event-emails';
import EventTabs from '@/app/components/EventTabs';
import BackButton from '@/app/components/BackButton';
import {
  amountWithPlatformFee,
  DEFAULT_PLATFORM_FEE_PERCENT,
  formatPlatformFeePercent,
  resolvePlatformFeePercent,
} from '@/app/libs/platform-fee';
import { reverseRegistrationIncome } from '@/app/libs/reverse-income';
import { isLeagueEvent, parseLineupIds } from '@/app/libs/league-match';
import { assignCaptainIfNeeded } from '@/app/libs/league-roster';

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

function getPairingLabel(reg: any, roundId: number | 'all') {
  if (roundId !== 'all') {
    const map = reg.round_pairings || {};
    const entry = map[String(roundId)] || map[roundId as number];
    if (entry?.hole && entry?.slot) return `${entry.hole} - ${entry.slot}`;
    return '—';
  }
  if (reg.pairing_hole && reg.pairing_slot) {
    return `${reg.pairing_hole} - ${reg.pairing_slot}`;
  }
  return '—';
}

function buildLiveUrl(
  eventId: string,
  reg: any,
  selectedRoundId: number | 'all',
  view?: 'tonight' | 'season' | null
) {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  const q = new URLSearchParams();
  const team = String(reg?.team_name || reg?.player_name || '').trim();
  if (team) q.set('team', team);
  if (selectedRoundId !== 'all' && selectedRoundId) {
    q.set('round', String(selectedRoundId));
  }
  if (view) q.set('view', view);
  const qs = q.toString();
  return `${base}/event/${eventId}/live${qs ? `?${qs}` : ''}`;
}

function isCheckedInForRound(
  reg: any,
  roundId: number | 'all',
  league = false
) {
  if (roundId === 'all') return !!reg.checked_in;
  const map = reg.round_checkins || {};
  if (map[String(roundId)] != null) return !!map[String(roundId)];
  if (map[roundId as number] != null) return !!map[roundId as number];
  if (league) return false;
  return !!reg.checked_in;
}

function compactAddonQuantities(raw: any, addonsList: any[]) {
  const out: Record<string, number> = {};
  for (const addon of addonsList || []) {
    const q = Number(raw?.[addon.id] ?? raw?.[String(addon.id)] ?? 0);
    if (Number.isFinite(q) && q > 0) out[String(addon.id)] = q;
  }
  return out;
}

function addonTotalFromQty(qty: Record<string, number>, addonsList: any[]) {
  let total = 0;
  for (const addon of addonsList || []) {
    const q = Number(qty[addon.id] ?? qty[String(addon.id)] ?? 0);
    if (q > 0) total += q * Number(addon.price_per_unit || 0);
  }
  return Math.round(total * 100) / 100;
}

function countTeams(regs: any[]) {
  const names = new Set(
    regs
      .map((r) => (r.team_name || '').trim())
      .filter((n) => n && n.toLowerCase() !== 'individual')
  );
  return names.size;
}

export default function EventCheckInPage() {
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
  const [addons, setAddons] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingAddonRegId, setEditingAddonRegId] = useState<number | null>(null);
  const [platformFeePercent, setPlatformFeePercent] = useState(
    DEFAULT_PLATFORM_FEE_PERCENT
  );

  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [currentPayReg, setCurrentPayReg] = useState<any>(null);
  const [showSubModal, setShowSubModal] = useState(false);
  const [subPlayerReg, setSubPlayerReg] = useState<any>(null);

  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerEmail, setNewPlayerEmail] = useState('');
  const [newPlayerTeam, setNewPlayerTeam] = useState('');
  // free | cash | link
  const [addChargeType, setAddChargeType] = useState<'free' | 'cash' | 'link'>('cash');
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [showConnectRequired, setShowConnectRequired] = useState(false);
  const [showCashFeeConfirm, setShowCashFeeConfirm] = useState(false);
  const [newPlayerAddonQty, setNewPlayerAddonQty] = useState<
    Record<string, number>
  >({});
  const [editAddonQty, setEditAddonQty] = useState<Record<string, number>>(
    {}
  );

  const [subName, setSubName] = useState('');
  const [subEmail, setSubEmail] = useState('');
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, any>>({});
  const [weekLineupIds, setWeekLineupIds] = useState<Set<string>>(new Set());
  const [leagueRosterFilter, setLeagueRosterFilter] = useState<
    'lineup' | 'bench'
  >('lineup');

  const lastNotificationRef = useRef<number>(0);

  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundReg, setRefundReg] = useState<any>(null);
  const [refundMode, setRefundMode] = useState<'none' | 'full' | 'minus_greens' | 'custom'>('none');
  const [customRefundAmount, setCustomRefundAmount] = useState('');
  const [refunding, setRefunding] = useState(false);

    const [showEditModal, setShowEditModal] = useState(false);
  const [editReg, setEditReg] = useState<any>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editTeam, setEditTeam] = useState('');
  const [editRoundIds, setEditRoundIds] = useState<number[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  const showAddons = addons.length > 0;
  const showHandicaps = !!event?.use_handicaps;

  const selectedRound = useMemo(() => {
    if (selectedRoundId === 'all') return null;
    return rounds.find((r) => r.id === selectedRoundId) || null;
  }, [rounds, selectedRoundId]);

  const isPerRound = (event?.pricing_mode || 'event') === 'per_round';

  // Estimate registration charge for admin-add (event or selected round)
  const estimateRegSubtotal = () => {
    if (isPerRound) {
      if (selectedRoundId !== 'all' && selectedRound) {
        return Number(selectedRound.price || 0);
      }
      if (rounds.length > 0) {
        return rounds.reduce((s, r) => s + Number(r.price || 0), 0);
      }
    }
    return Number(event?.price || 0);
  };

  const estimateRegCharge = () => {
    const subtotal = estimateRegSubtotal();
    if (addChargeType === 'free') return 0;
    if (addChargeType === 'cash') return Math.round(subtotal * 100) / 100;
    return amountWithPlatformFee(subtotal, platformFeePercent);
  };

  const addOnsForForms = addons.filter(
    (a) => String(a.name || '').toLowerCase() !== 'skins'
  );

  const addPlayerAddonQty = compactAddonQuantities(
    newPlayerAddonQty,
    addOnsForForms
  );
  const addPlayerAddonTotal = addonTotalFromQty(
    addPlayerAddonQty,
    addOnsForForms
  );
  const addChargePreview = estimateRegCharge() + addPlayerAddonTotal;
  const eventHasConnectAccount = !!(
    String(
      event?.is_demo
        ? event?.stripe_connect_account_id_test ||
            event?.stripe_connect_account_id
        : event?.stripe_connect_account_id
    ).trim()
  );
  const cashFeeBase =
    Number(event?.greens_fee || 0) + addPlayerAddonTotal;
  const cashFeePercent = Number(platformFeePercent) || 0;
  const cashFeeAmount =
    Math.round(cashFeeBase * (cashFeePercent / 100) * 100) / 100;

  const writeAddonIncomeRows = async (
    registrationId: string | number,
    qty: Record<string, number>
  ) => {
    await supabase
      .from('event_income_entries')
      .delete()
      .eq('registration_id', registrationId)
      .in('category', ['addon', 'add-on', 'addons']);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const rows = addons
      .map((addon) => {
        const q = Number(qty[addon.id] ?? qty[String(addon.id)] ?? 0);
        if (q <= 0) return null;
        return {
          event_id: parseInt(eventId, 10),
          registration_id: registrationId,
          category: 'addon',
          amount: q * Number(addon.price_per_unit || 0),
          label: addon.name,
          created_by: user?.id || null,
        };
      })
      .filter(Boolean);
    if (rows.length) {
      await supabase.from('event_income_entries').insert(rows);
    }
  };

  const persistCashAddons = async (reg: any, rawQty: any) => {
    const qty = compactAddonQuantities(rawQty, addons);
    const addonTotal = addonTotalFromQty(qty, addons);
    const prevQty = compactAddonQuantities(reg.addon_quantities || {}, addons);
    const prevAddonTotal = addonTotalFromQty(prevQty, addons);
    const base = Math.max(0, Number(reg.amount_paid || 0) - prevAddonTotal);
    const { error } = await supabase
      .from('event_registrations')
      .update({
        addon_quantities: qty,
        paid_addons: Object.keys(qty).length > 0,
        amount_paid: Math.round((base + addonTotal) * 100) / 100,
        payment_method: reg.payment_method || 'cash',
      })
      .eq('id', reg.id);
    if (error) throw error;
    await writeAddonIncomeRows(reg.id, qty);
  };

  const filteredRegistrations = useMemo(() => {
    let list = registrations;
    const league = isLeagueEvent(event);

    if (selectedRoundId !== 'all' && !league) {
      list = list.filter((r) => {
        const ids: number[] = r.selected_round_ids || [];
        if (!ids.length) return rounds.length <= 1;
        return ids.includes(selectedRoundId as number);
      });
    }

    if (league && selectedRoundId !== 'all') {
      if (leagueRosterFilter === 'lineup') {
        list = list.filter((r) => weekLineupIds.has(String(r.id)));
      } else {
        list = list.filter((r) => !weekLineupIds.has(String(r.id)));
      }
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (reg) =>
          (reg.player_name || '').toLowerCase().includes(q) ||
          (reg.team_name || '').toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) =>
      (a.player_name || '').localeCompare(b.player_name || '')
    );
  }, [
    registrations,
    selectedRoundId,
    rounds.length,
    searchTerm,
    weekLineupIds,
    event,
    leagueRosterFilter,
  ]);

    const existingTeams = useMemo(() => {
    const names = new Set<string>();
    for (const r of registrations) {
      const t = (r.team_name || '').trim();
      if (t && t.toLowerCase() !== 'individual') names.add(t);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [registrations]);

  const openEditPlayer = (reg: any) => {
    setEditReg(reg);
    setEditName(reg.player_name || '');
    setEditEmail(reg.player_email || '');
    setEditTeam(reg.team_name || '');
    const ids: number[] = Array.isArray(reg.selected_round_ids)
      ? reg.selected_round_ids.map(Number)
      : reg.round_id
        ? [Number(reg.round_id)]
        : [];
    setEditRoundIds(ids);
    setEditAddonQty(compactAddonQuantities(reg.addon_quantities || {}, addons));
    setShowEditModal(true);
  };

  const handleSaveEditPlayer = async () => {
    if (!editReg) return;
    if (!editName.trim()) {
      alert('Player name is required');
      return;
    }
    setSavingEdit(true);
    try {
      const isCash = String(editReg.payment_method || '').toLowerCase() === 'cash';
      const qty = compactAddonQuantities(editAddonQty, addons);
      const addonTotal = addonTotalFromQty(qty, addons);
      const prevQty = compactAddonQuantities(
        editReg.addon_quantities || {},
        addons
      );
      const prevAddonTotal = addonTotalFromQty(prevQty, addons);
      const base = Math.max(0, Number(editReg.amount_paid || 0) - prevAddonTotal);
      const patch: Record<string, any> = {
        player_name: editName.trim(),
        player_email: editEmail.trim() || null,
        team_name: editTeam.trim() || null,
        selected_round_ids: editRoundIds,
      };
      if (isCash) {
        patch.addon_quantities = qty;
        patch.paid_addons = Object.keys(qty).length > 0;
        patch.amount_paid = Math.round((base + addonTotal) * 100) / 100;
        patch.payment_method = 'cash';
      }
      const { error } = await supabase
        .from('event_registrations')
        .update(patch)
        .eq('id', editReg.id);

      if (error) throw error;
      if (isCash) await writeAddonIncomeRows(editReg.id, qty);

      setShowEditModal(false);
      setEditReg(null);
      await fetchRegistrations();
    } catch (e: any) {
      alert(e.message || 'Failed to update player');
    } finally {
      setSavingEdit(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const id = parseInt(eventId);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push(
          '/login?redirect=' + encodeURIComponent(`/event/${eventId}/check-in`)
        );
        return;
      }

      const access = await loadEventAccess(supabase, id, user);

      if (!access.allowed || !canUse(access.perms, 'checkin')) {
        router.push(`/event/${eventId}`);
        return;
      }

      setEvent(access.event);

      const { data: roundsData } = await supabase
        .from('event_rounds')
        .select('*')
        .eq('event_id', id)
        .order('sort_order', { ascending: true });

      setRounds(roundsData || []);
      if (roundsData && roundsData.length > 0) {
        setSelectedRoundId(roundsData[0].id);
      }

      const { data: addonData } = await supabase
        .from('event_addons')
        .select('*')
        .eq('event_id', id);
      setAddons(addonData || []);

      const { data: feeData } = await supabase
        .from('platform_settings')
        .select('platform_fee_percent')
        .eq('id', 1)
        .single();
      setPlatformFeePercent(
        resolvePlatformFeePercent(feeData?.platform_fee_percent)
      );

      await fetchRegistrations();
      setLoading(false);
    };

    fetchData();
  }, [eventId, supabase, router]);

  useEffect(() => {
    const loadLineup = async () => {
      if (!isLeagueEvent(event) || selectedRoundId === 'all') {
        setWeekLineupIds(new Set());
        return;
      }
      const { data } = await supabase
        .from('league_lineups')
        .select('registration_ids')
        .eq('event_id', parseInt(eventId, 10))
        .eq('round_id', selectedRoundId);
      const ids = new Set<string>();
      for (const row of data || []) {
        for (const id of parseLineupIds(row.registration_ids)) {
          ids.add(String(id));
        }
      }
      setWeekLineupIds(ids);
    };
    loadLineup();
  }, [event, selectedRoundId, eventId, supabase]);

  const fetchRegistrations = async () => {
    const { data } = await supabase
      .from('event_registrations')
      .select('*')
      .eq('event_id', parseInt(eventId));

    setRegistrations((data || []).filter(isListableReg));
  };

  useEffect(() => {
    if (!eventId) return;

    const channel = supabase
      .channel(`checkin-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_registrations',
          filter: `event_id=eq.${parseInt(eventId)}`,
        },
        () => {
          fetchRegistrations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, supabase]);

    const estimateAmountPaid = (reg: any) => {
    if (reg.amount_paid != null && Number(reg.amount_paid) > 0) {
      return Number(reg.amount_paid);
    }
    // Don't guess event.price + fee — shows wrong amounts (e.g. $55 vs $48)
    return null;
  };

  const handleRemoveOrRefund = async () => {
    if (!refundReg) return;
    setRefunding(true);

    try {
      const greens = Number(event?.greens_fee || 0);
      const amountPaid = estimateAmountPaid(refundReg); // number | null

      let refundAmount = 0;
      if (refundMode === 'full' && amountPaid != null) {
        refundAmount = amountPaid;
      }
      if (refundMode === 'minus_greens' && amountPaid != null) {
        refundAmount = Math.max(0, amountPaid - greens);
      }
      if (refundMode === 'custom') {
        refundAmount = Math.max(0, Number(customRefundAmount) || 0);
      }

      // Stripe refund (API also marks the registration refunded — no delete)
      if (refundAmount > 0 && refundReg.stripe_payment_intent_id) {
        const res = await fetch('/api/refund-registration', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            registration_id: refundReg.id,
            payment_intent_id: refundReg.stripe_payment_intent_id,
            amount: refundAmount,
            mode: refundMode,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Stripe refund failed');
        }
      } else {
        // Comp / cash / remove with $0 — soft-cancel only, keep the row
        const { error } = await supabase
          .from('event_registrations')
          .update({
            paid: false,
            refunded: true,
            refunded_at: new Date().toISOString(),
            refund_amount: refundAmount || 0,
          })
          .eq('id', refundReg.id);

        if (error) throw error;
      }

      await reverseRegistrationIncome(supabase, {
        eventId: parseInt(eventId, 10),
        registrationId: refundReg.id,
        playerName: refundReg.player_name,
        playerEmail: refundReg.player_email,
        amount:
          refundAmount > 0
            ? refundAmount
            : refundReg.amount_paid != null
              ? Number(refundReg.amount_paid)
              : null,
      });

      // Optional audit log
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        await supabase.from('event_refunds').insert({
          event_id: parseInt(eventId),
          registration_id: refundReg.id,
          method: refundMode,
          amount: refundAmount,
          notes: refundMode === 'custom' ? `Custom $${refundAmount}` : null,
          created_by: user?.id || null,
        });
      } catch {
        // table may not exist yet
      }

      // Do NOT delete the registration row

      setShowRefundModal(false);
      setRefundReg(null);
      setCustomRefundAmount('');
      setRefundMode('none');
      await fetchRegistrations();

      alert(
        refundAmount > 0
          ? `Refund recorded: $${refundAmount.toFixed(2)}${
              refundReg.stripe_payment_intent_id
                ? ''
                : ' (cash/manual — no Stripe charge)'
            }. Player kept in history, removed from active roster.`
          : 'Player removed from active roster (no refund). Row kept in history.'
      );
    } catch (e: any) {
      console.error(e);
      alert(e.message || 'Failed to remove/refund');
    } finally {
      setRefunding(false);
    }
  };

  const handleAddPlayer = async () => {
    if (!newPlayerName.trim()) return alert('Player name is required');
    if (addChargeType === 'link' && !newPlayerEmail.trim()) {
      return alert('Email is required to send a payment link');
    }

    if (addChargeType === 'cash') {
      if (!eventHasConnectAccount) {
        setShowConnectRequired(true);
        return;
      }
      setShowCashFeeConfirm(true);
      return;
    }

    await saveNewPlayer();
  };

  const confirmCashAddPlayer = async () => {
    setShowCashFeeConfirm(false);
    await saveNewPlayer();
  };

  const saveNewPlayer = async () => {
    setAddingPlayer(true);
    try {
      const selected_round_ids =
        selectedRoundId !== 'all'
          ? [selectedRoundId as number]
          : rounds.map((r) => r.id);

      const chargeAmount = estimateRegCharge();
      const addonQty = compactAddonQuantities(newPlayerAddonQty, addons);
      const addonTotal = addonTotalFromQty(addonQty, addons);
      const isCash = addChargeType === 'cash';
      const isFree = addChargeType === 'free';
      const isLink = addChargeType === 'link';

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: inserted, error } = await supabase
        .from('event_registrations')
        .insert({
          event_id: parseInt(eventId),
          player_name: newPlayerName.trim(),
          player_email: newPlayerEmail.trim() || null,
          team_name: newPlayerTeam.trim() || null,
          paid: isCash,
          checked_in: false,
          selected_round_ids,
          round_checkins: {},
          amount_paid: isCash
            ? Math.round((chargeAmount + addonTotal) * 100) / 100
            : null,
          payment_method: isCash
            ? 'cash'
            : isFree
              ? 'comp'
              : isLink
                ? 'payment_link'
                : 'comp',
          is_captain: false,
          addon_quantities: isCash ? addonQty : {},
          paid_addons: isCash && Object.keys(addonQty).length > 0,
        })
        .select()
        .single();

      if (error) throw error;
      await assignCaptainIfNeeded(
        supabase,
        parseInt(eventId),
        inserted?.team_name,
        inserted?.id
      );

      // Document cash on income so books + platform fee visibility stay honest
      if (isCash && chargeAmount > 0) {
        try {
          await supabase.from('event_income_entries').insert({
            event_id: parseInt(eventId),
            registration_id: inserted.id,
            label: `Paid cash – ${newPlayerName.trim()}`,
            category: 'registration',
            amount: chargeAmount,
            created_by: user?.id || null,
          });
        } catch (incErr) {
          console.warn('Income entry failed (reg still created):', incErr);
        }
        try {
          await writeAddonIncomeRows(inserted.id, addonQty);
        } catch (addonIncErr) {
          console.warn('Addon income failed (reg still created):', addonIncErr);
        }
      }

      // Email Stripe payment link (same pattern as add-ons)
      if (isLink && inserted) {
        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL || window.location.origin;

        const checkoutRes = await fetch('/api/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: chargeAmount,
            player_name: newPlayerName.trim(),
            email: newPlayerEmail.trim(),
            description: `Registration – ${event?.name || 'event'}`,
            event_name: event?.name,
            event_id: event?.id || parseInt(eventId),
            type: 'registration',
            registration_id: inserted.id,
           success_url: `${baseUrl}/api/confirm-registration-payment?registration_id=${inserted.id}&event_id=${eventId}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/event/${eventId}/check-in`,
          }),
        });

        const checkoutData = await checkoutRes.json();
        if (!checkoutRes.ok || !checkoutData.url) {
          throw new Error(
            checkoutData.error ||
              'Player added, but payment link failed. You can retry from their row later.'
          );
        }

        // Prefer registration email API if you have one; fall back to addon email shape
        const emailRes = await fetch('/api/send-addon-payment-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: newPlayerEmail.trim(),
            name: newPlayerName.trim(),
            eventName: event?.name || 'Event',
            amount: chargeAmount,
            paymentUrl: checkoutData.url,
          }),
        });

        if (!emailRes.ok) {
          const emailData = await emailRes.json().catch(() => ({}));
          alert(
            `Player added. Payment link created but email failed: ${
              emailData.error || 'unknown'
            }\n\nLink: ${checkoutData.url}`
          );
        } else {
          alert(
            `✅ ${newPlayerName.trim()} added. Payment link ($${chargeAmount.toFixed(
              2
            )}) emailed to ${newPlayerEmail.trim()}`
          );
        }
      } else if (isCash) {
        alert(
          `✅ ${newPlayerName.trim()} added as Paid cash ($${chargeAmount.toFixed(
            2
          )}). Logged on Income.`
        );
      } else {
        alert(`✅ ${newPlayerName.trim()} added (comp / free).`);
      }

      await fetchRegistrations();
      setShowAddPlayerModal(false);
      setNewPlayerName('');
      setNewPlayerEmail('');
      setNewPlayerTeam('');
      setAddChargeType('cash');
      setNewPlayerAddonQty({});
    } catch (e: any) {
      console.error(e);
      alert(e.message || 'Failed to add player');
    } finally {
      setAddingPlayer(false);
    }
  };

  const handleSubstitutePlayer = async () => {
    if (!subName.trim()) return alert('Player name is required');
    await supabase
      .from('event_registrations')
      .update({
        player_name: subName.trim(),
        player_email: subEmail.trim() || null,
      })
      .eq('id', subPlayerReg.id);
    fetchRegistrations();
    setShowSubModal(false);
    setSubName('');
    setSubEmail('');
  };

  const openPaymentModal = (reg: any) => {
    setCurrentPayReg(reg);
    setShowPaymentModal(true);
  };

  const handlePaidCash = async () => {
    if (!currentPayReg) return;

    const roundKey =
      selectedRoundId === 'all' ? null : String(selectedRoundId);
    const existing = { ...(currentPayReg.round_checkins || {}) };
    if (roundKey) existing[roundKey] = true;

    const qty = compactAddonQuantities(
      selectedQuantities[currentPayReg.id] ||
        currentPayReg.addon_quantities ||
        {},
      addons
    );
    const addonTotal = addonTotalFromQty(qty, addons);
    const prevQty = compactAddonQuantities(
      currentPayReg.addon_quantities || {},
      addons
    );
    const prevAddonTotal = addonTotalFromQty(prevQty, addons);
    const base = Math.max(
      0,
      Number(currentPayReg.amount_paid || 0) - prevAddonTotal
    );
    const isCash =
      String(currentPayReg.payment_method || '').toLowerCase() === 'cash';

    const { error } = await supabase
      .from('event_registrations')
      .update({
        paid_addons: Object.keys(qty).length > 0,
        checked_in: true,
        round_checkins: existing,
        addon_quantities: qty,
        ...(isCash
          ? {
              amount_paid: Math.round((base + addonTotal) * 100) / 100,
              payment_method: 'cash',
            }
          : {}),
      })
      .eq('id', currentPayReg.id);

    if (error) {
      alert('Error marking as paid: ' + error.message);
    } else {
      try {
        await writeAddonIncomeRows(currentPayReg.id, qty);
      } catch (e) {
        console.warn('Addon income failed:', e);
      }
      alert(`${currentPayReg.player_name} add-ons paid and checked in.`);
      setShowPaymentModal(false);
      await fetchRegistrations();
    }
  };

  const handleSendAddonPaymentEmail = async () => {
    if (!currentPayReg) return;

    const addonTotals =
      selectedQuantities[currentPayReg.id] ||
      currentPayReg.addon_quantities ||
      {};

    const addonSubtotal = addons.reduce((sum: number, addon: any) => {
      const qty = addonTotals[addon.id] || 0;
      return sum + qty * (addon.price_per_unit || 0);
    }, 0);
    const addonCost = amountWithPlatformFee(
      addonSubtotal,
      platformFeePercent
    );

    if (addonCost <= 0) {
      alert('No add-on total to charge.');
      return;
    }

    if (!currentPayReg.player_email) {
      alert('This player has no email on file.');
      return;
    }

    await supabase
      .from('event_registrations')
      .update({ addon_quantities: addonTotals })
      .eq('id', currentPayReg.id);

    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL || window.location.origin;

      const checkoutRes = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: addonCost,
          player_name: currentPayReg.player_name,
          email: currentPayReg.player_email,
          description: `Add-ons for ${event?.name || 'event'}`,
          event_name: event?.name,
          event_id: event?.id || parseInt(eventId),
          type: 'addon',
          registration_id: currentPayReg.id,
         success_url: `${baseUrl}/api/confirm-addon-payment?registration_id=${currentPayReg.id}&event_id=${eventId}&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${baseUrl}/event/${eventId}/check-in`,
        }),
      });

      const checkoutData = await checkoutRes.json();
      if (!checkoutRes.ok || !checkoutData.url) {
        throw new Error(checkoutData.error || 'Failed to create payment link');
      }

      const emailRes = await fetch('/api/send-addon-payment-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: currentPayReg.player_email,
          name: currentPayReg.player_name,
          eventName: event?.name || 'Event',
          amount: addonCost,
          paymentUrl: checkoutData.url,
        }),
      });

      const emailData = await emailRes.json();
      if (!emailRes.ok) {
        throw new Error(emailData.error || 'Failed to send email');
      }

      alert(`✅ Payment link emailed to ${currentPayReg.player_email}`);
      setShowPaymentModal(false);
    } catch (err: any) {
      console.error(err);
      alert('Failed: ' + (err.message || 'Unknown error'));
    }
  };

  const toggleSeasonCheckIn = async (reg: any) => {
    const next = !reg.checked_in;
    if (!next && !confirm(`Remove ${reg.player_name} from season check-in?`)) {
      return;
    }
    const { error } = await supabase
      .from('event_registrations')
      .update({ checked_in: next })
      .eq('id', reg.id);
    if (error) {
      alert('Failed to update season check-in: ' + error.message);
      return;
    }
    await fetchRegistrations();
  };

    const toggleCheckIn = async (reg: any) => {
    const league = isLeagueEvent(event);
    const currentlyIn = isCheckedInForRound(reg, selectedRoundId, league);

    if (currentlyIn) {
      if (!confirm(`Un-check in ${reg.player_name}?`)) return;
    }

    const existing = { ...(reg.round_checkins || {}) };
    const patch: Record<string, any> = {};

    if (league && selectedRoundId === 'all') {
      patch.checked_in = !currentlyIn;
    } else if (league && selectedRoundId !== 'all') {
      existing[String(selectedRoundId)] = !currentlyIn;
      patch.round_checkins = existing;
    } else {
      if (selectedRoundId !== 'all') {
        existing[String(selectedRoundId)] = !currentlyIn;
      }
      patch.round_checkins = existing;
      patch.checked_in = !currentlyIn;
    }

    const { error } = await supabase
      .from('event_registrations')
      .update(patch)
      .eq('id', reg.id);

    if (error) {
      alert('Failed to update check-in: ' + error.message);
      return;
    }

    // Email only when checking IN
    if (!currentlyIn) {
      const email = (reg.player_email || reg.email || '').trim();
      if (email) {
        const pairing = getPairingLabel(reg, selectedRoundId);
        const teeTime = selectedRound
          ? formatRoundTime(selectedRound.start_time)
          : null;
        const base =
          process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
        const liveUrl = buildLiveUrl(eventId, reg, selectedRoundId);
        const leaderboardUrl = `${base}/event/${eventId}/leaderboard`;

        fetch('/api/send-checkin-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: email,
            playerName: reg.player_name,
            eventName: event?.name || 'your event',
            pairing,
            teeTime,
            liveUrl,
            leaderboardUrl,
          }),
        }).catch((e) => console.error('Check-in email failed:', e));
      }
    }

    fetchRegistrations();
  };

    const toggleSkins = async (reg: any, on: boolean) => {
    const skinsAddon = addons.find(
      (a) => String(a.name || '').toLowerCase() === 'skins'
    );
    const existingQty = {
      ...(selectedQuantities[reg.id] || reg.addon_quantities || {}),
    };

    if (skinsAddon) {
      if (on) existingQty[skinsAddon.id] = 1;
      else delete existingQty[skinsAddon.id];
    }

    const nextAddons = { ...(reg.addons_selected || {}) };
    if (on) nextAddons['Skins'] = 1;
    else delete nextAddons['Skins'];

    const { error } = await supabase
      .from('event_registrations')
      .update({
        playing_skins: on,
        addons_selected: nextAddons,
        addon_quantities: existingQty,
        ...(on && Number(event?.skins_fee) > 0 ? { paid_addons: false } : {}),
      })
      .eq('id', reg.id);

    if (error) {
      alert(error.message);
      return;
    }

    setSelectedQuantities((prev) => ({
      ...prev,
      [reg.id]: existingQty,
    }));
    await fetchRegistrations();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin mx-auto mb-6"></div>
          <p className="text-gray-400">Loading check-in...</p>
        </div>
      </div>
    );
  }

  const greensFee = Number(event?.greens_fee || 0);
    const previewPaid = refundReg ? estimateAmountPaid(refundReg) : null;
  const previewRefund =
    refundMode === 'full' && previewPaid != null
      ? previewPaid
      : refundMode === 'minus_greens' && previewPaid != null
        ? Math.max(0, previewPaid - greensFee)
        : refundMode === 'custom'
          ? Math.max(0, Number(customRefundAmount) || 0)
          : 0;

  const headerTeeTime = selectedRound
    ? formatRoundTime(selectedRound.start_time)
    : null;

    const leagueCheckIn = isLeagueEvent(event);
    const checkedInRegs = filteredRegistrations.filter((r) =>
    isCheckedInForRound(r, selectedRoundId, leagueCheckIn)
  );
  const checkedInCount = checkedInRegs.length;
  const teamCount = countTeams(filteredRegistrations);
  const checkedInTeamCount = countTeams(checkedInRegs);



  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <BackButton
          href="/events"
          className="mb-6 text-gray-400 hover:text-white flex items-center gap-2"
        />

        <EventTabs eventId={eventId} variant="dayof" active="check-in" />

        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold mb-2">{event?.name}</h1>
                        <p className="text-gray-400 text-sm sm:text-base">
              Player Check-In · {checkedInCount}/{filteredRegistrations.length}{' '}
              checked in
              {teamCount > 0
                ? ` · ${checkedInTeamCount}/${teamCount} team${
                    teamCount === 1 ? '' : 's'
                  }`
                : ''}
              {event?.course ? ` · ${event.course}` : ''}
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
                {leagueCheckIn ? 'Check-in by week' : 'Check-in by round'}
              </label>
              <select
                value={
                  selectedRoundId === 'all' ? 'all' : String(selectedRoundId)
                }
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedRoundId(v === 'all' ? 'all' : parseInt(v, 10));
                }}
                className="w-full bg-gray-800 border border-gray-600 rounded-2xl px-5 py-4 text-white"
              >
                <option value="all">
                  {leagueCheckIn ? 'Season (league check-in)' : 'All rounds'}
                </option>
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

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <h2 className="text-2xl sm:text-3xl font-semibold">Player Check-in</h2>

          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            <button
              onClick={fetchRegistrations}
              className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 px-4 sm:px-6 py-3 rounded-2xl font-medium text-sm sm:text-base"
            >
              🔄 Refresh
            </button>
            <button
              onClick={async () => {
                for (const [regId, quantities] of Object.entries(
                  selectedQuantities
                )) {
                  await supabase
                    .from('event_registrations')
                    .update({ addon_quantities: quantities })
                    .eq('id', parseInt(regId));
                }
                await fetchRegistrations();
                alert('✅ Changes saved and table refreshed.');
              }}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 px-4 sm:px-6 py-3 rounded-2xl font-medium text-sm sm:text-base"
            >
              💾 Save
            </button>
            <button
              onClick={() => router.push(`/event/${eventId}/contacts`)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 px-4 sm:px-6 py-3 rounded-2xl font-medium text-sm sm:text-base"
            >
              📇 Contacts
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <input
            type="text"
            placeholder="Search by name or team..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4 focus:outline-none focus:border-blue-500 text-base"
          />
          <button
            onClick={() => setShowAddPlayerModal(true)}
            className="bg-blue-600 hover:bg-blue-700 px-8 py-4 rounded-3xl font-medium flex items-center justify-center gap-2 whitespace-nowrap"
          >
            + Add Player
          </button>
        </div>

        {leagueCheckIn && selectedRoundId !== 'all' && (
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              type="button"
              onClick={() => setLeagueRosterFilter('lineup')}
              className={`px-4 py-2 rounded-2xl text-sm font-medium ${
                leagueRosterFilter === 'lineup'
                  ? 'bg-white text-black'
                  : 'bg-gray-700 text-gray-300'
              }`}
            >
              Lineup this week
            </button>
            <button
              type="button"
              onClick={() => setLeagueRosterFilter('bench')}
              className={`px-4 py-2 rounded-2xl text-sm font-medium ${
                leagueRosterFilter === 'bench'
                  ? 'bg-white text-black'
                  : 'bg-gray-700 text-gray-300'
              }`}
            >
              Roster not playing
            </button>
          </div>
        )}

        {filteredRegistrations.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            {selectedRoundId === 'all'
              ? 'No registrations yet for this event.'
              : leagueCheckIn && leagueRosterFilter === 'lineup'
                ? 'No lineup set for this week.'
                : leagueCheckIn
                  ? 'Everyone on the roster is in this week’s lineup.'
                  : 'No players registered for this round.'}
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full border-collapse min-w-[640px]">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-900">
                  <th className="text-left py-3 px-3 sm:px-6 font-medium">Player</th>
                  <th className="text-left py-3 px-3 sm:px-6 font-medium">Team</th>
                  <th className="text-center py-3 px-3 sm:px-6 font-medium">HCP</th>
                  <th className="text-center py-3 px-3 sm:px-6 font-medium">Hole</th>

                  {event?.enable_skins && (
                    <th className="text-center py-3 px-3 sm:px-6 font-medium">
                      Skins
                    </th>
                  )}

                  {showAddons &&
                    addons
                      .filter(
                        (a) => String(a.name || '').toLowerCase() !== 'skins'
                      )
                      .map((addon: any) => (
                        <th
                          key={addon.id}
                          className="text-center py-3 px-3 sm:px-6 font-medium"
                        >
                          {addon.name}
                        </th>
                      ))}

                  {showAddons && (
                    <th className="text-center py-3 px-3 sm:px-6 font-medium">
                      Add-on
                    </th>
                  )}
                  <th className="text-center py-3 px-3 sm:px-6 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRegistrations.map((reg: any) => {
                  const isCheckedIn = isCheckedInForRound(
                    reg,
                    selectedRoundId,
                    leagueCheckIn
                  );
                  const addonTotals =
                    selectedQuantities[reg.id] || reg.addon_quantities || {};

                  const addonCost = addons.reduce((sum: number, addon: any) => {
                    const qty = addonTotals[addon.id] || 0;
                    return sum + qty * (addon.price_per_unit || 0);
                  }, 0);
                  const addonCheckout = amountWithPlatformFee(
                    addonCost,
                    platformFeePercent
                  );

                  const startingHole = getPairingLabel(reg, selectedRoundId);

                  return (
                    <tr
                      key={reg.id}
                      className="border-b border-gray-700 hover:bg-gray-800/50"
                    >
                      <td className="py-3 px-3 sm:px-6 font-medium">
                        <button
                          type="button"
                          onClick={() => openEditPlayer(reg)}
                          className="text-left hover:text-emerald-400 hover:underline"
                          title="Edit player / team"
                        >
                          {reg.player_name || 'Unknown'}
                        </button>
                        {reg.payment_method === 'cash' && (
                          <div className="text-xs text-emerald-400">Paid cash</div>
                        )}
                        {reg.payment_method === 'comp' && (
                          <div className="text-xs text-gray-500">Comp</div>
                        )}
                        {!reg.paid && reg.payment_method !== 'comp' && (
                          <div className="text-xs text-amber-400">Unpaid</div>
                        )}
                      </td>
                      <td className="py-3 px-3 sm:px-6 text-gray-400">
                        {reg.team_name || '—'}
                      </td>
                      <td className="py-3 px-3 sm:px-6 text-center">
                        {showHandicaps ? (
                          <input
                            type="number"
                            value={reg.handicap ?? ''}
                            onChange={async (e) => {
                              const newHandicap =
                                e.target.value === ''
                                  ? null
                                  : parseFloat(e.target.value);
                              await supabase
                                .from('event_registrations')
                                .update({ handicap: newHandicap })
                                .eq('id', reg.id);
                              fetchRegistrations();
                            }}
                            className="w-16 sm:w-20 bg-gray-700 border border-gray-600 rounded-xl text-center py-2"
                          />
                        ) : (
                          <span className="text-gray-500">N/A</span>
                        )}
                      </td>
                      <td className="py-3 px-3 sm:px-6 text-center text-teal-300 font-medium">
                        {startingHole}
                      </td>
                      {event?.enable_skins && (
  <td className="py-3 px-3 sm:px-6 text-center">
    <input
      type="checkbox"
      checked={
        !!reg.playing_skins ||
        !!reg.addons_selected?.['Skins'] ||
        (() => {
          const skinsAddon = addons.find(
            (a) => String(a.name || '').toLowerCase() === 'skins'
          );
          if (!skinsAddon) return false;
          const qty =
            (selectedQuantities[reg.id] || reg.addon_quantities || {})[
              skinsAddon.id
            ] || 0;
          return qty > 0;
        })()
      }
      onChange={(e) => toggleSkins(reg, e.target.checked)}
      className="w-5 h-5 accent-emerald-600"
      title="Playing skins"
    />
  </td>
)}

{showAddons &&
  addons
    .filter((a) => String(a.name || '').toLowerCase() !== 'skins')
    .map((addon: any) => {
                          const qty = addonTotals[addon.id] || 0;
                          const isLocked =
                            !!reg.paid_addons && editingAddonRegId !== reg.id;

                          return (
                            <td
                              key={addon.id}
                              className="py-3 px-3 sm:px-6 text-center"
                            >
                              {isLocked ? (
                                <span className="text-gray-300 font-medium">
                                  {qty > 0 ? qty : '—'}
                                </span>
                              ) : (
                                <div className="flex flex-col items-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={qty > 0}
                                    onChange={async (e) => {
                                      const newQty = e.target.checked ? 1 : 0;
                                      const next = {
                                        ...(selectedQuantities[reg.id] ||
                                          addonTotals),
                                        [addon.id]: newQty,
                                      };
                                      setSelectedQuantities((prev) => ({
                                        ...prev,
                                        [reg.id]: next,
                                      }));
                                      if (
                                        String(
                                          reg.payment_method || ''
                                        ).toLowerCase() === 'cash'
                                      ) {
                                        try {
                                          await persistCashAddons(reg, next);
                                          await fetchRegistrations();
                                        } catch (err: any) {
                                          alert(
                                            err.message ||
                                              'Failed to save cash add-ons'
                                          );
                                        }
                                      }
                                    }}
                                    className="w-5 h-5 accent-green-600"
                                  />
                                  {addon.quantity_available > 1 && qty > 0 && (
                                    <select
                                      value={qty}
                                      onChange={async (e) => {
                                        const newQty = parseInt(
                                          e.target.value,
                                          10
                                        );
                                        const next = {
                                          ...(selectedQuantities[reg.id] ||
                                            addonTotals),
                                          [addon.id]: newQty,
                                        };
                                        setSelectedQuantities((prev) => ({
                                          ...prev,
                                          [reg.id]: next,
                                        }));
                                        if (
                                          String(
                                            reg.payment_method || ''
                                          ).toLowerCase() === 'cash'
                                        ) {
                                          try {
                                            await persistCashAddons(reg, next);
                                            await fetchRegistrations();
                                          } catch (err: any) {
                                            alert(
                                              err.message ||
                                                'Failed to save cash add-ons'
                                            );
                                          }
                                        }
                                      }}
                                      className="bg-gray-700 border border-gray-600 rounded-xl text-xs px-2 py-1"
                                    >
                                      {Array.from(
                                        { length: addon.quantity_available },
                                        (_, i) => i + 1
                                      ).map((n) => (
                                        <option key={n} value={n}>
                                          {n}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}

                      {showAddons && (
                        <td className="py-3 px-3 sm:px-6 text-center text-gray-300">
                          {addonCost > 0 ? `$${addonCost.toFixed(2)}` : '—'}
                        </td>
                      )}

                      {/* Actions — compact row for mobile */}
                      <td className="py-3 px-2 sm:px-4">
                        <div className="flex flex-row flex-wrap items-center justify-end gap-1.5 sm:gap-2">
                          {showAddons &&
                            addonCost > 0 &&
                            (reg.paid_addons &&
                            editingAddonRegId !== reg.id ? (
                              <span className="bg-gray-600 text-gray-300 px-2.5 py-1.5 rounded-xl text-xs font-medium opacity-70">
                                ✓ Paid
                              </span>
                            ) : (
                              <button
                                onClick={() => openPaymentModal(reg)}
                                className="bg-amber-600 hover:bg-amber-700 px-2.5 py-1.5 rounded-xl text-xs font-medium text-white whitespace-nowrap"
                              >
                                Pay ${addonCheckout.toFixed(2)}
                              </button>
                            ))}

                          {showAddons && reg.paid_addons && (
                            editingAddonRegId === reg.id ? (
                              <button
                                onClick={async () => {
                                  const quantities =
                                    selectedQuantities[reg.id] ||
                                    reg.addon_quantities ||
                                    {};
                                  await supabase
                                    .from('event_registrations')
                                    .update({
                                      addon_quantities: quantities,
                                      paid_addons: false,
                                    })
                                    .eq('id', reg.id);
                                  setEditingAddonRegId(null);
                                  await fetchRegistrations();
                                  alert(
                                    'Add-ons updated. Player must pay again if total changed.'
                                  );
                                }}
                                className="bg-blue-600 hover:bg-blue-700 px-2.5 py-1.5 rounded-xl text-xs font-medium text-white"
                              >
                                Save
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  if (
                                    !confirm(
                                      'Edit paid add-ons? They will need to pay again after changes.'
                                    )
                                  )
                                    return;
                                  setSelectedQuantities((prev) => ({
                                    ...prev,
                                    [reg.id]: reg.addon_quantities || {},
                                  }));
                                  setEditingAddonRegId(reg.id);
                                }}
                                className="text-amber-400 hover:text-amber-300 text-xs font-medium px-1.5 py-1.5"
                              >
                                Edit
                              </button>
                            )
                          )}

                          {leagueCheckIn && selectedRoundId !== 'all' && (
                            <button
                              type="button"
                              onClick={() => toggleSeasonCheckIn(reg)}
                              className={`px-2.5 py-1.5 rounded-xl text-xs font-medium text-white whitespace-nowrap ${
                                reg.checked_in
                                  ? 'bg-amber-700 hover:bg-amber-800'
                                  : 'bg-gray-600 hover:bg-gray-500'
                              }`}
                            >
                              {reg.checked_in ? '✓ Season' : 'Season'}
                            </button>
                          )}

                                                    <button
                            onClick={() => toggleCheckIn(reg)}
                            className={`px-2.5 py-1.5 rounded-xl text-xs font-medium text-white whitespace-nowrap ${
                              isCheckedIn
                                ? 'bg-green-600 hover:bg-red-600'
                                : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                          >
                            {isCheckedIn ? '✓ In' : 'Check In'}
                          </button>

                          {isCheckedIn && (
                            <a
                              href={buildLiveUrl(
                                eventId,
                                reg,
                                selectedRoundId,
                                leagueCheckIn ? 'tonight' : null
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-emerald-700 hover:bg-emerald-600 px-2.5 py-1.5 rounded-xl text-xs font-medium text-white whitespace-nowrap"
                            >
                              Live
                            </a>
                          )}

                          <button
                            onClick={() => {
                              setRefundReg(reg);
                              setRefundMode('none');
                              setCustomRefundAmount('');
                              setShowRefundModal(true);
                            }}
                            className="text-red-400 hover:text-red-500 text-xs font-medium px-1.5 py-1.5 whitespace-nowrap"
                          >
                            Remove
                          </button>

                          <button
                            onClick={() => {
                              setSubPlayerReg(reg);
                              setSubName('');
                              setSubEmail('');
                              setShowSubModal(true);
                            }}
                            className="text-blue-400 hover:text-blue-500 text-xs font-medium px-1.5 py-1.5 whitespace-nowrap"
                          >
                            Sub
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Remove / Refund Modal — unchanged logic */}
      {showRefundModal && refundReg && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-3xl p-8 max-w-md w-full space-y-6">
            <h3 className="text-2xl font-semibold text-center">
              Remove / Refund
            </h3>
            <p className="text-center text-gray-400">
              {refundReg.player_name}
              {refundReg.team_name ? ` · ${refundReg.team_name}` : ''}
            </p>
            <p className="text-center text-sm text-gray-500">
              {previewPaid != null
  ? `Recorded paid: $${previewPaid.toFixed(2)}`
  : 'Paid amount not recorded — use Custom refund'}
              {greensFee > 0 ? ` · Greens fee: $${greensFee.toFixed(2)}` : ''}
            </p>

            <div className="space-y-3">
              {[
                { id: 'none', label: 'Remove (no refund)' },
                { id: 'full', label: '100% refund' },
                { id: 'minus_greens', label: 'Refund minus greens fees' },
                { id: 'custom', label: 'Custom refund ($)' },
              ].map((opt) => (
                <label
                  key={opt.id}
                  className={`flex items-center gap-3 p-4 rounded-2xl border cursor-pointer ${
                    refundMode === opt.id
                      ? 'border-blue-500 bg-blue-950/40'
                      : 'border-gray-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="refundMode"
                    checked={refundMode === opt.id}
                    onChange={() => setRefundMode(opt.id as any)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>

            {refundMode === 'custom' && (
              <input
                type="number"
                step="0.01"
                min="0"
                value={customRefundAmount}
                onChange={(e) => setCustomRefundAmount(e.target.value)}
                placeholder="Refund amount ($)"
                className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
              />
            )}

            {refundMode !== 'none' && (
              <p className="text-center text-emerald-400 font-medium">
                Refund amount: ${previewRefund.toFixed(2)}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setShowRefundModal(false);
                  setRefundReg(null);
                }}
                className="py-4 rounded-2xl bg-gray-700 hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveOrRefund}
                disabled={refunding}
                className="py-4 rounded-2xl bg-red-600 hover:bg-red-700 disabled:bg-gray-600 font-semibold"
              >
                {refunding ? 'Working...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Player Modal — with charge options */}
      {showAddPlayerModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-3xl p-6 sm:p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-semibold mb-2">Add Player</h3>
            <p className="text-sm text-gray-400 mb-6">
              Est. charge:{' '}
              <span className="text-emerald-400 font-medium">
                ${addChargePreview.toFixed(2)}
              </span>
              {addChargeType === 'link' ? (
                <span className="text-gray-500">
                  {' '}
                  ({formatPlatformFeePercent(platformFeePercent)}% platform fee
                  included at checkout)
                </span>
              ) : addChargeType === 'cash' ? (
                <span className="text-gray-500"> (cash — no platform fee)</span>
              ) : null}
            </p>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Player name"
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
              />
              <input
                type="email"
                placeholder="Email (required for payment link)"
                value={newPlayerEmail}
                onChange={(e) => setNewPlayerEmail(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
              />
              <input
                type="text"
                placeholder="Team (optional)"
                value={newPlayerTeam}
                onChange={(e) => setNewPlayerTeam(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
              />

              <div className="space-y-2">
                <p className="text-sm text-gray-400">Payment</p>
                {(
                  [
                    {
                      id: 'cash',
                      label: '💵 Paid cash',
                      hint: 'Marks paid + logs on Income',
                    },
                    {
                      id: 'link',
                      label: '📧 Send payment link',
                      hint: 'Same flow as add-ons email',
                    },
                    {
                      id: 'free',
                      label: '🆓 Comp / free',
                      hint: 'No charge (document as comp)',
                    },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.id}
                    className={`flex items-start gap-3 p-4 rounded-2xl border cursor-pointer ${
                      addChargeType === opt.id
                        ? 'border-blue-500 bg-blue-950/40'
                        : 'border-gray-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="addCharge"
                      className="mt-1"
                      checked={addChargeType === opt.id}
                      onChange={() => setAddChargeType(opt.id)}
                    />
                    <span>
                      <span className="font-medium block">{opt.label}</span>
                      <span className="text-xs text-gray-500">{opt.hint}</span>
                    </span>
                  </label>
                ))}
              </div>

              {addOnsForForms.length > 0 && addChargeType === 'cash' && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-400">Add-ons (cash)</p>
                  {addOnsForForms.map((addon) => {
                    const qty = Number(
                      newPlayerAddonQty[addon.id] ??
                        newPlayerAddonQty[String(addon.id)] ??
                        0
                    );
                    return (
                      <label
                        key={addon.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-gray-700"
                      >
                        <span>
                          <span className="font-medium">{addon.name}</span>
                          <span className="text-xs text-gray-500 block">
                            ${Number(addon.price_per_unit || 0).toFixed(2)}
                          </span>
                        </span>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={qty > 0}
                            onChange={(e) =>
                              setNewPlayerAddonQty((prev) => ({
                                ...prev,
                                [addon.id]: e.target.checked ? 1 : 0,
                              }))
                            }
                            className="w-5 h-5 accent-green-600"
                          />
                          {Number(addon.quantity_available) > 1 && qty > 0 && (
                            <select
                              value={qty}
                              onChange={(e) =>
                                setNewPlayerAddonQty((prev) => ({
                                  ...prev,
                                  [addon.id]: parseInt(e.target.value, 10),
                                }))
                              }
                              className="bg-gray-700 border border-gray-600 rounded-xl text-xs px-2 py-1"
                            >
                              {Array.from(
                                {
                                  length: Number(addon.quantity_available) || 1,
                                },
                                (_, i) => i + 1
                              ).map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleAddPlayer}
                  disabled={addingPlayer}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 py-4 rounded-2xl font-semibold"
                >
                  {addingPlayer ? 'Adding…' : 'Add Player'}
                </button>
                <button
                  onClick={() => {
                    setShowAddPlayerModal(false);
                    setNewPlayerName('');
                    setNewPlayerEmail('');
                    setNewPlayerTeam('');
                    setAddChargeType('cash');
                    setNewPlayerAddonQty({});
                  }}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 py-4 rounded-2xl font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showConnectRequired && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-4">
            <h3 className="text-2xl font-semibold">Connect Stripe first</h3>
            <p className="text-gray-300 leading-relaxed">
              Connect Stripe first so cash platform fees can be collected.
            </p>
            <a
              href={`/event/${eventId}/manage`}
              className="block text-center bg-amber-500 hover:bg-amber-400 text-gray-900 font-semibold py-4 rounded-2xl"
            >
              Connect setup
            </a>
            <button
              type="button"
              onClick={() => setShowConnectRequired(false)}
              className="w-full py-4 bg-gray-700 hover:bg-gray-600 rounded-2xl font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showCashFeeConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-4">
            <h3 className="text-2xl font-semibold">Cash platform fee</h3>
            <p className="text-gray-300 leading-relaxed whitespace-pre-line">
              {`Fried Egg Events keeps $${cashFeeAmount.toFixed(2)} (${formatPlatformFeePercent(cashFeePercent)}%) on this cash spot.
We’ll collect it from your Stripe payout balance when card payments exist,
or it stays as outstanding on the platform.`}
            </p>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCashFeeConfirm(false)}
                className="py-4 rounded-2xl bg-gray-700 hover:bg-gray-600 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmCashAddPlayer}
                disabled={addingPlayer}
                className="py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 font-semibold"
              >
                {addingPlayer ? 'Adding…' : 'Add player'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal (add-ons) */}
      {showPaymentModal && currentPayReg && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-3xl p-8 sm:p-10 max-w-md w-full">
            <h3 className="text-2xl font-semibold mb-8 text-center">
              Add-ons for {currentPayReg.player_name}
            </h3>
            <div className="grid grid-cols-1 gap-4">
              <button
                onClick={handleSendAddonPaymentEmail}
                className="bg-blue-600 hover:bg-blue-700 py-5 rounded-2xl text-lg font-semibold"
              >
                📧 Send Payment Link by Email
              </button>
              <button
                onClick={handlePaidCash}
                className="bg-emerald-600 hover:bg-emerald-700 py-5 rounded-2xl text-lg font-semibold"
              >
                💵 Paid Cash / Check In
              </button>
            </div>
            <button
              onClick={() => setShowPaymentModal(false)}
              className="w-full mt-6 py-4 text-gray-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Sub Player Modal */}
      {showSubModal && subPlayerReg && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-3xl p-8 max-w-md w-full">
            <h3 className="text-2xl font-semibold mb-2">Substitute Player</h3>
            <p className="text-gray-400 mb-6">
              Replacing:{' '}
              <span className="text-white">{subPlayerReg.player_name}</span>
            </p>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="New player name"
                value={subName}
                onChange={(e) => setSubName(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
              />
              <input
                type="email"
                placeholder="Email (optional)"
                value={subEmail}
                onChange={(e) => setSubEmail(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
              />
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSubstitutePlayer}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 py-4 rounded-2xl font-semibold"
                >
                  Save Sub
                </button>
                <button
                  onClick={() => {
                    setShowSubModal(false);
                    setSubName('');
                    setSubEmail('');
                  }}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 py-4 rounded-2xl font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
            {showEditModal && editReg && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-3xl p-6 sm:p-8 max-w-md w-full max-h-[90vh] overflow-y-auto space-y-4">
            <h3 className="text-2xl font-semibold">Edit player</h3>
            <p className="text-sm text-gray-400">
              Move them to another team or change name / rounds.
            </p>

            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Player name"
              className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
            />
            <input
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              placeholder="Email"
              className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
            />

            <div>
              <label className="text-sm text-gray-400 block mb-2">Team</label>
              <select
                value={
                  existingTeams.includes(editTeam) ? editTeam : editTeam ? '__custom__' : ''
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '__custom__') {
                    setEditTeam('');
                  } else {
                    setEditTeam(v);
                  }
                }}
                className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4 mb-2"
              >
                <option value="">Individual / no team</option>
                {existingTeams.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                <option value="__custom__">New team name…</option>
              </select>
              {(!existingTeams.includes(editTeam) || editTeam === '') && (
                <input
                  type="text"
                  value={existingTeams.includes(editTeam) ? '' : editTeam}
                  onChange={(e) => setEditTeam(e.target.value)}
                  placeholder="Type team name"
                  className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
                />
              )}
            </div>

            {String(editReg.payment_method || '').toLowerCase() === 'cash' &&
              addOnsForForms.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-400">Add-ons (cash)</p>
                  {addOnsForForms.map((addon) => {
                    const qty = Number(
                      editAddonQty[addon.id] ??
                        editAddonQty[String(addon.id)] ??
                        0
                    );
                    return (
                      <label
                        key={addon.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-gray-700"
                      >
                        <span>
                          <span className="font-medium">{addon.name}</span>
                          <span className="text-xs text-gray-500 block">
                            ${Number(addon.price_per_unit || 0).toFixed(2)}
                          </span>
                        </span>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={qty > 0}
                            onChange={(e) =>
                              setEditAddonQty((prev) => ({
                                ...prev,
                                [addon.id]: e.target.checked ? 1 : 0,
                              }))
                            }
                            className="w-5 h-5 accent-green-600"
                          />
                          {Number(addon.quantity_available) > 1 && qty > 0 && (
                            <select
                              value={qty}
                              onChange={(e) =>
                                setEditAddonQty((prev) => ({
                                  ...prev,
                                  [addon.id]: parseInt(e.target.value, 10),
                                }))
                              }
                              className="bg-gray-700 border border-gray-600 rounded-xl text-xs px-2 py-1"
                            >
                              {Array.from(
                                {
                                  length: Number(addon.quantity_available) || 1,
                                },
                                (_, i) => i + 1
                              ).map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

            {rounds.length > 0 && (
              <div>
                <label className="text-sm text-gray-400 block mb-2">Rounds</label>
                <div className="space-y-2">
                  {rounds.map((r) => {
                    const id = Number(r.id);
                    const on = editRoundIds.includes(id);
                    return (
                      <label
                        key={r.id}
                        className="flex items-center gap-3 p-3 rounded-2xl border border-gray-700"
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setEditRoundIds((prev) =>
                              on ? prev.filter((x) => x !== id) : [...prev, id]
                            )
                          }
                        />
                        <span>
                          {r.name}
                          {r.start_time
                            ? ` · ${formatRoundTime(r.start_time)}`
                            : ''}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSaveEditPlayer}
                disabled={savingEdit}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 py-4 rounded-2xl font-semibold"
              >
                {savingEdit ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditReg(null);
                }}
                className="flex-1 bg-gray-700 hover:bg-gray-600 py-4 rounded-2xl font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}