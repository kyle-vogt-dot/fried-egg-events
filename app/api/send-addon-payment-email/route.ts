import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, name, eventName, amount, paymentUrl } = body;

    if (!email || !paymentUrl) {
      return NextResponse.json({ error: 'Missing email or payment URL' }, { status: 400 });
    }

    if (!process.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not set");
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500 });
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Fried Egg Events <no-reply@friedeggevents.app>',
        to: email,
        subject: `Complete Your Add-ons Payment - ${eventName}`,
        html: `
          <h2>Hi ${name || 'there'},</h2>
          <p>Thank you for your registration for <strong>${eventName}</strong>.</p>
          <p>You have selected add-ons totaling <strong>$${amount}</strong>.</p>
          
          <p style="margin: 30px 0;">
            <a href="${paymentUrl}" 
               style="background-color: #10b981; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              Pay $${amount} Now
            </a>
          </p>

          <p>This is a secure payment link. You'll be checked in automatically after payment.</p>
          <p>See you on the course!</p>
          
          <hr style="margin: 30px 0;">
          <p style="font-size: 12px; color: #666;">
            Powered by Fried Egg Events
          </p>
        `,
      }),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      console.error('Resend API Error:', errorText);
      throw new Error(`Resend failed: ${resendResponse.status}`);
    }

    console.log(`✅ Payment email sent to ${email}`);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Send Add-on Email Error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to send email' 
    }, { status: 500 });
  }
}