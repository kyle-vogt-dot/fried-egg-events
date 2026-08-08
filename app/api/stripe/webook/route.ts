import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createSupabaseServerClient } from '@/app/libs/supabase/supabase-server-client';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature')!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  console.log(`Received Stripe event: ${event.type}`);

  // Handle successful checkout
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const registrationId = session.metadata?.registration_id;

    if (registrationId) {
      try {
        const supabase = await createSupabaseServerClient();

        const { error } = await supabase
          .from('event_registrations')
          .update({ 
            paid: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', registrationId);

        if (error) {
          console.error('Failed to update paid status:', error);
        } else {
          console.log(`✅ Successfully marked registration ${registrationId} as PAID`);
        }
      } catch (err) {
        console.error('Supabase error in webhook:', err);
      }
    }
  }

  return NextResponse.json({ received: true });
}