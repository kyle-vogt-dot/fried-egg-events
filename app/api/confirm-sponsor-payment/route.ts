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
    const { session_id, sponsor_id } = await request.json();
    if (!session_id || !sponsor_id) {
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

    const amountPaid =
      session.metadata?.net_amount != null
        ? Number(session.metadata.net_amount)
        : session.amount_total != null
          ? session.amount_total / 100
          : null;

    const { data: sponsor, error: fetchErr } = await supabaseAdmin
      .from('event_sponsors')
      .select('id, package_id, paid')
      .eq('id', sponsor_id)
      .single();

    if (fetchErr || !sponsor) {
      return NextResponse.json({ error: 'Sponsor not found' }, { status: 404 });
    }

    if (!sponsor.paid) {
      const { error } = await supabaseAdmin
        .from('event_sponsors')
        .update({
          paid: true,
          payment_method: 'card',
          stripe_payment_intent_id: paymentIntentId,
          amount_paid: amountPaid,
        })
        .eq('id', sponsor_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (sponsor.package_id) {
        const { data: pkg } = await supabaseAdmin
          .from('event_sponsor_packages')
          .select('times_sold')
          .eq('id', sponsor.package_id)
          .single();

        await supabaseAdmin
          .from('event_sponsor_packages')
          .update({
            times_sold: Number(pkg?.times_sold || 0) + 1,
          })
          .eq('id', sponsor.package_id);
      }
    }

        // Emails (non-blocking)
    try {
      const origin =
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.NEXT_PUBLIC_SITE_URL ||
        'https://www.friedeggevents.app';
      await fetch(`${origin}/api/send-sponsor-emails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsor_id }),
      });
    } catch (e) {
      console.error('Sponsor emails failed:', e);
    }

    return NextResponse.json({ success: true, paymentIntentId, amountPaid });

    return NextResponse.json({ success: true, paymentIntentId, amountPaid });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || 'Failed' },
      { status: 500 }
    );
  }
}