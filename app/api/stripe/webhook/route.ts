import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function parseIds(session: Stripe.Checkout.Session): number[] {
  const meta = session.metadata || {};
  const raw = [
    meta.registration_ids || '',
    meta.registration_id || '',
  ]
    .join(',')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return Array.from(
    new Set(
      raw
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n) && n > 0)
    )
  );
}

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

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const meta = session.metadata || {};
      const type = (meta.type || '').toLowerCase();
      const eventId = meta.event_id ? parseInt(meta.event_id, 10) : null;
      const ids = parseIds(session);

      const paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id ?? null;

      const netFromMeta = meta.net_amount ? Number(meta.net_amount) : null;
      const amountPaidTotal =
        session.amount_total != null ? session.amount_total / 100 : null;
      const amountPaid = netFromMeta ?? amountPaidTotal;

      if (type === 'sponsorship') {
        return NextResponse.json({ received: true });
      }

      if (type === 'addon' || type === 'addon_payment') {
        if (ids.length > 0) {
          const { error } = await supabaseAdmin
            .from('event_registrations')
            .update({
              paid_addons: true,
              stripe_payment_intent_id: paymentIntentId,
            })
            .in('id', ids);
          if (error) {
            console.error('Addon payment update failed:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
          }
        }
        return NextResponse.json({ received: true });
      }

      if (ids.length > 0) {
        const { data: updated, error } = await supabaseAdmin
          .from('event_registrations')
          .update({
            paid: true,
            payment_method: 'card',
            stripe_payment_intent_id: paymentIntentId,
            amount_paid: amountPaid,
          })
          .in('id', ids)
          .select('id');

        if (error) {
          console.error('Registration payment update failed:', error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const updatedIds = new Set((updated || []).map((r) => Number(r.id)));
        const missing = ids.filter((id) => !updatedIds.has(id));

        // Drafts were deleted — recreate paid rows with the same ids
        for (const id of missing) {
          if (!eventId) continue;
          const { error: insErr } = await supabaseAdmin
            .from('event_registrations')
            .insert({
              id,
              event_id: eventId,
              player_name: meta.player_name || 'Player',
              player_email: (meta.email || '').toLowerCase() || null,
              paid: true,
              payment_method: 'card',
              stripe_payment_intent_id: paymentIntentId,
              amount_paid: amountPaid,
              selected_round_ids: [],
            });
          if (insErr) {
            console.error('Registration upsert failed', id, insErr);
          }
        }
      } else if (eventId) {
        console.warn(
          'checkout.session.completed with no registration ids',
          session.id
        );
        const { error: insErr } = await supabaseAdmin
          .from('event_registrations')
          .insert({
            event_id: eventId,
            player_name: meta.player_name || 'Player',
            player_email: (meta.email || '').toLowerCase() || null,
            paid: true,
            payment_method: 'card',
            stripe_payment_intent_id: paymentIntentId,
            amount_paid: amountPaid,
            selected_round_ids: [],
          });
        if (insErr) {
          console.error('Registration create-from-session failed', insErr);
        }
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