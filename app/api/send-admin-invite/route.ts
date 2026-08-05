import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      to,
      eventName,
      eventId,
      inviterName,
      role = 'admin',
    } = body;

    if (!to || !eventName || !eventId) {
      return NextResponse.json(
        { error: 'Missing required fields: to, eventName, eventId' },
        { status: 400 }
      );
    }

    const manageUrl = `https://friedeggevents.app/event/${eventId}/manage`;
    const loginUrl = `https://friedeggevents.app/login?redirect=/event/${eventId}/manage`;

    const { data, error } = await resend.emails.send({
      from: 'Fried Egg Events <noreply@friedeggevents.app>',
      to,
      subject: `You've been added as an admin for ${eventName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #111827; color: #f3f4f6;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #22c55e; font-size: 28px; margin: 0;">Fried Egg Events</h1>
          </div>
          
          <h2 style="color: #f3f4f6; text-align: center;">You're an Event Admin</h2>
          
          <p style="font-size: 17px; line-height: 1.6; color: #e5e7eb;">
            ${inviterName ? `<strong>${inviterName}</strong> has` : 'You have been'} added you as an <strong>${role}</strong> for:
          </p>

          <div style="background-color: #1f2937; padding: 25px; border-radius: 16px; margin: 30px 0; text-align: center;">
            <p style="margin: 0; font-size: 20px; font-weight: 600; color: #22c55e;">
              ${eventName}
            </p>
          </div>

          <p style="font-size: 16px; line-height: 1.6; color: #e5e7eb;">
            As an admin you can manage registrations, check players in, view income, and more.
          </p>

          <p style="text-align: center; margin: 40px 0;">
            <a href="${manageUrl}" 
               style="background-color: #22c55e; color: #111827; padding: 14px 32px; text-decoration: none; border-radius: 9999px; font-weight: 600; display: inline-block;">
              Open Event Manage
            </a>
          </p>

          <p style="font-size: 14px; color: #9ca3af; text-align: center;">
            If you’re not logged in yet, <a href="${loginUrl}" style="color: #22c55e;">sign in here</a> first.
          </p>

          <p style="color: #9ca3af; font-size: 14px; text-align: center; margin-top: 50px;">
            — Fried Egg Events
          </p>
        </div>
      `,
    });

    if (error) {
      console.error('Resend error:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to send email' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, id: data?.id });
  } catch (err: any) {
    console.error('Admin invite API error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}