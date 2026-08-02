'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

const teamSizeFromEventType = (type: string) => {
  if (!type) return 1;
  if (type === 'individual') return 1;
  if (type.startsWith('2man')) return 2;
  if (type.startsWith('4man')) return 4;
  return 1; // other / unknown
};

export default function EventManagePage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [event, setEvent] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platformFee, setPlatformFee] = useState(3.0);

  const [courseSearch, setCourseSearch] = useState('');
  const [courseResults, setCourseResults] = useState<any[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);

  const [showFlights, setShowFlights] = useState(false);
  const [showAddOns, setShowAddOns] = useState(false);
  const [showAdmins, setShowAdmins] = useState(false);
  const [showRounds, setShowRounds] = useState(false);
  const [saving, setSaving] = useState(false);

  const [newFlight, setNewFlight] = useState({ name: '', range: '' });
  const [newAddon, setNewAddon] = useState({
    name: '',
    quantity_available: 5,
    price_per_unit: 10,
  });
  const [addons, setAddons] = useState<any[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');

  const [rounds, setRounds] = useState<any[]>([]);
  const [newRound, setNewRound] = useState({
  name: '',
  start_time: '',
  max_players: 40,
  pay_separately: false,
  price: 0,
  greens_fee: 0,
});

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: eventData, error: eventError } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', parseInt(eventId))
        .single();

      if (eventError || !eventData) {
        setError('Event not found');
        setLoading(false);
        return;
      }

      // Ensure team size matches event type
      const synced = {
        ...eventData,
        max_teammates: teamSizeFromEventType(eventData.event_type || ''),
      };
      setEvent(synced);

      setNewRound((prev) => ({
  ...prev,
  greens_fee: Number(eventData?.greens_fee) || 0,
}));

      const isCreator = eventData.created_by === user.id;

      const { data: adminData } = await supabase
        .from('event_admins')
        .select('id')
        .eq('event_id', parseInt(eventId))
        .eq('user_id', user.id)
        .single();

      const isEventAdmin = !!adminData;
      setIsAdmin(isCreator || isEventAdmin);

      if (!isCreator && !isEventAdmin) {
        setError("You don't have permission to manage this event.");
      }

      const { data: addonData } = await supabase
        .from('event_addons')
        .select('*')
        .eq('event_id', parseInt(eventId));
      setAddons(addonData || []);

      await fetchAdmins();

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

      if (feeData?.platform_fee) {
        setPlatformFee(Number(feeData.platform_fee));
      }

      setLoading(false);
    };

    fetchData();
  }, [eventId, supabase, router]);

  const fetchAdmins = async () => {
    const { data } = await supabase
      .from('event_admins')
      .select('*')
      .eq('event_id', parseInt(eventId));
    setAdmins(data || []);
  };

  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push(
          '/login?redirect=' + encodeURIComponent(window.location.pathname)
        );
      }
    };
    checkSession();
  }, [supabase, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin mx-auto mb-6"></div>
          <p className="text-gray-400">Loading event details...</p>
        </div>
      </div>
    );
  }

  if (error || !isAdmin) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-12 text-center">
        <p className="text-red-400 text-xl">{error || 'Access Denied'}</p>
        <button
          onClick={() => router.back()}
          className="mt-6 px-6 py-3 bg-gray-700 rounded-2xl"
        >
          ← Go Back
        </button>
      </div>
    );
  }

  const availableTees = (() => {
    if (!event?.course_data) return [];
    let teesData = event.course_data?.tees || event.course_data?.course?.tees;
    if (!teesData) return [];

    const flat: any[] = [];
    Object.keys(teesData).forEach((category) => {
      if (Array.isArray(teesData[category])) {
        teesData[category].forEach((tee: any) => {
          flat.push({
            ...tee,
            category,
            name: tee.name || tee.tee_name || tee.color || 'Unnamed Tee',
          });
        });
      }
    });
    return flat;
  })();

  const handleEventChange = (field: string, value: any) => {
    setEvent((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleEventTypeChange = (value: string) => {
    setEvent((prev: any) => ({
      ...prev,
      event_type: value,
      max_teammates: teamSizeFromEventType(value),
    }));
  };

  const debouncedSearch = (query: string) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => searchCourses(query), 500);
  };

  const searchCourses = async (query: string) => {
    if (query.length < 3) {
      setCourseResults([]);
      return;
    }

    try {
      const res = await fetch(`/api/golf-search?q=${encodeURIComponent(query)}`);

      if (!res.ok) {
        setCourseResults([
          {
            name: query,
            location: 'Atlanta Area, GA',
            id: 'mock-' + Date.now(),
          },
        ]);
        return;
      }

      const data = await res.json();
      setCourseResults(data.results || data.courses || data || []);
    } catch (err) {
      console.error('Course search failed:', err);
      setCourseResults([
        {
          name: query,
          location: 'Atlanta Area, GA',
          id: 'mock-' + Date.now(),
        },
      ]);
    }
  };

  const selectCourse = async (basicCourse: any) => {
    const courseName =
      basicCourse.name || basicCourse.course_name || basicCourse.club_name || '';
    setCourseSearch(courseName);

    try {
      const res = await fetch(
        `/api/golf-course-details?id=${encodeURIComponent(basicCourse.id || '')}&name=${encodeURIComponent(courseName)}`
      );
      let fullData;

      if (res.ok) {
        fullData = await res.json();
      } else {
        throw new Error('Details API failed');
      }

      handleEventChange('course', courseName);
      handleEventChange('course_data', fullData);
      setSelectedCourse(fullData);

      const { error } = await supabase
        .from('tournaments')
        .update({ course: courseName, course_data: fullData })
        .eq('id', parseInt(eventId));

      if (error) console.error('Failed to save course data:', error);

      setEvent((prev: any) => ({
        ...prev,
        course: courseName,
        course_data: fullData,
      }));
      setCourseResults([]);

      alert(`✅ Loaded real data for: ${courseName}`);
    } catch (err) {
      console.error('Details fetch failed:', err);

      const mockFullCourse = {
        name: courseName,
        course_name: courseName,
        scorecard: Array.from({ length: 18 }, (_, i) => ({
          Hole: i + 1,
          Par: [4, 5, 4, 4, 3, 4, 5, 4, 4, 4, 5, 4, 3, 4, 5, 4, 3, 4][i],
          yardage: [
            450, 520, 380, 410, 190, 430, 550, 390, 420, 460, 530, 400, 210, 440,
            560, 380, 220, 450,
          ][i],
          Handicap: (i % 18) + 1,
        })),
      };

      handleEventChange('course', courseName);
      handleEventChange('course_data', mockFullCourse);
      setSelectedCourse(mockFullCourse);

      await supabase
        .from('tournaments')
        .update({ course: courseName, course_data: mockFullCourse })
        .eq('id', parseInt(eventId));

      setEvent((prev: any) => ({
        ...prev,
        course: courseName,
        course_data: mockFullCourse,
      }));
      setCourseResults([]);

      alert(`⚠️ Using mock data for ${courseName}`);
    }
  };

  const handleSaveEvent = async () => {
    setSaving(true);
    const payload = {
      ...event,
      max_teammates: teamSizeFromEventType(event.event_type || ''),
    };
    const { error } = await supabase
      .from('tournaments')
      .update(payload)
      .eq('id', parseInt(eventId));
    if (error) alert('Save failed: ' + error.message);
    else alert('Event saved!');
    setSaving(false);
  };

  const handleAddAdmin = async () => {
    if (!newAdminEmail.trim()) return alert('Email is required');

    const email = newAdminEmail.trim().toLowerCase();
    const name = newAdminName.trim();

    try {
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single();

      const { error: insertError } = await supabase
        .from('event_admins')
        .insert({
          event_id: parseInt(eventId),
          user_id: existingUser?.id || null,
          name: name || null,
          email: email,
          added_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      if (!existingUser) {
        alert(`✅ Admin invitation added for ${email} (email sending coming soon)`);
      } else {
        alert(`✅ ${email} has been added as an admin.`);
      }

      fetchAdmins();
      setNewAdminName('');
      setNewAdminEmail('');
    } catch (err: any) {
      console.error(err);
      alert('Failed to add admin: ' + err.message);
    }
  };

  const handleAddFlight = () => {
    if (!newFlight.name.trim()) return alert('Flight name is required');
    const updatedFlights = [
      ...(event.flights || []),
      {
        name: newFlight.name.trim(),
        range: newFlight.range.trim(),
      },
    ];
    handleEventChange('flights', updatedFlights);
    setNewFlight({ name: '', range: '' });
  };

  const handleDeleteFlight = (index: number) => {
    const updatedFlights = (event.flights || []).filter(
      (_: any, i: number) => i !== index
    );
    handleEventChange('flights', updatedFlights);
  };

  const handleDeleteAdmin = async (adminId: number, email: string) => {
    if (!confirm(`Remove ${email} as an admin?`)) return;

    try {
      const { error } = await supabase
        .from('event_admins')
        .delete()
        .eq('id', adminId);

      if (error) throw error;

      alert(`✅ ${email} has been removed as admin.`);
      fetchAdmins();
    } catch (err: any) {
      console.error(err);
      alert('Failed to remove admin: ' + err.message);
    }
  };

  const handleAddAddon = async () => {
    if (!newAddon.name.trim()) return alert('Add-on name is required');
    const { error } = await supabase.from('event_addons').insert({
      event_id: parseInt(eventId),
      name: newAddon.name.trim(),
      quantity_available: newAddon.quantity_available,
      price_per_unit: newAddon.price_per_unit,
    });
    if (error) alert('Failed to add add-on');
    else {
      const { data } = await supabase
        .from('event_addons')
        .select('*')
        .eq('event_id', parseInt(eventId));
      setAddons(data || []);
      setNewAddon({ name: '', quantity_available: 5, price_per_unit: 10 });
    }
  };

  const handleDeleteAddon = async (id: number) => {
    if (!confirm('Remove this add-on?')) return;
    await supabase.from('event_addons').delete().eq('id', id);
    const { data } = await supabase
      .from('event_addons')
      .select('*')
      .eq('event_id', parseInt(eventId));
    setAddons(data || []);
  };

  const handleAddRound = async () => {
  if (!newRound.name.trim()) {
    alert('Round name is required');
    return;
  }

  const isPerRound = (event.pricing_mode || 'event') === 'per_round';
  const paySeparately = isPerRound ? true : newRound.pay_separately;
  const price = paySeparately ? Number(newRound.price) : 0;
  const greensFee =
    Number(newRound.greens_fee ?? event?.greens_fee) || 0;

  if (paySeparately && (!price || price <= 0)) {
    alert('Enter a price for this round');
    return;
  }

  const { error } = await supabase.from('event_rounds').insert({
    event_id: parseInt(eventId),
    name: newRound.name.trim(),
    start_time: newRound.start_time || null,
    max_players: newRound.max_players,
    pay_separately: paySeparately,
    price,
    greens_fee: greensFee,
    sort_order: rounds.length,
  });

  if (error) {
    alert('Failed to add round: ' + error.message);
    return;
  }

  const { data } = await supabase
    .from('event_rounds')
    .select('*')
    .eq('event_id', parseInt(eventId))
    .order('sort_order', { ascending: true });
  setRounds(data || []);

  setNewRound({
    name: '',
    start_time: '',
    max_players: 40,
    pay_separately: false,
    price: 0,
    greens_fee: Number(event?.greens_fee) || 0,
  });
};

  const handleDeleteRound = async (id: number) => {
    if (!confirm('Remove this round?')) return;
    await supabase.from('event_rounds').delete().eq('id', id);
    setRounds((prev) => prev.filter((r) => r.id !== id));
  };

  const handleDeleteEvent = async () => {
    if (
      !confirm(
        `⚠️ Delete this entire event?\n\n${event.name}\n\nThis action cannot be undone!`
      )
    ) {
      return;
    }

    if (
      !confirm(
        'Are you 100% sure? All registrations, scores, and data will be permanently deleted.'
      )
    ) {
      return;
    }

    try {
      setSaving(true);

      const { error } = await supabase
        .from('tournaments')
        .delete()
        .eq('id', parseInt(eventId));

      if (error) throw error;

      alert('✅ Event has been permanently deleted.');
      router.push('/dashboard');
    } catch (err: any) {
      console.error(err);
      alert('Failed to delete event: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const teamSize = teamSizeFromEventType(event.event_type || '');

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6"
        >
          ← Back
        </button>

        <h1 className="text-4xl font-bold mb-2">{event.name}</h1>
        <p className="text-gray-400 mb-8">Manage Event Details</p>

        {/* Event Image */}
        <div>
          <h3 className="text-xl font-medium mb-4">Event Image</h3>
          <div className="flex flex-col md:flex-row gap-6 items-start">
            <div className="w-full md:w-80 h-52 bg-gray-900 rounded-3xl overflow-hidden border border-gray-700 flex-shrink-0">
              {event.image_url ? (
                <img
                  src={event.image_url}
                  alt={event.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-6xl text-gray-600">
                  🏌️
                </div>
              )}
            </div>

            <div className="flex-1">
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const fileExt = file.name.split('.').pop();
                    const fileName = `${Date.now()}.${fileExt}`;
                    const filePath = `events/${eventId}/${fileName}`;

                    const { error: uploadError } = await supabase.storage
                      .from('tournament-images')
                      .upload(filePath, file, {
                        cacheControl: '3600',
                        upsert: false,
                      });

                    if (uploadError) throw uploadError;

                    const {
                      data: { publicUrl },
                    } = supabase.storage
                      .from('tournament-images')
                      .getPublicUrl(filePath);

                    handleEventChange('image_url', publicUrl);
                    alert(
                      "Image uploaded successfully! Click 'Save Changes' to store it."
                    );
                  } catch (err: any) {
                    alert('Failed to upload image: ' + err.message);
                  }
                }}
                className="block w-full text-sm text-gray-400 file:mr-4 file:py-4 file:px-6 file:rounded-3xl file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Golf Course Search */}
        <div className="mt-10">
          <h3 className="text-xl font-medium mb-4">Golf Course</h3>
          <div className="relative">
            <input
              type="text"
              value={courseSearch}
              onChange={(e) => {
                setCourseSearch(e.target.value);
                debouncedSearch(e.target.value);
              }}
              placeholder="Start typing course name..."
              className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5 text-base focus:outline-none focus:border-blue-500"
            />
            {courseResults.map((course, idx) => (
              <div
                key={idx}
                onClick={async () => {
                  await selectCourse(course);
                }}
                className="px-6 py-5 hover:bg-gray-700 cursor-pointer border-b border-gray-700 last:border-none bg-gray-800"
              >
                <div className="font-medium">
                  {course.name || course.course_name || 'Unknown Course'}
                </div>
                <div className="text-sm text-gray-400">
                  {course.club_name || course.city || course.location?.city || ''}{' '}
                  • {course.state || course.location?.state || ''}
                </div>
              </div>
            ))}
          </div>
          {event.course && (
            <p className="text-green-400 mt-3 text-sm">
              Current course: <span className="font-medium">{event.course}</span>
            </p>
          )}
        </div>

        {/* Pricing Mode */}
        <div className="flex flex-wrap items-center gap-4 bg-gray-900 border border-gray-700 rounded-2xl px-5 py-4 mt-8 mb-2">
          <div className="flex items-center gap-3 text-sm shrink-0">
            <span
              className={
                (event.pricing_mode || 'event') === 'event'
                  ? 'text-white'
                  : 'text-gray-500'
              }
            >
              Event
            </span>
            <button
              type="button"
              onClick={() =>
                handleEventChange(
                  'pricing_mode',
                  (event.pricing_mode || 'event') === 'event'
                    ? 'per_round'
                    : 'event'
                )
              }
              className={`relative w-12 h-7 rounded-full transition-colors ${
                event.pricing_mode === 'per_round' ? 'bg-blue-600' : 'bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white transition-transform ${
                  event.pricing_mode === 'per_round'
                    ? 'translate-x-5'
                    : 'translate-x-0'
                }`}
              />
            </button>
            <span
              className={
                event.pricing_mode === 'per_round' ? 'text-white' : 'text-gray-500'
              }
            >
              Per-round
            </span>
            <button
              type="button"
              onClick={() =>
                alert(
                  'EVENT PRICE\nOne fee covers the event. Optional extra rounds can cost more.\nBest when most players play the same main round.\n\nPER-ROUND PRICE\nPlayers only pay for the rounds they select. No base event fee.\nBest when players can choose 1 of several rounds (e.g. morning / afternoon / evening).'
                )
              }
              className="w-6 h-6 rounded-full bg-gray-700 hover:bg-gray-600 text-xs font-bold text-gray-300"
              title="What do these mean?"
            >
              ⓘ
            </button>
          </div>

          <p className="text-sm text-gray-400 flex-1 min-w-0">
            {(event.pricing_mode || 'event') === 'event'
              ? 'Players pay the event price. Extra rounds only if marked “charge separately.”'
              : 'Event price ignored. Players only pay for rounds they select.'}
          </p>
        </div>

        {/* Four Buttons */}
        <div className="flex flex-wrap gap-3 mt-8">
          <button
            onClick={() => setShowRounds(!showRounds)}
            className="flex-1 sm:flex-none bg-teal-600 hover:bg-teal-700 px-6 py-4 rounded-3xl font-medium transition-colors"
          >
            {showRounds ? 'Hide Rounds' : 'Manage Rounds'}
          </button>

          <button
            onClick={() => setShowFlights(!showFlights)}
            className="flex-1 sm:flex-none bg-purple-600 hover:bg-purple-700 px-6 py-4 rounded-3xl font-medium transition-colors"
          >
            {showFlights ? 'Hide Flights' : 'Manage Flights'}
          </button>

          <button
            onClick={() => setShowAddOns(!showAddOns)}
            className="flex-1 sm:flex-none bg-yellow-600 hover:bg-yellow-700 px-6 py-4 rounded-3xl font-medium transition-colors"
          >
            {showAddOns ? 'Hide Add-ons' : 'Manage Add-ons'}
          </button>

          <button
            onClick={() => setShowAdmins(!showAdmins)}
            className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 px-6 py-4 rounded-3xl font-medium transition-colors"
          >
            {showAdmins ? 'Hide Admins' : 'Manage Admins'}
          </button>
        </div>

        {/* Rounds Panel */}
        {showRounds && (
          <div className="bg-gray-900 border border-teal-500/30 rounded-3xl p-8 mt-8">
            <h3 className="text-xl font-medium mb-2">Event Rounds</h3>
            <p className="text-sm text-gray-400 mb-6">
              {(event.pricing_mode || 'event') === 'per_round'
                ? 'Per-round pricing: set a price on each round. Players only pay for rounds they select.'
                : 'Event pricing: rounds are included unless you check “Charge separately.”'}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end mb-8">
              <div className="md:col-span-3">
                <label className="block text-sm text-gray-400 mb-2">Round Name</label>
                <input
                  value={newRound.name}
                  onChange={(e) => setNewRound({ ...newRound, name: e.target.value })}
                  placeholder="Morning Round"
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-gray-400 mb-2">Start Time</label>
                <input
                  type="time"
                  value={newRound.start_time}
                  onChange={(e) =>
                    setNewRound({ ...newRound, start_time: e.target.value })
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-gray-400 mb-2">Max Players</label>
                <input
                  type="number"
                  value={newRound.max_players}
                  onChange={(e) =>
                    setNewRound({
                      ...newRound,
                      max_players: parseInt(e.target.value) || 0,
                      
                    })
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                />
              </div>
              <div className="md:col-span-2">
  <label className="block text-sm text-gray-400 mb-2">
    Greens fee (per player)
  </label>
  <input
    type="number"
    step="0.01"
    min="0"
    value={newRound.greens_fee}
    onChange={(e) =>
      setNewRound({
        ...newRound,
        greens_fee: parseFloat(e.target.value) || 0,
      })
    }
    className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
  />
</div>

              <div className="md:col-span-3">
                {(event.pricing_mode || 'event') === 'per_round' ? (
                  <>
                    <label className="block text-sm text-gray-400 mb-2">
                      Price per player
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={newRound.price}
                      onChange={(e) =>
                        setNewRound({
                          ...newRound,
                          price: parseFloat(e.target.value) || 0,
                          pay_separately: true,
                        })
                      }
                      placeholder="40.00"
                      className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                    />
                  </>
                ) : (
                  <>
                    <label className="flex items-center gap-3 text-sm text-gray-300 mb-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newRound.pay_separately}
                        onChange={(e) =>
                          setNewRound({
                            ...newRound,
                            pay_separately: e.target.checked,
                          })
                        }
                        className="w-5 h-5 accent-teal-600"
                      />
                      Charge separately
                    </label>
                    {newRound.pay_separately && (
                      <input
                        type="number"
                        step="0.01"
                        value={newRound.price}
                        onChange={(e) =>
                          setNewRound({
                            ...newRound,
                            price: parseFloat(e.target.value) || 0,
                          })
                        }
                        placeholder="Price per player"
                        className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                      />
                    )}
                  </>
                )}
              </div>

              <div className="md:col-span-2">
                <button
                  onClick={handleAddRound}
                  className="w-full bg-teal-600 hover:bg-teal-700 py-4 rounded-3xl font-medium"
                >
                  Add Round
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {rounds.length === 0 && (
                <p className="text-gray-500 text-sm">
                  No rounds yet. Add one above (e.g. 8:00 AM, 12:00 PM, 4:00 PM).
                </p>
              )}
              {rounds.map((round) => (
                <div
                  key={round.id}
                  className="bg-gray-800 p-6 rounded-3xl flex justify-between items-center"
                >
                  <div>
                    <div className="font-semibold text-lg">{round.name}</div>
                    <div className="text-sm text-gray-400 mt-1">
                      {round.start_time
                        ? String(round.start_time).slice(0, 5)
                        : 'No time set'}
                      {' · '}
                      Max {round.max_players} players
                      {(event.pricing_mode || 'event') === 'per_round' || round.pay_separately
    ? ` · $${Number(round.price).toFixed(2)} per player`
    : ' · Included in event price'}
  {` · Greens $${Number(round.greens_fee || 0).toFixed(2)}/player`}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteRound(round.id)}
                    className="text-red-500 hover:text-red-600 text-sm font-medium px-4 py-2"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Flights Panel */}
        {showFlights && (
          <div className="bg-gray-900 border border-purple-500/30 rounded-3xl p-8 mt-8">
            <h3 className="text-xl font-medium mb-6">Manage Flights</h3>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end mb-8">
              <div className="md:col-span-4">
                <input
                  value={newFlight.name}
                  onChange={(e) =>
                    setNewFlight({ ...newFlight, name: e.target.value })
                  }
                  placeholder="Flight A..."
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
                />
              </div>
              <div className="md:col-span-4">
                <input
                  value={newFlight.range}
                  onChange={(e) =>
                    setNewFlight({ ...newFlight, range: e.target.value })
                  }
                  placeholder="<15 or 4.0-7.9"
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
                />
              </div>
              <div className="md:col-span-4">
                <button
                  onClick={handleAddFlight}
                  className="w-full bg-purple-600 hover:bg-purple-700 py-5 rounded-3xl font-medium"
                >
                  Add Flight
                </button>
              </div>
            </div>

            <div className="space-y-6">
              {(event.flights || []).map((flight: any, index: number) => (
                <div key={index} className="bg-gray-800 p-6 rounded-3xl">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <span className="font-semibold text-lg">{flight.name}</span>
                      <span className="ml-4 text-gray-400">
                        Range: {flight.range}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteFlight(index)}
                      className="text-red-500 hover:text-red-600 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Tees for this Flight
                  </label>
                  <select
                    value={flight.tee || ''}
                    onChange={(e) => {
                      const updated = [...(event.flights || [])];
                      updated[index] = { ...updated[index], tee: e.target.value };
                      handleEventChange('flights', updated);
                    }}
                    className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
                  >
                    <option value="">Select Tees</option>
                    {availableTees.map((tee: any, i: number) => {
                      const teeName =
                        tee.name || tee.tee_name || tee.color || `Tee ${i + 1}`;
                      const teeYards = tee.total_yards || tee.yardage || 0;
                      return (
                        <option key={i} value={teeName}>
                          {teeName} ({teeYards} yds)
                        </option>
                      );
                    })}
                  </select>
                </div>
              ))}
            </div>

            {(event.flights || []).length === 0 && (
              <p className="text-gray-400 text-center py-8">
                No flights added yet. Add one above!
              </p>
            )}
          </div>
        )}

        {/* Add-ons Panel */}
        {showAddOns && (
          <div className="bg-gray-900 border border-yellow-500/30 rounded-3xl p-8 mt-8">
            <h3 className="text-xl font-medium mb-6">Manage Add-ons</h3>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end mb-8">
              <div className="md:col-span-5">
                <input
                  value={newAddon.name}
                  onChange={(e) =>
                    setNewAddon({ ...newAddon, name: e.target.value })
                  }
                  placeholder="Mulligan Package, Cart, etc."
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
                />
              </div>
              <div className="md:col-span-2">
                <input
                  type="number"
                  value={newAddon.quantity_available}
                  onChange={(e) =>
                    setNewAddon({
                      ...newAddon,
                      quantity_available: parseInt(e.target.value) || 0,
                    })
                  }
                  placeholder="Qty"
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5 text-center"
                />
              </div>
              <div className="md:col-span-2">
                <input
                  type="number"
                  value={newAddon.price_per_unit}
                  onChange={(e) =>
                    setNewAddon({
                      ...newAddon,
                      price_per_unit: parseFloat(e.target.value) || 0,
                    })
                  }
                  placeholder="$"
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5 text-center"
                />
              </div>
              <div className="md:col-span-3">
                <button
                  onClick={handleAddAddon}
                  className="w-full bg-yellow-600 hover:bg-yellow-700 py-5 rounded-3xl font-medium"
                >
                  Add Add-on
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {addons.map((addon: any) => (
                <div
                  key={addon.id}
                  className="bg-gray-800 p-6 rounded-3xl flex justify-between items-center"
                >
                  <div>
                    <div className="font-medium">{addon.name}</div>
                    <div className="text-sm text-gray-400">
                      ${addon.price_per_unit} each • {addon.quantity_available}{' '}
                      available
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteAddon(addon.id)}
                    className="text-red-500 hover:text-red-600 px-4 py-2"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            {addons.length === 0 && (
              <p className="text-gray-400 text-center py-8">No add-ons added yet.</p>
            )}
          </div>
        )}

        {/* Admins Panel */}
        {showAdmins && (
          <div className="bg-gray-900 border border-indigo-500/30 rounded-3xl p-8 mt-8">
            <h3 className="text-xl font-medium mb-6">Event Admins</h3>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end mb-8">
              <div className="md:col-span-5">
                <input
                  value={newAdminName}
                  onChange={(e) => setNewAdminName(e.target.value)}
                  placeholder="Admin Name (optional)"
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
                />
              </div>
              <div className="md:col-span-5">
                <input
                  type="email"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
                />
              </div>
              <div className="md:col-span-2">
                <button
                  onClick={handleAddAdmin}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 py-5 rounded-3xl font-medium"
                >
                  Add Admin
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {admins.map((admin: any) => (
                <div
                  key={admin.id}
                  className="bg-gray-800 p-6 rounded-3xl flex justify-between items-center"
                >
                  <div>
                    <div className="font-medium">{admin.name || 'No Name'}</div>
                    <div className="text-sm text-gray-400">{admin.email}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-xs px-3 py-1 bg-gray-700 rounded-full">
                      {admin.user_id ? 'Registered' : 'Invited'}
                    </div>
                    <button
                      onClick={() => handleDeleteAdmin(admin.id, admin.email)}
                      className="text-red-500 hover:text-red-600 px-4 py-2 text-sm font-medium"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {admins.length === 0 && (
              <p className="text-gray-400 text-center py-8">No admins added yet.</p>
            )}
          </div>
        )}

        {/* ====================== MAIN FORM FIELDS ====================== */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Event Name</label>
            <input
              value={event.name || ''}
              onChange={(e) => handleEventChange('name', e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Event Type</label>
            <select
              value={event.event_type || ''}
              onChange={(e) => handleEventTypeChange(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
            >
              <option value="">Select Event Type</option>
              <option value="individual">Individual Stroke Play</option>
              <option value="2man-best-ball">2-Man Best Ball</option>
              <option value="2man-scramble">2-Man Scramble</option>
              <option value="4man-best-ball">4-Man Best Ball</option>
              <option value="4man-scramble">4-Man Scramble</option>
              <option value="other">Other</option>
            </select>
            <p className="text-sm text-gray-400 mt-2">
              Players per team:{' '}
              <span className="text-white font-medium">{teamSize}</span>
              {teamSize === 1
                ? ' (individual)'
                : teamSize === 2
                  ? ' (2-man)'
                  : ' (4-man)'}
            </p>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">
              {(event.pricing_mode || 'event') === 'per_round'
                ? 'Base Event Price (ignored in per-round mode)'
                : 'Price per Player'}
            </label>
            <input
              type="number"
              value={event.price || ''}
              onChange={(e) =>
                handleEventChange('price', parseFloat(e.target.value) || 0)
              }
              className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
              disabled={(event.pricing_mode || 'event') === 'per_round'}
            />
            <p className="text-sm text-gray-400 mt-2">
              ${platformFee.toFixed(2)} platform fee is included in checkout totals
            </p>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Greens fees <span className="text-gray-500">(per player)</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={event?.greens_fee ?? 0}
              onChange={(e) =>
                handleEventChange('greens_fee', Number(e.target.value) || 0)
              }
              className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
            />
            <p className="text-xs text-gray-500 mt-2">
              Used on Income and for “refund minus greens fees.”
            </p>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Registration Open Date
            </label>
            <input
              type="date"
              value={event.registration_open_date || ''}
              onChange={(e) =>
                handleEventChange('registration_open_date', e.target.value)
              }
              className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Open Time</label>
            <input
              type="time"
              value={event.registration_open_time || ''}
              onChange={(e) =>
                handleEventChange('registration_open_time', e.target.value)
              }
              className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Registration Close Date
            </label>
            <input
              type="date"
              value={event.registration_close_date || ''}
              onChange={(e) =>
                handleEventChange('registration_close_date', e.target.value)
              }
              className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Close Time</label>
            <input
              type="time"
              value={event.registration_close_time || ''}
              onChange={(e) =>
                handleEventChange('registration_close_time', e.target.value)
              }
              className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Event Date</label>
            <input
              type="date"
              value={event.date || ''}
              onChange={(e) => handleEventChange('date', e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
            />
          </div>

          {/* Number of Holes */}
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-400 mb-3">Number of Holes</label>
            <div className="flex gap-3 bg-gray-700 border border-gray-600 rounded-3xl p-1">
              <button
                type="button"
                onClick={() => handleEventChange('number_of_holes', 9)}
                className={`flex-1 py-4 rounded-3xl font-medium ${
                  event?.number_of_holes === 9
                    ? 'bg-blue-600 text-white'
                    : 'hover:bg-gray-600 text-gray-300'
                }`}
              >
                9 Holes
              </button>
              <button
                type="button"
                onClick={() => handleEventChange('number_of_holes', 18)}
                className={`flex-1 py-4 rounded-3xl font-medium ${
                  event?.number_of_holes === 18 || !event?.number_of_holes
                    ? 'bg-blue-600 text-white'
                    : 'hover:bg-gray-600 text-gray-300'
                }`}
              >
                18 Holes
              </button>
            </div>
          </div>

          {/* Start Format */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Start Format</label>
            <select
              value={event.start_format || 'shotgun'}
              onChange={(e) => handleEventChange('start_format', e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
            >
              <option value="shotgun">Shotgun Start</option>
              <option value="tee_times">Tee Times</option>
              <option value="double_tee">Double Tee</option>
            </select>
          </div>

          {event.start_format === 'tee_times' && (
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Minutes between Tee Times
              </label>
              <input
                type="number"
                value={event.tee_time_interval || 10}
                onChange={(e) =>
                  handleEventChange(
                    'tee_time_interval',
                    parseInt(e.target.value) || 10
                  )
                }
                className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
                min="5"
              />
            </div>
          )}

          {/* Starting Hole */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Starting Hole</label>
            <select
              value={event.starting_hole || 1}
              onChange={(e) =>
                handleEventChange('starting_hole', parseInt(e.target.value))
              }
              className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
            >
              {Array.from({ length: event?.number_of_holes || 18 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  Hole {i + 1}
                </option>
              ))}
            </select>
          </div>

          {/* Event Contact */}
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-400 mb-4">
              Event Contact (optional)
            </label>
            <div className="space-y-6">
              <div>
                <label className="block text-xs text-gray-500 mb-2">Contact Name</label>
                <input
                  placeholder="John Smith"
                  value={event.contact_name || ''}
                  onChange={(e) => handleEventChange('contact_name', e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5 text-base"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-2">Email Address</label>
                <input
                  type="email"
                  placeholder="John@friedeggevents.app"
                  value={event.contact_email || ''}
                  onChange={(e) =>
                    handleEventChange('contact_email', e.target.value)
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5 text-base"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-2">Phone Number</label>
                <input
                  type="tel"
                  placeholder="(555) 555-5555"
                  value={event.contact_phone || ''}
                  onChange={(e) =>
                    handleEventChange('contact_phone', e.target.value)
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5 text-base"
                />
              </div>
            </div>
          </div>

          {/* Event Description */}
          <div className="md:col-span-2 mt-4">
            <h3 className="text-xl font-medium mb-4">Event Description</h3>
            <textarea
              value={event.description || ''}
              onChange={(e) => handleEventChange('description', e.target.value)}
              rows={6}
              placeholder="18-hole stroke play tournament with flights based on handicap..."
              className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5 text-base focus:outline-none focus:border-blue-500 resize-y min-h-[140px]"
            />
            <p className="text-xs text-gray-500 mt-2">
              This will appear on the event page and registration form.
            </p>
          </div>

          {/* Handicaps */}
          <div className="md:col-span-2 mt-6 pt-8 border-t border-gray-700">
            <label className="flex items-center gap-3 text-lg cursor-pointer">
              <input
                type="checkbox"
                checked={!!event?.use_handicaps}
                onChange={(e) =>
                  handleEventChange('use_handicaps', e.target.checked)
                }
                className="w-6 h-6 accent-blue-600"
              />
              <span className="font-medium">Use Handicaps for this Event</span>
            </label>
            <p className="text-sm text-gray-500 mt-2 ml-9">
              When enabled, you can enter individual handicaps in the Check-in tab.
            </p>
          </div>
        </div>

        {/* Save / Postpone / Delete */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12">
          <button
            onClick={handleSaveEvent}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 py-5 rounded-3xl font-semibold text-lg"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            onClick={() =>
              alert('Update the date and save to postpone the event')
            }
            className="bg-amber-600 hover:bg-amber-700 py-5 rounded-3xl font-semibold text-lg"
          >
            Postpone Event
          </button>
          <button
            onClick={handleDeleteEvent}
            disabled={saving}
            className="px-8 py-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded-3xl font-medium text-lg transition-colors flex items-center justify-center gap-2"
          >
            🗑️ Delete Event
          </button>
        </div>
      </div>
    </div>
  );
}