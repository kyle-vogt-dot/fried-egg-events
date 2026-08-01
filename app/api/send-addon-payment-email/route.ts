import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const { to, name, eventName, amount, paymentUrl } = await request.json();

    if (!to || !paymentUrl) {
      return NextResponse.json(
        { error: 'Missing email or payment URL' },
        { status: 400 }
      );
    }

    const { error } = await resend.emails.send({
      from: 'Fried Egg Events <noreply@friedeggevents.app>', // use your verified Resend domain
      to: [to],
      subject: `Pay add-ons for ${eventName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
          <h2>Add-on payment</h2>
          <p>Hi ${name || 'there'},</p>
          <p>You have add-ons to pay for <strong>${eventName}</strong>.</p>
          <p style="font-size: 18px;"><strong>Amount due: $${Number(amount).toFixed(2)}</strong></p>
          <p style="margin: 28px 0;">
            <a href="${paymentUrl}"
               style="background:#2563eb;color:#fff;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:600;">
              Pay now
            </a>
          </p>
          <p style="color:#666;font-size:13px;">If the button doesn’t work, open this link:<br/>${paymentUrl}</p>
          <p>— Fried Egg Events</p>
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