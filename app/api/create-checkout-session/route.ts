import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia',
});

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
      success_url,     // Custom success URL sent from frontend (preferred)
      cancel_url,      // Optional custom cancel URL
    } = body;

    if (!amount || !email || !event_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // ←←← PRODUCTION URL PRIORITY ←←←
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL 
      || process.env.NEXT_PUBLIC_SITE_URL 
      || 'http://localhost:3000';

    // Default success URL (used for normal registrations)
    const defaultSuccessUrl = `${baseUrl}/event/${event_id}?payment=success&type=${type}`;

    // Default cancel URL
    const defaultCancelUrl = `${baseUrl}/event/${event_id}?payment=cancelled`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: description || `${type === 'registration' ? 'Registration' : 'Add-ons'} for ${event_name || 'Tournament'}`,
              description: `${player_name} - ${description || ''}`,
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      // Use custom success_url from frontend if provided (this is what fixes your issue)
      success_url: success_url || defaultSuccessUrl,
      cancel_url: cancel_url || defaultCancelUrl,
      metadata: {
        registration_id: registration_id || '',
        event_id,
        type,
      },
      customer_email: email,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('Stripe Checkout Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to create checkout session' }, { status: 500 });
  }
}