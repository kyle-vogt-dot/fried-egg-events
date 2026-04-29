'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';

export default function EventsPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [creating, setCreating] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const router = useRouter();

  useEffect(() => {
    const fetchEvents = async () => {
      const { data } = await supabase
        .from('tournaments')
        .select('*')
        .order('date', { ascending: true });

      setEvents(data || []);
      setLoading(false);
    };

    fetchEvents();
  }, []);

  const filteredEvents = events.filter(event =>
    event.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    event.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    event.course?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isRegistrationOpen = (event: any) => {
    if (!event.registration_open_date) return false;
    const now = new Date();
    const openDate = new Date(event.registration_open_date + 'T' + (event.registration_open_time || '00:00:00'));
    return now >= openDate;
  };

  const handleCreateEvent = async () => {
    setCreating(true);

    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      router.push('/create');
    } else {
      router.push('/signup?redirect=/create');
    }

    setCreating(false);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Top Navigation Bar */}
      <div className="border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-2xl font-bold">Fried Egg Events</div>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={handleCreateEvent}
              disabled={creating}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 px-8 py-3 rounded-2xl font-semibold transition-colors"
            >
              {creating ? 'Checking...' : '+ Create Event'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="flex justify-between items-end mb-10">
          <div>
            <h1 className="text-5xl font-bold">Upcoming Tournaments</h1>
            <p className="text-gray-400 mt-2 text-xl">Find or host great golf events</p>
          </div>

          <div className="relative w-80">
            <input
              type="text"
              placeholder="Search events, courses, or locations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-6 py-4 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading events...</div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-20 text-gray-400">No events found matching your search.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">


            {filteredEvents.map((event) => {
  const registrationIsOpen = isRegistrationOpen(event);

  return (
    <Link
      key={event.id}
      href={`/event/${event.id}`}
      className="block bg-gray-800 rounded-3xl overflow-hidden hover:bg-gray-700 transition-all group"
    >
      {/* Image Thumbnail */}
      <div className="relative h-48 bg-gray-900">
        {event.image_url ? (
          <img 
            src={event.image_url} 
            alt={event.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600 text-6xl">
            🏌️
          </div>
        )}

        {/* Registration Open Badge */}
        {registrationIsOpen && (
          <div className="absolute top-4 right-4 bg-green-600 text-white text-xs font-semibold px-4 py-1.5 rounded-full">
            Registration Open
          </div>
        )}
      </div>

      {/* Event Info */}
      <div className="p-8">
        <h3 className="text-2xl font-semibold mb-3 group-hover:text-green-400 transition-colors">
          {event.name}
        </h3>
        <p className="text-gray-400 mb-1">{event.course}</p>
        <p className="text-gray-500">{event.location}</p>

        <div className="mt-8 flex justify-between items-end">
          <div>
            <p className="text-xs text-gray-500">DATE</p>
            <p className="font-medium">
              {new Date(event.date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">MAX PLAYERS</p>
            <p className="font-medium">
              {event.max_players || event.max_teammates || 'N/A'}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
})}
          </div>
        )}
      </div>
    </div>
  );
}