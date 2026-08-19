import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import {
  TEMPLATES,
  isListableReg,
  normalizeEmail,
  firstName,
  applyVars,
  buildCaptainMap,
  EmailAudience,
} from '@/app/libs/event-emails';

const resend = new Resend(process.env.RESEND_API_KEY);

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function appOrigin() {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://friedeggevents.app').replace(
    /\/$/,
    ''
  );
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function btn(href: string, label: string) {
  if (!href) return '';
  return `<p style="margin:16px 0">
    <a href="${escapeHtml(href)}"
       style="display:inline-block;background:#059669;color:#ffffff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px">
      ${escapeHtml(label)}
    </a>
  </p>`;
}

function buildHtml(
  text: string,
  vars: Record<string, string>,
  templateKey: string
) {
  const paragraphs = escapeHtml(text)
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 14px;line-height:1.5">${p.replace(/\n/g, '<br/>')}</p>`
    )
    .join('');

  const buttons =
    templateKey === 'fill_team'
      ? btn(vars.join_link, 'Join this team')
      : templateKey === 'pairings'
        ? btn(vars.live_link, 'Live scoring') +
          btn(vars.leaderboard_link, 'Leaderboard')
        : btn(vars.join_link, 'Join this team') +
          btn(vars.live_link, 'View event');

  return `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#111827;max-width:560px">
    ${paragraphs}
    ${buttons}
  </div>`;
}

async function assertOrganizer(req: NextRequest, eventId: number) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return { error: 'Not signed in', user: null as any };

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return { error: 'Not signed in', user: null as any };

  const sb = adminClient();
  const { data: event } = await sb
    .from('tournaments')
    .select(
      'id, name, date, course, location, created_by, contact_email, contact_name, max_teammates'
    )
    .eq('id', eventId)
    .single();
  if (!event) return { error: 'Event not found', user };

  const isCreator = event.created_by === user.id;
  const { data: adminRow } = await sb
    .from('event_admins')
    .select('id')
    .eq('event_id', eventId)
    .or(`user_id.eq.${user.id},email.eq.${user.email}`)
    .maybeSingle();

  if (!isCreator && !adminRow) return { error: 'Forbidden', user };
  return { error: null, user, event, sb };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const eventId = Number(body.event_id);
    const templateKey = String(body.template_key || 'custom');
    const audience = String(body.audience || '') as EmailAudience;
    const subjectIn = String(body.subject || '');
    const bodyIn = String(body.body || '');

    if (!eventId) {
      return NextResponse.json({ error: 'event_id required' }, { status: 400 });
    }

    const gate = await assertOrganizer(req, eventId);
    if (gate.error || !gate.event || !gate.sb) {
      return NextResponse.json({ error: gate.error }, { status: 401 });
    }
    const { event, sb, user } = gate;

    const tpl = TEMPLATES[templateKey] || TEMPLATES.custom;
    const subjectTemplate = subjectIn || tpl.subject;
    const bodyTemplate = bodyIn || tpl.body;

    const [{ data: regs }, { data: rounds }] = await Promise.all([
      sb.from('event_registrations').select('*').eq('event_id', eventId),
      sb
        .from('event_rounds')
        .select('*')
        .eq('event_id', eventId)
        .order('sort_order'),
    ]);

    const listable = (regs || []).filter(isListableReg);
    const maxTeam = Number(event.max_teammates) || 4;
    const origin = appOrigin();
    const joinBase = `${origin}/event/${eventId}/join`;

    const dateStr = event.date
      ? new Date(event.date + 'T12:00:00').toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : '';

    type Recip = { email: string; name: string; vars: Record<string, string> };
    const recipients: Recip[] = [];

    if (audience === 'everyone') {
      const seen = new Set<string>();
      for (const r of listable) {
        const email = normalizeEmail(r.player_email);
        if (!email || seen.has(email)) continue;
        seen.add(email);
        recipients.push({
          email,
          name: r.player_name || 'Golfer',
          vars: {
            first_name: firstName(r.player_name),
            team_name: r.team_name || '—',
            round_line: '',
            tee_line: '',
            spots_left: '',
            join_link: r.team_name
              ? `${joinBase}?team=${encodeURIComponent(r.team_name)}`
              : `${origin}/event/${eventId}`,
            live_link: `${origin}/event/${eventId}`,
            leaderboard_link: `${origin}/event/${eventId}`,
          },
        });
      }
    } else {
      const captains = buildCaptainMap(listable, rounds || [], maxTeam);
      for (const c of captains.values()) {
        const teams =
          audience === 'captains_open'
            ? c.teams.filter((t) => t.spotsLeft > 0)
            : c.teams;
        if (!teams.length) continue;
        const spots = teams.reduce((s, t) => s + t.spotsLeft, 0);
        const teamName = teams[0].team;
        recipients.push({
          email: c.email,
          name: c.name,
          vars: {
            first_name: firstName(c.name),
            team_name: teams.map((t) => t.team).join(', '),
            round_line: teams
              .map((t) => (t.roundName ? `${t.team} — ${t.roundName}` : t.team))
              .join('\n'),
            tee_line: '',
            spots_left: String(spots),
            join_link: `${joinBase}?team=${encodeURIComponent(teamName)}`,
            live_link: `${origin}/event/${eventId}`,
            leaderboard_link: `${origin}/event/${eventId}`,
          },
        });
      }
    }

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: 'No recipients for that audience' },
        { status: 400 }
      );
    }

    const shared = {
      event_name: event.name || 'Golf event',
      date: dateStr,
      course: event.course || '',
      location: event.location || '',
      organizer_name: event.contact_name || 'Tournament committee',
      live_link: `${origin}/event/${eventId}`,
      leaderboard_link: `${origin}/event/${eventId}`,
    };

    const from =
      process.env.RESEND_FROM ||
      'Fried Egg Events <noreply@friedeggevents.app>';
    const replyTo = event.contact_email || undefined;

    let sent = 0;
    const errors: string[] = [];
    const results: {
      email: string;
      name: string;
      status: 'sent' | 'failed';
      error: string | null;
    }[] = [];

    for (const r of recipients) {
      const vars = { ...shared, ...r.vars };
      const subject = applyVars(subjectTemplate, vars);
      const text = applyVars(bodyTemplate, vars);
      try {
        const { error } = await resend.emails.send({
          from,
          to: r.email,
          subject,
          text,
          html: buildHtml(text, vars, templateKey),
          ...(replyTo ? { replyTo } : {}),
        });
        if (error) {
          errors.push(`${r.email}: ${error.message}`);
          results.push({
            email: r.email,
            name: r.name,
            status: 'failed',
            error: error.message,
          });
        } else {
          sent += 1;
          results.push({
            email: r.email,
            name: r.name,
            status: 'sent',
            error: null,
          });
        }
      } catch (e: any) {
        const msg = e.message || 'send failed';
        errors.push(`${r.email}: ${msg}`);
        results.push({
          email: r.email,
          name: r.name,
          status: 'failed',
          error: msg,
        });
      }
    }

    const { data: sendRow } = await sb
      .from('event_email_sends')
      .insert({
        event_id: eventId,
        sent_by: user.id,
        template_key: templateKey,
        audience,
        subject: applyVars(subjectTemplate, {
          ...shared,
          first_name: '',
          team_name: '',
          spots_left: '',
          join_link: '',
          round_line: '',
          tee_line: '',
        }),
        body_text: bodyTemplate,
        recipient_count: sent,
        results,
      })
      .select('id')
      .single();

    return NextResponse.json({
      sent,
      attempted: recipients.length,
      errors,
      send_id: sendRow?.id || null,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: e.message || 'Send failed' },
      { status: 500 }
    );
  }
}