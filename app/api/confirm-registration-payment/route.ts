import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { session_id, registration_ids } = await request.json();
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

    const ids = (registration_ids as string[]).map(String);

    const { error } = await supabaseAdmin
      .from('event_registrations')
      .update({
        paid: true,
        payment_method: 'card',
        stripe_payment_intent_id: paymentIntentId,
        amount_paid: amountPaid,
      })
      .in('id', ids);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, paymentIntentId, amountPaid });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || 'Failed' },
      { status: 500 }
    );
  }
}
