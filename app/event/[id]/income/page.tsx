'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  PDFDownloadLink,
} from '@react-pdf/renderer';
import EventTabs from '@/app/components/EventTabs';
import BackButton from '@/app/components/BackButton';
import {
  amountWithPlatformFee,
  formatPlatformFeePercent,
  platformFeeFromChargedAmount,
  resolvePlatformFeePercent,
} from '@/app/libs/platform-fee';
import { computeCashPlatformFeeDue } from '@/app/libs/cash-platform-fee';

const pdfStyles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 48,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#111',
  },
  header: {
    marginBottom: 20,
    borderBottomWidth: 1.5,
    borderBottomColor: '#111',
    paddingBottom: 12,
  },
  brand: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: '#444',
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  rowIndent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
    paddingLeft: 12,
  },
  label: {
    flex: 1,
    fontSize: 10,
  },
  labelMuted: {
    flex: 1,
    fontSize: 9,
    color: '#555',
  },
  amount: {
    width: 90,
    textAlign: 'right',
    fontSize: 10,
  },
  amountMuted: {
    width: 90,
    textAlign: 'right',
    fontSize: 9,
    color: '#555',
  },
  divider: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc',
    marginVertical: 6,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: '#111',
    marginTop: 4,
  },
  totalLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: 'bold',
  },
  totalAmount: {
    width: 90,
    textAlign: 'right',
    fontSize: 11,
    fontWeight: 'bold',
  },
  netRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: '#111',
    marginTop: 12,
  },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 48,
    right: 48,
    fontSize: 8,
    color: '#888',
    textAlign: 'center',
  },
});

function money(n: number) {
  const v = Number(n) || 0;
  const abs = Math.abs(v).toFixed(2);
  return v < 0 ? `($${abs})` : `$${abs}`;
}

function IncomeStatementPDF({
  event,
  registrationRevenue,
  totalDiscounts,
  discountLines,
  addonRevenue,
  paidAddonPlayers,
  sponsorRevenue,
  paidSponsorCount,
  manualIncome,
  manualIncomeTotal,
  platformFeeDue,
  platformFeeWithheld,
  platformFeeCaption,
  greensFeesTotal,
  greensLines,
  expenses,
  manualExpenseTotal,
  totalExpenses,
  grossIncome,
  estimatedKeep,
  paidPlayerCount,
  paidSeatCount,
  isPerRound,
  generatedAt,
}: {
  event: any;
  registrationRevenue: number;
  totalDiscounts: number;
    discountLines: { code: string; players: number; rounds: number; totalSaved: number }[];
  addonRevenue: number;
  paidAddonPlayers: number;
  sponsorRevenue: number;
  paidSponsorCount: number;
  manualIncome: any[];
  manualIncomeTotal: number;
  platformFeeDue: number;
  platformFeeWithheld: number;
  platformFeeCaption: string;
  greensFeesTotal: number;
  greensLines: { label: string; amount: number; detail: string }[];
  expenses: any[];
  manualExpenseTotal: number;
  totalExpenses: number;
  grossIncome: number;
  estimatedKeep: number;
  paidPlayerCount: number;
  paidSeatCount: number;
  isPerRound: boolean;
  generatedAt: string;
}) {
  const eventDate = event?.date
    ? new Date(String(event.date) + 'T12:00:00').toLocaleDateString()
    : '';

  const regCountLabel = isPerRound
    ? `${paidSeatCount} seat${paidSeatCount === 1 ? '' : 's'} · ${paidPlayerCount} player${
        paidPlayerCount === 1 ? '' : 's'
      }`
    : `${paidPlayerCount} player${paidPlayerCount === 1 ? '' : 's'}`;

  return (
    <Document>
      <Page size="LETTER" style={pdfStyles.page}>
        <View style={pdfStyles.header}>
          <Text style={pdfStyles.brand}>Fried Egg Events</Text>
          <Text style={pdfStyles.title}>Income Statement</Text>
          <Text style={pdfStyles.subtitle}>{event?.name || 'Event'}</Text>
          <Text style={pdfStyles.subtitle}>
            {[eventDate, event?.course, event?.location]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <Text style={pdfStyles.subtitle}>Generated {generatedAt}</Text>
        </View>

        <Text style={pdfStyles.sectionTitle}>Revenue</Text>

        <View style={pdfStyles.row}>
          <Text style={pdfStyles.label}>
            Registration (net card + cash, {regCountLabel})
          </Text>
          <Text style={pdfStyles.amount}>{money(registrationRevenue)}</Text>
        </View>

                {discountLines.map((d) => (
          <View key={d.code} style={pdfStyles.rowIndent}>
            <Text style={pdfStyles.labelMuted}>
              Less: discount {d.code} (
              {isPerRound
                ? `${d.rounds} round${d.rounds === 1 ? '' : 's'} · ${d.players} player${
                    d.players === 1 ? '' : 's'
                  }`
                : `${d.players} player${d.players === 1 ? '' : 's'}`}
              )
            </Text>
            <Text style={pdfStyles.amountMuted}>{money(-d.totalSaved)}</Text>
          </View>
        ))}

        {totalDiscounts > 0 && (
          <View style={pdfStyles.row}>
            <Text style={pdfStyles.label}>Net registration revenue</Text>
            <Text style={pdfStyles.amount}>
              {money(registrationRevenue - totalDiscounts)}
            </Text>
          </View>
        )}

        <View style={pdfStyles.row}>
          <Text style={pdfStyles.label}>
            Add-ons ({paidAddonPlayers} player
            {paidAddonPlayers === 1 ? '' : 's'})
          </Text>
          <Text style={pdfStyles.amount}>{money(addonRevenue)}</Text>
        </View>

        <View style={pdfStyles.row}>
          <Text style={pdfStyles.label}>
            Sponsorships ({paidSponsorCount} sponsor
            {paidSponsorCount === 1 ? '' : 's'})
          </Text>
          <Text style={pdfStyles.amount}>{money(sponsorRevenue)}</Text>
        </View>

        {manualIncome.map((row) => (
          <View key={row.id} style={pdfStyles.row}>
            <Text style={pdfStyles.label}>
              {row.label}
              {row.category ? ` (${row.category})` : ''}
            </Text>
            <Text style={pdfStyles.amount}>{money(Number(row.amount))}</Text>
          </View>
        ))}

        <View style={pdfStyles.totalRow}>
          <Text style={pdfStyles.totalLabel}>Total revenue</Text>
          <Text style={pdfStyles.totalAmount}>{money(grossIncome)}</Text>
        </View>

        <Text style={pdfStyles.sectionTitle}>Expenses</Text>

        {platformFeeWithheld > 0 && (
          <View style={pdfStyles.row}>
            <Text style={pdfStyles.labelMuted}>
              Platform fee withheld (card, not due)
            </Text>
            <Text style={pdfStyles.amountMuted}>
              {money(platformFeeWithheld)}
            </Text>
          </View>
        )}

        <View style={pdfStyles.row}>
          <Text style={pdfStyles.label}>
            Platform fee due (cash) ({platformFeeCaption})
          </Text>
          <Text style={pdfStyles.amount}>{money(platformFeeDue)}</Text>
        </View>

        {greensLines.map((line) => (
          <View key={line.label} style={pdfStyles.row}>
            <Text style={pdfStyles.label}>
              {line.label} ({line.detail})
            </Text>
            <Text style={pdfStyles.amount}>{money(line.amount)}</Text>
          </View>
        ))}

        {greensLines.length === 0 && greensFeesTotal > 0 && (
          <View style={pdfStyles.row}>
            <Text style={pdfStyles.label}>Greens fees</Text>
            <Text style={pdfStyles.amount}>{money(greensFeesTotal)}</Text>
          </View>
        )}

        {expenses.map((row) => (
          <View key={row.id} style={pdfStyles.row}>
            <Text style={pdfStyles.label}>
              {row.label}
              {row.category ? ` (${row.category})` : ''}
            </Text>
            <Text style={pdfStyles.amount}>{money(Number(row.amount))}</Text>
          </View>
        ))}

        <View style={pdfStyles.totalRow}>
          <Text style={pdfStyles.totalLabel}>Total expenses</Text>
          <Text style={pdfStyles.totalAmount}>{money(totalExpenses)}</Text>
        </View>

        <View style={pdfStyles.netRow}>
          <Text style={pdfStyles.totalLabel}>Estimated keep</Text>
          <Text style={pdfStyles.totalAmount}>{money(estimatedKeep)}</Text>
        </View>

        <Text style={pdfStyles.footer}>
          Prepared for record-keeping · Not a formal tax return · Fried Egg
          Events
        </Text>
      </Page>
    </Document>
  );
}

export default function EventIncomePage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<any>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [addons, setAddons] = useState<any[]>([]);
  const [rounds, setRounds] = useState<any[]>([]);
  const [manualIncome, setManualIncome] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [sponsors, setSponsors] = useState<any[]>([]);
  const [platformFeePercent, setPlatformFeePercent] = useState<number | null>(
    null
  );
  const [platformFeeDollars, setPlatformFeeDollars] = useState<number | null>(
    null
  );

  const [incomeLabel, setIncomeLabel] = useState('');
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeCategory, setIncomeCategory] = useState('cash');
  const [expenseLabel, setExpenseLabel] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('other');
  const [expenseNotes, setExpenseNotes] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [feePayments, setFeePayments] = useState<any[]>([]);

  const fetchAll = async () => {
    setLoading(true);
    const id = parseInt(eventId);

    const [
      { data: ev },
      { data: regs },
      { data: ads },
      { data: rds },
      { data: inc },
      { data: exp },
      { data: fee },
      { data: sponsorRows },
      { data: feePayRows },
    ] = await Promise.all([
      supabase.from('tournaments').select('*').eq('id', id).single(),
      supabase.from('event_registrations').select('*').eq('event_id', id),
      supabase.from('event_addons').select('*').eq('event_id', id),
      supabase
        .from('event_rounds')
        .select('*')
        .eq('event_id', id)
        .order('sort_order'),
      supabase
        .from('event_income_entries')
        .select('*')
        .eq('event_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('event_expenses')
        .select('*')
        .eq('event_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('platform_settings')
        .select('platform_fee, platform_fee_percent')
        .eq('id', 1)
        .single(),
      supabase
        .from('event_sponsors')
        .select('id, company_name, amount_paid, paid, package_id')
        .eq('event_id', id)
        .eq('paid', true),
      supabase
        .from('platform_fee_payments')
        .select('*')
        .eq('event_id', id)
        .order('created_at', { ascending: false }),
    ]);

    setEvent(ev);
    setRegistrations(regs || []);
    setAddons(ads || []);
    setRounds(rds || []);
    setManualIncome(inc || []);
    setExpenses(exp || []);
    setSponsors(sponsorRows || []);
    setFeePayments(feePayRows || []);
    const settingsPercent =
      fee?.platform_fee_percent != null &&
      fee.platform_fee_percent !== '' &&
      Number.isFinite(Number(fee.platform_fee_percent))
        ? Number(fee.platform_fee_percent)
        : null;
    const settingsDollars =
      fee?.platform_fee != null && Number.isFinite(Number(fee.platform_fee))
        ? Number(fee.platform_fee)
        : null;
    const eventDollars =
      ev?.platform_fee_per_player != null &&
      Number.isFinite(Number(ev.platform_fee_per_player))
        ? Number(ev.platform_fee_per_player)
        : null;

    // /platform edits platform_fee_percent. Do not fall back to a leftover $3.
    if (settingsPercent != null) {
      setPlatformFeePercent(settingsPercent);
      setPlatformFeeDollars(null);
    } else if (eventDollars != null) {
      setPlatformFeePercent(null);
      setPlatformFeeDollars(eventDollars);
    } else if (settingsDollars != null) {
      setPlatformFeePercent(null);
      setPlatformFeeDollars(settingsDollars);
    } else {
      setPlatformFeePercent(null);
      setPlatformFeeDollars(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, [eventId]);

  const isPerRound = (event?.pricing_mode || 'event') === 'per_round';
  const isTeamEvent = Number(event?.max_teammates) > 1;
  const feeIsPercent = platformFeePercent != null;
  const feePercent =
    platformFeePercent != null
      ? resolvePlatformFeePercent(platformFeePercent)
      : 0;
  const feeDollars = platformFeeDollars != null ? Number(platformFeeDollars) : 0;

  const methodOf = (r: any) => String(r?.payment_method || '').toLowerCase();
  const isComp = (r: any) =>
    ['comp', 'complimentary'].includes(methodOf(r));
  const isCashMethod = (r: any) =>
    ['cash', 'check', 'manual', 'checkin'].includes(methodOf(r));
  const isCashPaid = (r: any) =>
    r?.paid === true && r?.refunded !== true && isCashMethod(r);
  const isOnlinePaid = (r: any) =>
    r?.paid === true &&
    r?.refunded !== true &&
    !isComp(r) &&
    !isCashMethod(r);

  const groupRegs = (regs: any[]) => {
    if (!isTeamEvent) return regs.map((r) => [r]);
    const byTeam = new Map<string, any[]>();
    const groups: any[][] = [];
    for (const r of regs) {
      const team = String(r.team_name || '').trim().toLowerCase();
      if (!team) {
        groups.push([r]);
        continue;
      }
      if (!byTeam.has(team)) byTeam.set(team, []);
      byTeam.get(team)!.push(r);
    }
    return [...groups, ...Array.from(byTeam.values())];
  };

  const checkoutSubtotal = (reg: any) => {
    if (reg?.amount_paid != null && Number(reg.amount_paid) > 0) {
      return Number(reg.amount_paid);
    }
    const selectedIds: number[] = Array.isArray(reg?.selected_round_ids)
      ? reg.selected_round_ids
      : [];
    const selectedRounds = rounds.filter((r) => selectedIds.includes(r.id));
    if (isPerRound) {
      const roundsToCharge =
        selectedRounds.length > 0 ? selectedRounds : rounds;
      return roundsToCharge.reduce((s, r) => s + Number(r.price || 0), 0);
    }
    let t = Number(event?.price || 0);
    for (const round of selectedRounds.filter((r) => r.pay_separately)) {
      t += Number(round.price || 0);
    }
    return t;
  };

  const paidCheckoutGroups = useMemo(() => {
    const paid = registrations.filter((r) => {
      if (r.refunded === true) return false;
      if (isComp(r) && !(Number(r.amount_paid) > 0 && r.paid === true)) {
        return false;
      }
      return r.paid === true;
    });
    return groupRegs(paid);
  }, [registrations, isTeamEvent]);

  const refundedCheckoutGroups = useMemo(() => {
    return groupRegs(registrations.filter((r) => r.refunded === true));
  }, [registrations, isTeamEvent]);

  const groupCheckoutAmount = (group: any[]) => {
    const withPaid = group.find(
      (r) => r.amount_paid != null && Number(r.amount_paid) > 0
    );
    if (withPaid) return Number(withPaid.amount_paid);
    return checkoutSubtotal(group[0]);
  };

  const groupIsOnline = (group: any[]) => group.some(isOnlinePaid);
  const groupIsCash = (group: any[]) => group.some(isCashPaid);
  const groupIsCardMethod = (group: any[]) =>
    group.some((r) => !isComp(r) && !isCashMethod(r));

  const withheldForOnline = (group: any[]) => {
    const charged = groupCheckoutAmount(group);
    if (feeIsPercent) {
      const fromPaid = group.some(
        (r) => r.amount_paid != null && Number(r.amount_paid) > 0
      );
      if (fromPaid) return platformFeeFromChargedAmount(charged, feePercent);
      return Math.max(
        0,
        amountWithPlatformFee(charged, feePercent) - charged
      );
    }
    return feeDollars;
  };

  const netForOnline = (group: any[]) =>
    Math.max(0, groupCheckoutAmount(group) - withheldForOnline(group));

  const feeDueForCash = (group: any[]) => {
    if (feeIsPercent) {
      const cash = groupCheckoutAmount(group);
      return Math.max(0, amountWithPlatformFee(cash, feePercent) - cash);
    }
    return feeDollars;
  };

  const paidPlayers = useMemo(
    () => registrations.filter((r) => r.paid === true && r.refunded !== true),
    [registrations]
  );

  const refundedRows = useMemo(() => {
    return registrations
      .filter((r) => r.refunded === true)
      .map((r) => {
        const m = String(r.payment_method || '').toLowerCase();
        const method = ['cash', 'check', 'manual', 'checkin'].includes(m)
          ? 'cash'
          : 'card';
        const amount =
          r.refund_amount != null && Number(r.refund_amount) > 0
            ? Number(r.refund_amount)
            : Number(r.amount_paid || 0);
        const withheld =
          method === 'card' ? withheldForOnline([r]) : 0;
        const feeDue = method === 'cash' ? feeDueForCash([r]) : 0;
        return {
          id: r.id,
          player_name: r.player_name,
          team_name: r.team_name,
          method,
          amount,
          withheld,
          feeDue,
          refunded_at: r.refunded_at,
        };
      })
      .sort((a, b) =>
        String(b.refunded_at || '').localeCompare(String(a.refunded_at || ''))
      );
  }, [registrations]);

  // Paid + comp/cash/etc. — for greens (course payment)
  const isPlayingForGreens = (r: any) => {
    if (r.refunded === true) return false;
    if (r.paid === true) return true;
    const m = String(r.payment_method || '').toLowerCase();
    return ['comp', 'complimentary', 'cash', 'manual', 'checkin'].includes(m);
  };

  // Paid + comp/cash/etc. — for greens (course payment)
  const greensPlayers = useMemo(
    () => registrations.filter(isPlayingForGreens),
    [registrations]
  );

  const paidSeatCount = useMemo(() => {
    return paidPlayers.reduce((sum, r) => {
      if (!isPerRound) return sum + 1;
      const ids: number[] = Array.isArray(r.selected_round_ids)
        ? r.selected_round_ids
        : [];
      return sum + Math.max(ids.length, 1);
    }, 0);
  }, [paidPlayers, isPerRound]);

  const { greensFeesTotal, greensLines } = useMemo(() => {
    const lines: { label: string; amount: number; detail: string }[] = [];
    let total = 0;

    if (isPerRound && rounds.length > 0) {
      for (const round of rounds) {
        const roundFee = Number(round.greens_fee ?? event?.greens_fee ?? 0);
        if (roundFee <= 0) continue;

        let playersOnRound = greensPlayers.filter((r) => {
          const ids: number[] = r.selected_round_ids || [];
          return ids.includes(round.id);
        }).length;

        const anyoneHasRounds = greensPlayers.some(
          (r) => (r.selected_round_ids || []).length > 0
        );
        if (!anyoneHasRounds) {
          playersOnRound = greensPlayers.length;
        }

        const amount = playersOnRound * roundFee;
        total += amount;
        lines.push({
          label: `Greens – ${round.name}`,
          amount,
          detail: `${playersOnRound} × $${roundFee.toFixed(2)}`,
        });
      }
    } else {
      const perPlayer = Number(event?.greens_fee || 0);
      const count =
        event?.greens_guarantee_count != null
          ? Number(event.greens_guarantee_count)
          : greensPlayers.length;
      const amount = count * perPlayer;
      total = amount;
      if (amount > 0) {
        lines.push({
          label: 'Greens fees (event)',
          amount,
          detail: `${count} × $${perPlayer.toFixed(2)}`,
        });
      }
    }

    return { greensFeesTotal: total, greensLines: lines };
  }, [isPerRound, rounds, event, greensPlayers]);

  const registrationRevenue = useMemo(() => {
    let total = 0;
    for (const group of paidCheckoutGroups) {
      if (groupIsOnline(group)) total += netForOnline(group);
      else if (groupIsCash(group)) total += groupCheckoutAmount(group);
    }
    return total;
  }, [
    paidCheckoutGroups,
    rounds,
    event,
    isPerRound,
    feeIsPercent,
    feePercent,
    feeDollars,
  ]);

    const discountSummary = useMemo(() => {
    const paid = registrations.filter(
      (r) => r.paid === true && r.refunded !== true && r.discount_code
    );
    const byCode: Record<
      string,
      { code: string; players: number; rounds: number; totalSaved: number }
    > = {};

    for (const reg of paid) {
      const code = String(reg.discount_code).toUpperCase();
      if (!byCode[code]) {
        byCode[code] = { code, players: 0, rounds: 0, totalSaved: 0 };
      }
      byCode[code].players += 1;

      const ids: number[] = Array.isArray(reg.selected_round_ids)
        ? reg.selected_round_ids
        : [];
      // Per-round: each selected round is a discounted seat; event mode: 1 unit
      const roundUnits = isPerRound ? Math.max(ids.length, 1) : 1;
      byCode[code].rounds += roundUnits;
      byCode[code].totalSaved += Number(reg.discount_amount || 0);
    }

    return Object.values(byCode).sort((a, b) => a.code.localeCompare(b.code));
  }, [registrations, isPerRound]);

  const totalDiscounts = useMemo(
    () => discountSummary.reduce((s, d) => s + d.totalSaved, 0),
    [discountSummary]
  );

  const { platformFeeDue, cashCheckoutCount } = useMemo(() => {
    const result = computeCashPlatformFeeDue({
      registrations,
      event,
      rounds,
      feeIsPercent,
      feePercent,
      feeDollars,
    });
    return {
      platformFeeDue: Number(result?.due) || 0,
      cashCheckoutCount: Number(result?.cashCheckoutCount) || 0,
    };
  }, [registrations, event, rounds, feeIsPercent, feePercent, feeDollars]);

  const { platformFeeWithheld } = useMemo(() => {
    let withheld = 0;
    for (const group of paidCheckoutGroups) {
      if (groupIsOnline(group)) withheld += withheldForOnline(group);
    }
    for (const group of refundedCheckoutGroups) {
      if (groupIsCardMethod(group)) withheld += withheldForOnline(group);
    }
    return { platformFeeWithheld: withheld };
  }, [
    paidCheckoutGroups,
    refundedCheckoutGroups,
    feeIsPercent,
    feePercent,
    feeDollars,
    rounds,
    event,
    isPerRound,
  ]);

  const paidFeePayments = useMemo(
    () =>
      (feePayments || []).filter(
        (p) => String(p.status || '').toLowerCase() === 'paid'
      ),
    [feePayments]
  );
  const feeCollected = useMemo(
    () =>
      paidFeePayments.reduce((s, p) => s + Number(p.amount || 0), 0),
    [paidFeePayments]
  );
  const feeOutstanding = Math.max(
    0,
    (Number(platformFeeDue) || 0) - (Number(feeCollected) || 0)
  );

  const platformFeeCaption = feeIsPercent
    ? `${formatPlatformFeePercent(feePercent)}% per checkout`
    : `$${feeDollars.toFixed(2)} per checkout`;

  const addonRevenue = useMemo(() => {
    const refundedIds = new Set(
      registrations
        .filter((r) => r.refunded === true)
        .map((r) => String(r.id))
    );
    const addonCats = new Set(['addon', 'add-on', 'addons']);
    const incomeByReg = new Set<string>();
    let total = 0;
    for (const row of manualIncome) {
      const cat = String(row.category || '').toLowerCase();
      if (!addonCats.has(cat)) continue;
      if (Number(row.amount) <= 0) continue;
      const rid = row.registration_id != null ? String(row.registration_id) : '';
      if (rid && refundedIds.has(rid)) continue;
      total += Number(row.amount) || 0;
      if (rid) incomeByReg.add(rid);
    }
    for (const reg of registrations) {
      if (reg.refunded === true) continue;
      if (incomeByReg.has(String(reg.id))) continue;
      const qty = reg.addon_quantities || {};
      let line = 0;
      for (const addon of addons) {
        const q = Number(qty[addon.id] ?? qty[String(addon.id)] ?? 0);
        if (q > 0) line += q * Number(addon.price_per_unit || 0);
      }
      total += line;
    }
    return total;
  }, [registrations, addons, manualIncome]);

  const paidAddonPlayers = useMemo(
    () =>
      registrations.filter((r) => {
        if (r.refunded === true) return false;
        if (r.paid_addons) return true;
        const qty = r.addon_quantities || {};
        return Object.values(qty).some((q) => Number(q) > 0);
      }).length,
    [registrations]
  );

  const sponsorRevenue = useMemo(
    () => sponsors.reduce((s, row) => s + Number(row.amount_paid || 0), 0),
    [sponsors]
  );

  const paidSponsorCount = sponsors.length;

  const manualIncomeTotal = useMemo(
    () => manualIncome.reduce((s, row) => s + Number(row.amount || 0), 0),
    [manualIncome]
  );

  const manualExpenseTotal = useMemo(
    () => expenses.reduce((s, row) => s + Number(row.amount || 0), 0),
    [expenses]
  );

  const extraManualIncome = useMemo(
    () =>
      manualIncome.filter((row) => {
        const cat = String(row.category || '').toLowerCase();
        if (
          ['registration', 'entry', 'addon', 'add-on', 'addons'].includes(
            cat
          ) &&
          (row.registration_id ||
            /^paid cash/i.test(String(row.label || '')))
        ) {
          return false;
        }
        return true;
      }),
    [manualIncome]
  );
  const extraManualIncomeTotal = extraManualIncome.reduce(
    (s, row) => s + Number(row.amount || 0),
    0
  );

  const totalExpenses = manualExpenseTotal + greensFeesTotal;
  const grossIncome =
    registrationRevenue -
    totalDiscounts +
    addonRevenue +
    sponsorRevenue +
    extraManualIncomeTotal;
  const estimatedKeep = grossIncome - totalExpenses - feeOutstanding;

  const generatedAt = useMemo(
    () =>
      new Date().toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [loading, registrations, manualIncome, expenses, sponsors]
  );

  const pdfFileName = `${String(event?.name || 'event')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')}-income-statement.pdf`;

  const addManualIncome = async () => {
    if (!incomeLabel.trim() || !incomeAmount)
      return alert('Label and amount required');
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from('event_income_entries').insert({
      event_id: parseInt(eventId),
      label: incomeLabel.trim(),
      category: incomeCategory,
      amount: Number(incomeAmount),
      created_by: user?.id || null,
    });
    setSaving(false);
    if (error) return alert(error.message);
    setIncomeLabel('');
    setIncomeAmount('');
    fetchAll();
  };

  const addExpense = async () => {
    if (!expenseLabel.trim() || !expenseAmount)
      return alert('Label and amount required');
    setSaving(true);

    let receipt_url: string | null = null;
    if (receiptFile) {
      const ext = receiptFile.name.split('.').pop();
      const path = `event-${eventId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('event-receipts')
        .upload(path, receiptFile);
      if (upErr) {
        setSaving(false);
        return alert('Receipt upload failed: ' + upErr.message);
      }
      const { data: pub } = supabase.storage
        .from('event-receipts')
        .getPublicUrl(path);
      receipt_url = pub.publicUrl;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from('event_expenses').insert({
      event_id: parseInt(eventId),
      label: expenseLabel.trim(),
      category: expenseCategory,
      amount: Number(expenseAmount),
      notes: expenseNotes || null,
      receipt_url,
      created_by: user?.id || null,
    });
    setSaving(false);
    if (error) return alert(error.message);
    setExpenseLabel('');
    setExpenseAmount('');
    setExpenseNotes('');
    setReceiptFile(null);
    fetchAll();
  };

  const deleteIncome = async (id: number) => {
    if (!confirm('Delete this income entry?')) return;
    await supabase.from('event_income_entries').delete().eq('id', id);
    fetchAll();
  };

  const deleteExpense = async (id: number) => {
    if (!confirm('Delete this expense?')) return;
    await supabase.from('event_expenses').delete().eq('id', id);
    fetchAll();
  };

  const platformFeeDueNum = Number(platformFeeDue) || 0;
  const platformFeeCollectedNum = Number(feeCollected) || 0;
  const platformFeeOutstandingNum = Math.max(
    0,
    platformFeeDueNum - platformFeeCollectedNum
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        Loading income...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-10">
        <BackButton href="/events" className="text-gray-400 hover:text-white" />

        <EventTabs eventId={eventId} variant="manage" active="income" />

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold">{event?.name}</h1>
            <p className="text-gray-400 mt-1">Income & Expenses</p>
          </div>

          <PDFDownloadLink
            document={
              <IncomeStatementPDF
                event={event}
                registrationRevenue={registrationRevenue}
                totalDiscounts={totalDiscounts}
                discountLines={discountSummary}
                addonRevenue={addonRevenue}
                paidAddonPlayers={paidAddonPlayers}
                sponsorRevenue={sponsorRevenue}
                paidSponsorCount={paidSponsorCount}
                manualIncome={extraManualIncome}
                manualIncomeTotal={extraManualIncomeTotal}
                platformFeeDue={platformFeeDueNum}
                platformFeeWithheld={platformFeeWithheld}
                platformFeeCaption={platformFeeCaption}
                greensFeesTotal={greensFeesTotal}
                greensLines={greensLines}
                expenses={expenses}
                manualExpenseTotal={manualExpenseTotal}
                totalExpenses={totalExpenses}
                grossIncome={grossIncome}
                estimatedKeep={estimatedKeep}
                paidPlayerCount={paidPlayers.length}
                paidSeatCount={paidSeatCount}
                isPerRound={isPerRound}
                generatedAt={generatedAt}
              />
            }
            fileName={pdfFileName}
            className="inline-flex justify-center px-6 py-4 bg-emerald-600 hover:bg-emerald-700 rounded-2xl font-semibold text-center"
          >
            {({ loading: pdfLoading }) =>
              pdfLoading ? 'Preparing PDF…' : '📄 Download Income Statement'
            }
          </PDFDownloadLink>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-gray-800 rounded-3xl p-6">
            <p className="text-gray-400 text-sm">Revenue (net card + cash)</p>
            <p className="text-3xl font-bold text-emerald-400 mt-2">
              ${(registrationRevenue - totalDiscounts).toFixed(2)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {isPerRound
                ? `${paidSeatCount} paid seats · ${paidPlayers.length} player${
                    paidPlayers.length === 1 ? '' : 's'
                  }`
                : `${paidPlayers.length} paid player${
                    paidPlayers.length === 1 ? '' : 's'
                  }`}
              {totalDiscounts > 0 && (
                <span className="text-amber-400">
                  {' '}
                  · −${totalDiscounts.toFixed(2)} discounts
                </span>
              )}
            </p>
          </div>
          <div className="bg-gray-800 rounded-3xl p-6">
            <p className="text-gray-400 text-sm">Add-ons</p>
            <p className="text-3xl font-bold text-emerald-400 mt-2">
              ${addonRevenue.toFixed(2)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {paidAddonPlayers} paid add-on players
            </p>
          </div>
          <div className="bg-gray-800 rounded-3xl p-6">
            <p className="text-gray-400 text-sm">Sponsorships</p>
            <p className="text-3xl font-bold text-emerald-400 mt-2">
              ${sponsorRevenue.toFixed(2)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {paidSponsorCount} paid sponsor
              {paidSponsorCount === 1 ? '' : 's'}
            </p>
          </div>
          <div className="bg-gray-800 rounded-3xl p-6">
            <p className="text-gray-400 text-sm">Other income</p>
            <p className="text-3xl font-bold text-emerald-400 mt-2">
              ${extraManualIncomeTotal.toFixed(2)}
            </p>
          </div>
          <div className="bg-gray-800 rounded-3xl p-6">
            <p className="text-gray-400 text-sm">Estimated keep</p>
            <p
              className={`text-3xl font-bold mt-2 ${
                estimatedKeep >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              ${estimatedKeep.toFixed(2)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Revenue ${grossIncome.toFixed(2)} · Expenses $
              {totalExpenses.toFixed(2)} · Fee outstanding $
              {platformFeeOutstandingNum.toFixed(2)}
            </p>
          </div>
        </div>

        {refundedRows.length > 0 && (
          <details className="bg-gray-800 rounded-3xl p-6 md:p-8">
            <summary className="cursor-pointer text-xl font-semibold flex items-center justify-between gap-3">
              <span>Refunded ({refundedRows.length})</span>
              <span className="text-sm font-normal text-gray-500">
                Not in totals
              </span>
            </summary>
            <p className="text-sm text-gray-500 mt-3">
              History only. These amounts are not in revenue, net to organizer,
              cash-in, or platform fee due.
            </p>
            <div className="mt-4 space-y-2">
              {refundedRows.map((r) => {
                const when = r.refunded_at
                  ? new Date(r.refunded_at).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })
                  : null;
                return (
                  <div
                    key={r.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 bg-gray-900 rounded-2xl px-5 py-4"
                  >
                    <div>
                      <div className="font-medium">
                        {r.player_name || 'Player'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {[r.team_name || '—', r.method, when]
                          .filter(Boolean)
                          .join(' · ')}
                        {r.method === 'card' && r.withheld > 0
                          ? ` · platform fee withheld $${r.withheld.toFixed(2)}`
                          : ''}
                        {r.method === 'cash' && r.feeDue > 0
                          ? ` · fee due $${r.feeDue.toFixed(2)} still owed`
                          : ''}
                      </div>
                    </div>
                    <span className="text-gray-400 font-semibold">
                      {r.amount > 0
                        ? `−$${r.amount.toFixed(2)}`
                        : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </details>
        )}

        <div className="bg-gray-800 rounded-3xl p-6 md:p-8">
          <h2 className="text-2xl font-semibold mb-6">Income summary</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-gray-900 rounded-2xl px-5 py-4">
              <div>
                <div className="font-medium">Net to organizer</div>
                <div className="text-sm text-gray-500">
                  Card net + full cash
                  {isPerRound
                    ? ` · ${paidSeatCount} seat${
                        paidSeatCount === 1 ? '' : 's'
                      } · ${paidPlayers.length} player${
                        paidPlayers.length === 1 ? '' : 's'
                      }`
                    : ` · ${paidPlayers.length} player${
                        paidPlayers.length === 1 ? '' : 's'
                      }`}
                  {platformFeeWithheld > 0 && (
                    <span className="block text-gray-500">
                      Platform fee withheld: ${platformFeeWithheld.toFixed(2)}{' '}
                      (not due)
                    </span>
                  )}
                </div>
              </div>
              <span className="text-emerald-400 font-semibold text-lg">
                ${registrationRevenue.toFixed(2)}
              </span>
            </div>

                        {discountSummary.map((d) => (
              <div
                key={d.code}
                className="flex justify-between items-center bg-gray-900/70 rounded-2xl px-5 py-4 border border-amber-900/40"
              >
                <div>
                  <div className="font-medium text-amber-300">{d.code}</div>
                  <div className="text-sm text-gray-500">
                    {d.players} player{d.players === 1 ? '' : 's'}
                  </div>
                </div>
                <span className="text-amber-400 font-semibold text-lg">
                  −${d.totalSaved.toFixed(2)}
                </span>
              </div>
            ))}

            <div className="flex justify-between items-center bg-gray-900 rounded-2xl px-5 py-4">
              <div>
                <div className="font-medium">Add-ons</div>
                <div className="text-sm text-gray-500">
                  {paidAddonPlayers} player
                  {paidAddonPlayers === 1 ? '' : 's'}
                </div>
              </div>
              <span className="text-emerald-400 font-semibold text-lg">
                ${addonRevenue.toFixed(2)}
              </span>
            </div>

            <div className="flex justify-between items-center bg-gray-900 rounded-2xl px-5 py-4">
              <div>
                <div className="font-medium">Sponsorships</div>
                <div className="text-sm text-gray-500">
                  {paidSponsorCount} sponsor
                  {paidSponsorCount === 1 ? '' : 's'}
                </div>
              </div>
              <span className="text-emerald-400 font-semibold text-lg">
                ${sponsorRevenue.toFixed(2)}
              </span>
            </div>

            {sponsors.map((s) => (
              <div
                key={s.id}
                className="flex justify-between items-center bg-gray-900/50 rounded-2xl px-5 py-3 ml-2 border border-gray-800"
              >
                <div className="text-sm text-gray-300">{s.company_name}</div>
                <span className="text-emerald-400/90 text-sm font-medium">
                  ${Number(s.amount_paid || 0).toFixed(2)}
                </span>
              </div>
            ))}

            <div className="flex justify-between items-center bg-gray-900 rounded-2xl px-5 py-4">
              <div>
                <div className="font-medium">Other income</div>
                <div className="text-sm text-gray-500">
                  {extraManualIncome.length} entr
                  {extraManualIncome.length === 1 ? 'y' : 'ies'}
                </div>
              </div>
              <span className="text-emerald-400 font-semibold text-lg">
                ${extraManualIncomeTotal.toFixed(2)}
              </span>
            </div>

            <div className="flex justify-between items-center border-t border-gray-700 pt-4 px-1">
              <div className="font-semibold text-lg">Revenue</div>
              <span className="text-emerald-400 font-bold text-xl">
                ${grossIncome.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center px-1">
              <div className="text-sm text-gray-400">
                Platform fee due (cash) · {platformFeeCaption}
              </div>
              <span className="text-amber-400 font-semibold">
                ${platformFeeDueNum.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center px-1">
              <div className="text-sm text-gray-400">Expenses</div>
              <span className="text-amber-400 font-semibold">
                ${totalExpenses.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center px-1">
              <div className="font-semibold">Estimated keep</div>
              <span
                className={`font-bold text-xl ${
                  estimatedKeep >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                ${estimatedKeep.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-3xl p-6 md:p-8 space-y-6">
          <h2 className="text-2xl font-semibold">Add cash / other income</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input
              value={incomeLabel}
              onChange={(e) => setIncomeLabel(e.target.value)}
              placeholder="Label (e.g. Cash mulligans)"
              className="md:col-span-2 bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
            />
            <select
              value={incomeCategory}
              onChange={(e) => setIncomeCategory(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
            >
              <option value="cash">Cash</option>
              <option value="registration">Registration</option>
              <option value="addon">Add-on</option>
              <option value="round">Round</option>
              <option value="other">Other</option>
            </select>
            <input
              type="number"
              step="0.01"
              value={incomeAmount}
              onChange={(e) => setIncomeAmount(e.target.value)}
              placeholder="Amount"
              className="bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
            />
          </div>
          <button
            onClick={addManualIncome}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 px-8 py-4 rounded-2xl font-semibold"
          >
            Add income
          </button>

          <div className="space-y-3 pt-4">
            {manualIncome.map((row) => (
              <div
                key={row.id}
                className="flex justify-between items-center bg-gray-900 rounded-2xl px-5 py-4"
              >
                <div>
                  <div className="font-medium">{row.label}</div>
                  <div className="text-xs text-gray-500">{row.category}</div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-emerald-400 font-semibold">
                    ${Number(row.amount).toFixed(2)}
                  </span>
                  <button
                    onClick={() => deleteIncome(row.id)}
                    className="text-red-400 text-sm"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-800 rounded-3xl p-6 md:p-8 space-y-6">
          <h2 className="text-2xl font-semibold">Expenses</h2>

          <div className="bg-gray-900 rounded-3xl p-6">
            <div className="flex justify-between items-start gap-4">
              <div>
                <p className="text-gray-400 text-sm">
                  Platform cash fees
                </p>
                <p className="text-3xl font-bold text-amber-400 mt-2">
                  ${platformFeeOutstandingNum.toFixed(2)} outstanding
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Platform fee {platformFeeCaption}
                </p>
                <div className="text-sm text-gray-300 mt-3 space-y-1">
                  <div>Fee due (cash): ${platformFeeDueNum.toFixed(2)}</div>
                  <div>Fee collected: ${platformFeeCollectedNum.toFixed(2)}</div>
                  <div>
                    Fee outstanding: ${platformFeeOutstandingNum.toFixed(2)}
                    {cashCheckoutCount > 0
                      ? ` · ${cashCheckoutCount} cash spot${
                          cashCheckoutCount === 1 ? '' : 's'
                        }`
                      : ''}
                  </div>
                </div>
                {platformFeeWithheld > 0 && (
                  <p className="text-xs text-gray-500 mt-2">
                    Platform fee withheld: ${platformFeeWithheld.toFixed(2)}{' '}
                    (card / Apple Pay / Connect — not due)
                  </p>
                )}
                {paidFeePayments.length > 0 && (
                  <div className="mt-4 space-y-2 border-t border-gray-800 pt-3">
                    {paidFeePayments.map((p) => (
                      <div
                        key={p.id}
                        className="flex justify-between text-xs text-gray-400 gap-3"
                      >
                        <span>
                          {p.created_at
                            ? new Date(p.created_at).toLocaleDateString()
                            : '—'}
                          {p.stripe_transfer_id
                            ? ` · ${p.stripe_transfer_id}`
                            : ''}
                        </span>
                        <span>${Number(p.amount || 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-gray-900 rounded-3xl p-6 space-y-3">
            <div className="flex justify-between items-start gap-4">
              <div>
                <p className="text-gray-400 text-sm">Greens fees (auto)</p>
                <p className="text-3xl font-bold text-amber-400 mt-2">
                  ${greensFeesTotal.toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {isPerRound
                    ? 'Per-round: playing players (paid + comp) on each round × that round’s greens fee'
                    : 'Event: playing players (paid + comp) × event greens fee'}
                  {greensPlayers.length !== paidPlayers.length && (
                    <span className="text-teal-400">
                      {' '}
                      · {greensPlayers.length} playing · {paidPlayers.length} paid
                    </span>
                  )}
                </p>
              </div>
            </div>
            {greensLines.length > 0 ? (
              <div className="space-y-2 pt-2 border-t border-gray-800">
                {greensLines.map((line) => (
                  <div
                    key={line.label}
                    className="flex justify-between text-sm text-gray-300"
                  >
                    <span>
                      {line.label}{' '}
                      <span className="text-gray-500">({line.detail})</span>
                    </span>
                    <span className="text-amber-400 font-medium">
                      ${line.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                No greens calculated — set greens fee on the event or each round
                in Manage.
              </p>
            )}
          </div>

          <h3 className="text-lg font-medium text-gray-300">Add expense</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              value={expenseLabel}
              onChange={(e) => setExpenseLabel(e.target.value)}
              placeholder="Expense label"
              className="bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
            />
            <input
              type="number"
              step="0.01"
              value={expenseAmount}
              onChange={(e) => setExpenseAmount(e.target.value)}
              placeholder="Amount"
              className="bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
            />
            <select
              value={expenseCategory}
              onChange={(e) => setExpenseCategory(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
            >
              <option value="course">Course / green fees</option>
              <option value="food">Food & beverage</option>
              <option value="prizes">Prizes</option>
              <option value="supplies">Supplies</option>
              <option value="other">Other</option>
            </select>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
              className="bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4 text-sm"
            />
            <input
              value={expenseNotes}
              onChange={(e) => setExpenseNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="md:col-span-2 bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
            />
          </div>
          <button
            onClick={addExpense}
            disabled={saving}
            className="bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 px-8 py-4 rounded-2xl font-semibold"
          >
            Add expense
          </button>

          <div className="space-y-3 pt-4">
            {expenses.map((row) => (
              <div
                key={row.id}
                className="flex justify-between items-center bg-gray-900 rounded-2xl px-5 py-4 gap-4"
              >
                <div className="min-w-0">
                  <div className="font-medium">{row.label}</div>
                  <div className="text-xs text-gray-500">
                    {row.category}
                    {row.notes ? ` · ${row.notes}` : ''}
                  </div>
                  {row.receipt_url && (
                    <a
                      href={row.receipt_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-400 text-sm"
                    >
                      View receipt →
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-red-400 font-semibold">
                    −${Number(row.amount).toFixed(2)}
                  </span>
                  <button
                    onClick={() => deleteExpense(row.id)}
                    className="text-red-400 text-sm"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}