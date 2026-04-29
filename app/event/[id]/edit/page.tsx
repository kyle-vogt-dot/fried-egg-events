'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export default function EditEventPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Fetch the event
  useEffect(() => {
    const fetchEvent = async () => {
      if (!eventId) return;

      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', parseInt(eventId))
        .single();

      if (error) {
        console.error("Fetch error:", error);
      } else if (data) {
        setEvent(data);
      }
      setLoading(false);
    };

    fetchEvent();
  }, [eventId]);

  // Handle form submission
  const handleSubmit = async (formData: FormData) => {
    setSaving(true);

    const updates = {
      name: formData.get('name') as string,
      date: formData.get('date') as string,
      location: formData.get('location') as string,
      course: formData.get('course') as string,
      description: formData.get('description') as string || null,
      max_players: formData.get('maxPlayers') 
        ? parseInt(formData.get('maxPlayers') as string) 
        : null,
      price: formData.get('price') 
        ? parseFloat(formData.get('price') as string) 
        : null,
      event_type: formData.get('eventType') as string || null,
      registration_open_date: formData.get('registrationOpenDate') as string || null,
      registration_open_time: formData.get('registrationOpenTime') as string || null,
    };

    const { error } = await supabase
      .from('tournaments')
      .update(updates)
      .eq('id', parseInt(eventId));

    if (error) {
      console.error("Update error:", error);
      alert("Update failed: " + error.message);
    } else {
      alert("Update successful! Check Supabase table.");
      router.push(`/event/${eventId}`);
    }

    setSaving(false);
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center text-2xl">Loading event...</div>;
  }

  if (!event) {
    return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center text-2xl">Event not found</div>;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <button 
          onClick={() => router.push(`/event/${eventId}`)} 
          className="mb-8 text-gray-400 hover:text-white flex items-center gap-2"
        >
          ← Back to Event
        </button>

        <div className="bg-gray-800 rounded-3xl p-12">
          <h1 className="text-5xl font-bold mb-8">Edit Event</h1>

          <form action={handleSubmit} className="space-y-8">
            <div>
              <label className="block text-sm font-medium mb-2">Event Name</label>
              <input 
                type="text" 
                name="name" 
                defaultValue={event.name} 
                required
                className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-2xl text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2">Date</label>
                <input 
                  type="date" 
                  name="date" 
                  defaultValue={event.date} 
                  required
                  className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-2xl text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Max Players</label>
                <input 
                  type="number" 
                  name="maxPlayers" 
                  defaultValue={event.max_players} 
                  className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-2xl text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Location</label>
              <input 
                type="text" 
                name="location" 
                defaultValue={event.location} 
                required
                className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-2xl text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Course Name</label>
              <input 
                type="text" 
                name="course" 
                defaultValue={event.course} 
                required
                className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-2xl text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Price</label>
              <input 
                type="number" 
                step="0.01"
                name="price" 
                defaultValue={event.price} 
                className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-2xl text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Event Type</label>
              <select 
                name="eventType" 
                defaultValue={event.event_type || ''} 
                className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-2xl text-white"
              >
                <option value="">Select Type</option>
                <option value="individual">Individual</option>
                <option value="2man-best-ball">2 Man Best Ball</option>
                <option value="2man-scramble">2 Man Scramble</option>
                <option value="4man-best-ball">4 Man Best Ball</option>
                <option value="4man-scramble">4 Man Scramble</option>
                <option value="skins">Skins Match</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* New Registration Open Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2">Registration Opens - Date</label>
                <input 
                  type="date" 
                  name="registrationOpenDate" 
                  defaultValue={event.registration_open_date || ''} 
                  className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-2xl text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Registration Opens - Time</label>
                <input 
                  type="time" 
                  name="registrationOpenTime" 
                  defaultValue={event.registration_open_time || ''} 
                  className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-2xl text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <textarea 
                name="description" 
                defaultValue={event.description || ''} 
                rows={5}
                className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-2xl text-white"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-2xl font-semibold text-lg transition-colors"
            >
              {saving ? 'Saving Changes...' : 'Save Changes'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}