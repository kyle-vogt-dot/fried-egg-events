import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { resolvePlatformFeePercent } from '@/app/libs/platform-fee';
import {
  connectColumns,
  retrieveAccountInCurrentMode,
  storedConnectAccountId,
  storedConnectReady,
} from '@/app/api/stripe/connect/lib';

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

function calculateAmountWithStripeFee(desiredNetDollars: number) {
  const desiredNetCents = Math.round(desiredNetDollars * 100);
  const totalCents = Math.ceil((desiredNetCents + 30) / (1 - 0.029));
  const feeCents = totalCents - desiredNetCents;

  return {
    totalCents,
    feeCents,
    netCents: desiredNetCents,
  };
}

function appendQuery(url: string, key: string, value: string) {
  if (!value) return url;
  if (url.includes(`${key}=`)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${key}=${value}`;
}

/** Inverse of amountWithPlatformFee: platform cut in cents from the charged amount. */
function platformFeeCentsFromChargedAmount(
  chargedDollars: number,
  percent: number
) {
  const chargedCents = Math.round(Number(chargedDollars) * 100);
  if (!Number.isFinite(chargedCents) || chargedCents <= 0) return 0;
  const pct = resolvePlatformFeePercent(percent);
  if (pct <= 0) return 0;
  const subtotalCents = Math.round(chargedCents / (1 + pct / 100));
  return Math.max(0, chargedCents - subtotalCents);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      registration_id,
      registration_ids,
      amount,
      player_name,
      email,
      description,
      event_name,
      event_id,
      type = 'addon_payment',
      success_url,
      cancel_url,
      team_name,
      selected_round_ids,
    } = body;

    if (amount == null || amount === '' || !email || !event_id) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: ev } = await sb
      .from('tournaments')
      .select(
        'is_demo, stripe_connect_ready, stripe_connect_account_id, stripe_connect_ready_test, stripe_connect_account_id_test'
      )
      .eq('id', event_id)
      .single();
    const isDemo = !!ev?.is_demo;
    const stripe = getStripe(isDemo);

    const { data: feeData } = await sb
      .from('platform_settings')
      .select('platform_fee_percent')
      .eq('id', 1)
      .single();
    const platformFeePercent = resolvePlatformFeePercent(
      feeData?.platform_fee_percent
    );

    const baseUrl = (
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      'http://localhost:3000'
    ).replace(/\/$/, '');

    const ids = registration_ids
      ? String(registration_ids)
      : registration_id
        ? String(registration_id)
        : '';

    const roundIds = Array.isArray(selected_round_ids)
      ? selected_round_ids.map(String).join(',')
      : selected_round_ids
        ? String(selected_round_ids)
        : '';

    let finalSuccess =
      success_url ||
      `${baseUrl}/event/${event_id}?payment=success&type=${type}`;
    finalSuccess = appendQuery(
      finalSuccess,
      'session_id',
      '{CHECKOUT_SESSION_ID}'
    );
    if (ids) {
      finalSuccess = appendQuery(finalSuccess, 'registration_ids', ids);
    }

    const finalCancel =
      cancel_url || `${baseUrl}/event/${event_id}?payment=cancelled`;

    const { feeCents, netCents } = calculateAmountWithStripeFee(Number(amount));
    const applicationFeeAmount = platformFeeCentsFromChargedAmount(
      Number(amount),
      platformFeePercent
    );
    const connectAccountId = storedConnectAccountId(ev, isDemo);
    let connectReady = storedConnectReady(ev, isDemo);
    if (connectAccountId && !connectReady) {
      const retrieved = await retrieveAccountInCurrentMode(
        stripe,
        connectAccountId
      );
      if ('account' in retrieved && retrieved.account.charges_enabled) {
        connectReady = true;
        const cols = connectColumns(isDemo);
        await sb
          .from('tournaments')
          .update({ [cols.ready]: true })
          .eq('id', event_id);
      } else {
        connectReady = false;
      }
    }
    const useDestination = connectReady && !!connectAccountId;

    const meta: Record<string, string> = {
      registration_id: registration_id ? String(registration_id) : '',
      registration_ids: ids,
      event_id: String(event_id),
      type: String(type),
      net_amount: String(amount),
      player_name: player_name ? String(player_name) : '',
      email: String(email),
      is_demo: isDemo ? 'true' : 'false',
      team_name: team_name ? String(team_name) : '',
      selected_round_ids: roundIds,
    };

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name:
                description ||
                `${
                  type === 'registration' ? 'Registration' : 'Add-ons'
                } – ${event_name || 'Tournament'}`,
              description: player_name ? `${player_name}` : undefined,
            },
            unit_amount: netCents,
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Processing Fee',
              description: 'Card processing fee',
            },
            unit_amount: feeCents,
          },
          quantity: 1,
        },
      ],
      success_url: finalSuccess,
      cancel_url: finalCancel,
      metadata: meta,
      payment_intent_data: {
        metadata: {
          ...meta,
          registration_ids: meta.registration_ids,
          registration_id: meta.registration_id,
          event_id: meta.event_id,
          email: meta.email,
          type: meta.type,
        },
        ...(useDestination
          ? {
              application_fee_amount: applicationFeeAmount,
              transfer_data: { destination: connectAccountId },
            }
          : {}),
      },
      customer_email: email,
    });

    return NextResponse.json({
      url: session.url,
      session_id: session.id,
      is_demo: isDemo,
    });
  } catch (error: any) {
    console.error('Stripe Checkout Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}