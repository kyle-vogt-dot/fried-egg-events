'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

export default function CreatedEventsPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const fetchEvents = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('tournaments')
        .select('*')
        .eq('created_by', user.id)
        .order('date', { ascending: true });

      setEvents(data || []);
      setLoading(false);
    };

    fetchEvents();
  }, [supabase]);

  if (loading) {
    return <div className="p-12 text-center text-xl text-white">Loading your events...</div>;
  }

  const now = new Date();
  const upcoming = events.filter(e => new Date(e.date) >= now);
  const past = events.filter(e => new Date(e.date) < now);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-10">
          <h1 className="text-4xl font-bold">Created Events</h1>
          <Link 
            href="/create" 
            className="bg-green-600 hover:bg-green-700 px-8 py-4 rounded-3xl font-semibold flex items-center gap-2"
          >
            + Create New Event
          </Link>
        </div>

        {upcoming.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-semibold mb-6 text-gray-300">Upcoming</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {upcoming.map((event) => (
                <div key={event.id} className="bg-gray-800 p-8 rounded-3xl hover:bg-gray-700 transition-colors">
                  <h3 className="text-2xl font-semibold mb-2">{event.name}</h3>
                  <p className="text-gray-400 mb-6">{new Date(event.date).toLocaleDateString()}</p>
                  
                  <div className="flex gap-3">
                    <Link 
                      href={`/event/${event.id}/admin`}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 py-4 rounded-2xl text-center font-medium"
                    >
                      Manage Event →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {past.length > 0 && (
          <div>
            <h2 className="text-2xl font-semibold mb-6 text-gray-300">Past Events</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 opacity-75">
              {past.map((event) => (
                <div key={event.id} className="bg-gray-800 p-8 rounded-3xl hover:bg-gray-700 transition-colors">
                  <h3 className="text-2xl font-semibold mb-2">{event.name}</h3>
                  <p className="text-gray-400 mb-6">{new Date(event.date).toLocaleDateString()}</p>
                  
                  <div className="flex gap-3">
                    <Link 
                      href={`/event/${event.id}/admin`}
                      className="flex-1 bg-gray-700 hover:bg-gray-600 py-4 rounded-2xl text-center font-medium"
                    >
                      View Results →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {events.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            You haven't created any events yet.
          </div>
        )}
      </div>
    </div>
  );
}