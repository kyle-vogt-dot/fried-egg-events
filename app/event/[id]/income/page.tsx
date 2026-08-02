'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

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
  const [platformFee, setPlatformFee] = useState(0);

  // forms
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
      supabase.from('platform_settings').select('platform_fee').eq('id', 1).single(),
    ]);

    setEvent(ev);
    setRegistrations(regs || []);
    setAddons(ads || []);
    setRounds(rds || []);
    setManualIncome(inc || []);
    setExpenses(exp || []);
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

  // Greens: per-round = sum(players on round × round.greens_fee)
  // Event mode = billable count × event.greens_fee
  const { greensFeesTotal, greensLines } = useMemo(() => {
    const lines: { label: string; amount: number; detail: string }[] = [];
    let total = 0;

    if (isPerRound && rounds.length > 0) {
      for (const round of rounds) {
        const roundFee = Number(round.greens_fee ?? event?.greens_fee ?? 0);
        if (roundFee <= 0) continue;

        // Players who paid and selected this round
        let playersOnRound = paidPlayers.filter((r) => {
          const ids: number[] = r.selected_round_ids || [];
          return ids.includes(round.id);
        }).length;

        // Fallback: if nobody has selected_round_ids, use all paid players
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

  const manualIncomeTotal = useMemo(
    () => manualIncome.reduce((s, row) => s + Number(row.amount || 0), 0),
    [manualIncome]
  );

  const manualExpenseTotal = useMemo(
    () => expenses.reduce((s, row) => s + Number(row.amount || 0), 0),
    [expenses]
  );

  const totalExpenses = manualExpenseTotal + greensFeesTotal;
  const grossIncome = registrationRevenue + addonRevenue + manualIncomeTotal;
  const net = grossIncome - totalExpenses;

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

        <div>
          <h1 className="text-4xl font-bold">{event?.name}</h1>
          <p className="text-gray-400 mt-1">Income & Expenses</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-3xl p-6">
            <p className="text-gray-400 text-sm">Registrations (est.)</p>
            <p className="text-3xl font-bold text-emerald-400 mt-2">
              ${registrationRevenue.toFixed(2)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {paidPlayers.length} paid players
            </p>
          </div>
          <div className="bg-gray-800 rounded-3xl p-6">
            <p className="text-gray-400 text-sm">Add-ons</p>
            <p className="text-3xl font-bold text-emerald-400 mt-2">
              ${addonRevenue.toFixed(2)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {registrations.filter((r) => r.paid_addons).length} paid add-on
              players
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

        {/* Paid players breakdown */}
        <div className="bg-gray-800 rounded-3xl p-6 md:p-8">
          <h2 className="text-2xl font-semibold mb-6">Paid registrations</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-gray-400 border-b border-gray-700">
                <tr>
                  <th className="py-3 pr-4">Player</th>
                  <th className="py-3 pr-4">Team</th>
                  <th className="py-3 pr-4">Paid</th>
                  <th className="py-3 pr-4">Add-ons paid</th>
                  <th className="py-3">Rounds</th>
                </tr>
              </thead>
              <tbody>
                {registrations
                  .filter((r) => r.paid || r.paid_addons)
                  .map((r) => {
                    const ids: number[] = r.selected_round_ids || [];
                    const names = rounds
                      .filter((rd) => ids.includes(rd.id))
                      .map((rd) => rd.name)
                      .join(', ');
                    return (
                      <tr key={r.id} className="border-b border-gray-700/60">
                        <td className="py-3 pr-4">{r.player_name}</td>
                        <td className="py-3 pr-4 text-gray-400">
                          {r.team_name || '—'}
                        </td>
                        <td className="py-3 pr-4">
                          {r.paid ? (
                            <span className="text-emerald-400">Yes</span>
                          ) : (
                            <span className="text-gray-500">No</span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          {r.paid_addons ? (
                            <span className="text-emerald-400">Yes</span>
                          ) : (
                            <span className="text-gray-500">No</span>
                          )}
                        </td>
                        <td className="py-3 text-gray-400">{names || '—'}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            {registrations.filter((r) => r.paid || r.paid_addons).length ===
              0 && (
              <p className="text-gray-500 py-6">No paid registrations yet.</p>
            )}
          </div>
        </div>

        {/* Manual income */}
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

        {/* Expenses */}
        <div className="bg-gray-800 rounded-3xl p-6 md:p-8 space-y-6">
          <h2 className="text-2xl font-semibold">Expenses</h2>

          {/* Auto greens breakdown */}
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