import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // @ts-expect-error stripe types lag package versions
  apiVersion: '2024-11-20.acacia',
});

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function appOrigin(request: NextRequest) {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_URL;
  if (fromEnv) {
    return fromEnv.startsWith('http') ? fromEnv : `https://${fromEnv}`;
  }
  return request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // ignore in route handlers when cookies are read-only
            }
          },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const eventId = body?.eventId ? Number(body.eventId) : null;

    // Load existing Stripe account from profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select(
        'id, email, full_name, stripe_account_id, stripe_payouts_enabled, stripe_charges_enabled'
      )
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error(profileError);
      return NextResponse.json(
        { error: 'Could not load profile' },
        { status: 500 }
      );
    }

    let accountId = profile?.stripe_account_id as string | null;

    // Create Express account if needed
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: profile?.email || user.email || undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          product_description: 'Golf tournament registration and event payouts',
        },
        metadata: {
          user_id: user.id,
          ...(eventId ? { last_event_id: String(eventId) } : {}),
        },
      });

      accountId = account.id;

      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({
          stripe_account_id: accountId,
          stripe_payouts_enabled: false,
          stripe_charges_enabled: false,
        })
        .eq('id', user.id);

      if (updateError) {
        console.error(updateError);
        return NextResponse.json(
          { error: 'Saved Stripe account failed on profile' },
          { status: 500 }
        );
      }
    }

    const origin = appOrigin(request);

    // After onboarding, land back on manage (or a dedicated return page)
    const returnPath = eventId
      ? `/event/${eventId}/manage?stripe_return=1`
      : `/platform?stripe_return=1`;

    const refreshPath = eventId
      ? `/event/${eventId}/manage?setup_payouts=1`
      : `/platform?setup_payouts=1`;

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}${refreshPath}`,
      return_url: `${origin}${returnPath}`,
      type: 'account_onboarding',
    });

    return NextResponse.json({
      url: accountLink.url,
      accountId,
    });
  } catch (err: any) {
    console.error('Stripe connect error:', err);
    return NextResponse.json(
      { error: err?.message || 'Stripe Connect failed' },
      { status: 500 }
    );
  }
}