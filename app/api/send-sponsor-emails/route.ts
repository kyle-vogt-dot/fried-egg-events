import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const resend = new Resend(process.env.RESEND_API_KEY!);
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { sponsor_id } = await request.json();
    if (!sponsor_id) {
      return NextResponse.json({ error: 'sponsor_id required' }, { status: 400 });
    }

    const { data: sponsor, error: sErr } = await supabaseAdmin
      .from('event_sponsors')
      .select(
        'id, company_name, contact_name, contact_email, website_url, amount_paid, package_id, event_id'
      )
      .eq('id', sponsor_id)
      .single();

    if (sErr || !sponsor) {
      return NextResponse.json({ error: 'Sponsor not found' }, { status: 404 });
    }

    const { data: event } = await supabaseAdmin
      .from('tournaments')
      .select('id, name, date, course, contact_email, contact_name, created_by')
      .eq('id', sponsor.event_id)
      .single();

    let packageName = 'Sponsorship';
    if (sponsor.package_id) {
      const { data: pkg } = await supabaseAdmin
        .from('event_sponsor_packages')
        .select('name, price')
        .eq('id', sponsor.package_id)
        .single();
      if (pkg?.name) packageName = pkg.name;
    }

    const amount = Number(sponsor.amount_paid || 0).toFixed(2);
    const eventName = event?.name || 'your event';
    const eventDate = event?.date
      ? new Date(event.date + 'T12:00:00').toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : '';

    // Organizer email: event contact, else creator profile
    let organizerEmail = (event?.contact_email || '').trim().toLowerCase();
    if (!organizerEmail && event?.created_by) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('email')
        .eq('id', event.created_by)
        .maybeSingle();
      organizerEmail = (profile?.email || '').trim().toLowerCase();
    }

    const sponsorTo = (sponsor.contact_email || '').trim().toLowerCase();
    const company = sponsor.company_name || 'Sponsor';
    const contact = sponsor.contact_name || company;

    const results: { sponsor?: string; organizer?: string } = {};

    // --- Receipt to sponsor ---
    if (sponsorTo) {
      const { error } = await resend.emails.send({
        from: 'Fried Egg Events <noreply@friedeggevents.app>',
        to: [sponsorTo],
        subject: `Sponsorship confirmed – ${eventName}`,
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; background: #111827; color: #f3f4f6; padding: 32px; border-radius: 16px;">
            <p style="color: #22c55e; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 12px;">Fried Egg Events</p>
            <h1 style="margin: 0 0 16px; font-size: 22px; color: #fff;">Sponsorship confirmed</h1>
            <p style="color: #d1d5db; line-height: 1.5;">
              Hi ${contact}, thank you for sponsoring <strong style="color:#fff;">${eventName}</strong>.
            </p>
            <div style="background: #1f2937; border-radius: 12px; padding: 20px; margin: 24px 0;">
              <p style="margin: 0 0 8px; color: #9ca3af; font-size: 13px;">Receipt</p>
              <p style="margin: 0 0 6px;"><strong>Company:</strong> ${company}</p>
              <p style="margin: 0 0 6px;"><strong>Package:</strong> ${packageName}</p>
              <p style="margin: 0 0 6px;"><strong>Amount paid:</strong> $${amount}</p>
              ${eventDate ? `<p style="margin: 0;"><strong>Event date:</strong> ${eventDate}</p>` : ''}
            </div>
            <p style="color: #9ca3af; font-size: 14px;">
              Your company will appear on the event page. Questions? Reply to this email or contact the event organizer.
            </p>
            <p style="color: #6b7280; font-size: 13px; margin-top: 28px;">
              <a href="https://friedeggevents.app/event/${sponsor.event_id}" style="color: #60a5fa;">View event →</a>
            </p>
          </div>
        `,
      });
      if (error) {
        console.error('Sponsor receipt error:', error);
        results.sponsor = error.message;
      } else {
        results.sponsor = 'sent';
      }
    }

    // --- Notice to organizer ---
    if (organizerEmail) {
      const { error } = await resend.emails.send({
        from: 'Fried Egg Events <noreply@friedeggevents.app>',
        to: [organizerEmail],
        subject: `New sponsor: ${company} – ${eventName}`,
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; background: #111827; color: #f3f4f6; padding: 32px; border-radius: 16px;">
            <p style="color: #22c55e; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 12px;">Fried Egg Events</p>
            <h1 style="margin: 0 0 16px; font-size: 22px; color: #fff;">New sponsorship</h1>
            <p style="color: #d1d5db; line-height: 1.5;">
              Someone just sponsored <strong style="color:#fff;">${eventName}</strong>.
            </p>
            <div style="background: #1f2937; border-radius: 12px; padding: 20px; margin: 24px 0;">
              <p style="margin: 0 0 6px;"><strong>Company:</strong> ${company}</p>
              <p style="margin: 0 0 6px;"><strong>Contact:</strong> ${contact}</p>
              <p style="margin: 0 0 6px;"><strong>Email:</strong> ${sponsorTo || '—'}</p>
              <p style="margin: 0 0 6px;"><strong>Package:</strong> ${packageName}</p>
              <p style="margin: 0;"><strong>Amount:</strong> $${amount}</p>
            </div>
            <p style="margin: 20px 0;">
              <a href="https://friedeggevents.app/event/${sponsor.event_id}/manage"
                 style="background: #22c55e; color: #111827; padding: 12px 24px; text-decoration: none; border-radius: 9999px; font-weight: 600; display: inline-block;">
                Open Manage
              </a>
            </p>
          </div>
        `,
      });
      if (error) {
        console.error('Organizer notice error:', error);
        results.organizer = error.message;
      } else {
        results.organizer = 'sent';
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || 'Server error' },
      { status: 500 }
    );
  }
}