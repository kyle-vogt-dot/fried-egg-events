'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import EventTabs from '@/app/components/EventTabs';
import BackButton from '@/app/components/BackButton';
import { createBrowserClient } from '@supabase/ssr';
import { Document, Page, Text, View, StyleSheet, PDFDownloadLink } from '@react-pdf/renderer';

const pdfStyles = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 36,
    paddingHorizontal: 28,
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 9,
    color: '#374151',
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#111827',
    paddingBottom: 4,
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#d1d5db',
    paddingVertical: 4,
  },
  colName: { width: '18%' },
  colEmail: { width: '24%' },
  colPhone: { width: '14%' },
  colTeam: { width: '16%' },
  colRounds: { width: '16%' },
  colPaid: { width: '12%' },
  headerText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: '#111827',
  },
  cell: {
    fontSize: 8,
    color: '#111827',
    paddingRight: 6,
  },
  empty: {
    fontSize: 10,
    color: '#374151',
    marginTop: 16,
  },
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 28,
    right: 28,
    fontSize: 8,
    color: '#4b5563',
    textAlign: 'center',
  },
});

function roundIdsFor(r: any): number[] {
  const ids: number[] = Array.isArray(r?.selected_round_ids)
    ? (r.selected_round_ids as any[])
        .map(Number)
        .filter((n: number) => Number.isFinite(n))
    : [];
  return Array.from(new Set(ids));
}

function paymentStatus(r: any): string {
  const m = String(r?.payment_method || '').toLowerCase();
  if (m === 'cash') return 'Cash';
  if (m === 'comp' || m === 'complimentary') return 'Comp';
  if (r?.paid) return 'Paid';
  return '—';
}

function mergePaymentMethod(a: any, b: any): string {
  const methods = [a?.payment_method, b?.payment_method].map((m) =>
    String(m || '').toLowerCase()
  );
  if (methods.includes('cash')) return 'cash';
  if (methods.includes('comp') || methods.includes('complimentary')) {
    return 'comp';
  }
  return a?.payment_method || b?.payment_method || '';
}

function roundsLabel(r: any, rounds: any[]): string {
  const ids = roundIdsFor(r);
  if (!ids.length) return 'Event';
  return ids
    .map((id) => {
      const round = (rounds || []).find((x) => Number(x.id) === id);
      return round?.name || `Round ${id}`;
    })
    .join(', ');
}

function ContactsListPDF({
  event,
  rounds,
  players,
}: {
  event: any;
  rounds: any[];
  players: any[];
}) {
  const dateStr = event?.date
    ? new Date(event.date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  return (
    <Document>
      <Page size="LETTER" orientation="landscape" style={pdfStyles.page}>
        <Text style={pdfStyles.title}>
          {event?.name || 'Event'} — Player contacts
        </Text>
        <Text style={pdfStyles.subtitle}>
          {[dateStr, event?.course, `${players.length} player${players.length === 1 ? '' : 's'}`]
            .filter(Boolean)
            .join('  ·  ')}
        </Text>

        {players.length === 0 ? (
          <Text style={pdfStyles.empty}>No players found for this event.</Text>
        ) : (
          <>
            <View style={pdfStyles.tableHeader} fixed>
              <Text style={[pdfStyles.colName, pdfStyles.headerText]}>
                Player name
              </Text>
              <Text style={[pdfStyles.colEmail, pdfStyles.headerText]}>
                Email
              </Text>
              <Text style={[pdfStyles.colPhone, pdfStyles.headerText]}>
                Phone
              </Text>
              <Text style={[pdfStyles.colTeam, pdfStyles.headerText]}>Team</Text>
              <Text style={[pdfStyles.colRounds, pdfStyles.headerText]}>
                Rounds
              </Text>
              <Text style={[pdfStyles.colPaid, pdfStyles.headerText]}>
                Paid / Cash / Comp
              </Text>
            </View>
            {players.map((r, i) => (
              <View key={r.id || i} style={pdfStyles.tableRow} wrap={false}>
                <Text style={[pdfStyles.colName, pdfStyles.cell]}>
                  {r.player_name || '—'}
                </Text>
                <Text style={[pdfStyles.colEmail, pdfStyles.cell]}>
                  {r.player_email || '—'}
                </Text>
                <Text style={[pdfStyles.colPhone, pdfStyles.cell]}>
                  {r.phone || '—'}
                </Text>
                <Text style={[pdfStyles.colTeam, pdfStyles.cell]}>
                  {r.team_name || '—'}
                </Text>
                <Text style={[pdfStyles.colRounds, pdfStyles.cell]}>
                  {roundsLabel(r, rounds)}
                </Text>
                <Text style={[pdfStyles.colPaid, pdfStyles.cell]}>
                  {paymentStatus(r)}
                </Text>
              </View>
            ))}
          </>
        )}

        <Text
          style={pdfStyles.footer}
          render={({ pageNumber, totalPages }) =>
            `friedeggevents.app  ·  ${pageNumber}/${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}

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
  const [rounds, setRounds] = useState<any[]>([]);
  const [waitlist, setWaitlist] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      const id = parseInt(eventId);

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

      const { data: roundsData } = await supabase
        .from('event_rounds')
        .select('id, name, start_time, sort_order')
        .eq('event_id', id)
        .order('sort_order', { ascending: true });
      setRounds(roundsData || []);

      const { data: regs, error: regErr } = await supabase
        .from('event_registrations')
        .select(
          'id, player_name, player_email, team_name, paid, checked_in, user_id, discount_code, discount_amount, payment_method, selected_round_ids'
        )
        .eq('event_id', id)
        .order('player_name', { ascending: true });

      if (regErr) {
        console.error('Registrations load error:', regErr);
        setError(regErr.message);
        setRegistrations([]);
      } else {
        let rows = regs || [];

        const userIds = [
          ...new Set(rows.map((r) => r.user_id).filter(Boolean)),
        ];
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, phone, full_name, name, email')
            .in('id', userIds);

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

                // One contact per email (fallback: name) + registration count
        const byKey = new Map<string, any>();
        for (const r of rows) {
          const email = (r.player_email || '').trim().toLowerCase();
          const name = (r.player_name || '').trim().toLowerCase();
          const key = email || (name ? `name:${name}` : `id:${r.id}`);

          const existing = byKey.get(key);
          if (!existing) {
            byKey.set(key, { ...r, reg_count: 1 });
            continue;
          }

          byKey.set(key, {
            ...existing,
            reg_count: (existing.reg_count || 1) + 1,
            player_name: existing.player_name || r.player_name,
            player_email: existing.player_email || r.player_email,
            phone: existing.phone || (r as any).phone || '',
            team_name: existing.team_name || r.team_name,
            paid: !!(existing.paid || r.paid),
            checked_in: !!(existing.checked_in || r.checked_in),
            payment_method: mergePaymentMethod(existing, r),
            selected_round_ids: Array.from(
              new Set([...roundIdsFor(existing), ...roundIdsFor(r)])
            ),
            discount_code: existing.discount_code || r.discount_code,
            discount_amount:
              Number(existing.discount_amount || 0) >=
              Number(r.discount_amount || 0)
                ? existing.discount_amount
                : r.discount_amount,
          });
        }

        rows = Array.from(byKey.values()).sort((a, b) =>
          String(a.player_name || '').localeCompare(String(b.player_name || ''))
        );

        setRegistrations(rows);
      }

      const { data: wl, error: wlErr } = await supabase
        .from('event_waitlist')
        .select('id, name, email, phone, created_at')
        .eq('event_id', id)
        .order('created_at', { ascending: true });

      if (wlErr) {
        console.warn('Waitlist load error:', wlErr);
        setWaitlist([]);
      } else {
        setWaitlist(wl || []);
      }

      setLoading(false);
    };

    load();
  }, [eventId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return registrations;
    return registrations.filter((r) => {
      const hay =
        `${r.player_name || ''} ${r.player_email || ''} ${r.phone || ''} ${r.team_name || ''} ${r.discount_code || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [registrations, search]);

  const filteredWaitlist = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return waitlist;
    return waitlist.filter((r) => {
      const hay =
        `${r.name || ''} ${r.email || ''} ${r.phone || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [waitlist, search]);

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
      alert(
        `${label} copied (${text.split(/[\n,;]/).filter(Boolean).length})`
      );
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
    window.location.href = `mailto:?bcc=${encodeURIComponent(
      bcc
    )}&subject=${subject}&body=${body}`;
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
        <BackButton href="/events" className="text-gray-400 hover:text-white" />

        <EventTabs eventId={eventId} variant="dayof" active="contacts" />

        <div>
          <h1 className="text-4xl font-bold">Player contacts</h1>
          <p className="text-gray-400 mt-1">
            {event?.name || 'Event'} · {filtered.length} player
            {filtered.length === 1 ? '' : 's'}
            {waitlist.length > 0 ? ` · ${waitlist.length} on waitlist` : ''}
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
          <PDFDownloadLink
            document={
              <ContactsListPDF
                event={event}
                rounds={rounds}
                players={filtered}
              />
            }
            fileName={`${(event?.name || 'event')
              .replace(/\s+/g, '-')
              .toLowerCase()}-contacts.pdf`}
            className="bg-gray-100 hover:bg-white text-gray-900 px-6 py-4 rounded-2xl font-semibold text-center"
          >
            {({ loading: pdfLoading }) =>
              pdfLoading ? 'Preparing PDF…' : '📄 Download PDF'
            }
          </PDFDownloadLink>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, phone, team, discount..."
          className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4"
        />

        <div className="bg-gray-800 rounded-3xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-700">
            <h2 className="text-lg font-semibold">Registered players</h2>
          </div>
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
                      {r.reg_count > 1 && (
                        <span className="text-gray-400 font-normal">
                          {' '}
                          ({r.reg_count})
                        </span>
                      )}
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

        <div className="bg-gray-800 border border-amber-500/30 rounded-3xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-amber-300">Waitlist</h2>
              <p className="text-xs text-gray-500 mt-1">
                People who signed up after the event hit max players
              </p>
            </div>
            <span className="text-sm text-gray-400">
              {filteredWaitlist.length}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-gray-400 border-b border-gray-700">
                <tr>
                  <th className="py-4 px-5">Name</th>
                  <th className="py-4 px-5">Email</th>
                  <th className="py-4 px-5">Phone</th>
                  <th className="py-4 px-5">Joined</th>
                </tr>
              </thead>
              <tbody>
                {filteredWaitlist.map((r) => (
                  <tr key={r.id} className="border-b border-gray-700/60">
                    <td className="py-4 px-5 font-medium">{r.name || '—'}</td>
                    <td className="py-4 px-5">
                      {r.email ? (
                        <a
                          href={`mailto:${r.email}`}
                          className="text-blue-400 hover:text-blue-300"
                        >
                          {r.email}
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
                      {r.created_at
                        ? new Date(r.created_at).toLocaleDateString()
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredWaitlist.length === 0 && (
            <p className="text-gray-500 p-8 text-center">
              No one on the waitlist yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}