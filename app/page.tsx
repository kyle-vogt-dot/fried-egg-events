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

  function isListableReg(r: any) {
  if (r.refunded === true) return false;
  if (r.paid === true) return true;
  const m = String(r.payment_method || '').toLowerCase();
  return ['comp', 'complimentary', 'cash', 'manual', 'checkin', 'payment_link'].includes(
    m
  );
}

function getEventRegWindow(event: any) {
  const now = new Date();

  const open =
    event.registration_open_date
      ? new Date(
          `${event.registration_open_date}T${event.registration_open_time || '00:00:00'}`
        )
      : null;

  const close =
    event.registration_close_date
      ? new Date(
          `${event.registration_close_date}T${event.registration_close_time || '23:59:59'}`
        )
      : null;

  const notYetOpen = !!(open && now < open);
  const closed = !!(close && now > close);
  const isOpen = !notYetOpen && !closed && (!!open || !close);

  return { notYetOpen, closed, isOpen };
}

  useEffect(() => {
    const fetchEvents = async () => {
      const { data } = await supabase
        .from('tournaments')
        .select('*')
        .eq('is_active', true)
        .eq('is_locked', false)
        .order('date', { ascending: true });

      setEvents(data || []);
      setLoading(false);
    };

    fetchEvents();
}, []);   // ← Keep empty array for now

  const filteredEvents = events.filter(event =>
    event.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    event.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    event.course?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const [regCounts, setRegCounts] = useState<Record<number, number>>({});

  useEffect(() => {
    const fetchEvents = async () => {
      const { data } = await supabase
        .from('tournaments')
        .select('*')
        .eq('is_active', true)
        .eq('is_locked', false)
        .order('date', { ascending: true });

      const list = data || [];
      setEvents(list);

      const ids = list.map((e: any) => e.id);
      if (ids.length) {
        const { data: regs } = await supabase
          .from('event_registrations')
          .select('id, event_id, paid, payment_method, refunded')
          .in('event_id', ids);

        const counts: Record<number, number> = {};
        for (const r of regs || []) {
          if (!isListableReg(r)) continue;
          const eid = Number(r.event_id);
          counts[eid] = (counts[eid] || 0) + 1;
        }
        setRegCounts(counts);
      }

      setLoading(false);
    };

    fetchEvents();
  }, []);

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
      {/* Top Navigation Bar - Mobile Optimized */}
      <div className="border-b border-gray-800 bg-gray-900 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="text-2xl font-bold tracking-tight">Fried Egg Events</div>
          </div>

         

          {/* Right side buttons */}
          <div className="flex items-center gap-3">
            <button 
              onClick={handleCreateEvent}
              disabled={creating}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 px-6 py-3 rounded-2xl font-semibold text-sm transition-colors whitespace-nowrap"
            >
              {creating ? 'Checking...' : '+ Create Event'}
            </button>

            
          </div>
        </div>
      </div>

       

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        
        {/* Title + Search Bar Row */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-12">
          <div>
            <h1 className="text-4xl sm:text-5xl font-bold">Upcoming Tournaments</h1>
            <p className="text-gray-400 mt-2 text-lg sm:text-xl">Find or host great golf events</p>
          </div>

          {/* Search Bar (you already moved this here) */}
          <div className="flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search events, courses, or locations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-3xl px-5 py-3 text-sm focus:outline-none focus:border-blue-500 transition-colors"
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
              const { isOpen, closed, notYetOpen } = getEventRegWindow(event);
              const maxPlayers = Number(event.max_players) || 0;
              const taken = regCounts[event.id] || 0;
              const spotsLeft =
                maxPlayers > 0 ? Math.max(0, maxPlayers - taken) : null;
              const soldOut = spotsLeft === 0;

              let badgeText = 'Registration closed';
              let badgeClass = 'bg-gray-600 text-white';
              if (soldOut) {
                badgeText = 'Sold out';
                badgeClass = 'bg-red-600 text-white';
              } else if (isOpen) {
                badgeText = 'Registration open';
                badgeClass = 'bg-green-600 text-white';
              } else if (notYetOpen) {
                badgeText = 'Registration opens soon';
                badgeClass = 'bg-amber-600 text-white';
              } else if (closed) {
                badgeText = 'Registration closed';
                badgeClass = 'bg-gray-600 text-white';
              }

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
                    <div
                      className={`absolute top-4 right-4 text-xs font-semibold px-4 py-1.5 rounded-full ${badgeClass}`}
                    >
                      {badgeText}
                    </div>
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
  {new Date(event.date + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })}
</p>
                      </div>
                                          {spotsLeft != null && (
                      <p className="mt-3 text-sm text-gray-400">
                        {soldOut
                          ? 'No spots remaining'
                          : `${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} remaining`}
                      </p>
                    )}
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