'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { TEMPLATES, EmailAudience } from '@/app/libs/event-emails';

export default function EventEmailsPanel({ eventId }: { eventId: number }) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [templateKey, setTemplateKey] = useState('fill_team');
  const [audience, setAudience] = useState<EmailAudience>('captains_open');
  const [subject, setSubject] = useState(TEMPLATES.fill_team.subject);
  const [body, setBody] = useState(TEMPLATES.fill_team.body);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState('');
  const [sendId, setSendId] = useState<number | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    const t = TEMPLATES[templateKey];
    if (!t) return;
    setSubject(t.subject);
    setBody(t.body);
    setAudience(t.audience);
  }, [templateKey]);

  useEffect(() => {
    supabase
      .from('event_email_sends')
      .select('id, template_key, audience, subject, recipient_count, created_at')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => setHistory(data || []));
  }, [eventId, result]);

  const send = async () => {
    if (!confirm(`Send this email now? Recipients will not see each other.`)) {
      return;
    }
    setSending(true);
    setResult('');
    setSendId(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch('/api/event-emails/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({
          event_id: eventId,
          template_key: templateKey,
          audience,
          subject,
          body,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Send failed');
      setSendId(data.send_id || null);
      setResult(
        `Sent ${data.sent} of ${data.attempted}` +
          (data.errors?.length ? ` · ${data.errors.length} failed` : '')
      );
    } catch (e: any) {
      setResult(e.message || 'Send failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-3xl p-6 space-y-4">
      <h2 className="text-xl font-semibold">Emails</h2>
      <p className="text-sm text-gray-400">
        Each player gets their own email. Addresses are never shared.
      </p>

      <label className="block text-sm text-gray-400">Template</label>
      <select
        value={templateKey}
        onChange={(e) => setTemplateKey(e.target.value)}
        className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3"
      >
        {Object.entries(TEMPLATES).map(([k, t]) => (
          <option key={k} value={k}>
            {t.label}
          </option>
        ))}
      </select>

      <label className="block text-sm text-gray-400">Audience</label>
      <select
        value={audience}
        onChange={(e) => setAudience(e.target.value as EmailAudience)}
        className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3"
      >
        <option value="everyone">Everyone registered</option>
        <option value="captains">Team captains</option>
        <option value="captains_open">Captains with open spots</option>
      </select>

      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3"
        placeholder="Subject"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={14}
        className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3 font-mono text-sm"
      />
      <p className="text-xs text-gray-500">
        {
          '{{first_name}} {{event_name}} {{date}} {{course}} {{team_name}} {{spots_left}} {{join_link}} {{live_link}} {{leaderboard_link}}'
        }
      </p>

      <button
        type="button"
        onClick={send}
        disabled={sending}
        className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 px-5 py-3 rounded-xl font-semibold"
      >
        {sending ? 'Sending…' : 'Send emails'}
      </button>

      {result ? (
        sendId ? (
          <Link
            href={`/event/${eventId}/emails/log/${sendId}`}
            className="block text-sm text-emerald-400 hover:underline"
          >
            {result} →
          </Link>
        ) : (
          <p className="text-sm text-gray-300">{result}</p>
        )
      ) : null}

      {history.length > 0 && (
        <div className="pt-4 border-t border-gray-700 space-y-2">
          <p className="text-xs text-gray-500 uppercase">Recent sends</p>
          {history.map((h) => (
            <Link
              key={h.id}
              href={`/event/${eventId}/emails/log/${h.id}`}
              className="block text-sm text-gray-400 hover:text-white"
            >
              {new Date(h.created_at).toLocaleString()} · {h.template_key} ·{' '}
              {h.audience} · {h.recipient_count} sent
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}