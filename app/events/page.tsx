'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

export default function EventsPage() {
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
        .order('date', { ascending: true });
      
      setEvents(data || []);
      setLoading(false);
    };
    fetchEvents();
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white py-12">
      <div className="max-w-5xl mx-auto px-6">
        <h1 className="text-5xl font-bold mb-12">Upcoming Events</h1>

        {loading ? (
          <p className="text-xl text-gray-400">Loading events...</p>
        ) : events.length === 0 ? (
          <p className="text-xl text-gray-400">No events found.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {events.map((event) => (
              <Link
                key={event.id}
                href={`/event/${event.id}`}
                className="group bg-gray-800 rounded-3xl p-8 hover:bg-gray-700 transition-all duration-300 hover:-translate-y-1"
              >
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-2xl font-semibold mb-2 group-hover:text-blue-400 transition-colors">
                      {event.name}
                    </h3>
                    <p className="text-gray-400">
                      {event.location} • {event.course}
                    </p>
                  </div>

                  {event.event_type && (
                    <div className="text-xs bg-gray-700 px-4 py-2 rounded-full capitalize whitespace-nowrap">
                      {event.event_type.replace(/-/g, ' ')}
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-sm text-gray-500">Date</p>
                    <p className="font-medium">
                      {new Date(event.date).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-sm text-gray-500">Price</p>
                    <p className="text-xl font-semibold text-emerald-400">
                      {event.price ? `$${Number(event.price).toFixed(2)}` : 'Free'}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}