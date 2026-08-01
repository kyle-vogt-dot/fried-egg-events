import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const {
      eventId,
      eventName,
      createdBy,
      contactEmail,
      playerName,
      playerEmail,
      teamName,
      rounds,
      eventFee = 0,
      totalPaid = 0,
      teammates = [],
    } = await request.json();

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    let organizerEmail = contactEmail || null;

    if (!organizerEmail && createdBy) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', createdBy)
        .maybeSingle();
      organizerEmail = profile?.email || null;
    }

    if (!organizerEmail && createdBy && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { data: userData } = await supabase.auth.admin.getUserById(createdBy);
      organizerEmail = userData?.user?.email || null;
    }

    if (!organizerEmail) {
      console.error('No organizer email found for event', eventId);
      return NextResponse.json({ error: 'No organizer email' }, { status: 400 });
    }

    const teammatesList = Array.isArray(teammates) ? teammates : [];
    const teammatesHtml =
      teammatesList.length > 0
        ? `
          <p style="margin: 16px 0 8px;"><strong>Teammates:</strong></p>
          <ul style="margin: 0; padding-left: 18px;">
            ${teammatesList
              .map(
                (t: any) =>
                  `<li style="margin: 4px 0;">${t.name || '—'} &lt;${t.email || '—'}&gt;</li>`
              )
              .join('')}
          </ul>
        `
        : '';

    const { error } = await resend.emails.send({
      from: 'Fried Egg Events <noreply@friedeggevents.app>',
      to: organizerEmail,
      subject: `New Registration – ${eventName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
          <h2 style="margin-bottom: 16px;">New Registration</h2>
          <p><strong>Event:</strong> ${eventName}</p>
          <p><strong>Name:</strong> ${playerName || '—'}</p>
          <p><strong>Email:</strong> ${playerEmail || '—'}</p>
          ${teamName ? `<p><strong>Team:</strong> ${teamName}</p>` : ''}
          ${teammatesHtml}
          ${rounds ? `<p><strong>Rounds:</strong> ${rounds}</p>` : ''}
          <p><strong>Event Fee:</strong> $${Number(eventFee).toFixed(2)}</p>
          <p style="color:#666;font-size:13px;">
            (Includes platform fee. Stripe total charged: $${Number(totalPaid).toFixed(2)})
          </p>
          <p style="margin-top: 24px;">
            <a href="https://friedeggevents.app/event/${eventId}" style="color:#2563eb;">View event</a>
          </p>
        </div>
      `,
    });

    if (error) {
      console.error('Organizer email error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}