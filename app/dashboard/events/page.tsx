'use client';

import { useEffect, useState } from 'react';
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
      
      if (!user) {
        // Redirect or show login
        return;
      }

      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .eq('created_by', user.id)
        .order('date', { ascending: false });

      if (error) console.error(error);
      else setEvents(data || []);
      
      setLoading(false);
    };

    fetchEvents();
  }, [supabase]);

  if (loading) return <div className="text-center py-20 text-xl">Loading your events...</div>;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-10">
        <h1 className="text-4xl font-bold">Created Events</h1>
        <Link href="/create" className="bg-green-600 hover:bg-green-700 px-8 py-4 rounded-3xl font-medium">
          + Create New Event
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="bg-gray-900 rounded-3xl p-16 text-center">
          <p className="text-2xl mb-4">No events yet</p>
          <Link href="/create" className="text-blue-400 hover:underline">Create your first tournament →</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {events.map((event) => (
            <Link 
              key={event.id} 
              href={`/event/${event.id}/admin`}
              className="bg-gray-900 rounded-3xl p-8 hover:bg-gray-800 transition-all group"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-semibold mb-2 group-hover:text-blue-400">{event.name}</h3>
                  <p className="text-gray-400">{new Date(event.date).toLocaleDateString()}</p>
                </div>
                <div className="text-sm bg-gray-800 px-4 py-2 rounded-full">{event.event_type || 'Event'}</div>
              </div>
              
              <div className="mt-8 text-blue-400 flex items-center gap-2 text-sm">
                Manage Event →
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}