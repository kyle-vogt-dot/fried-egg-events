import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const {
      to,
      playerName,
      eventName,
      pairing,
      teeTime,
      liveUrl,
      leaderboardUrl,
    } = await request.json();

    if (!to || !eventName || !liveUrl) {
      return NextResponse.json(
        { error: 'to, eventName, and liveUrl are required' },
        { status: 400 }
      );
    }

    const name = playerName || 'Golfer';
    const pairingLine =
      pairing && pairing !== '—'
        ? `<p style="margin: 8px 0; color: #e5e7eb;"><strong>Pairing:</strong> ${pairing}</p>`
        : '';
    const teeLine = teeTime
      ? `<p style="margin: 8px 0; color: #e5e7eb;"><strong>Tee time:</strong> ${teeTime}</p>`
      : '';

    const { error } = await resend.emails.send({
      from: 'Fried Egg Events <noreply@friedeggevents.app>',
      to: [String(to).trim().toLowerCase()],
      subject: `You're checked in – ${eventName}`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; background: #111827; color: #f3f4f6; padding: 32px; border-radius: 16px;">
          <p style="color: #22c55e; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 12px;">Fried Egg Events</p>
          <h1 style="margin: 0 0 16px; font-size: 22px; color: #fff;">You're checked in</h1>
          <p style="color: #d1d5db; line-height: 1.5;">
            Hi ${name}, you're checked in to <strong style="color: #fff;">${eventName}</strong>.
          </p>
          ${teeLine}
          ${pairingLine}
          <p style="margin: 28px 0 12px;">
            <a href="${liveUrl}"
               style="background: #22c55e; color: #111827; padding: 14px 28px; text-decoration: none; border-radius: 9999px; font-weight: 600; display: inline-block;">
              Open live scoring
            </a>
          </p>
          ${
            leaderboardUrl
              ? `<p style="margin: 12px 0;">
                   <a href="${leaderboardUrl}" style="color: #60a5fa;">View leaderboard →</a>
                 </p>`
              : ''
          }
          <p style="color: #6b7280; font-size: 13px; margin-top: 32px;">
            See you on the course.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error('Resend error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || 'Server error' },
      { status: 500 }
    );
  }
}