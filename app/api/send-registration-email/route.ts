import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);

type RoundLine =
  | string
  | {
      name?: string;
      label?: string;
      time?: string;
      price?: number;
    };

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
      eventPrice = 0,
      platformFee = 0,
      processingFee = 0,
      totalPaid = 0,
      playerCount = 1,
      rounds = [],
      pricingMode = 'event',
      // NEW
      discountCode = null,
      discountAmount = 0,
    } = await request.json();

    const isPerRound = pricingMode === 'per_round' || pricingMode === 'per-round';

    const normalizedRounds = (Array.isArray(rounds) ? rounds : []).map((r: RoundLine) => {
      if (typeof r === 'string') {
        return { label: r, price: 0 };
      }
      return {
        label: r.name || r.label || r.time || 'Round',
        price: Number(r.price || 0),
      };
    });

    const roundsHtml =
      normalizedRounds.length > 0
        ? `
          <div style="background-color: #1f2937; padding: 25px; border-radius: 16px; margin: 30px 0;">
            <h3 style="margin-top: 0; color: #22c55e;">Rounds</h3>
            <ul style="margin: 0; padding-left: 18px; color: #e5e7eb;">
              ${normalizedRounds
                .map((r) => `<li style="margin: 6px 0;">${r.label}</li>`)
                .join('')}
            </ul>
          </div>
        `
        : '';

    // Receipt rows
    let receiptRows = '';

    if (isPerRound) {
      if (normalizedRounds.some((r) => r.price > 0)) {
        receiptRows += normalizedRounds
          .map(
            (r) => `
            <tr>
              <td style="padding: 8px 0;">${r.label}</td>
              <td style="padding: 8px 0; text-align: right;">$${r.price.toFixed(2)}</td>
            </tr>`
          )
          .join('');
      } else {
        receiptRows += `
          <tr>
            <td style="padding: 8px 0;">
              Round fees${playerCount > 1 ? ` (${playerCount} players)` : ''}
            </td>
            <td style="padding: 8px 0; text-align: right;">
              $${Math.max(0, Number(totalPaid) - Number(platformFee) - Number(processingFee) + Number(discountAmount || 0)).toFixed(2)}
            </td>
          </tr>`;
      }
    } else {
      receiptRows += `
        <tr>
          <td style="padding: 8px 0;">
            Event Registration${playerCount > 1 ? ` (${playerCount} players)` : ''}
          </td>
          <td style="padding: 8px 0; text-align: right;">$${Number(eventPrice).toFixed(2)}</td>
        </tr>`;
    }

    // Discount line
    if (discountCode && Number(discountAmount) > 0) {
      receiptRows += `
        <tr>
          <td style="padding: 8px 0; color: #34d399;">
            Discount (${discountCode})
          </td>
          <td style="padding: 8px 0; text-align: right; color: #34d399;">
            −$${Number(discountAmount).toFixed(2)}
          </td>
        </tr>`;
    }

    if (Number(platformFee) > 0) {
      receiptRows += `
        <tr>
          <td style="padding: 8px 0;">Platform Fee</td>
          <td style="padding: 8px 0; text-align: right;">$${Number(platformFee).toFixed(2)}</td>
        </tr>`;
    }

    if (Number(processingFee) > 0) {
      receiptRows += `
        <tr>
          <td style="padding: 8px 0;">Processing Fee</td>
          <td style="padding: 8px 0; text-align: right;">$${Number(processingFee).toFixed(2)}</td>
        </tr>`;
    }

    const { error } = await resend.emails.send({
      from: 'Fried Egg Events <noreply@friedeggevents.app>',
      to,
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
            <p style="margin: 8px 0;"><strong>Location:</strong> ${location || 'TBD'}</p>
            ${course ? `<p style="margin: 8px 0;"><strong>Course:</strong> ${course}</p>` : ''}
            ${teamName ? `<p style="margin: 8px 0;"><strong>Team:</strong> ${teamName}</p>` : ''}
          </div>

          ${roundsHtml}

          <div style="background-color: #1f2937; padding: 25px; border-radius: 16px; margin: 30px 0;">
            <h3 style="margin-top: 0; color: #22c55e;">Payment Receipt</h3>
            <table style="width: 100%; border-collapse: collapse; color: #e5e7eb;">
              ${receiptRows}
              <tr style="border-top: 1px solid #374151;">
                <td style="padding: 12px 0; font-weight: bold;">Total Paid</td>
                <td style="padding: 12px 0; text-align: right; font-weight: bold; color: #22c55e;">
                  $${Number(totalPaid).toFixed(2)}
                </td>
              </tr>
            </table>
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