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

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { data: eventData } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', parseInt(eventId))
        .single();
      setEvent(eventData);

      // Fetch addons
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

  // Real-time notification for add-on payments
  useEffect(() => {
    if (!eventId) return;

    const channel = supabase
      .channel(`addon-notify-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'event_registrations',
          filter: `event_id=eq.${parseInt(eventId)}`,
        },
        (payload) => {
          const newData = payload.new as any;
          
          if (newData?.paid_addons === true && newData.checked_in !== true) {
            const playerName = newData.player_name || 'A player';
            const now = Date.now();

            if (now - lastNotificationRef.current > 4000) {
              lastNotificationRef.current = now;

              const confirmed = window.confirm(
                `✅ ${playerName} has paid their add-ons!\n\nClick OK to refresh the table.`
              );
              
              if (confirmed) {
                fetchRegistrations();
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, supabase]);

  const handleAddPlayer = async () => {
    if (!newPlayerName.trim()) return alert("Player name is required");
    const { error } = await supabase
      .from('event_registrations')
      .insert({
        event_id: parseInt(eventId),
        player_name: newPlayerName.trim(),
        player_email: newPlayerEmail.trim() || null,
        team_name: newPlayerTeam.trim() || null,
        paid: false,
        checked_in: false,
      });
    if (error) alert("Failed to add player: " + error.message);
    else {
      fetchRegistrations();
      setShowAddPlayerModal(false);
      setNewPlayerName('');
      setNewPlayerEmail('');
      setNewPlayerTeam('');
      alert("Player added successfully!");
    }
  };

  const handleSubstitutePlayer = async () => {
    if (!subName.trim()) return alert("Player name is required");
    await supabase.from('event_registrations').update({ 
      player_name: subName.trim(), 
      player_email: subEmail.trim() || null 
    }).eq('id', subPlayerReg.id);
    fetchRegistrations();
    setShowSubModal(false);
    setSubName('');
    setSubEmail('');
  };

  const handleRemovePlayer = async (reg: any) => {
    if (!confirm(`Remove ${reg.player_name}?`)) return;
    const { error } = await supabase.from('event_registrations').delete().eq('id', reg.id);
    if (error) alert("Failed to remove: " + error.message);
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
        checked_in: true 
      })
      .eq('id', currentPayReg.id);

    if (error) {
      alert("Error marking as paid: " + error.message);
    } else {
      alert(`${currentPayReg.player_name} add-ons paid and checked in.`);
      setShowPaymentModal(false);
      await fetchRegistrations();
    }
  };

  const handleSendAddonPaymentEmail = async () => {
    alert("Email sending coming soon");
    setShowPaymentModal(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin mx-auto mb-6"></div>
          <p>Loading check-in...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <button onClick={() => router.back()} className="mb-6 text-gray-400 hover:text-white flex items-center gap-2">
          ← Back
        </button>

        <h1 className="text-4xl font-bold mb-2">{event?.name}</h1>
        <p className="text-gray-400 mb-8">Player Check-In</p>

        {/* Title + Action Buttons */}
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
                await fetchRegistrations();
                alert("✅ Changes saved and table refreshed.");
              }}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 px-6 py-3 rounded-2xl font-medium transition-colors"
            >
              💾 Save
            </button>
          </div>
        </div>

        {/* Search + Add Player */}
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
    {event?.use_handicaps && (
      <th className="text-center py-3 px-6 font-medium">Handicap</th>
    )}
    {(event?.flights && event.flights.length > 0) && (
      <th className="text-center py-3 px-6 font-medium">Flight</th>
    )}
    {addons.map((addon: any) => (
      <th key={addon.id} className="text-center py-3 px-6 font-medium">{addon.name}</th>
    ))}
    <th className="text-center py-3 px-6 font-medium">Add-on Total</th>
    <th className="text-center py-3 px-6 font-medium w-48">Actions</th>
  </tr>
</thead>
              <tbody>
                {registrations
                  .filter((reg: any) => 
                    !searchTerm || 
                    (reg.player_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (reg.team_name || '').toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .sort((a: any, b: any) => (a.player_name || '').localeCompare(b.player_name || ''))
                  .map((reg: any) => {
                    const isCheckedIn = reg.checked_in || false;
                    const addonTotals = reg.addon_quantities || selectedQuantities[reg.id] || {};

                    const addonCost = addons.reduce((sum: number, addon: any) => {
                      const qty = addonTotals[addon.id] || 0;
                      return sum + qty * (addon.price_per_unit || 0);
                    }, 0);

                    return (
                      <tr key={reg.id} className="border-b border-gray-700 hover:bg-gray-750">
                        <td className="py-2 px-6 font-medium">{reg.player_name || 'Unknown'}</td>
                        <td className="py-2 px-6 text-gray-400">{reg.team_name || 'Individual'}</td>

                        {event?.use_handicaps && (
                          <td className="py-2 px-6 text-center">
                            <input
                              type="number"
                              value={reg.handicap ?? ''}
                              onChange={async (e) => {
                                const newHandicap = parseFloat(e.target.value) || 0;
                                await supabase
                                  .from('event_registrations')
                                  .update({ handicap: newHandicap })
                                  .eq('id', reg.id);
                                fetchRegistrations();
                              }}
                              className="w-20 bg-gray-700 border border-gray-600 rounded-xl text-center py-2 focus:outline-none focus:border-blue-500"
                            />
                          </td>
                        )}

                        {(event?.flights && event.flights.length > 0) && (
                          <td className="py-2 px-6 text-center font-medium">
                            {reg.flight || '—'}
                          </td>
                        )}

                        {/* ADD-ONS CHECKBOXES */}
                        {addons.map((addon: any) => {
                          const qty = addonTotals[addon.id] || 0;
                          return (
                            <td key={addon.id} className="py-2 px-6 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <input 
                                  type="checkbox" 
                                  checked={qty > 0} 
                                  onChange={(e) => {
                                    const newQty = e.target.checked ? 1 : 0;
                                    setSelectedQuantities((prev) => ({
                                      ...prev,
                                      [reg.id]: { ...(prev[reg.id] || {}), [addon.id]: newQty }
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
                                        [reg.id]: { ...(prev[reg.id] || {}), [addon.id]: newQty }
                                      }));
                                    }} 
                                    className="bg-gray-700 border border-gray-600 rounded-xl text-xs px-2 py-1"
                                  >
                                    {Array.from({ length: addon.quantity_available }, (_, i) => i + 1).map(n => (
                                      <option key={n} value={n}>{n}</option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            </td>
                          );
                        })}

                        <td className="py-2 px-6 text-center">
  <div className="flex flex-wrap gap-3 justify-center">
    {addonCost > 0 ? (
      <button 
        onClick={() => openPaymentModal(reg)} 
        className="bg-amber-600 hover:bg-amber-700 px-6 py-2.5 rounded-2xl text-sm font-medium text-white"
      >
        Pay ${addonCost}
      </button>
    ) : (
      <button 
        onClick={async () => {
          if (isCheckedIn) {
            if (!confirm(`Un-check in ${reg.player_name}?`)) return;
            await supabase.from('event_registrations').update({ checked_in: false }).eq('id', reg.id);
          } else {
            await supabase.from('event_registrations').update({ checked_in: true }).eq('id', reg.id);
          }
          fetchRegistrations();
        }} 
        className={`px-8 py-2.5 rounded-2xl text-sm font-medium transition-all ${isCheckedIn ? 'bg-green-600 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
      >
        {isCheckedIn ? '✓ Checked In' : 'Check In'}
      </button>
    )}

    <div className="flex gap-2">
      <button onClick={() => handleRemovePlayer(reg)} className="text-red-400 hover:text-red-500 text-sm font-medium px-4 py-2">Remove</button>
      <button onClick={() => {
        setSubPlayerReg(reg);
        setSubName('');
        setSubEmail('');
        setShowSubModal(true);
      }} className="text-blue-400 hover:text-blue-500 text-sm font-medium px-4 py-2">Sub Player</button>
    </div>
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
    </div>
  );
}