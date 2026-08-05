'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

type Permissions = {
  manage?: boolean;
  checkin?: boolean;
  scoring?: boolean;
  leaderboard?: boolean;
  scorecards?: boolean;
  income?: boolean;
};

export default function AdminEventsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const fetchAdminEvents = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Find admin rows for this user (by user_id or email)
      const { data: adminRows } = await supabase
        .from('event_admins')
        .select('id, event_id, email, permissions, user_id')
        .or(`user_id.eq.${user.id},email.eq.${user.email}`);

      if (!adminRows || adminRows.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      const eventIds = [...new Set(adminRows.map((r) => r.event_id))];

      const { data: events } = await supabase
        .from('tournaments')
        .select('*')
        .in('id', eventIds)
        .order('date', { ascending: true });

      const byEventId: Record<number, any> = {};
      (events || []).forEach((e) => {
        byEventId[e.id] = e;
      });

      const combined = adminRows
        .map((row) => ({
          adminId: row.id,
          permissions: (row.permissions || {}) as Permissions,
          event: byEventId[row.event_id],
        }))
        .filter((x) => x.event);

      // Dedupe by event (keep first)
      const seen = new Set<number>();
      const unique = combined.filter((x) => {
        if (seen.has(x.event.id)) return false;
        seen.add(x.event.id);
        return true;
      });

      setItems(unique);
      setLoading(false);
    };

    fetchAdminEvents();
  }, [supabase]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin mx-auto mb-6"></div>
          <p className="text-gray-400">Loading admin events...</p>
        </div>
      </div>
    );
  }

  const now = new Date();
  const upcoming = items.filter((i) => new Date(i.event.date) >= now);
  const past = items.filter((i) => new Date(i.event.date) < now);

  const renderLinks = (event: any, perms: Permissions) => {
    const links: { label: string; href: string; key: keyof Permissions }[] = [
      { label: 'Manage Event', href: `/event/${event.id}/manage`, key: 'manage' },
      { label: 'Check-In', href: `/event/${event.id}/check-in`, key: 'checkin' },
      { label: 'Scoring', href: `/event/${event.id}/scoring`, key: 'scoring' },
      { label: 'Leaderboard', href: `/event/${event.id}/leaderboard`, key: 'leaderboard' },
      { label: 'Scorecards', href: `/event/${event.id}/scorecards`, key: 'scorecards' },
      { label: 'Income', href: `/event/${event.id}/income`, key: 'income' },
    ];

    const allowed = links.filter((l) => perms[l.key]);

    if (allowed.length === 0) {
      return (
        <p className="text-sm text-gray-500">No page access granted yet.</p>
      );
    }

    return (
      <div className="space-y-2 text-sm">
        {allowed.map((l) => (
          <Link
            key={l.key}
            href={l.href}
            className="block text-blue-400 hover:text-blue-300"
          >
            {l.label} →
          </Link>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-10">
          <h1 className="text-4xl font-bold">Events I Admin</h1>
        </div>

        {upcoming.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-semibold mb-6 text-gray-300">
              Upcoming
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {upcoming.map(({ event, permissions }) => (
                <div
                  key={event.id}
                  className="bg-gray-800 p-6 rounded-3xl hover:bg-gray-700 transition-colors"
                >
                  <h3 className="text-xl font-semibold mb-1">{event.name}</h3>
                  <p className="text-gray-400 mb-6 text-sm">
                    {new Date(event.date + 'T12:00:00').toLocaleDateString()} •{' '}
                    {event.course}
                  </p>
                  {renderLinks(event, permissions)}
                </div>
              ))}
            </div>
          </div>
        )}

        {past.length > 0 && (
          <div>
            <h2 className="text-2xl font-semibold mb-6 text-gray-300">
              Past Events
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 opacity-75">
              {past.map(({ event, permissions }) => (
                <div
                  key={event.id}
                  className="bg-gray-800 p-6 rounded-3xl hover:bg-gray-700 transition-colors"
                >
                  <h3 className="text-xl font-semibold mb-1">{event.name}</h3>
                  <p className="text-gray-400 mb-6 text-sm">
                    {new Date(event.date + 'T12:00:00').toLocaleDateString()} •{' '}
                    {event.course}
                  </p>
                  {renderLinks(event, permissions)}
                </div>
              ))}
            </div>
          </div>
        )}

        {items.length === 0 && (
          <div className="bg-gray-800 rounded-3xl p-16 text-center">
            <div className="text-6xl mb-6">🛡️</div>
            <h3 className="text-2xl font-semibold mb-3">No Admin Access Yet</h3>
            <p className="text-gray-400 mb-8 max-w-md mx-auto">
              When an organizer adds you as an event admin, those events will
              show up here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}