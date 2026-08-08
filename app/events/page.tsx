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
      const {
        data: { user },
      } = await supabase.auth.getUser();
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
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin mx-auto mb-6"></div>
          <p className="text-gray-400">Loading event details...</p>
        </div>
      </div>
    );
  }

  // Compare calendar dates (noon) so timezone doesn't push same-day events into Past
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const eventDay = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const upcoming = events.filter((e) => eventDay(e.date) >= today);
  const past = events.filter((e) => eventDay(e.date) < today);

  const EventCard = ({
    event,
    isPast = false,
  }: {
    event: any;
    isPast?: boolean;
  }) => (
    <div
      className={`bg-gray-800 p-6 rounded-3xl hover:bg-gray-700 transition-colors ${
        isPast ? 'opacity-90' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="text-xl font-semibold">{event.name}</h3>
        {isPast && (
          <span className="shrink-0 text-xs px-2.5 py-1 rounded-full bg-gray-700 text-gray-400">
            Past
          </span>
        )}
      </div>
      <p className="text-gray-400 mb-6 text-sm">
        {new Date(event.date + 'T12:00:00').toLocaleDateString()} •{' '}
        {event.course}
      </p>

      <div className="space-y-2 text-sm">
        <Link
          href={`/event/${event.id}/manage`}
          className="block text-blue-400 hover:text-blue-300 font-medium"
        >
          Manage Event →
        </Link>
        <Link
          href={`/event/${event.id}/check-in`}
          className="block text-blue-400 hover:text-blue-300"
        >
          Check-In →
        </Link>
        <Link
          href={`/event/${event.id}/scoring`}
          className="block text-blue-400 hover:text-blue-300"
        >
          Scoring →
        </Link>
        <Link
          href={`/event/${event.id}/leaderboard`}
          className="block text-blue-400 hover:text-blue-300"
        >
          Leaderboard →
        </Link>
        <Link
          href={`/event/${event.id}/pairings`}
          className="block text-blue-400 hover:text-blue-300"
        >
          Pairings →
        </Link>
        <Link
          href={`/event/${event.id}/scorecards`}
          className="block text-blue-400 hover:text-blue-300"
        >
          Scorecards →
        </Link>
        <Link
          href={`/event/${event.id}/income`}
          className="block text-blue-400 hover:text-blue-300"
        >
          Income →
        </Link>
        <Link
          href={`/event/${event.id}`}
          className="block text-gray-400 hover:text-gray-300"
        >
          View public page →
        </Link>
      </div>
    </div>
  );

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
            <h2 className="text-2xl font-semibold mb-6 text-gray-300">
              Upcoming
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {upcoming.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </div>
        )}

        {past.length > 0 && (
          <div>
            <h2 className="text-2xl font-semibold mb-6 text-gray-300">
              Past Events
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              You can still open Manage to finish setup, edit details, or pull
              reports after the event date.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {past.map((event) => (
                <EventCard key={event.id} event={event} isPast />
              ))}
            </div>
          </div>
        )}

        {events.length === 0 && (
          <div className="bg-gray-800 rounded-3xl p-16 text-center">
            <div className="text-6xl mb-6">🏌️</div>
            <h3 className="text-2xl font-semibold mb-3">No Events Yet</h3>
            <p className="text-gray-400 mb-8 max-w-md mx-auto">
              You haven&apos;t created any tournaments yet. Get started by
              creating your first event!
            </p>
            <Link
              href="/create"
              className="inline-block bg-green-600 hover:bg-green-700 px-8 py-4 rounded-2xl font-semibold text-lg"
            >
              Create Your First Event
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}