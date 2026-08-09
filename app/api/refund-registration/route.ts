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

    const amountCents = Math.round(amountDollars * 100);

    const refund = await stripe.refunds.create({
      payment_intent: payment_intent_id,
      amount: amountCents,
      reason: 'requested_by_customer',
      metadata: {
        registration_id: registration_id ? String(registration_id) : '',
      },
    });

    // Optional: stamp registration before delete (if row still exists)
    if (registration_id) {
      await supabaseAdmin
        .from('event_registrations')
        .update({
          refunded: true,
          stripe_refund_id: refund.id,
          refund_amount: amountDollars,
        })
        .eq('id', registration_id);
      // Ignore errors if columns don't exist yet
    }

    return NextResponse.json({
      success: true,
      refund_id: refund.id,
      status: refund.status,
      amount: amountDollars,
    });
  } catch (err: any) {
    console.error('Stripe refund error:', err);
    return NextResponse.json(
      { error: err.message || 'Refund failed' },
      { status: 500 }
    );
  }
}