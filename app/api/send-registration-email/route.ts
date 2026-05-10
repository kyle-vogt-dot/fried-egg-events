import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const {
      to,
      name,
      eventName,
      eventDate,
      location,
      course,
      teamName,
      isTeam = false,
      eventId,
    } = await request.json();

    const { data, error } = await resend.emails.send({
      from: 'Fried Egg Events <noreply@friedeggevents.app>',
      to: to,
      subject: isTeam 
        ? `You're registered for ${eventName} as part of ${teamName}` 
        : `You're registered for ${eventName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #111827; color: #f3f4f6;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #22c55e; font-size: 28px; margin: 0;">Fried Egg Events</h1>
          </div>
          
          <h2 style="color: #f3f4f6; text-align: center;">Registration Confirmed!</h2>
          
          <p style="font-size: 18px; color: #e5e7eb;">Hi ${name},</p>
          
          <p style="font-size: 17px; line-height: 1.6; color: #e5e7eb;">
            You are now officially registered for <strong>${eventName}</strong>.
          </p>

          <div style="background-color: #1f2937; padding: 25px; border-radius: 16px; margin: 30px 0;">
            <p style="margin: 8px 0;"><strong>Event:</strong> ${eventName}</p>
            <p style="margin: 8px 0;"><strong>Date:</strong> ${eventDate}</p>
            <p style="margin: 8px 0;"><strong>Location:</strong> ${location}</p>
            ${course ? `<p style="margin: 8px 0;"><strong>Course:</strong> ${course}</p>` : ''}
            ${teamName ? `<p style="margin: 8px 0;"><strong>Team:</strong> ${teamName}</p>` : ''}
          </div>

          <p style="text-align: center; margin: 40px 0;">
            <a href="https://friedeggevents.app/event/${eventId}" 
               style="background-color: #22c55e; color: #111827; padding: 14px 32px; text-decoration: none; border-radius: 9999px; font-weight: 600; display: inline-block;">
              View Event Details
            </a>
          </p>

          <p style="color: #9ca3af; font-size: 14px; text-align: center; margin-top: 50px;">
            Thank you for registering with Fried Egg Events!<br>
            We can't wait to see you on the course.
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
    console.error('Email API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}