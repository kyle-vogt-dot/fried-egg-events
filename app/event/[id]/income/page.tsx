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
  platformFeeTotal,
  platformFeeCount,
  platformFeeRate,
  greensFeesTotal,
  greensLines,
  expenses,
  manualExpenseTotal,
  totalExpenses,
  grossIncome,
  net,
  paidPlayerCount,
  paidSeatCount,
  isPerRound,
  generatedAt,
}: {
  event: any;
  registrationRevenue: number;
  totalDiscounts: number;
  discountLines: { code: string; players: number; totalSaved: number }[];
  addonRevenue: number;
  paidAddonPlayers: number;
  sponsorRevenue: number;
  paidSponsorCount: number;
  manualIncome: any[];
  manualIncomeTotal: number;
  platformFeeTotal: number;
  platformFeeCount: number;
  platformFeeRate: number;
  greensFeesTotal: number;
  greensLines: { label: string; amount: number; detail: string }[];
  expenses: any[];
  manualExpenseTotal: number;
  totalExpenses: number;
  grossIncome: number;
  net: number;
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
            Registration fees ({regCountLabel}, full price)
          </Text>
          <Text style={pdfStyles.amount}>{money(registrationRevenue)}</Text>
        </View>

        {discountLines.map((d) => (
          <View key={d.code} style={pdfStyles.rowIndent}>
            <Text style={pdfStyles.labelMuted}>
              Less: discount {d.code} ({d.players} player
              {d.players === 1 ? '' : 's'})
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

        <View style={pdfStyles.row}>
          <Text style={pdfStyles.label}>
            Platform fees ({platformFeeCount} × {money(platformFeeRate)})
          </Text>
          <Text style={pdfStyles.amount}>{money(platformFeeTotal)}</Text>
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
          <Text style={pdfStyles.totalLabel}>Net income (loss)</Text>
          <Text style={pdfStyles.totalAmount}>{money(net)}</Text>
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
  const [platformFee, setPlatformFee] = useState(0);

  const [incomeLabel, setIncomeLabel] = useState('');
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeCategory, setIncomeCategory] = useState('cash');
  const [expenseLabel, setExpenseLabel] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('other');
  const [expenseNotes, setExpenseNotes] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

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
        .select('platform_fee')
        .eq('id', 1)
        .single(),
      supabase
        .from('event_sponsors')
        .select('id, company_name, amount_paid, paid, package_id')
        .eq('event_id', id)
        .eq('paid', true),
    ]);

    setEvent(ev);
    setRegistrations(regs || []);
    setAddons(ads || []);
    setRounds(rds || []);
    setManualIncome(inc || []);
    setExpenses(exp || []);
    setSponsors(sponsorRows || []);
    if (fee?.platform_fee != null) setPlatformFee(Number(fee.platform_fee));
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, [eventId]);

  const isPerRound = (event?.pricing_mode || 'event') === 'per_round';
  const fee = platformFee;

  const paidPlayers = useMemo(
    () => registrations.filter((r) => r.paid),
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

        let playersOnRound = paidPlayers.filter((r) => {
          const ids: number[] = r.selected_round_ids || [];
          return ids.includes(round.id);
        }).length;

        const anyoneHasRounds = paidPlayers.some(
          (r) => (r.selected_round_ids || []).length > 0
        );
        if (!anyoneHasRounds) {
          playersOnRound = paidPlayers.length;
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
          : paidPlayers.length;
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
  }, [isPerRound, rounds, event, paidPlayers]);

  const registrationRevenue = useMemo(() => {
    const paid = registrations.filter((r) => r.paid);
    let total = 0;

    for (const reg of paid) {
      const selectedIds: number[] = reg.selected_round_ids || [];
      const selectedRounds = rounds.filter((r) => selectedIds.includes(r.id));

      if (isPerRound) {
        const roundsToCharge =
          selectedRounds.length > 0 ? selectedRounds : rounds;
        for (const round of roundsToCharge) {
          total += Number(round.price || 0) + fee;
        }
      } else {
        total += Number(event?.price || 0) + fee;
        for (const round of selectedRounds.filter((r) => r.pay_separately)) {
          total += Number(round.price || 0) + fee;
        }
      }
    }
    return total;
  }, [registrations, rounds, event, isPerRound, fee]);

  const discountSummary = useMemo(() => {
    const paid = registrations.filter((r) => r.paid && r.discount_code);
    const byCode: Record<
      string,
      { code: string; players: number; totalSaved: number }
    > = {};

    for (const reg of paid) {
      const code = String(reg.discount_code).toUpperCase();
      if (!byCode[code]) {
        byCode[code] = { code, players: 0, totalSaved: 0 };
      }
      byCode[code].players += 1;
      byCode[code].totalSaved += Number(reg.discount_amount || 0);
    }

    return Object.values(byCode).sort((a, b) => a.code.localeCompare(b.code));
  }, [registrations]);

  const totalDiscounts = useMemo(
    () => discountSummary.reduce((s, d) => s + d.totalSaved, 0),
    [discountSummary]
  );

  const { platformFeeTotal, platformFeeCount } = useMemo(() => {
    const paid = registrations.filter((r) => r.paid);
    let total = 0;
    let feeUnits = 0;

    for (const reg of paid) {
      const selectedIds: number[] = reg.selected_round_ids || [];
      const selectedRounds = rounds.filter((r) => selectedIds.includes(r.id));

      if (isPerRound) {
        const roundsToCharge =
          selectedRounds.length > 0 ? selectedRounds : rounds;
        const units = roundsToCharge.length || 1;
        total += units * fee;
        feeUnits += units;
      } else {
        total += fee;
        feeUnits += 1;
        for (const round of selectedRounds.filter((r) => r.pay_separately)) {
          total += fee;
          feeUnits += 1;
        }
      }
    }

    return { platformFeeTotal: total, platformFeeCount: feeUnits };
  }, [registrations, rounds, isPerRound, fee]);

  const addonRevenue = useMemo(() => {
    let total = 0;
    for (const reg of registrations.filter((r) => r.paid_addons)) {
      const qty = reg.addon_quantities || {};
      for (const addon of addons) {
        const q = Number(qty[addon.id] ?? qty[String(addon.id)] ?? 0);
        if (q > 0) total += q * Number(addon.price_per_unit || 0);
      }
    }
    return total;
  }, [registrations, addons]);

  const paidAddonPlayers = useMemo(
    () => registrations.filter((r) => r.paid_addons).length,
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

  const totalExpenses = manualExpenseTotal + greensFeesTotal + platformFeeTotal;
  const grossIncome =
    registrationRevenue -
    totalDiscounts +
    addonRevenue +
    sponsorRevenue +
    manualIncomeTotal;
  const net = grossIncome - totalExpenses;

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
        <button
          onClick={() => router.back()}
          className="text-gray-400 hover:text-white"
        >
          ← Back
        </button>

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
                manualIncome={manualIncome}
                manualIncomeTotal={manualIncomeTotal}
                platformFeeTotal={platformFeeTotal}
                platformFeeCount={platformFeeCount}
                platformFeeRate={fee}
                greensFeesTotal={greensFeesTotal}
                greensLines={greensLines}
                expenses={expenses}
                manualExpenseTotal={manualExpenseTotal}
                totalExpenses={totalExpenses}
                grossIncome={grossIncome}
                net={net}
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
            <p className="text-gray-400 text-sm">Registrations (est.)</p>
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
            <p className="text-gray-400 text-sm">Manual / cash entries</p>
            <p className="text-3xl font-bold text-emerald-400 mt-2">
              ${manualIncomeTotal.toFixed(2)}
            </p>
          </div>
          <div className="bg-gray-800 rounded-3xl p-6">
            <p className="text-gray-400 text-sm">Net (income − expenses)</p>
            <p
              className={`text-3xl font-bold mt-2 ${
                net >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              ${net.toFixed(2)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Gross ${grossIncome.toFixed(2)} · Expenses $
              {totalExpenses.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="bg-gray-800 rounded-3xl p-6 md:p-8">
          <h2 className="text-2xl font-semibold mb-6">Income summary</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-gray-900 rounded-2xl px-5 py-4">
              <div>
                <div className="font-medium">Registered players</div>
                <div className="text-sm text-gray-500">
                  {isPerRound
                    ? `${paidSeatCount} seat${
                        paidSeatCount === 1 ? '' : 's'
                      } · ${paidPlayers.length} player${
                        paidPlayers.length === 1 ? '' : 's'
                      } (full price)`
                    : `${paidPlayers.length} player${
                        paidPlayers.length === 1 ? '' : 's'
                      } (full price)`}
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
                <div className="font-medium">Manual / cash income</div>
                <div className="text-sm text-gray-500">
                  {manualIncome.length} entr
                  {manualIncome.length === 1 ? 'y' : 'ies'}
                </div>
              </div>
              <span className="text-emerald-400 font-semibold text-lg">
                ${manualIncomeTotal.toFixed(2)}
              </span>
            </div>

            <div className="flex justify-between items-center border-t border-gray-700 pt-4 px-1">
              <div className="font-semibold text-lg">Total income</div>
              <span className="text-emerald-400 font-bold text-xl">
                ${grossIncome.toFixed(2)}
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
                <p className="text-gray-400 text-sm">Platform fee (auto)</p>
                <p className="text-3xl font-bold text-amber-400 mt-2">
                  ${platformFeeTotal.toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {platformFeeCount} fee unit
                  {platformFeeCount === 1 ? '' : 's'} × ${fee.toFixed(2)}
                  {paidPlayers.length > 0
                    ? ` · ${paidPlayers.length} paid player${
                        paidPlayers.length === 1 ? '' : 's'
                      }`
                    : ''}
                </p>
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
                    ? 'Per-round: players on each round × that round’s greens fee'
                    : 'Event: paid players × event greens fee'}
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