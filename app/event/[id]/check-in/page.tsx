'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

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
  const [addons, setAddons] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingAddonRegId, setEditingAddonRegId] = useState<number | null>(null);

  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [currentPayReg, setCurrentPayReg] = useState<any>(null);
  const [showSubModal, setShowSubModal] = useState(false);
  const [subPlayerReg, setSubPlayerReg] = useState<any>(null);

  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerEmail, setNewPlayerEmail] = useState('');
  const [newPlayerTeam, setNewPlayerTeam] = useState('');
  const [subName, setSubName] = useState('');
  const [subEmail, setSubEmail] = useState('');
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, any>>({});

  const lastNotificationRef = useRef<number>(0);

  const showAddons = addons.length > 0;
  const showHandicaps = !!event?.use_handicaps;

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { data: eventData } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', parseInt(eventId))
        .single();
      setEvent(eventData);

      const { data: addonData } = await supabase
        .from('event_addons')
        .select('*')
        .eq('event_id', parseInt(eventId));
      setAddons(addonData || []);

      await fetchRegistrations();
      setLoading(false);
    };

    fetchData();
  }, [eventId, supabase]);

  const fetchRegistrations = async () => {
    const { data } = await supabase
      .from('event_registrations')
      .select('*')
      .eq('event_id', parseInt(eventId));
    setRegistrations(data || []);
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
          // Any insert/update/delete — refresh table (covers paid_addons from Stripe)
          fetchRegistrations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, supabase]);

  const handleAddPlayer = async () => {
    if (!newPlayerName.trim()) return alert('Player name is required');
    const { error } = await supabase.from('event_registrations').insert({
      event_id: parseInt(eventId),
      player_name: newPlayerName.trim(),
      player_email: newPlayerEmail.trim() || null,
      team_name: newPlayerTeam.trim() || null,
      paid: false,
      checked_in: false,
    });
    if (error) alert('Failed to add player: ' + error.message);
    else {
      fetchRegistrations();
      setShowAddPlayerModal(false);
      setNewPlayerName('');
      setNewPlayerEmail('');
      setNewPlayerTeam('');
      alert('Player added successfully!');
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

  const handleRemovePlayer = async (reg: any) => {
    if (!confirm(`Remove ${reg.player_name}?`)) return;
    const { error } = await supabase.from('event_registrations').delete().eq('id', reg.id);
    if (error) alert('Failed to remove: ' + error.message);
    else fetchRegistrations();
  };

  const openPaymentModal = (reg: any) => {
    setCurrentPayReg(reg);
    setShowPaymentModal(true);
  };

  const handlePaidCash = async () => {
    if (!currentPayReg) return;

    const { error } = await supabase
      .from('event_registrations')
      .update({
        paid_addons: true,
        checked_in: true,
      })
      .eq('id', currentPayReg.id);

    if (error) {
      alert('Error marking as paid: ' + error.message);
    } else {
      alert(`${currentPayReg.player_name} add-ons paid and checked in.`);
      setShowPaymentModal(false);
      await fetchRegistrations();
    }
  };

    const handleSendAddonPaymentEmail = async () => {
    if (!currentPayReg) return;

    const addonTotals =
      selectedQuantities[currentPayReg.id] || currentPayReg.addon_quantities || {};

    const addonCost = addons.reduce((sum: number, addon: any) => {
      const qty = addonTotals[addon.id] || 0;
      return sum + qty * (addon.price_per_unit || 0);
    }, 0);

    if (addonCost <= 0) {
      alert('No add-on total to charge.');
      return;
    }

    if (!currentPayReg.player_email) {
      alert('This player has no email on file.');
      return;
    }
        // Save selected quantities so they persist after payment
    await supabase
      .from('event_registrations')
      .update({ addon_quantities: addonTotals })
      .eq('id', currentPayReg.id);

    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;

      // 1) Create Stripe payment link
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
          success_url: `${baseUrl}/api/confirm-addon-payment?registration_id=${currentPayReg.id}&event_id=${eventId}`,
          cancel_url: `${baseUrl}/event/${eventId}/check-in`,
        }),
      });

      const checkoutData = await checkoutRes.json();
      if (!checkoutRes.ok || !checkoutData.url) {
        throw new Error(checkoutData.error || 'Failed to create payment link');
      }

      // 2) Email the link
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

  const toggleCheckIn = async (reg: any) => {
    const isCheckedIn = reg.checked_in || false;
    if (isCheckedIn) {
      if (!confirm(`Un-check in ${reg.player_name}?`)) return;
      await supabase.from('event_registrations').update({ checked_in: false }).eq('id', reg.id);
    } else {
      await supabase.from('event_registrations').update({ checked_in: true }).eq('id', reg.id);
    }
    fetchRegistrations();
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

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <button
          onClick={() => router.back()}
          className="mb-6 text-gray-400 hover:text-white flex items-center gap-2"
        >
          ← Back
        </button>

        <h1 className="text-4xl font-bold mb-2">{event?.name}</h1>
        <p className="text-gray-400 mb-8">Player Check-In</p>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <h2 className="text-3xl font-semibold">Player Check-in</h2>

          <div className="flex items-center gap-4">
            <button
              onClick={fetchRegistrations}
              className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 px-6 py-3 rounded-2xl font-medium transition-colors"
            >
              🔄 Refresh
            </button>

            <button
              onClick={async () => {
                // Persist any pending addon quantity selections
                for (const [regId, quantities] of Object.entries(selectedQuantities)) {
                  await supabase
                    .from('event_registrations')
                    .update({ addon_quantities: quantities })
                    .eq('id', parseInt(regId));
                }
                await fetchRegistrations();
                alert('✅ Changes saved and table refreshed.');
              }}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 px-6 py-3 rounded-2xl font-medium transition-colors"
            >
              💾 Save
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

        {registrations.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            No registrations yet for this event.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-900">
                  <th className="text-left py-3 px-6 font-medium">Player Name</th>
                  <th className="text-left py-3 px-6 font-medium">Team</th>
                  <th className="text-center py-3 px-6 font-medium">Handicap</th>
                  <th className="text-center py-3 px-6 font-medium">Starting Hole</th>
                  {showAddons &&
                    addons.map((addon: any) => (
                      <th key={addon.id} className="text-center py-3 px-6 font-medium">
                        {addon.name}
                      </th>
                    ))}
                  {showAddons && (
                    <th className="text-center py-3 px-6 font-medium">Add-on Total</th>
                  )}
                  <th className="text-center py-3 px-6 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {registrations
                  .filter(
                    (reg: any) =>
                      !searchTerm ||
                      (reg.player_name || '')
                        .toLowerCase()
                        .includes(searchTerm.toLowerCase()) ||
                      (reg.team_name || '')
                        .toLowerCase()
                        .includes(searchTerm.toLowerCase())
                  )
                  .sort((a: any, b: any) =>
                    (a.player_name || '').localeCompare(b.player_name || '')
                  )
                  .map((reg: any) => {
                    const isCheckedIn = reg.checked_in || false;
                    const addonTotals =
                      selectedQuantities[reg.id] || reg.addon_quantities || {};

                    const addonCost = addons.reduce((sum: number, addon: any) => {
                      const qty = addonTotals[addon.id] || 0;
                      return sum + qty * (addon.price_per_unit || 0);
                    }, 0);

                    return (
                      <tr key={reg.id} className="border-b border-gray-700 hover:bg-gray-800/50">
                        {/* Name */}
                        <td className="py-3 px-6 font-medium">
                          {reg.player_name || 'Unknown'}
                        </td>

                        {/* Team */}
                        <td className="py-3 px-6 text-gray-400">
                          {reg.team_name || '—'}
                        </td>

                        {/* Handicap — always shown */}
                        <td className="py-3 px-6 text-center">
                          {showHandicaps ? (
                            <input
                              type="number"
                              value={reg.handicap ?? ''}
                              onChange={async (e) => {
                                const newHandicap = e.target.value === ''
                                  ? null
                                  : parseFloat(e.target.value);
                                await supabase
                                  .from('event_registrations')
                                  .update({ handicap: newHandicap })
                                  .eq('id', reg.id);
                                fetchRegistrations();
                              }}
                              className="w-20 bg-gray-700 border border-gray-600 rounded-xl text-center py-2 focus:outline-none focus:border-blue-500"
                            />
                          ) : (
                            <span className="text-gray-500">N/A</span>
                          )}
                        </td>

                        {/* Starting Hole — pairings later */}
                        <td className="py-3 px-6 text-center text-gray-500">
                          {reg.starting_hole || '—'}
                        </td>

                        {/* Add-on checkboxes — only if event has add-ons */}
                        {showAddons &&
  addons.map((addon: any) => {
    const qty = addonTotals[addon.id] || 0;
    const isLocked = !!reg.paid_addons && editingAddonRegId !== reg.id;

    return (
      <td key={addon.id} className="py-3 px-6 text-center">
        {isLocked ? (
          <span className="text-gray-300 font-medium">{qty > 0 ? qty : '—'}</span>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <input
              type="checkbox"
              checked={qty > 0}
              onChange={(e) => {
                const newQty = e.target.checked ? 1 : 0;
                setSelectedQuantities((prev) => ({
                  ...prev,
                  [reg.id]: {
                    ...(prev[reg.id] || addonTotals),
                    [addon.id]: newQty,
                  },
                }));
              }}
              className="w-5 h-5 accent-green-600"
            />
            {addon.quantity_available > 1 && qty > 0 && (
              <select
                value={qty}
                onChange={(e) => {
                  const newQty = parseInt(e.target.value);
                  setSelectedQuantities((prev) => ({
                    ...prev,
                    [reg.id]: {
                      ...(prev[reg.id] || addonTotals),
                      [addon.id]: newQty,
                    },
                  }));
                }}
                className="bg-gray-700 border border-gray-600 rounded-xl text-xs px-2 py-1"
              >
                {Array.from({ length: addon.quantity_available }, (_, i) => i + 1).map((n) => (
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

                        {/* Add-on Total — only if event has add-ons */}
                        {showAddons && (
                          <td className="py-3 px-6 text-center text-gray-300">
                            {addonCost > 0 ? `$${addonCost.toFixed(2)}` : '—'}
                          </td>
                        )}

                        {/* Actions — always last column */}
                        <td className="py-3 px-6">
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            {showAddons && addonCost > 0 && (
  reg.paid_addons && editingAddonRegId !== reg.id ? (
    <button
      disabled
      className="bg-gray-600 text-gray-300 px-4 py-2 rounded-2xl text-sm font-medium cursor-not-allowed opacity-70"
    >
      ✓ Paid
    </button>
  ) : (
    <button
      onClick={() => openPaymentModal(reg)}
      className="bg-amber-600 hover:bg-amber-700 px-4 py-2 rounded-2xl text-sm font-medium text-white"
    >
      Pay ${addonCost.toFixed(2)}
    </button>
  )
)}

{showAddons && reg.paid_addons && (
  editingAddonRegId === reg.id ? (
    <button
      onClick={async () => {
        const quantities = selectedQuantities[reg.id] || reg.addon_quantities || {};
        await supabase
          .from('event_registrations')
          .update({
            addon_quantities: quantities,
            paid_addons: false, // changing add-ons requires pay again
          })
          .eq('id', reg.id);
        setEditingAddonRegId(null);
        await fetchRegistrations();
        alert('Add-ons updated. Player must pay again if total changed.');
      }}
      className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-2xl text-sm font-medium text-white"
    >
      Save Edit
    </button>
  ) : (
    <button
      onClick={() => {
        if (!confirm('Edit paid add-ons? They will need to pay again after changes.')) return;
        setSelectedQuantities((prev) => ({
          ...prev,
          [reg.id]: reg.addon_quantities || {},
        }));
        setEditingAddonRegId(reg.id);
      }}
      className="text-amber-400 hover:text-amber-300 text-sm font-medium px-2 py-2"
    >
      Edit
    </button>
  )
)}

                            <button
                              onClick={() => toggleCheckIn(reg)}
                              className={`px-5 py-2 rounded-2xl text-sm font-medium transition-all text-white ${
                                isCheckedIn
                                  ? 'bg-green-600 hover:bg-red-600'
                                  : 'bg-blue-600 hover:bg-blue-700'
                              }`}
                            >
                              {isCheckedIn ? '✓ Checked In' : 'Check In'}
                            </button>

                            <button
                              onClick={() => handleRemovePlayer(reg)}
                              className="text-red-400 hover:text-red-500 text-sm font-medium px-2 py-2"
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
                              className="text-blue-400 hover:text-blue-500 text-sm font-medium px-2 py-2"
                            >
                              Sub Player
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

      {/* Add Player Modal */}
      {showAddPlayerModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-3xl p-8 max-w-md w-full">
            <h3 className="text-2xl font-semibold mb-6">Add Player</h3>
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
                placeholder="Email (optional)"
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
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleAddPlayer}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 py-4 rounded-2xl font-semibold"
                >
                  Add Player
                </button>
                <button
                  onClick={() => {
                    setShowAddPlayerModal(false);
                    setNewPlayerName('');
                    setNewPlayerEmail('');
                    setNewPlayerTeam('');
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

      {/* Payment Modal */}
      {showPaymentModal && currentPayReg && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-3xl p-10 max-w-md w-full">
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
              Replacing: <span className="text-white">{subPlayerReg.player_name}</span>
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
    </div>
  );
}