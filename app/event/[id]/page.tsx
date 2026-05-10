'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export default function EventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = params.id as string;

  const [event, setEvent] = useState<any>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);
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

  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

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
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [eventId]);

  // Handle payment success
  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    if (paymentStatus === 'success') {
      setShowSuccessMessage(true);
      updatePaymentStatusToPaid();
    }
  }, [searchParams]);

  const updatePaymentStatusToPaid = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      await supabase
        .from('event_registrations')
        .update({ paid: true, checked_in: true })
        .eq('event_id', parseInt(eventId))
        .eq('user_id', user.id)
        .eq('paid', false);

      await fetchData();
      await sendRegistrationEmails();   // ← Sends emails to everyone
    } catch (err) {
      console.error("Error updating payment status:", err);
    }
  };

  // ==================== SEND CONFIRMATION EMAILS ====================
  const sendRegistrationEmails = async () => {
    try {
      const mainRegistrant = registrations.find(r => r.user_id && r.paid === true);
      if (!mainRegistrant) return;

      // Email to main registrant
      await fetch('/api/send-registration-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: mainRegistrant.player_email,
          name: mainRegistrant.player_name,
          eventName: event.name,
          eventDate: new Date(event.date).toLocaleDateString('en-US', { 
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
          }),
          location: event.location,
          course: event.course,
          teamName: mainRegistrant.team_name || null,
          isTeam: !isIndividual,
          eventId: event.id,
        }),
      });

      // Emails to additional teammates
      const teammates = registrations.filter(r => !r.user_id && r.team_name === mainRegistrant.team_name);

      for (const teammate of teammates) {
        await fetch('/api/send-registration-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: teammate.player_email,
            name: teammate.player_name,
            eventName: event.name,
            eventDate: new Date(event.date).toLocaleDateString('en-US', { 
              weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
            }),
            location: event.location,
            course: event.course,
            teamName: teammate.team_name,
            isTeam: true,
            eventId: event.id,
          }),
        });
      }
    } catch (err) {
      console.error("Failed to send registration emails:", err);
    }
  };

  // ==================== CALCULATIONS ====================
  const isIndividual = event?.max_teammates === 1 || !event?.max_teammates;
  const maxTeamSize = event?.max_teammates || 1;

  const registrationOpen = event?.registration_open_date 
    ? new Date() >= new Date(event.registration_open_date + 'T' + (event.registration_open_time || '00:00:00'))
    : false;

  const basePricePerPlayer = event?.price && maxTeamSize > 0 
    ? event.price / maxTeamSize 
    : event?.price || 0;

  const feePerPlayer = 3;
  const totalPlayers = isOrganizerOnly 
    ? additionalPlayers.length 
    : 1 + additionalPlayers.length;
  const totalCost = totalPlayers * (basePricePerPlayer + feePerPlayer);

  const existingTeams = Array.from(new Set(registrations.map(r => r.team_name).filter(Boolean)));

  const getSpotsLeft = (team: string) => {
    const count = registrations.filter(r => r.team_name === team).length;
    return Math.max(0, maxTeamSize - count);
  };

  const updateExtraPlayer = (index: number, field: 'name' | 'email', value: string) => {
    const updated = [...additionalPlayers];
    updated[index][field] = value;
    setAdditionalPlayers(updated);
  };

  const removeExtraPlayer = (index: number) => {
    const updated = additionalPlayers.filter((_, i) => i !== index);
    setAdditionalPlayers(updated);
  };

  const handleRegisterClick = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push(`/login?redirect=/event/${eventId}`);
      return;
    }
    setShowRegisterModal(true);
    setIsOrganizerOnly(false);
  };

  const handleRegister = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert("Please log in to register");
      return;
    }

    const finalTeamName = mode === 'create' ? newTeamName : selectedTeam;

    if (!isIndividual && !finalTeamName) {
      alert("Please select or create a team name");
      return;
    }

    setSubmitting(true);

    try {
      const mainInsert = {
        event_id: parseInt(eventId),
        user_id: user.id,
        player_name: isOrganizerOnly 
          ? `${user.email?.split('@')[0] || 'Organizer'} (Organizer)` 
          : user.email?.split('@')[0] || 'Player',
        player_email: user.email || '',
        team_name: finalTeamName || null,
        paid: false,
        checked_in: false,
        addons_selected: {}
      };

      await supabase.from('event_registrations').insert(mainInsert);

      if (additionalPlayers.length > 0) {
        const inserts = additionalPlayers.map(p => ({
          event_id: parseInt(eventId),
          user_id: null,
          player_name: p.name,
          player_email: p.email,
          team_name: finalTeamName || null,
          paid: false,
          checked_in: false,
          addons_selected: {}
        }));

        await supabase.from('event_registrations').insert(inserts);
      }

      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: totalCost,
          player_name: user.email?.split('@')[0] || 'Player',
          email: user.email,
          description: `Registration for ${event.name}`,
          event_name: event.name,
          event_id: event.id,
          type: 'registration',
        }),
      });

      const { url } = await response.json();

      if (url) {
        window.open(url, '_blank');
      } else {
        alert('Failed to create payment link');
      }
    } catch (err: any) {
      console.error(err);
      alert('Error starting registration');
    } finally {
      setSubmitting(false);
    }
  };

  const viewRegisteredPlayers = () => {
    router.push(`/event/${eventId}/players`);
  };

  if (loading) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Loading event...</div>;
  if (!event) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Event not found</div>;

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-20">
      <div className="max-w-4xl mx-auto px-6 pt-8">
        <button 
          onClick={() => router.push('/')} 
          className="mb-8 flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          ← Back to All Events
        </button>

        {showSuccessMessage && (
          <div className="mb-8 bg-green-900/50 border border-green-600 rounded-3xl p-8 text-center">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-3xl font-bold text-green-400 mb-2">Registration Complete!</h2>
            <p className="text-gray-300 mb-6">Your registration has been successfully processed.</p>
            <button 
              onClick={viewRegisteredPlayers}
              className="bg-green-600 hover:bg-green-700 px-8 py-4 rounded-2xl font-semibold text-lg"
            >
              View Registered Players
            </button>
          </div>
        )}

        <div className="bg-gray-800 rounded-3xl overflow-hidden">
          {/* Image Banner */}
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
              <h1 className="text-5xl font-bold mb-3 text-white">{event.name}</h1>
              <p className="text-2xl text-gray-200">
                {event.course} • {event.location}
              </p>
              {event.event_type && (
                <p className="text-lg text-blue-400 mt-2">Event Type: {event.event_type}</p>
              )}
            </div>
          </div>

          {/* Key Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 p-10 border-b border-gray-700">
            <div>
              <p className="text-gray-500 text-sm mb-1">DATE</p>
              <p className="text-xl font-medium">
                {new Date(event.date).toLocaleDateString('en-US', { 
                  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
                })}
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-sm mb-1">REGISTRATION OPENS</p>
              <p className="text-xl font-medium">
                {new Date(event.registration_open_date).toLocaleDateString()} at {event.registration_open_time || '00:00'}
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-sm mb-1">{isIndividual ? 'Price' : 'Team Price'}</p>
              <p className="text-xl font-medium">
                ${event.price || 'TBD'}
                {!isIndividual && event.price && (
                  <span className="text-sm text-gray-400 ml-2">
                    (${Math.round(event.price / maxTeamSize)} per person)
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-sm mb-1">MAX PLAYERS</p>
              <p className="text-xl font-medium">{event.max_teammates || event.max_players || 'N/A'}</p>
            </div>
          </div>

          {/* Flights */}
          {event.flights && event.flights.length > 0 && (
            <div className="p-10 border-b border-gray-700">
              <p className="text-gray-500 text-sm mb-3">FLIGHTS</p>
              <div className="flex flex-wrap gap-3">
                {event.flights.map((flight: any, index: number) => (
                  <div key={index} className="bg-gray-900 px-5 py-2 rounded-2xl text-sm">
                    {flight.name} ({flight.range})
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div className="p-10 border-b border-gray-700">
              <p className="text-gray-500 text-sm mb-3">ABOUT THIS EVENT</p>
              <p className="text-gray-300 leading-relaxed text-lg">{event.description}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="p-10 flex flex-col sm:flex-row gap-4">
            {registrationOpen ? (
              <>
                <button 
                  onClick={handleRegisterClick}
                  className="flex-1 bg-green-600 hover:bg-green-700 py-5 rounded-2xl text-xl font-semibold transition-colors"
                >
                  Register for this Event
                </button>

                <button 
                  onClick={() => router.push(`/event/${eventId}/sponsors`)}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 py-5 rounded-2xl text-xl font-semibold transition-colors"
                >
                  Sponsor / Donate
                </button>

                <button 
                  onClick={viewRegisteredPlayers}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 py-5 rounded-2xl text-xl font-semibold transition-colors"
                >
                  View Registered Players
                </button>
              </>
            ) : (
              <button 
                className="flex-1 bg-gray-700 hover:bg-gray-600 py-5 rounded-2xl text-xl font-semibold transition-colors"
              >
                Notify Me When Registration Opens
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-3xl p-10 w-full max-w-md">
            <h2 className="text-3xl font-bold mb-8 text-center">Sign in to Register</h2>
            <div className="space-y-4">
              <button 
                onClick={() => router.push(`/login?redirect=/event/${eventId}`)}
                className="w-full bg-blue-600 hover:bg-blue-700 py-4 rounded-2xl text-lg font-semibold"
              >
                Sign In
              </button>
              <button 
                onClick={() => router.push(`/signup?redirect=/event/${eventId}`)}
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

      {/* Registration Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-10">
              <h2 className="text-3xl font-bold mb-6">Register for {event.name}</h2>

              {isIndividual ? (
                <div className="space-y-8">
                  <div className="bg-gray-900 p-6 rounded-2xl text-center">
                    <p className="text-xl">Individual Event</p>
                    <p className="text-3xl font-semibold mt-2">${event.price || 'TBD'}</p>
                  </div>

                  <button
                    onClick={handleRegister}
                    disabled={submitting}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 py-5 rounded-2xl text-xl font-semibold"
                  >
                    {submitting ? 'Processing Payment...' : `Complete Registration — $${(event.price || 0).toFixed(2)}`}
                  </button>
                </div>
              ) : (
                <div className="space-y-8">
                  <div>
                    <label className="block text-sm text-gray-400 mb-4">How would you like to register?</label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={() => setMode('join')}
                        className={`p-6 rounded-2xl border text-center font-medium transition-colors ${mode === 'join' ? 'border-blue-500 bg-blue-950' : 'border-gray-700 hover:border-gray-600'}`}
                      >
                        Join Existing Team
                      </button>
                      <button
                        onClick={() => setMode('create')}
                        className={`p-6 rounded-2xl border text-center font-medium transition-colors ${mode === 'create' ? 'border-blue-500 bg-blue-950' : 'border-gray-700 hover:border-gray-600'}`}
                      >
                        Create New Team
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 bg-gray-900 p-4 rounded-2xl">
                    <input
                      type="checkbox"
                      id="organizer-only"
                      checked={isOrganizerOnly}
                      onChange={(e) => setIsOrganizerOnly(e.target.checked)}
                      className="w-5 h-5 accent-blue-600"
                    />
                    <label htmlFor="organizer-only" className="text-sm cursor-pointer">
                      I am not playing — just registering the team
                    </label>
                  </div>

                  {!isOrganizerOnly && (
                    <div className="bg-gray-900 p-5 rounded-2xl">
                      <p className="text-sm text-gray-400 mb-2">You are registering as the first player</p>
                      <p className="font-medium">
                        {currentUser?.email?.split('@')[0] || 'You'}
                      </p>
                    </div>
                  )}

                  {mode === 'join' && (
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Select Team</label>
                      <select
                        value={selectedTeam}
                        onChange={(e) => setSelectedTeam(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4"
                      >
                        <option value="">Choose a team</option>
                        {existingTeams.map((team) => {
                          const spots = getSpotsLeft(team);
                          return (
                            <option key={team} value={team} disabled={spots <= 0}>
                              {team} ({spots} spot{spots !== 1 ? 's' : ''} left)
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}

                  {mode === 'create' && (
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">New Team Name</label>
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
                      <label className="text-sm text-gray-400">Additional Players</label>
                      <span className="text-xs text-gray-500">
                        {additionalPlayers.length} added
                      </span>
                    </div>

                    {additionalPlayers.map((player, index) => (
                      <div key={index} className="bg-gray-900 p-5 rounded-2xl mb-4 flex gap-4 items-end">
                        <div className="flex-1">
                          <input
                            type="text"
                            value={player.name || ''}
                            onChange={(e) => updateExtraPlayer(index, 'name', e.target.value)}
                            placeholder="Player Name"
                            className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3"
                          />
                        </div>
                        <div className="flex-1">
                          <input
                            type="email"
                            value={player.email || ''}
                            onChange={(e) => updateExtraPlayer(index, 'email', e.target.value)}
                            placeholder="Email"
                            className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3"
                          />
                        </div>
                        <button
                          onClick={() => removeExtraPlayer(index)}
                          className="w-10 h-10 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-xl text-xl font-bold transition-colors"
                        >
                          −
                        </button>
                      </div>
                    ))}

                    <button
                      onClick={() => {
                        const maxAdditional = isOrganizerOnly ? maxTeamSize : maxTeamSize - 1;
                        if (additionalPlayers.length < maxAdditional) {
                          setAdditionalPlayers([...additionalPlayers, { name: '', email: '' }]);
                        }
                      }}
                      disabled={additionalPlayers.length >= (isOrganizerOnly ? maxTeamSize : maxTeamSize - 1)}
                      className="w-full py-4 border border-dashed border-gray-600 rounded-2xl text-gray-400 hover:text-white disabled:opacity-50"
                    >
                      + Add Another Player
                    </button>
                  </div>

                  <div className="bg-gray-900 p-6 rounded-2xl">
                    <div className="flex justify-between text-xl font-semibold">
                      <span>Total Cost</span>
                      <span>${totalCost.toFixed(2)}</span>
                    </div>
                  </div>

                  <button
                    onClick={handleRegister}
                    disabled={submitting || (mode === '' || (mode === 'create' && !newTeamName) || (mode === 'join' && !selectedTeam))}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 py-5 rounded-2xl text-xl font-semibold"
                  >
                    {submitting ? 'Processing Payment...' : `Complete Registration — $${totalCost.toFixed(2)}`}
                  </button>
                </div>
              )}

              <button
                onClick={() => setShowRegisterModal(false)}
                className="w-full mt-6 py-4 text-gray-400 hover:text-white text-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add-on Payment Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100]">
          <div className="bg-gray-900 rounded-3xl p-10 max-w-md w-full mx-4 text-center">
            <div className="mx-auto w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6">
              <span className="text-4xl">✅</span>
            </div>
            
            <h2 className="text-3xl font-semibold mb-2">You are Checked In!</h2>
            <p className="text-gray-400 mb-8">Your add-ons have been paid successfully.</p>

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