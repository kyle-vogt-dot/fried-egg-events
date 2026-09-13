import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function parseIdsFromMeta(meta: Record<string, string> | null | undefined): string[] {
  const m = meta || {};
  const raw = [m.registration_ids || '', m.registration_id || '']
    .join(',')
    .split(',')
    .map((s) => String(s).trim())
    .filter(Boolean);

  // Keep UUID strings. Do not parseInt.
  return Array.from(new Set(raw));
}

function parseIds(session: Stripe.Checkout.Session): string[] {
  return parseIdsFromMeta(session.metadata as Record<string, string> | null);
}

function stripeForLivemode(livemode: boolean) {
  const key = livemode
    ? process.env.STRIPE_SECRET_KEY
    : process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('Missing Stripe secret key for webhook retrieve');
  }
  return new Stripe(key);
}

function paidPatchFromMeta(
  meta: Record<string, string>,
  paymentIntentId: string | null,
  amountPaid: number | null
) {
  const paidPatch: Record<string, any> = {
    paid: true,
    payment_method: 'stripe',
    stripe_payment_intent_id: paymentIntentId,
    amount_paid: amountPaid,
  };
  if (meta.team_name) paidPatch.team_name = meta.team_name;
  if (meta.selected_round_ids) {
    const roundIds = String(meta.selected_round_ids)
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (roundIds.length) paidPatch.selected_round_ids = roundIds;
  }
  return paidPatch;
}

async function markRegistrationsPaid(opts: {
  meta: Record<string, string>;
  ids: string[];
  paymentIntentId: string | null;
  amountPaid: number | null;
  email: string;
  logLabel: string;
}) {
  const { meta, ids, paymentIntentId, amountPaid, email, logLabel } = opts;
  const type = (meta.type || '').toLowerCase();
  const eventId = meta.event_id ? parseInt(meta.event_id, 10) : null;
  const paidPatch = paidPatchFromMeta(meta, paymentIntentId, amountPaid);

  if (type === 'sponsorship') {
    return;
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
      if (error) throw error;
    }
    return;
  }

  if (ids.length > 0) {
    const { data: updated, error } = await supabaseAdmin
      .from('event_registrations')
      .update(paidPatch)
      .in('id', ids)
      .select('id');

    if (error) throw error;

    const updatedIds = new Set((updated || []).map((r) => String(r.id)));
    const missing = ids.filter((id) => !updatedIds.has(String(id)));
    if (missing.length) {
      console.error('Webhook: paid session but rows gone', logLabel, missing);
    }
    return;
  }

  const fallbackEmail = email.toLowerCase().trim();
  if (eventId && fallbackEmail) {
    const { error } = await supabaseAdmin
      .from('event_registrations')
      .update(paidPatch)
      .eq('event_id', eventId)
      .ilike('player_email', fallbackEmail)
      .eq('paid', false);
    if (error) throw error;
  } else {
    console.warn(`${logLabel} with no registration ids`);
  }
}

async function handleCheckoutSession(
  session: Stripe.Checkout.Session,
  logLabel: string
) {
  const meta = (session.metadata || {}) as Record<string, string>;
  const ids = parseIds(session);
  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  const netFromMeta = meta.net_amount ? Number(meta.net_amount) : null;
  const amountPaidTotal =
    session.amount_total != null ? session.amount_total / 100 : null;
  const amountPaid = netFromMeta ?? amountPaidTotal;
  const email = (meta.email || session.customer_email || '').trim();

  await markRegistrationsPaid({
    meta,
    ids,
    paymentIntentId,
    amountPaid,
    email,
    logLabel,
  });
}

async function handlePaymentIntent(
  pi: Stripe.PaymentIntent,
  client: Stripe
) {
  let meta = (pi.metadata || {}) as Record<string, string>;
  let ids = parseIdsFromMeta(meta);
  let email = (meta.email || pi.receipt_email || '').trim();
  let amountPaid = meta.net_amount
    ? Number(meta.net_amount)
    : pi.amount != null
      ? pi.amount / 100
      : null;

  if (ids.length === 0) {
    const listed = await client.checkout.sessions.list({
      payment_intent: pi.id,
      limit: 1,
    });
    const session = listed.data[0];
    if (session) {
      const sessionMeta = (session.metadata || {}) as Record<string, string>;
      meta = { ...sessionMeta, ...meta };
      ids = parseIds(session);
      if (!email) {
        email = (sessionMeta.email || session.customer_email || '').trim();
      }
      if (amountPaid == null) {
        const netFromMeta = sessionMeta.net_amount
          ? Number(sessionMeta.net_amount)
          : null;
        amountPaid =
          netFromMeta ??
          (session.amount_total != null ? session.amount_total / 100 : null);
      }
    }
  }

  await markRegistrationsPaid({
    meta,
    ids,
    paymentIntentId: pi.id,
    amountPaid,
    email,
    logLabel: pi.id,
  });
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

    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutSession(session, session.id);
    }

    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as Stripe.PaymentIntent;
      await handlePaymentIntent(pi, stripeForLivemode(!!event.livemode));
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
