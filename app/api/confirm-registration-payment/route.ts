import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getStripe(isDemo: boolean) {
  const key = isDemo
    ? process.env.STRIPE_TEST_SECRET_KEY
    : process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      isDemo ? 'Missing STRIPE_TEST_SECRET_KEY' : 'Missing STRIPE_SECRET_KEY'
    );
  }
  return new Stripe(key);
}

function parseIds(
  session: Stripe.Checkout.Session,
  extra?: string[] | string
): number[] {
  const meta = session.metadata || {};
  const extraStr = Array.isArray(extra) ? extra.join(',') : extra || '';
  const raw = [meta.registration_ids || '', meta.registration_id || '', extraStr]
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

async function confirmRegistrationPayment(opts: {
  session_id: string;
  registration_ids?: string[] | string;
}) {
  const session_id = String(opts.session_id || '').trim();
  if (!session_id) {
    return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe(false).checkout.sessions.retrieve(session_id);
  } catch {
    session = await getStripe(true).checkout.sessions.retrieve(session_id);
  }

  if (session.payment_status !== 'paid' && session.status !== 'complete') {
    return NextResponse.json(
      { error: 'Not paid', status: session.payment_status },
      { status: 400 }
    );
  }

  const meta = session.metadata || {};
  const type = String(meta.type || '').toLowerCase();
  const eventId = meta.event_id ? parseInt(meta.event_id, 10) : null;
  const ids = parseIds(session, opts.registration_ids);

  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const netFromMeta = meta.net_amount ? Number(meta.net_amount) : null;
  const amountPaid =
    netFromMeta ??
    (session.amount_total != null ? session.amount_total / 100 : null);

  const methodFromMeta = String(meta.payment_method || '').toLowerCase();
  const payment_method =
    methodFromMeta === 'payment_link' || methodFromMeta === 'addon'
      ? methodFromMeta
      : 'card';

  if (type === 'addon' || type === 'addon_payment') {
    if (ids.length) {
      const { error } = await supabaseAdmin
        .from('event_registrations')
        .update({
          paid_addons: true,
          stripe_payment_intent_id: paymentIntentId,
        })
        .in('id', ids);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
    return NextResponse.json({ success: true, paymentIntentId, ids, type });
  }

  if (ids.length > 0) {
    const { data: updated, error } = await supabaseAdmin
      .from('event_registrations')
      .update({
        paid: true,
        payment_method,
        stripe_payment_intent_id: paymentIntentId,
        amount_paid: amountPaid,
      })
      .in('id', ids)
      .select('id');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const updatedIds = new Set((updated || []).map((r) => Number(r.id)));
    const missing = ids.filter((id) => !updatedIds.has(id));

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
          payment_method,
          stripe_payment_intent_id: paymentIntentId,
          amount_paid: amountPaid,
          selected_round_ids: [],
        });
      if (insErr) console.error('confirm upsert failed', id, insErr);
    }
  } else if (eventId) {
    const { error: insErr } = await supabaseAdmin
      .from('event_registrations')
      .insert({
        event_id: eventId,
        player_name: meta.player_name || 'Player',
        player_email: (meta.email || '').toLowerCase() || null,
        paid: true,
        payment_method,
        stripe_payment_intent_id: paymentIntentId,
        amount_paid: amountPaid,
        selected_round_ids: [],
      });
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    success: true,
    paymentIntentId,
    amountPaid,
    ids,
  });
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