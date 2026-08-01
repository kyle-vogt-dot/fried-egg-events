'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export default function EventDetailPage() {
  const [agreedToWaiver, setAgreedToWaiver] = useState(false);
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = params.id as string;
  const [platformFee, setPlatformFee] = useState(3.00);

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

    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [eventId]);

  // Handle payment success (main registration OR add-ons)
  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    const type = searchParams.get('type');
    const regIdParam = searchParams.get('registration_id');

    if (paymentStatus === 'success' && type === 'registration') {
      const handleRegistrationSuccess = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        await supabase
          .from('event_registrations')
          .update({ paid: true })
          .eq('event_id', parseInt(eventId))
          .eq('user_id', user.id);

        const { data: regs } = await supabase
          .from('event_registrations')
          .select('*')
          .eq('event_id', parseInt(eventId))
          .eq('user_id', user.id)
          .order('id', { ascending: false })
          .limit(1);

        const myReg = regs?.[0] || null;

        const { data: feeData } = await supabase
          .from('platform_settings')
          .select('platform_fee')
          .eq('id', 1)
          .single();

        if (feeData?.platform_fee) {
          setPlatformFee(Number(feeData.platform_fee));
        }

        setShowSuccessMessage(true);

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
          let teammates: any[] = [];
          if (myReg.team_name) {
            const { data } = await supabase
              .from('event_registrations')
              .select('*')
              .eq('event_id', parseInt(eventId))
              .eq('team_name', myReg.team_name)
              .is('user_id', null);
            teammates = data || [];
          }
          // Get rounds this player signed up for
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

                    const playerCount = 1 + teammates.length;

          const { data: liveFeeData } = await supabase
            .from('platform_settings')
            .select('platform_fee')
            .eq('id', 1)
            .single();

          const feePerPlayer = Number(liveFeeData?.platform_fee) || 0;
          const isPerRound = (eventData.pricing_mode || 'event') === 'per_round';

          let eventPriceTotal = 0; // shown as one "Event / round fees" line (includes platform fee)
          let roundsSummary: any[] = [];

          if (isPerRound) {
            // Each round display price = round price + platform fee (matches checkout)
            eventPriceTotal = signedUpRounds.reduce((sum, r) => {
              return sum + (Number(r.price || 0) + feePerPlayer) * playerCount;
            }, 0);

            roundsSummary = signedUpRounds.map((r) => {
              const time = r.start_time ? String(r.start_time).slice(0, 5) : '';
              return {
                label: `${r.name}${time ? ` at ${time}` : ''}`,
                price: (Number(r.price || 0) + feePerPlayer) * playerCount,
              };
            });
          } else {
            const baseWithFee =
              ((Number(eventData.price) || 0) + feePerPlayer) * playerCount;
            const optionalRounds = signedUpRounds.filter((r) => r.pay_separately);
            const optionalWithFee =
              optionalRounds.reduce(
                (sum, r) => sum + Number(r.price || 0) + feePerPlayer,
                0
              ) * playerCount;

            eventPriceTotal = baseWithFee + optionalWithFee;

            roundsSummary = signedUpRounds.map((r) => {
              const time = r.start_time ? String(r.start_time).slice(0, 5) : '';
              if (r.pay_separately) {
                return {
                  label: `${r.name}${time ? ` at ${time}` : ''}`,
                  price: (Number(r.price || 0) + feePerPlayer) * playerCount,
                };
              }
              return `${r.name}${time ? ` at ${time}` : ''} (included)`;
            });
          }

          const netAmount = eventPriceTotal;
          const netCents = Math.round(netAmount * 100);
          const totalCents = Math.ceil((netCents + 30) / (1 - 0.029));
          const processingFee = (totalCents - netCents) / 100;
          const totalPaid = totalCents / 100;

          const emailPayloadBase = {
            eventName: eventData.name,
            eventDate: new Date(eventData.date + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            }),
            location: eventData.location,
            course: eventData.course,
            eventId: eventData.id,
            pricingMode: isPerRound ? 'per_round' : 'event',
            eventPrice: isPerRound ? 0 : eventPriceTotal,
            platformFee: 0, // folded into event/round prices
            processingFee,
            totalPaid,
            playerCount,
            rounds: roundsSummary,
          };

          // Email to main player
          await fetch('/api/send-registration-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...emailPayloadBase,
              to: myReg.player_email,
              name: myReg.player_name,
              teamName: myReg.team_name || null,
              isTeam: !!myReg.team_name,
            }),
          });

          // Emails to teammates
          for (const teammate of teammates) {
            await fetch('/api/send-registration-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...emailPayloadBase,
                to: teammate.player_email,
                name: teammate.player_name,
                teamName: teammate.team_name,
                isTeam: true,
              }),
            });
          }

          // Notify event creator
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
              eventFee: eventPriceTotal,
              totalPaid,
              teammates: teammates.map((t: any) => ({
                name: t.player_name,
                email: t.player_email,
              })),
            }),
          });
        }

        await fetchData();
      };

      handleRegistrationSuccess();
    }

    if (paymentStatus === 'success' && type === 'addon' && regIdParam) {
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
    ? new Date() >= new Date(event.registration_open_date + 'T' + (event.registration_open_time || '00:00:00'))
    : false;

 


  // Per-round mode: every round is choosable and priced
    const isPerRound = (event?.pricing_mode || 'event') === 'per_round';

  const includedRounds = isPerRound ? [] : rounds.filter((r) => !r.pay_separately);
  const selectableRounds = isPerRound
    ? rounds
    : rounds.filter((r) => r.pay_separately);

  const pricePerPlayer = isPerRound ? 0 : Number(event?.price) || 0;
  const feePerPlayer = platformFee;
  const totalPlayers = isOrganizerOnly
    ? additionalPlayers.length
    : 1 + additionalPlayers.length;

  // Each selected round = round price + platform fee
  const selectedRoundsCostPerPlayer = selectedPaidRoundIds.reduce((sum, id) => {
    const round = selectableRounds.find((r) => r.id === id) || rounds.find((r) => r.id === id);
    if (!round) return sum;
    return sum + Number(round.price || 0) + feePerPlayer;
  }, 0);

  const totalCost = isPerRound
    ? // Per-round: only selected rounds (fee included on each). $0 until something is selected.
      totalPlayers * selectedRoundsCostPerPlayer
    : // Event mode: event price + one platform fee, plus any optional paid rounds
      totalPlayers * (pricePerPlayer + feePerPlayer + selectedRoundsCostPerPlayer);

  const getSelectedRoundIds = () => {
    if (isPerRound) return [...selectedPaidRoundIds];
    const autoIds = includedRounds.map((r) => r.id);
    return [...autoIds, ...selectedPaidRoundIds];
  };

  const existingTeams = Array.from(new Set(registrations.map((r) => r.team_name).filter(Boolean)));

  const getSpotsLeft = (team: string) => {
    const count = registrations.filter((r) => r.team_name === team).length;
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

  const togglePaidRound = (roundId: number) => {
    setSelectedPaidRoundIds((prev) =>
      prev.includes(roundId) ? prev.filter((id) => id !== roundId) : [...prev, roundId]
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

  const handleRegisterClick = async () => {
    const { data: { user } } = await supabase.auth.getUser();
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
    setAgreedToWaiver(false);
  };

  const handleRegister = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert('Please log in to register');
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

      // ========== INDIVIDUAL ==========
      if (isIndividual) {
        const { error } = await supabase.from('event_registrations').insert({
          event_id: parseInt(eventId),
          user_id: user.id,
          player_name: playerName,
          player_email: user.email || '',
          team_name: null,
          paid: false,
          checked_in: false,
          addons_selected: {},
          selected_round_ids: selectedRoundIds,
        });

        if (error) {
          console.error('Registration error:', error);
          alert(`Failed to register: ${error.message}`);
          setSubmitting(false);
          return;
        }
      }

      // ========== TEAM ==========
      else {
        if (mode === 'join' && selectedTeam) {
          const { error } = await supabase.from('event_registrations').insert({
            event_id: parseInt(eventId),
            user_id: user.id,
            player_name: playerName,
            player_email: user.email || '',
            team_name: selectedTeam,
            paid: false,
            checked_in: false,
            addons_selected: {},
            selected_round_ids: selectedRoundIds,
          });

          if (error) {
            console.error('Join team error:', error);
            alert(`Failed to join team: ${error.message}`);
            setSubmitting(false);
            return;
          }
        } else if (mode === 'create' && newTeamName) {
          if (!isOrganizerOnly) {
            const { error } = await supabase.from('event_registrations').insert({
              event_id: parseInt(eventId),
              user_id: user.id,
              player_name: playerName,
              player_email: user.email || '',
              team_name: newTeamName,
              paid: false,
              checked_in: false,
              addons_selected: {},
              selected_round_ids: selectedRoundIds,
            });

            if (error) {
              console.error('Create team error:', error);
              alert(`Failed to create team: ${error.message}`);
              setSubmitting(false);
              return;
            }
          }
        }

        if (additionalPlayers.length > 0) {
          const inserts = additionalPlayers.map((p) => ({
            event_id: parseInt(eventId),
            user_id: null,
            player_name: p.name,
            player_email: p.email,
            team_name: finalTeamName,
            paid: false,
            checked_in: false,
            addons_selected: {},
            selected_round_ids: selectedRoundIds,
          }));

          const { error } = await supabase.from('event_registrations').insert(inserts);
          if (error) {
            console.error('Additional players error:', error);
            alert(`Failed to add additional players: ${error.message}`);
            setSubmitting(false);
            return;
          }
        }
      }

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;

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
          success_url: `${baseUrl}/event/${eventId}?payment=success&type=registration`,
          cancel_url: `${baseUrl}/event/${eventId}`,
        }),
      });

      const { url } = await response.json();

      if (url) {
        window.location.href = url;
        setShowRegisterModal(false);
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

        {showSuccessMessage && (
          <div className="mb-8 bg-green-900/50 border border-green-600 rounded-3xl p-8 text-center">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-3xl font-bold text-green-400 mb-2">Registration Complete!</h2>
            <p className="text-gray-300 mb-6">
              Congratulations! You are registered for <strong>{event?.name}</strong>.
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
          {/* Image Banner */}
          <div className="relative h-80 bg-gray-900">
            {event.image_url ? (
              <img src={event.image_url} alt={event.name} className="w-full h-full object-cover" />
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
                {(event.pricing_mode || 'event') === 'per_round' ? 'From (per player)' : 'Price per Player'}
              </p>
              <p className="text-xl font-medium">
                {(event.pricing_mode || 'event') === 'per_round'
                  ? rounds.length > 0
                    ? `$${(
                        Math.min(...rounds.map((r) => Number(r.price) || 0)) + platformFee
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

          {/* Rounds */}
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
  {(event.pricing_mode || 'event') === 'per_round' || round.pay_separately
    ? ` · $${(Number(round.price || 0) + platformFee).toFixed(2)}`
    : ' · Included'}
</div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
              <button className="flex-1 bg-gray-700 hover:bg-gray-600 py-5 rounded-2xl text-xl font-semibold transition-colors">
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

                            {/* Rounds selection */}
              {rounds.length > 0 && (
                <div className="bg-gray-900 rounded-2xl p-5 mb-6">
                  <p className="text-sm text-gray-400 mb-4 font-medium">
                    {(event.pricing_mode || 'event') === 'per_round'
                      ? 'Select round(s) to play'
                      : 'Rounds'}
                  </p>

                  {/* Included (event pricing only) */}
                  {(event.pricing_mode || 'event') !== 'per_round' &&
                    includedRounds.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs text-teal-300 mb-2">Included in registration</p>
                        <ul className="text-sm text-gray-300 space-y-1">
                          {includedRounds.map((r) => (
                            <li key={r.id}>
                              {r.name}
                              {r.start_time ? ` · ${String(r.start_time).slice(0, 5)}` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                  {/* Selectable rounds */}
                  {selectableRounds.length > 0 && (
                    <div className="space-y-3">
                      {(event.pricing_mode || 'event') !== 'per_round' && (
                        <p className="text-xs text-gray-500 mb-1">Optional (extra charge)</p>
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
  ${(Number(round.price || 0) + platformFee).toFixed(2)}
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
                  <div className="bg-gray-900 p-6 rounded-2xl text-center">
                    <p className="text-xl">Individual Event</p>
                    <p className="text-3xl font-semibold mt-2">${totalCost.toFixed(2)}</p>
                  </div>

                  <div className="flex items-start gap-3 bg-gray-900 p-5 rounded-2xl">
                    <input
                      type="checkbox"
                      id="waiver-individual"
                      checked={agreedToWaiver}
                      onChange={(e) => setAgreedToWaiver(e.target.checked)}
                      className="mt-1 w-5 h-5 accent-blue-600"
                    />
                    <label htmlFor="waiver-individual" className="text-sm text-gray-300 cursor-pointer">
                      I have read and agree to the <strong>Waiver & Release of Liability</strong>.
                      <a href="/waiver" target="_blank" className="text-blue-400 hover:underline ml-1">
                        (View Document)
                      </a>
                    </label>
                  </div>

                  <button
                    onClick={handleRegister}
                    disabled={
  submitting ||
  !agreedToWaiver ||
  ((event.pricing_mode || 'event') === 'per_round' && selectedPaidRoundIds.length === 0)
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
                        onClick={() => setMode('create')}
                        className={`p-6 rounded-2xl border text-center font-medium transition-colors ${
                          mode === 'create'
                            ? 'border-blue-500 bg-blue-950'
                            : 'border-gray-700 hover:border-gray-600'
                        }`}
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
                    <div className="bg-emerald-900/30 border border-emerald-500 p-5 rounded-2xl">
                      <p className="text-sm text-emerald-400 mb-1">You are playing as the first player</p>
                      <p className="font-medium text-white">{getPlayerName(currentUser)}</p>
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
                      <span className="text-xs text-gray-500">{additionalPlayers.length} added</span>
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
                        let maxAdditional = maxTeamSize;
                        if (mode === 'join' && selectedTeam) {
                          const spotsLeft = getSpotsLeft(selectedTeam);
                          maxAdditional = isOrganizerOnly ? spotsLeft : spotsLeft - 1;
                        } else if (mode === 'create') {
                          maxAdditional = isOrganizerOnly ? maxTeamSize : maxTeamSize - 1;
                        }

                        if (additionalPlayers.length < maxAdditional) {
                          setAdditionalPlayers([...additionalPlayers, { name: '', email: '' }]);
                        }
                      }}
                      disabled={
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

                  <div className="bg-gray-900 p-6 rounded-2xl">
                    <div className="flex justify-between text-xl font-semibold">
                      <span>Total Cost</span>
                      <span>${totalCost.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 bg-gray-900 p-5 rounded-2xl">
                    <input
                      type="checkbox"
                      id="waiver-team"
                      checked={agreedToWaiver}
                      onChange={(e) => setAgreedToWaiver(e.target.checked)}
                      className="mt-1 w-5 h-5 accent-blue-600"
                    />
                    <label htmlFor="waiver-team" className="text-sm text-gray-300 cursor-pointer">
                      I have read and agree to the <strong>Waiver & Release of Liability</strong>.
                      <a href="/waiver" target="_blank" className="text-blue-400 hover:underline ml-1">
                        (View Document)
                      </a>
                    </label>
                  </div>

                  <button
                    onClick={handleRegister}
                    disabled={
  submitting ||
  !agreedToWaiver ||
  mode === '' ||
  (mode === 'create' && !newTeamName) ||
  (mode === 'join' && !selectedTeam)
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

            <h2 className="text-3xl font-semibold mb-2">Add-ons Paid Successfully</h2>
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