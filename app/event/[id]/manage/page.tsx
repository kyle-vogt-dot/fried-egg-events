'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

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

  const [courseSearch, setCourseSearch] = useState('');
  const [courseResults, setCourseResults] = useState<any[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);

  const [showFlights, setShowFlights] = useState(false);
  const [showAddOns, setShowAddOns] = useState(false);
  const [showAdmins, setShowAdmins] = useState(false);
  const [saving, setSaving] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const [newFlight, setNewFlight] = useState({ name: '', range: '' });
  const [newAddon, setNewAddon] = useState({ name: '', quantity_available: 5, price_per_unit: 10 });
  const [addons, setAddons] = useState<any[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Main fetch + permission check
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
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
        setError("Event not found");
        setLoading(false);
        return;
      }

      setEvent(eventData);

      // Permission check
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

      // Load addons and admins
      const { data: addonData } = await supabase
        .from('event_addons')
        .select('*')
        .eq('event_id', parseInt(eventId));
      setAddons(addonData || []);

      await fetchAdmins();

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

  // Session check
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
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
        <p className="text-red-400 text-xl">{error || "Access Denied"}</p>
        <button 
          onClick={() => router.back()} 
          className="mt-6 px-6 py-3 bg-gray-700 rounded-2xl"
        >
          ← Go Back
        </button>
      </div>
    );
  }
    // Available Tees for Flights
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
            name: tee.name || tee.tee_name || tee.color || 'Unnamed Tee'
          });
        });
      }
    });
    return flat;
  })();

  const handleEventChange = (field: string, value: any) => {
    setEvent((prev: any) => ({ ...prev, [field]: value }));
  };



  // Course Search
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
      console.log("Searching for:", query); // Debug log

      const res = await fetch(`/api/golf-search?q=${encodeURIComponent(query)}`);
      
      if (!res.ok) {
        console.error('Search failed:', res.status);
        setCourseResults([{
          name: query,
          location: "Atlanta Area, GA",
          id: "mock-" + Date.now()
        }]);
        return;
      }

      const data = await res.json();
      console.log("Search results:", data); // Debug log
      setCourseResults(data.results || data.courses || data || []);
    } catch (err) {
      console.error('Course search failed:', err);
      setCourseResults([{
        name: query,
        location: "Atlanta Area, GA",
        id: "mock-" + Date.now()
      }]);
    }
  };

  const selectCourse = async (basicCourse: any) => {
    const courseName = basicCourse.name || basicCourse.course_name || basicCourse.club_name || '';
    setCourseSearch(courseName);

    console.log("Selecting course:", basicCourse);

    try {
      const res = await fetch(`/api/golf-course-details?id=${encodeURIComponent(basicCourse.id || '')}&name=${encodeURIComponent(courseName)}`);
      let fullData;

      if (res.ok) {
        fullData = await res.json();
        console.log("Real data loaded:", fullData);
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

      if (error) console.error("Failed to save course data:", error);

      setEvent((prev: any) => ({ ...prev, course: courseName, course_data: fullData }));
      setCourseResults([]);

      alert(`✅ Loaded real data for: ${courseName}`);
    } catch (err) {
      console.error("Details fetch failed:", err);

      const mockFullCourse = {
        name: courseName,
        course_name: courseName,
        scorecard: Array.from({ length: 18 }, (_, i) => ({
          Hole: i + 1,
          Par: [4,5,4,4,3,4,5,4,4,4,5,4,3,4,5,4,3,4][i],
          yardage: [450,520,380,410,190,430,550,390,420,460,530,400,210,440,560,380,220,450][i],
          Handicap: (i % 18) + 1
        }))
      };

      handleEventChange('course', courseName);
      handleEventChange('course_data', mockFullCourse);
      setSelectedCourse(mockFullCourse);

      await supabase
        .from('tournaments')
        .update({ course: courseName, course_data: mockFullCourse })
        .eq('id', parseInt(eventId));

      setEvent((prev: any) => ({ ...prev, course: courseName, course_data: mockFullCourse }));
      setCourseResults([]);

      alert(`⚠️ Using mock data for ${courseName}`);
    }
  };



  const handleSaveEvent = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('tournaments')
      .update(event)
      .eq('id', parseInt(eventId));
    if (error) alert('Save failed');
    else alert('Event saved!');
    setSaving(false);
  };

      const handleAddAdmin = async () => {
    if (!newAdminEmail.trim()) return alert("Email is required");

    const email = newAdminEmail.trim().toLowerCase();
    const name = newAdminName.trim();

    try {
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single();

      const { data: newAdminRow, error: insertError } = await supabase
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
      alert("Failed to add admin: " + err.message);
    }
  };

  // ====================== FLIGHT & ADDON HANDLERS ======================
  const handleAddFlight = () => {
    if (!newFlight.name.trim()) return alert("Flight name is required");
    const updatedFlights = [...(event.flights || []), { 
      name: newFlight.name.trim(), 
      range: newFlight.range.trim() 
    }];
    handleEventChange('flights', updatedFlights);
    setNewFlight({ name: '', range: '' });
  };

  const handleDeleteFlight = (index: number) => {
    const updatedFlights = (event.flights || []).filter((_: any, i: number) => i !== index);
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
      alert("Failed to remove admin: " + err.message);
    }
  };

  const handleAddAddon = async () => {
    if (!newAddon.name.trim()) return alert("Add-on name is required");
    const { error } = await supabase
      .from('event_addons')
      .insert({
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

    if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading event...</p>
        </div>
      </div>
    );
  }

    const handleDeleteEvent = async () => {
    if (!confirm(`⚠️ Delete this entire event?\n\n${event.name}\n\nThis action cannot be undone!`)) {
      return;
    }

    if (!confirm("Are you 100% sure? All registrations, scores, and data will be permanently deleted.")) {
      return;
    }

    try {
      setSaving(true);

      const { error } = await supabase
        .from('tournaments')
        .delete()
        .eq('id', parseInt(eventId));

      if (error) throw error;

      alert("✅ Event has been permanently deleted.");
      router.push('/dashboard');
    } catch (err: any) {
      console.error(err);
      alert("Failed to delete event: " + err.message);
    } finally {
      setSaving(false);
    }
  };
  

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
                <img src={event.image_url} alt={event.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-6xl text-gray-600">🏌️</div>
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
                      .upload(filePath, file, { cacheControl: '3600', upsert: false });

                    if (uploadError) throw uploadError;

                    const { data: { publicUrl } } = supabase.storage
                      .from('tournament-images')
                      .getPublicUrl(filePath);

                    handleEventChange('image_url', publicUrl);
                    alert("Image uploaded successfully! Click 'Save Changes' to store it.");
                  } catch (err: any) {
                    alert("Failed to upload image: " + err.message);
                  }
                }}
                className="block w-full text-sm text-gray-400 file:mr-4 file:py-4 file:px-6 file:rounded-3xl file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Golf Course Search */}
        
        <div>
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
                  console.log("Selected course:", course);
                  await selectCourse(course);
                }}
                className="px-6 py-5 hover:bg-gray-700 cursor-pointer border-b border-gray-700 last:border-none"
              >
                <div className="font-medium">{course.name || course.course_name || 'Unknown Course'}</div>
                <div className="text-sm text-gray-400">
                  {course.club_name || course.city || course.location?.city || ''} • {course.state || course.location?.state || ''}
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

        {/* Three Buttons */}
        <div className="flex flex-wrap gap-3 mt-8">
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
                {/* Flights Panel */}
        {showFlights && (
          <div className="bg-gray-900 border border-purple-500/30 rounded-3xl p-8 mt-8">
            <h3 className="text-xl font-medium mb-6">Manage Flights</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end mb-8">
              <div className="md:col-span-4">
                <input 
                  value={newFlight.name} 
                  onChange={(e) => setNewFlight({ ...newFlight, name: e.target.value })} 
                  placeholder="Flight A..." 
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5" 
                />
              </div>
              <div className="md:col-span-4">
                <input 
                  value={newFlight.range} 
                  onChange={(e) => setNewFlight({ ...newFlight, range: e.target.value })} 
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
                      <span className="ml-4 text-gray-400">Range: {flight.range}</span>
                    </div>
                    <button 
                      onClick={() => handleDeleteFlight(index)} 
                      className="text-red-500 hover:text-red-600 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                  <label className="block text-sm text-gray-400 mb-2">Tees for this Flight</label>
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
                      const teeName = tee.name || tee.tee_name || tee.color || `Tee ${i+1}`;
                      const teeYards = tee.total_yards || tee.yardage || 0;
                      return <option key={i} value={teeName}>{teeName} ({teeYards} yds)</option>;
                    })}
                  </select>
                </div>
              ))}
            </div>

            {(event.flights || []).length === 0 && (
              <p className="text-gray-400 text-center py-8">No flights added yet. Add one above!</p>
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
                  onChange={(e) => setNewAddon({ ...newAddon, name: e.target.value })} 
                  placeholder="Mulligan Package, Cart, etc." 
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5" 
                />
              </div>
              <div className="md:col-span-2">
                <input 
                  type="number" 
                  value={newAddon.quantity_available} 
                  onChange={(e) => setNewAddon({ ...newAddon, quantity_available: parseInt(e.target.value) || 0 })} 
                  placeholder="Qty" 
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5 text-center" 
                />
              </div>
              <div className="md:col-span-2">
                <input 
                  type="number" 
                  value={newAddon.price_per_unit} 
                  onChange={(e) => setNewAddon({ ...newAddon, price_per_unit: parseFloat(e.target.value) || 0 })} 
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
                <div key={addon.id} className="bg-gray-800 p-6 rounded-3xl flex justify-between items-center">
                  <div>
                    <div className="font-medium">{addon.name}</div>
                    <div className="text-sm text-gray-400">
                      ${addon.price_per_unit} each • {addon.quantity_available} available
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
                <div key={admin.id} className="bg-gray-800 p-6 rounded-3xl flex justify-between items-center">
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <label className="block text-sm text-gray-400 mb-2">Event Name</label>
        <input value={event.name || ''} onChange={(e) => handleEventChange('name', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5" />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-2">Event Type</label>
        <select value={event.event_type || ''} onChange={(e) => handleEventChange('event_type', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5">
          <option value="">Select Event Type</option>
          <option value="individual">Individual Stroke Play</option>
          <option value="2man-best-ball">2-Man Best Ball</option>
          <option value="2man-scramble">2-Man Scramble</option>
          <option value="4man-best-ball">4-Man Best Ball</option>
          <option value="4man-scramble">4-Man Scramble</option>
          <option value="skins">Skins Match</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-2">{event.event_type?.toLowerCase() === 'individual' ? 'Price' : 'Team Price'}</label>
        <input type="number" value={event.price || ''} onChange={(e) => handleEventChange('price', parseFloat(e.target.value) || 0)} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5" />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-2">Golfers per Team</label>
        <input type="number" value={event.max_teammates || 1} onChange={(e) => handleEventChange('max_teammates', parseInt(e.target.value) || 1)} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5" min="1" />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-2">Registration Open Date</label>
        <input type="date" value={event.registration_open_date || ''} onChange={(e) => handleEventChange('registration_open_date', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5" />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-2">Open Time</label>
        <input type="time" value={event.registration_open_time || ''} onChange={(e) => handleEventChange('registration_open_time', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5" />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-2">Event Date</label>
        <input type="date" value={event.date || ''} onChange={(e) => handleEventChange('date', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5" />
      </div>

      {/* Number of Holes Toggle */}
      <div className="md:col-span-2">
        <label className="block text-sm text-gray-400 mb-3">Number of Holes</label>
        <div className="flex gap-3 bg-gray-700 border border-gray-600 rounded-3xl p-1">
          <button type="button" onClick={() => handleEventChange('number_of_holes', 9)} className={`flex-1 py-4 rounded-3xl font-medium ${event?.number_of_holes === 9 ? 'bg-blue-600 text-white' : 'hover:bg-gray-600 text-gray-300'}`}>9 Holes</button>
          <button type="button" onClick={() => handleEventChange('number_of_holes', 18)} className={`flex-1 py-4 rounded-3xl font-medium ${event?.number_of_holes === 18 || !event?.number_of_holes ? 'bg-blue-600 text-white' : 'hover:bg-gray-600 text-gray-300'}`}>18 Holes</button>
        </div>
      </div>

      {/* Players per Hole */}
      <div>
        <label className="block text-sm text-gray-400 mb-2">Players per Hole</label>
        <input type="number" value={event.players_per_hole || 4} onChange={(e) => handleEventChange('players_per_hole', parseInt(e.target.value) || 4)} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5" min="1" />
      </div>

      {/* Start Format */}
      <div>
        <label className="block text-sm text-gray-400 mb-2">Start Format</label>
        <select value={event.start_format || 'shotgun'} onChange={(e) => handleEventChange('start_format', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5">
          <option value="shotgun">Shotgun Start</option>
          <option value="tee_times">Tee Times</option>
          <option value="double_tee">Double Tee</option>
        </select>
      </div>

      {event.start_format === 'tee_times' && (
        <div>
          <label className="block text-sm text-gray-400 mb-2">Minutes between Tee Times</label>
          <input type="number" value={event.tee_time_interval || 10} onChange={(e) => handleEventChange('tee_time_interval', parseInt(e.target.value) || 10)} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5" min="5" />
        </div>
      )}

      {/* Starting Hole */}
      <div>
        <label className="block text-sm text-gray-400 mb-2">Starting Hole</label>
        <select value={event.starting_hole || 1} onChange={(e) => handleEventChange('starting_hole', parseInt(e.target.value))} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5">
          {Array.from({ length: event?.number_of_holes || 18 }, (_, i) => (
            <option key={i + 1} value={i + 1}>Hole {i + 1}</option>
          ))}
        </select>
      </div>

      {/* Event Contact - Clean stacked */}
      <div className="md:col-span-2">
        <label className="block text-sm text-gray-400 mb-4">Event Contact (optional)</label>
        <div className="space-y-6">
          <div>
            <label className="block text-xs text-gray-500 mb-2">Contact Name</label>
            <input placeholder="John Smith" value={event.contact_name || ''} onChange={(e) => handleEventChange('contact_name', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5 text-base" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-2">Email Address</label>
            <input type="email" placeholder="John@friedeggevents.app" value={event.contact_email || ''} onChange={(e) => handleEventChange('contact_email', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5 text-base" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-2">Phone Number</label>
            <input type="tel" placeholder="(555) 555-5555" value={event.contact_phone || ''} onChange={(e) => handleEventChange('contact_phone', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5 text-base" />
          </div>
        </div>
      </div>

              {/* Event Description */}
        <div className="mt-10">
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

      {/* USGA Checkbox */}
      <div className="md:col-span-2">
        <label className="flex items-center gap-3 text-lg cursor-pointer">
          <input type="checkbox" checked={!!event?.usga_event} onChange={(e) => handleEventChange('usga_event', e.target.checked)} className="w-6 h-6 accent-blue-600" />
          <span className="font-medium">USGA Event (submit scores to USGA)</span>
        </label>
      </div>

      {/* Handicaps Checkbox */}
      <div className="md:col-span-2 mt-6 pt-8 border-t border-gray-700">
        <label className="flex items-center gap-3 text-lg cursor-pointer">
          <input type="checkbox" checked={!!event?.use_handicaps} onChange={(e) => handleEventChange('use_handicaps', e.target.checked)} className="w-6 h-6 accent-blue-600" />
          <span className="font-medium">Use Handicaps for this Event</span>
        </label>
        <p className="text-sm text-gray-500 mt-2 ml-9">
          When enabled, you can enter individual handicaps for each player or team in the Check-in tab.
        </p>
      </div>
    </div>
          {/* Waiver / Terms Checkbox for Event Creation */}
      <div className="md:col-span-2 flex items-start gap-3 bg-gray-900 p-5 rounded-2xl mt-6">
        <input
          type="checkbox"
          id="event-terms"
          checked={agreedToTerms}
          onChange={(e) => setAgreedToTerms(e.target.checked)}
          className="mt-1 w-5 h-5 accent-blue-600"
        />
        <label htmlFor="event-terms" className="text-sm text-gray-300 cursor-pointer">
          I agree to Fried Egg Events Terms of Service and will ensure all participants sign the Waiver & Release of Liability.
        </label>
      </div>

    {/* Save / Postpone / Delete Buttons */}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <button onClick={handleSaveEvent} disabled={saving} className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 py-5 rounded-3xl font-semibold text-lg">
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
      <button onClick={() => alert('Update the date and save to postpone the event')} className="bg-amber-600 hover:bg-amber-700 py-5 rounded-3xl font-semibold text-lg">
        Postpone Event
      </button>
      <button
  onClick={handleDeleteEvent}
  disabled={saving}
  className="px-8 py-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded-3xl font-medium text-lg transition-colors flex items-center gap-2"
>
  🗑️ Delete Event
</button>
    </div>
    </div>

  </div>
);
}