'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import EventEmailsPanel from '@/app/components/EventEmailsPanel';

export default function EventEmailsPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [eventName, setEventName] = useState('');

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login?redirect=' + encodeURIComponent(`/event/${eventId}/emails`));
        return;
      }

      const { data: eventData } = await supabase
        .from('tournaments')
        .select('id, name, created_by')
        .eq('id', parseInt(eventId))
        .single();

      if (!eventData) {
        setLoading(false);
        return;
      }
      setEventName(eventData.name || '');

      const email = (user.email || '').toLowerCase();
      const isCreator = eventData.created_by === user.id;
      const { data: adminRow } = await supabase
        .from('event_admins')
        .select('id')
        .eq('event_id', parseInt(eventId))
        .or(`user_id.eq.${user.id},email.eq."${email}"`)
        .maybeSingle();

      setAllowed(isCreator || !!adminRow);
      setLoading(false);
    })();
  }, [eventId, router, supabase]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        Loading…
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-12 text-center">
        <p className="text-red-400 text-xl">Access denied</p>
        <button onClick={() => router.back()} className="mt-6 px-6 py-3 bg-gray-700 rounded-2xl">
          ← Go back
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-gray-400 hover:text-white"
        >
          ← Back
        </button>
        <h1 className="text-3xl font-bold">Emails</h1>
        <p className="text-gray-400">{eventName}</p>
        <EventEmailsPanel eventId={parseInt(eventId)} />
      </div>
    </div>
  );
}