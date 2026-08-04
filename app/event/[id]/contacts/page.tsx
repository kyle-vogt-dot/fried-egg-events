'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export default function EventContactsPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<any>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      const id = parseInt(eventId);

      // 1) Event
      const { data: ev, error: evErr } = await supabase
        .from('tournaments')
        .select('id, name, date, course')
        .eq('id', id)
        .single();

      if (evErr) {
        console.error('Event load error:', evErr);
        setError(evErr.message);
      }
      setEvent(ev);

      // 2) Registrations — include discount_code
      const { data: regs, error: regErr } = await supabase
        .from('event_registrations')
        .select(
          'id, player_name, player_email, team_name, paid, checked_in, user_id, discount_code, discount_amount'
        )
        .eq('event_id', id)
        .order('player_name', { ascending: true });

      if (regErr) {
        console.error('Registrations load error:', regErr);
        setError(regErr.message);
        setRegistrations([]);
        setLoading(false);
        return;
      }

      let rows = regs || [];
      console.log('Loaded registrations:', rows.length, rows);

      // 3) Optional: phones + names from profiles
      const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: profiles, error: profErr } = await supabase
          .from('profiles')
          .select('id, phone, full_name, name, email')
          .in('id', userIds);

        if (profErr) {
          console.warn('Profiles load error (phones may be missing):', profErr);
        }

        const byId: Record<string, any> = {};
        (profiles || []).forEach((p) => {
          byId[p.id] = p;
        });

        rows = rows.map((r) => {
          const p = r.user_id ? byId[r.user_id] : null;
          return {
            ...r,
            phone: p?.phone || '',
            player_name:
              r.player_name ||
              p?.full_name ||
              p?.name ||
              r.player_email?.split('@')[0] ||
              'Player',
            player_email: r.player_email || p?.email || '',
          };
        });
      }

      setRegistrations(rows);
      setLoading(false);
    };

    load();
  }, [eventId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return registrations;
    return registrations.filter((r) => {
      const hay = `${r.player_name || ''} ${r.player_email || ''} ${r.phone || ''} ${r.team_name || ''} ${r.discount_code || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [registrations, search]);

  const emails = useMemo(
    () =>
      filtered
        .map((r) => (r.player_email || '').trim())
        .filter((e) => e.includes('@')),
    [filtered]
  );

  const phones = useMemo(
    () =>
      filtered
        .map((r) => String(r.phone || '').replace(/[^\d+]/g, ''))
        .filter((p) => p.length >= 7),
    [filtered]
  );

  const copyText = async (text: string, label: string) => {
    if (!text) return alert(`No ${label} to copy`);
    try {
      await navigator.clipboard.writeText(text);
      alert(`${label} copied (${text.split(/[\n,;]/).filter(Boolean).length})`);
    } catch {
      prompt(`Copy ${label}:`, text);
    }
  };

  const emailEveryone = () => {
    if (emails.length === 0) return alert('No emails found');
    const bcc = emails.join(',');
    const subject = encodeURIComponent(
      event?.name ? `${event.name} – update` : 'Event update'
    );
    const body = encodeURIComponent(
      event?.name
        ? `Hi everyone,\n\nQuick update about ${event.name}.\n\n`
        : 'Hi everyone,\n\n'
    );
    window.location.href = `mailto:?bcc=${encodeURIComponent(bcc)}&subject=${subject}&body=${body}`;
  };

  const textEveryone = () => {
    if (phones.length === 0) {
      return alert('No phone numbers found yet.');
    }
    copyText(phones.join('\n'), 'phone numbers');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        Loading contacts...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-8">
        <button
          onClick={() => router.back()}
          className="text-gray-400 hover:text-white"
        >
          ← Back
        </button>

        <div>
          <h1 className="text-4xl font-bold">Player contacts</h1>
          <p className="text-gray-400 mt-1">
            {event?.name || 'Event'} · {filtered.length} player
            {filtered.length === 1 ? '' : 's'}
          </p>
          {error && (
            <p className="text-red-400 mt-2 text-sm">Error: {error}</p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap gap-3">
          <button
            onClick={emailEveryone}
            className="bg-blue-600 hover:bg-blue-700 px-6 py-4 rounded-2xl font-semibold"
          >
            📧 Email everyone
          </button>
          <button
            onClick={() => copyText(emails.join(', '), 'emails')}
            className="bg-gray-700 hover:bg-gray-600 px-6 py-4 rounded-2xl font-semibold"
          >
            Copy emails
          </button>
          <button
            onClick={textEveryone}
            className="bg-emerald-600 hover:bg-emerald-700 px-6 py-4 rounded-2xl font-semibold"
          >
            💬 Copy phones (text list)
          </button>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, phone, team, discount..."
          className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4"
        />

        <div className="bg-gray-800 rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-gray-400 border-b border-gray-700">
                <tr>
                  <th className="py-4 px-5">Name</th>
                  <th className="py-4 px-5">Email</th>
                  <th className="py-4 px-5">Phone</th>
                  <th className="py-4 px-5">Team</th>
                  <th className="py-4 px-5">Discount</th>
                  <th className="py-4 px-5">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-gray-700/60">
                    <td className="py-4 px-5 font-medium">
                      {r.player_name || '—'}
                    </td>
                    <td className="py-4 px-5">
                      {r.player_email ? (
                        <a
                          href={`mailto:${r.player_email}`}
                          className="text-blue-400 hover:text-blue-300"
                        >
                          {r.player_email}
                        </a>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                    <td className="py-4 px-5">
                      {r.phone ? (
                        <a
                          href={`sms:${r.phone}`}
                          className="text-emerald-400 hover:text-emerald-300"
                        >
                          {r.phone}
                        </a>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                    <td className="py-4 px-5 text-gray-400">
                      {r.team_name || '—'}
                    </td>
                    <td className="py-4 px-5">
                      {r.discount_code ? (
                        <span className="text-emerald-400 font-medium">
                          {r.discount_code}
                          {r.discount_amount > 0 && (
                            <span className="text-gray-400 text-xs ml-1">
                              (−${Number(r.discount_amount).toFixed(2)})
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                    <td className="py-4 px-5 text-gray-400">
                      {r.checked_in
                        ? 'Checked in'
                        : r.paid
                        ? 'Paid'
                        : 'Registered'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <p className="text-gray-500 p-8 text-center">
              No players found for this event.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}