import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const resend = new Resend(process.env.RESEND_API_KEY!);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { eventId, name, email, phone } = await request.json();
    if (!eventId || !name || !email) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const { data: event } = await supabase
      .from('tournaments')
      .select('id, name, contact_email, created_by')
      .eq('id', Number(eventId))
      .single();

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const recipients = new Set<string>();
    if (event.contact_email) recipients.add(event.contact_email.toLowerCase());

    if (event.created_by) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', event.created_by)
        .maybeSingle();
      if (profile?.email) recipients.add(profile.email.toLowerCase());
    }

    const { data: admins } = await supabase
      .from('event_admins')
      .select('email')
      .eq('event_id', Number(eventId));

    (admins || []).forEach((a) => {
      if (a.email) recipients.add(String(a.email).toLowerCase());
    });

    if (recipients.size === 0) {
      return NextResponse.json({
        success: true,
        message: 'No admin emails found',
      });
    }

    const contactsUrl = `https://friedeggevents.app/event/${eventId}/contacts`;

    await resend.emails.send({
      from: 'Fried Egg Events <noreply@friedeggevents.app>',
      to: Array.from(recipients),
      subject: `Waitlist: ${name} joined ${event.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
          <h2 style="margin-bottom: 8px;">New waitlist signup</h2>
          <p><strong>Event:</strong> ${event.name}</p>
          <p><strong>Name:</strong> ${name}<br/>
             <strong>Email:</strong> ${email}<br/>
             <strong>Phone:</strong> ${phone || '—'}
          </p>
          <p>View the full waitlist on the Contacts page:</p>
          <p>
            <a href="${contactsUrl}"
               style="display:inline-block;background:#d97706;color:#111;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600;">
              Open Contacts / Waitlist
            </a>
          </p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || 'Failed' },
      { status: 500 }
    );
  }
}