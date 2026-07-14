'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

export default function PlayEventsPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const fetchEvents = async () => {
      const { data } = await supabase
        .from('tournaments')
        .select('*')
        .gt('date', new Date().toISOString())
        .order('date', { ascending: true });

      setEvents(data || []);
      setLoading(false);
    };

    fetchEvents();
  }, [supabase]);

  if (loading) {
    return <div className="p-12 text-center text-xl text-white">Loading upcoming events...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-10">
          <h1 className="text-4xl font-bold">Play Events</h1>
          <div className="text-gray-400">Find and join upcoming tournaments</div>
        </div>

        {events.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {events.map((event) => (
              <div key={event.id} className="bg-gray-800 p-8 rounded-3xl hover:bg-gray-700 transition-colors">
                <h3 className="text-2xl font-semibold mb-2">{event.name}</h3>
                <p className="text-gray-400 mb-2">{new Date(event.date).toLocaleDateString()}</p>
                <p className="text-gray-400 mb-6">{event.course}</p>
                
                <div className="flex gap-3">
                  <Link 
                    href={`/event/${event.id}`}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 py-4 rounded-2xl text-center font-medium"
                  >
                    View Event
                  </Link>
                  <Link 
                    href={`/event/${event.id}/register`}
                    className="flex-1 bg-green-600 hover:bg-green-700 py-4 rounded-2xl text-center font-medium"
                  >
                    Register →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 text-gray-400">
            No upcoming events at the moment.
          </div>
        )}
      </div>
    </div>
  );
}