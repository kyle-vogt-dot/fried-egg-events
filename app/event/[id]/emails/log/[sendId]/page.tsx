'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export default function EventEmailLogPage() {
  const params = useParams<{ id: string; sendId: string }>();
  const router = useRouter();
  const eventId = params.id;
  const sendId = params.sendId;

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [row, setRow] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push(
          '/login?redirect=' +
            encodeURIComponent(`/event/${eventId}/emails/log/${sendId}`)
        );
        return;
      }

      const { data: eventData } = await supabase
        .from('tournaments')
        .select('id, created_by')
        .eq('id', parseInt(eventId))
        .single();

      const email = (user.email || '').toLowerCase();
      const isCreator = eventData?.created_by === user.id;
      const { data: adminRow } = await supabase
        .from('event_admins')
        .select('id')
        .eq('event_id', parseInt(eventId))
        .or(`user_id.eq.${user.id},email.eq."${email}"`)
        .maybeSingle();

      if (!isCreator && !adminRow) {
        setDenied(true);
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('event_email_sends')
        .select('*')
        .eq('id', sendId)
        .eq('event_id', parseInt(eventId))
        .maybeSingle();

      setRow(data);
      setLoading(false);
    })();
  }, [eventId, sendId, router, supabase]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        Loading…
      </div>
    );
  }

  if (denied) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-12 text-center">
        Access denied
      </div>
    );
  }

  if (!row) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-12 text-center">
        Send not found
      </div>
    );
  }

  const results: {
    email: string;
    name?: string;
    status: string;
    error?: string | null;
  }[] = Array.isArray(row.results) ? row.results : [];
  const ok = results.filter((r) => r.status === 'sent');
  const bad = results.filter((r) => r.status !== 'sent');

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

        <h1 className="text-3xl font-bold">Email send</h1>
        <p className="text-gray-400">
          {new Date(row.created_at).toLocaleString()} · {row.template_key} ·{' '}
          {row.audience}
        </p>
        <p className="text-sm text-gray-500">{row.subject}</p>
        <p className="text-lg">
          {ok.length} sent · {bad.length} failed · {results.length} total
        </p>

        <div>
          <h2 className="text-emerald-400 font-semibold mb-3">Successful</h2>
          {ok.length === 0 ? (
            <p className="text-gray-500 text-sm">None</p>
          ) : (
            <ul className="space-y-2">
              {ok.map((r) => (
                <li
                  key={r.email}
                  className="bg-gray-800 rounded-xl px-4 py-3 text-sm"
                >
                  <span className="font-medium">{r.name || '—'}</span>
                  <span className="text-gray-400"> · {r.email}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="text-red-400 font-semibold mb-3">Unsuccessful</h2>
          {bad.length === 0 ? (
            <p className="text-gray-500 text-sm">None</p>
          ) : (
            <ul className="space-y-2">
              {bad.map((r) => (
                <li
                  key={r.email}
                  className="bg-red-950/40 border border-red-500/30 rounded-xl px-4 py-3 text-sm"
                >
                  <div>
                    <span className="font-medium">{r.name || '—'}</span>
                    <span className="text-gray-400"> · {r.email}</span>
                  </div>
                  {r.error ? (
                    <p className="text-red-300 text-xs mt-1">{r.error}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}