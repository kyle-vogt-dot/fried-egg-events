import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia',
});

// Calculate the total the customer must pay so you receive the desired net amount
function calculateAmountWithStripeFee(desiredNetDollars: number) {
  const desiredNetCents = Math.round(desiredNetDollars * 100);
  // Stripe fee ≈ 2.9% + $0.30
  const totalCents = Math.ceil((desiredNetCents + 30) / (1 - 0.029));
  const feeCents = totalCents - desiredNetCents;

  return {
    totalCents,
    feeCents,
    netCents: desiredNetCents,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      registration_id, 
      amount, 
      player_name, 
      email, 
      description, 
      event_name, 
      event_id,
      type = 'addon_payment',
      success_url,
      cancel_url,
    } = body;

    if (!amount || !email || !event_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL 
      || process.env.NEXT_PUBLIC_SITE_URL 
      || 'http://localhost:3000';

    const defaultSuccessUrl = `${baseUrl}/event/${event_id}?payment=success&type=${type}`;
    const defaultCancelUrl = `${baseUrl}/event/${event_id}?payment=cancelled`;

    // Calculate fee so you still receive the full `amount`
    const { totalCents, feeCents, netCents } = calculateAmountWithStripeFee(amount);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        // 1. Main event / registration cost
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: description || `${type === 'registration' ? 'Registration' : 'Add-ons'} – ${event_name || 'Tournament'}`,
              description: player_name ? `${player_name}` : undefined,
            },
            unit_amount: netCents,
          },
          quantity: 1,
        },
        // 2. Processing fee (covers Stripe)
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Processing Fee',
              description: 'Card processing fee',
            },
            unit_amount: feeCents,
          },
          quantity: 1,
        },
      ],
      success_url: success_url || defaultSuccessUrl,
      cancel_url: cancel_url || defaultCancelUrl,
      metadata: {
        registration_id: registration_id || '',
        event_id,
        type,
        net_amount: String(amount),
      },
      customer_email: email,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('Stripe Checkout Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to create checkout session' }, { status: 500 });
  }
}