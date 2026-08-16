import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function confirmRegistrationPayment(opts: {
  session_id: string;
  registration_ids: string[];
}) {
  const { session_id, registration_ids } = opts;

  if (!session_id || !registration_ids?.length) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const session = await stripe.checkout.sessions.retrieve(String(session_id));
  if (session.payment_status !== 'paid') {
    return NextResponse.json({ error: 'Not paid' }, { status: 400 });
  }

  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const netFromMeta = session.metadata?.net_amount
    ? Number(session.metadata.net_amount)
    : null;
  const amountPaid =
    netFromMeta ??
    (session.amount_total != null ? session.amount_total / 100 : null);

  const ids = registration_ids.map(String);

  // Prefer metadata payment_method if present (payment_link vs card)
  const methodFromMeta = String(
    session.metadata?.payment_method || ''
  ).toLowerCase();
  const payment_method =
    methodFromMeta === 'payment_link' || methodFromMeta === 'addon'
      ? methodFromMeta
      : 'card';

  const { error } = await supabaseAdmin
    .from('event_registrations')
    .update({
      paid: true,
      payment_method,
      stripe_payment_intent_id: paymentIntentId,
      amount_paid: amountPaid,
    })
    .in('id', ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, paymentIntentId, amountPaid });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    return await confirmRegistrationPayment({
      session_id: body.session_id,
      registration_ids: body.registration_ids || [],
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || 'Failed' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const session_id =
      sp.get('session_id') || sp.get('checkout_session_id') || '';
    const event_id = sp.get('event_id');

    const registration_ids: string[] = [];
    const multi = sp.get('registration_ids');
    const single = sp.get('registration_id');
    if (multi) {
      multi
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((id) => registration_ids.push(id));
    } else if (single) {
      registration_ids.push(single);
    }

    if (!session_id) {
      return NextResponse.json(
        { error: 'session_id is required' },
        { status: 400 }
      );
    }

    const result = await confirmRegistrationPayment({
      session_id,
      registration_ids,
    });

    // If this was a browser redirect from Stripe, send them to the event
    const accept = request.headers.get('accept') || '';
    if (accept.includes('text/html') && event_id) {
      const origin = request.nextUrl.origin;
      return NextResponse.redirect(
        `${origin}/event/${event_id}?payment=success&type=registration&session_id=${encodeURIComponent(session_id)}&registration_ids=${encodeURIComponent(registration_ids.join(','))}`
      );
    }

    return result;
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || 'Failed' },
      { status: 500 }
    );
  }
}