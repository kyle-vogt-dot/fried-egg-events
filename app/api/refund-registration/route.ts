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
    const body = await request.json();
    const {
      registration_id,
      payment_intent_id,
      amount, // dollars
    } = body;

    if (!registration_id) {
      return NextResponse.json(
        { error: 'registration_id is required' },
        { status: 400 }
      );
    }

    if (!payment_intent_id) {
      return NextResponse.json(
        { error: 'payment_intent_id is required for Stripe refund' },
        { status: 400 }
      );
    }

    const amountDollars = Number(amount);
    if (!amountDollars || amountDollars <= 0) {
      return NextResponse.json(
        { error: 'Refund amount must be greater than 0' },
        { status: 400 }
      );
    }

    // Load registration first (audit + safety)
    const { data: reg, error: regErr } = await supabaseAdmin
      .from('event_registrations')
      .select('id, paid, refunded, event_id, player_name, player_email')
      .eq('id', registration_id)
      .maybeSingle();

    if (regErr || !reg) {
      return NextResponse.json(
        { error: 'Registration not found' },
        { status: 404 }
      );
    }

    if (reg.refunded === true) {
      return NextResponse.json(
        { error: 'Registration is already marked refunded' },
        { status: 400 }
      );
    }

    const amountCents = Math.round(amountDollars * 100);

    const refund = await stripe.refunds.create({
      payment_intent: payment_intent_id,
      amount: amountCents,
      reason: 'requested_by_customer',
      metadata: {
        registration_id: String(registration_id),
        event_id: reg.event_id != null ? String(reg.event_id) : '',
      },
    });

    // Keep the row — mark refunded, drop off active rosters
    const { error: updateErr } = await supabaseAdmin
      .from('event_registrations')
      .update({
        paid: false,
        refunded: true,
        refunded_at: new Date().toISOString(),
        stripe_refund_id: refund.id,
        refund_amount: amountDollars,
        // optional: payment_method: 'refunded',
      })
      .eq('id', registration_id);

    if (updateErr) {
      console.error('Refund succeeded in Stripe but DB update failed:', updateErr);
      return NextResponse.json(
        {
          success: true,
          warning:
            'Stripe refund created but registration update failed — fix row manually',
          refund_id: refund.id,
          status: refund.status,
          amount: amountDollars,
          db_error: updateErr.message,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      success: true,
      refund_id: refund.id,
      status: refund.status,
      amount: amountDollars,
      registration_id,
    });
  } catch (err: any) {
    console.error('Stripe refund error:', err);
    return NextResponse.json(
      { error: err?.message || 'Refund failed' },
      { status: 500 }
    );
  }
}