import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function appOrigin(request: NextRequest) {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    request.nextUrl.origin;

  const origin = String(raw).trim().replace(/\/$/, '');
  if (!/^https?:\/\//i.test(origin)) {
    return request.nextUrl.origin;
  }
  return origin;
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {},
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const eventId = body?.eventId ? Number(body.eventId) : null;

    // Load existing profile
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('stripe_account_id, email, full_name')
      .eq('id', user.id)
      .maybeSingle();

    let accountId = profile?.stripe_account_id || null;

    // Create Express account if needed
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: profile?.email || user.email || undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'individual',
        metadata: {
          supabase_user_id: user.id,
        },
      });

      accountId = account.id;

      // IMPORTANT: save account id so refresh can work later
      const { error: updateErr } = await supabaseAdmin
  .from('profiles')
  .upsert(
    {
      id: user.id,
      email: profile?.email || user.email || null,
      stripe_account_id: accountId,
    },
    { onConflict: 'id' }
  );

if (updateErr) {
  console.error('Failed to save stripe_account_id:', updateErr);
  return NextResponse.json(
    { error: 'Could not save Stripe account to profile' },
    { status: 500 }
  );
}
    }

    const origin = appOrigin(request);

    const returnPath = eventId
      ? `/event/${eventId}/manage?stripe_return=1`
      : `/platform?stripe_return=1`;

    const refreshPath = eventId
      ? `/event/${eventId}/manage?setup_payouts=1`
      : `/platform?setup_payouts=1`;

    const returnUrl = `${origin}${returnPath}`;
    const refreshUrl = `${origin}${refreshPath}`;

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });

    return NextResponse.json({
      url: accountLink.url,
      accountId,
    });
  } catch (err: any) {
    console.error('Stripe connect error:', err);
    return NextResponse.json(
      { error: err.message || 'Stripe Connect failed' },
      { status: 500 }
    );
  }
}