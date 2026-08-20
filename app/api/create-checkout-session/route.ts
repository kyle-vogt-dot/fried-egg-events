import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function calculateAmountWithStripeFee(desiredNetDollars: number) {
  const desiredNetCents = Math.round(desiredNetDollars * 100);
  const totalCents = Math.ceil((desiredNetCents + 30) / (1 - 0.029));
  const feeCents = totalCents - desiredNetCents;

  return {
    totalCents,
    feeCents,
    netCents: desiredNetCents,
  };
}

function appendQuery(url: string, key: string, value: string) {
  if (!value) return url;
  if (url.includes(`${key}=`)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${key}=${value}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      registration_id,
      registration_ids,
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
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const baseUrl = (
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      'http://localhost:3000'
    ).replace(/\/$/, '');

    const ids = registration_ids
      ? String(registration_ids)
      : registration_id
        ? String(registration_id)
        : '';

    let finalSuccess =
      success_url ||
      `${baseUrl}/event/${event_id}?payment=success&type=${type}`;
    finalSuccess = appendQuery(
      finalSuccess,
      'session_id',
      '{CHECKOUT_SESSION_ID}'
    );
    if (ids) {
      finalSuccess = appendQuery(finalSuccess, 'registration_ids', ids);
    }

    const finalCancel =
      cancel_url || `${baseUrl}/event/${event_id}?payment=cancelled`;

    const { feeCents, netCents } = calculateAmountWithStripeFee(Number(amount));

    const meta: Record<string, string> = {
      registration_id: registration_id ? String(registration_id) : '',
      registration_ids: ids,
      event_id: String(event_id),
      type: String(type),
      net_amount: String(amount),
      player_name: player_name ? String(player_name) : '',
      email: String(email),
    };

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name:
                description ||
                `${
                  type === 'registration' ? 'Registration' : 'Add-ons'
                } – ${event_name || 'Tournament'}`,
              description: player_name ? `${player_name}` : undefined,
            },
            unit_amount: netCents,
          },
          quantity: 1,
        },
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
      success_url: finalSuccess,
      cancel_url: finalCancel,
      metadata: meta,
      payment_intent_data: {
        metadata: meta,
      },
      customer_email: email,
    });

    return NextResponse.json({ url: session.url, session_id: session.id });
  } catch (error: any) {
    console.error('Stripe Checkout Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}