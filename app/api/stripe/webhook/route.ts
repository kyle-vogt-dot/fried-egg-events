import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function parseIds(session: Stripe.Checkout.Session): string[] {
  const meta = session.metadata || {};
  const raw = [meta.registration_ids || '', meta.registration_id || '']
    .join(',')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return Array.from(new Set(raw));
}

export async function POST(request: NextRequest) {
  const sig = request.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const body = await request.text();

  let event: Stripe.Event;
  try {
    const secrets = [
      process.env.STRIPE_WEBHOOK_SECRET,
      process.env.STRIPE_TEST_WEBHOOK_SECRET,
    ].filter(Boolean) as string[];

    let verified: Stripe.Event | null = null;
    let verifyErr: any = null;
    for (const secret of secrets) {
      try {
        verified = stripe.webhooks.constructEvent(body, sig, secret);
        break;
      } catch (e) {
        verifyErr = e;
      }
    }
    if (!verified) {
      console.error('Webhook signature failed:', verifyErr?.message);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }
    event = verified;
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

      const paidPatch = {
        paid: true,
        payment_method: 'stripe',
        stripe_payment_intent_id: paymentIntentId,
        amount_paid: amountPaid,
      };

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
          .update(paidPatch)
          .in('id', ids)
          .select('id');

        if (error) {
          console.error('Registration payment update failed:', error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const updatedIds = new Set((updated || []).map((r) => String(r.id)));
        const missing = ids.filter((id) => !updatedIds.has(String(id)));
        if (missing.length) {
          console.error(
            'Webhook: paid session but rows gone',
            session.id,
            missing
          );
        }
        return NextResponse.json({ received: true });
      }

      // No IDs in metadata — recover unpaid drafts for this event + email
      const email = (meta.email || session.customer_email || '')
        .toLowerCase()
        .trim();
      if (eventId && email) {
        const { error } = await supabaseAdmin
          .from('event_registrations')
          .update(paidPatch)
          .eq('event_id', eventId)
          .ilike('player_email', email)
          .eq('paid', false);
        if (error) {
          console.error('Webhook email fallback failed:', error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      } else {
        console.warn(
          'checkout.session.completed with no registration ids',
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