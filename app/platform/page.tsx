'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export default function PlatformAdminPage() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feeInput, setFeeInput] = useState('3.00');
  const [message, setMessage] = useState('');
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // ---------- Events for Add Player ----------
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [rounds, setRounds] = useState<any[]>([]);
  const [selectedRoundIds, setSelectedRoundIds] = useState<number[]>([]);

  // ---------- Add Player form ----------
  const [playerName, setPlayerName] = useState('');
  const [playerEmail, setPlayerEmail] = useState('');
  const [teamName, setTeamName] = useState('');
  const [chargeType, setChargeType] = useState<'free' | 'charge'>('free');
  const [customAmount, setCustomAmount] = useState('');
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [addPlayerMessage, setAddPlayerMessage] = useState('');

  // ---------- Discount codes ----------
  const [discountCodes, setDiscountCodes] = useState<any[]>([]);
  const [newCode, setNewCode] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<'fixed' | 'percent'>('fixed');
  const [newAmount, setNewAmount] = useState('');
  const [newMaxUses, setNewMaxUses] = useState('');
  const [newExpiresAt, setNewExpiresAt] = useState('');
  const [savingCode, setSavingCode] = useState(false);
  const [codeMessage, setCodeMessage] = useState('');

  const ALLOWED_EMAILS = ['kyle-vogt@hotmail.com'];

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login?redirect=/platform');
        return;
      }

      setUserEmail(user.email || null);

      if (!ALLOWED_EMAILS.includes(user.email || '')) {
        router.push('/');
        return;
      }

      // Platform fee
      const { data: feeData } = await supabase
        .from('platform_settings')
        .select('platform_fee')
        .eq('id', 1)
        .single();

      if (feeData?.platform_fee !== undefined && feeData?.platform_fee !== null) {
        setFeeInput(Number(feeData.platform_fee).toFixed(2));
      }

      // Events list
      const { data: eventsData } = await supabase
        .from('tournaments')
        .select('id, name, date, price, pricing_mode, max_teammates, location, course')
        .eq('is_active', true)
        .order('date', { ascending: true });

      setEvents(eventsData || []);

      // Existing global discount codes
      await loadDiscountCodes();

      setLoading(false);
    };

    init();
  }, [supabase, router]);

  const loadDiscountCodes = async () => {
    const { data } = await supabase
      .from('discount_codes')
      .select('*')
      .is('event_id', null)
      .order('created_at', { ascending: false });
    setDiscountCodes(data || []);
  };

  // When event changes, load its rounds
  useEffect(() => {
    const loadRounds = async () => {
      if (!selectedEventId) {
        setSelectedEvent(null);
        setRounds([]);
        setSelectedRoundIds([]);
        return;
      }

      const event = events.find((e) => String(e.id) === String(selectedEventId));
      setSelectedEvent(event || null);

      const { data: roundsData } = await supabase
        .from('event_rounds')
        .select('*')
        .eq('event_id', parseInt(selectedEventId))
        .order('sort_order', { ascending: true });

      setRounds(roundsData || []);
      setSelectedRoundIds([]);
    };

    loadRounds();
  }, [selectedEventId, events, supabase]);

  const handleSaveFee = async () => {
    setSaving(true);
    setMessage('');

    const fee = Number(feeInput) || 0;

    const { error } = await supabase
      .from('platform_settings')
      .update({
        platform_fee: fee,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    if (error) {
      setMessage('Failed to save: ' + error.message);
    } else {
      setMessage('✅ Fee updated successfully');
    }

    setSaving(false);
  };

  // ---------- Add Player ----------
  const handleAddPlayer = async () => {
    setAddPlayerMessage('');
    setAddingPlayer(true);

    try {
      if (!selectedEventId) {
        setAddPlayerMessage('Please select an event');
        setAddingPlayer(false);
        return;
      }
      if (!playerName.trim()) {
        setAddPlayerMessage('Player name is required');
        setAddingPlayer(false);
        return;
      }
      if (!playerEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(playerEmail.trim())) {
        setAddPlayerMessage('Valid email is required');
        setAddingPlayer(false);
        return;
      }

      const isPerRound = (selectedEvent?.pricing_mode || 'event') === 'per_round';

      if (isPerRound && selectedRoundIds.length === 0) {
        setAddPlayerMessage('Please select at least one round');
        setAddingPlayer(false);
        return;
      }

      // Calculate amount if charging
      let amountToCharge = 0;

      if (chargeType === 'charge') {
        if (customAmount.trim() !== '') {
          amountToCharge = Number(customAmount) || 0;
        } else if (isPerRound) {
          // Sum selected rounds + platform fee
          const fee = Number(feeInput) || 0;
          amountToCharge = selectedRoundIds.reduce((sum, id) => {
            const r = rounds.find((x) => x.id === id);
            return sum + (Number(r?.price || 0) + fee);
          }, 0);
        } else {
          const fee = Number(feeInput) || 0;
          amountToCharge = (Number(selectedEvent?.price) || 0) + fee;
        }
      }

      // Insert registration
      const row: any = {
        event_id: parseInt(selectedEventId),
        user_id: null,
        player_name: playerName.trim(),
        player_email: playerEmail.trim().toLowerCase(),
        team_name: teamName.trim() || null,
        paid: chargeType === 'free',
        checked_in: false,
        addons_selected: {},
        selected_round_ids: isPerRound ? selectedRoundIds : [],
        discount_code: null,
        discount_amount: 0,
      };

      const { data: inserted, error: insertErr } = await supabase
        .from('event_registrations')
        .insert(row)
        .select('*')
        .single();

      if (insertErr) {
        setAddPlayerMessage('Failed to add player: ' + insertErr.message);
        setAddingPlayer(false);
        return;
      }

      // If charging, create a payment link
      if (chargeType === 'charge' && amountToCharge > 0 && inserted) {
        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL || window.location.origin;

        const response = await fetch('/api/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: amountToCharge,
            player_name: playerName.trim(),
            email: playerEmail.trim().toLowerCase(),
            description: `Registration for ${selectedEvent?.name}`,
            event_name: selectedEvent?.name,
            event_id: selectedEvent?.id,
            type: 'registration',
            registration_id: inserted.id,
            success_url: `${baseUrl}/event/${selectedEventId}?payment=success&type=registration`,
            cancel_url: `${baseUrl}/event/${selectedEventId}`,
          }),
        });

        const { url } = await response.json();

        if (url) {
          setAddPlayerMessage(
            `✅ Player added (unpaid). Payment link:\n${url}`
          );
          // Optionally copy to clipboard
          try {
            await navigator.clipboard.writeText(url);
            setAddPlayerMessage(
              (prev) => prev + '\n\n(Link copied to clipboard)'
            );
          } catch {}
        } else {
          setAddPlayerMessage(
            '✅ Player added, but failed to create payment link. You can still mark them paid later.'
          );
        }
      } else {
        setAddPlayerMessage(
          chargeType === 'free'
            ? `✅ ${playerName.trim()} added as FREE / COMP`
            : `✅ ${playerName.trim()} added`
        );
      }

      // Reset form
      setPlayerName('');
      setPlayerEmail('');
      setTeamName('');
      setCustomAmount('');
      setSelectedRoundIds([]);
      setChargeType('free');
    } catch (err: any) {
      console.error(err);
      setAddPlayerMessage('Error: ' + (err.message || 'Something went wrong'));
    } finally {
      setAddingPlayer(false);
    }
  };

  // ---------- Discount Codes ----------
  const handleCreateCode = async () => {
    setCodeMessage('');
    setSavingCode(true);

    try {
      if (!newCode.trim()) {
        setCodeMessage('Code is required');
        setSavingCode(false);
        return;
      }
      if (!newAmount || Number(newAmount) <= 0) {
        setCodeMessage('Amount must be greater than 0');
        setSavingCode(false);
        return;
      }

      const payload: any = {
        code: newCode.trim().toUpperCase(),
        label: newLabel.trim() || null,
        discount_type: newType,
        amount: Number(newAmount),
        event_id: null, // global
        max_uses: newMaxUses ? parseInt(newMaxUses) : null,
        times_used: 0,
        active: true,
        expires_at: newExpiresAt
          ? new Date(newExpiresAt + 'T23:59:59').toISOString()
          : null,
      };

      const { error } = await supabase.from('discount_codes').insert(payload);

      if (error) {
        setCodeMessage('Failed: ' + error.message);
      } else {
        setCodeMessage('✅ Code created');
        setNewCode('');
        setNewLabel('');
        setNewAmount('');
        setNewMaxUses('');
        setNewExpiresAt('');
        await loadDiscountCodes();
      }
    } catch (err: any) {
      setCodeMessage('Error: ' + err.message);
    } finally {
      setSavingCode(false);
    }
  };

  const toggleCodeActive = async (id: number, current: boolean) => {
    await supabase
      .from('discount_codes')
      .update({ active: !current })
      .eq('id', id);
    await loadDiscountCodes();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-3xl mx-auto space-y-10">
        <div>
          <h1 className="text-3xl font-bold mb-2">Platform Admin</h1>
          <p className="text-gray-400">Logged in as {userEmail}</p>
        </div>

        {/* ==================== PLATFORM FEE ==================== */}
        <div className="bg-gray-800 rounded-3xl p-8 space-y-6">
          <h2 className="text-xl font-semibold">Platform Fee</h2>

          <div>
            <label className="block text-sm font-medium mb-2">
              Platform Fee (in dollars)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={feeInput}
              onChange={(e) => setFeeInput(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4 text-lg"
            />
            <p className="text-sm text-gray-400 mt-2">
              Current fee: ${Number(feeInput || 0).toFixed(2)} per player
            </p>
          </div>

          <button
            onClick={handleSaveFee}
            disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 py-4 rounded-2xl font-semibold text-lg"
          >
            {saving ? 'Saving...' : 'Save Fee'}
          </button>

          {message && (
            <p className="text-center text-emerald-400">{message}</p>
          )}
        </div>

        {/* ==================== ADD PLAYER ==================== */}
        <div className="bg-gray-800 rounded-3xl p-8 space-y-6">
          <h2 className="text-xl font-semibold">Add Player to Event</h2>
          <p className="text-sm text-gray-400">
            Manually add a player. Choose Free/Comp or create a payment link.
          </p>

          {/* Event select */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Event</label>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
            >
              <option value="">Select an event…</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name} — {ev.date ? String(ev.date).slice(0, 10) : 'TBD'}
                </option>
              ))}
            </select>
          </div>

          {/* Rounds (if per-round event) */}
          {selectedEvent &&
            (selectedEvent.pricing_mode || 'event') === 'per_round' &&
            rounds.length > 0 && (
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Rounds
                </label>
                <div className="space-y-2">
                  {rounds.map((r) => (
                    <label
                      key={r.id}
                      className="flex items-center gap-3 bg-gray-900 px-4 py-3 rounded-xl cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedRoundIds.includes(r.id)}
                        onChange={() => {
                          setSelectedRoundIds((prev) =>
                            prev.includes(r.id)
                              ? prev.filter((id) => id !== r.id)
                              : [...prev, r.id]
                          );
                        }}
                        className="w-5 h-5 accent-teal-600"
                      />
                      <span>
                        {r.name}
                        {r.start_time
                          ? ` · ${String(r.start_time).slice(0, 5)}`
                          : ''}
                        {' — $'}
                        {Number(r.price || 0).toFixed(2)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

          {/* Player info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Player Name *
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="John Smith"
                className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Email *
              </label>
              <input
                type="email"
                value={playerEmail}
                onChange={(e) => setPlayerEmail(e.target.value)}
                placeholder="name@email.com"
                className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Team Name (optional)
            </label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="Team name"
              className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
            />
          </div>

          {/* Charge type */}
          <div>
            <label className="block text-sm text-gray-400 mb-3">
              Payment
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setChargeType('free')}
                className={`p-4 rounded-2xl border font-medium ${
                  chargeType === 'free'
                    ? 'border-emerald-500 bg-emerald-950'
                    : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                Free / Comp
              </button>
              <button
                type="button"
                onClick={() => setChargeType('charge')}
                className={`p-4 rounded-2xl border font-medium ${
                  chargeType === 'charge'
                    ? 'border-blue-500 bg-blue-950'
                    : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                Charge
              </button>
            </div>
          </div>

          {chargeType === 'charge' && (
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Custom Amount (optional — leave blank to use event price)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder="Leave blank for normal price"
                className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
              />
            </div>
          )}

          <button
            onClick={handleAddPlayer}
            disabled={addingPlayer}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 py-4 rounded-2xl font-semibold text-lg"
          >
            {addingPlayer ? 'Adding…' : 'Add Player'}
          </button>

          {addPlayerMessage && (
            <pre className="text-sm text-emerald-400 whitespace-pre-wrap bg-gray-900 p-4 rounded-2xl">
              {addPlayerMessage}
            </pre>
          )}
        </div>

        {/* ==================== GLOBAL DISCOUNT CODES ==================== */}
        <div className="bg-gray-800 rounded-3xl p-8 space-y-6">
          <h2 className="text-xl font-semibold">Global Discount Codes</h2>
          <p className="text-sm text-gray-400">
            These codes work on any event. Per-event codes can be added later
            in Manage.
          </p>

          {/* Create new */}
          <div className="bg-gray-900 rounded-2xl p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Code *
                </label>
                <input
                  type="text"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  placeholder="WELCOME10"
                  className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3 uppercase"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Label
                </label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Global $10 off"
                  className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Type</label>
                <select
                  value={newType}
                  onChange={(e) =>
                    setNewType(e.target.value as 'fixed' | 'percent')
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3"
                >
                  <option value="fixed">Fixed $</option>
                  <option value="percent">Percent %</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Amount *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  placeholder={newType === 'percent' ? '20' : '10'}
                  className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Max Uses
                </label>
                <input
                  type="number"
                  min="1"
                  value={newMaxUses}
                  onChange={(e) => setNewMaxUses(e.target.value)}
                  placeholder="Unlimited"
                  className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Expires
                </label>
                <input
                  type="date"
                  value={newExpiresAt}
                  onChange={(e) => setNewExpiresAt(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3"
                />
              </div>
            </div>

            <button
              onClick={handleCreateCode}
              disabled={savingCode}
              className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-gray-600 py-3 rounded-xl font-medium"
            >
              {savingCode ? 'Creating…' : 'Create Global Code'}
            </button>

            {codeMessage && (
              <p className="text-center text-sm text-emerald-400">
                {codeMessage}
              </p>
            )}
          </div>

          {/* Existing codes */}
          <div className="space-y-3">
            {discountCodes.length === 0 && (
              <p className="text-gray-500 text-sm">No global codes yet.</p>
            )}
            {discountCodes.map((c) => (
              <div
                key={c.id}
                className="bg-gray-900 rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <p className="font-medium">
                    {c.code}{' '}
                    <span className="text-gray-400 text-sm">
                      ({c.discount_type === 'percent'
                        ? `${c.amount}%`
                        : `$${Number(c.amount).toFixed(2)}`}
                      )
                    </span>
                  </p>
                  <p className="text-xs text-gray-500">
                    {c.label || '—'} · Used {c.times_used}
                    {c.max_uses != null ? ` / ${c.max_uses}` : ''}
                    {c.expires_at
                      ? ` · Expires ${String(c.expires_at).slice(0, 10)}`
                      : ''}
                  </p>
                </div>
                <button
                  onClick={() => toggleCodeActive(c.id, c.active)}
                  className={`text-sm px-4 py-2 rounded-xl ${
                    c.active
                      ? 'bg-emerald-900/50 text-emerald-400'
                      : 'bg-gray-700 text-gray-400'
                  }`}
                >
                  {c.active ? 'Active' : 'Inactive'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}