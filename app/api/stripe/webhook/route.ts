import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  const sig = request.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error('Webhook signature failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    // --- Connect: organizer account flags ---
    if (event.type === 'account.updated') {
      const account = event.data.object as Stripe.Account;

      const { error } = await supabaseAdmin
        .from('profiles')
        .update({
          stripe_charges_enabled: !!account.charges_enabled,
          stripe_payouts_enabled: !!account.payouts_enabled,
        })
        .eq('stripe_account_id', account.id);

      if (error) {
        console.error('Profile Stripe update failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    // --- Checkout: mark registration paid + save PaymentIntent ---
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      const registrationId = session.metadata?.registration_id?.trim();
      const type = (session.metadata?.type || '').toLowerCase();
      const netFromMeta = session.metadata?.net_amount
        ? Number(session.metadata.net_amount)
        : null;

      const paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id ?? null;

      const amountPaidTotal =
        session.amount_total != null ? session.amount_total / 100 : null;

      if (registrationId) {
        if (type === 'addon' || type === 'addon_payment') {
          const { error } = await supabaseAdmin
            .from('event_registrations')
            .update({
              paid_addons: true,
              stripe_payment_intent_id: paymentIntentId,
            })
            .eq('id', registrationId);

          if (error) {
            console.error('Addon payment update failed:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
          }
        } else {
          // registration (or empty type)
          const { error } = await supabaseAdmin
            .from('event_registrations')
            .update({
              paid: true,
              payment_method: 'card',
              stripe_payment_intent_id: paymentIntentId,
              amount_paid: netFromMeta ?? amountPaidTotal,
            })
            .eq('id', registrationId);

          if (error) {
            console.error('Registration payment update failed:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
          }
        }
      } else {
        console.warn(
          'checkout.session.completed without registration_id metadata',
          session.id
        );
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('Webhook handler error:', err);
    return NextResponse.json(
      { error: err.message || 'Webhook failed' },
      { status: 500 }
    );
  }
}