import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      to,
      name,
      eventName,
      eventDate,
      location,
      course,
      teamName,
      teammates, // string[] of names
      notice, // 'teammate_added' | undefined
    } = body;

    if (!to || !eventName) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const teammateList =
      Array.isArray(teammates) && teammates.length > 0
        ? teammates.map((n: string) => `• ${n}`).join('<br/>')
        : '• (team roster TBD)';

    const isInviterNotice = notice === 'teammate_added';

    const subject = isInviterNotice
      ? `Teammate added – ${eventName}`
      : `You're registered for ${eventName}`;

    const html = isInviterNotice
      ? `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
        <h2 style="margin-bottom: 8px;">Teammate added</h2>
        <p>Hi ${name || 'Golfer'},</p>
        <p>
          Someone joined your team on <strong>${eventName}</strong>
          ${teamName ? ` (<strong>${teamName}</strong>)` : ''}.
        </p>
        <p style="margin: 16px 0;">
          <strong>Date:</strong> ${eventDate || 'TBD'}<br/>
          <strong>Course:</strong> ${course || 'TBD'}<br/>
          <strong>Location:</strong> ${location || 'TBD'}
        </p>
        <p style="margin: 16px 0;">
          <strong>Players on this registration:</strong><br/>
          ${teammateList}
        </p>
        <p style="margin-top: 24px; color: #888; font-size: 13px;">
          Fried Egg Events
        </p>
      </div>
    `
      : `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
        <h2 style="margin-bottom: 8px;">You're registered!</h2>
        <p>Hi ${name || 'Golfer'},</p>
        <p>
          You’ve been registered for <strong>${eventName}</strong>.
        </p>
        <p style="margin: 16px 0;">
          <strong>Date:</strong> ${eventDate || 'TBD'}<br/>
          <strong>Course:</strong> ${course || 'TBD'}<br/>
          <strong>Location:</strong> ${location || 'TBD'}
          ${teamName ? `<br/><strong>Team:</strong> ${teamName}` : ''}
        </p>
        <p style="margin: 16px 0;">
          <strong>Players on this registration:</strong><br/>
          ${teammateList}
        </p>
        <p style="color: #555; font-size: 14px;">
          No payment was charged to you for this registration.
          If you have questions, contact the event organizer.
        </p>
        <p style="margin-top: 24px; color: #888; font-size: 13px;">
          Fried Egg Events
        </p>
      </div>
    `;

    const { error } = await resend.emails.send({
      from: 'Fried Egg Events <noreply@friedeggevents.app>',
      to: [to],
      subject,
      html,
    });

    if (error) {
      console.error('Teammate email error:', error);
      return NextResponse.json({ error }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || 'Failed' },
      { status: 500 }
    );
  }
}