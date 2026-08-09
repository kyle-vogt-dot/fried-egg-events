import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { registration_id, payment_intent_id, amount } = body;

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
      payment_intent: String(payment_intent_id),
      amount: amountCents,
      reason: 'requested_by_customer',
      metadata: {
        registration_id: registration_id ? String(registration_id) : '',
      },
    });

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
