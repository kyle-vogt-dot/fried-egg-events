'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import EventTabs from '@/app/components/EventTabs';
import BackButton from '@/app/components/BackButton';
import LeagueLineupPanel from '@/app/components/LeagueLineupPanel';
import { loadEventAccess } from '@/app/libs/event-admin';
import { isLeagueEvent } from '@/app/libs/league-match';

export default function EventLineupPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [event, setEvent] = useState<any>(null);
  const [rounds, setRounds] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const id = parseInt(eventId, 10);
      const {
        data: { user: u },
      } = await supabase.auth.getUser();
      setUser(u || null);

      const { data: ev } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', id)
        .single();
      setEvent(ev);

      if (!isLeagueEvent(ev)) {
        router.replace(`/event/${eventId}/scoring`);
        return;
      }

      if (u) {
        const access = await loadEventAccess(supabase, id, u);
        setIsAdmin(!!(access.isCreator || access.isPlatform || access.allowed));
      }

      const { data: roundsData } = await supabase
        .from('event_rounds')
        .select('*')
        .eq('event_id', id)
        .order('sort_order', { ascending: true });
      setRounds(roundsData || []);

      const { data: regs } = await supabase
        .from('event_registrations')
        .select('*')
        .eq('event_id', id);
      setRegistrations(regs || []);
      setLoading(false);
    };
    load();
  }, [eventId, router, supabase]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        Loading lineup...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
        <BackButton
          href="/events"
          className="mb-6 text-gray-400 hover:text-white"
        />
        <EventTabs eventId={eventId} variant="dayof" active="lineup" />
        <h1 className="text-4xl font-bold mb-2">{event?.name}</h1>
        <p className="text-gray-400 mb-8">Weekly lineup · pick {Number(event?.players_per_match) || 2}</p>
        <LeagueLineupPanel
          event={event}
          rounds={rounds}
          registrations={registrations}
          isAdmin={isAdmin}
          user={user}
        />
      </div>
    </div>
  );
}
