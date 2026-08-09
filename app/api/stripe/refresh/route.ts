import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST() {
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

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('stripe_account_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.stripe_account_id) {
      return NextResponse.json({
        connected: false,
        payoutsEnabled: false,
        chargesEnabled: false,
      });
    }

    const account = await stripe.accounts.retrieve(profile.stripe_account_id);

    await supabaseAdmin
      .from('profiles')
      .update({
        stripe_charges_enabled: !!account.charges_enabled,
        stripe_payouts_enabled: !!account.payouts_enabled,
      })
      .eq('id', user.id);

    return NextResponse.json({
      connected: true,
      payoutsEnabled: !!account.payouts_enabled,
      chargesEnabled: !!account.charges_enabled,
    });
  } catch (err: any) {
    console.error('Stripe refresh error:', err);
    return NextResponse.json(
      { error: err.message || 'Refresh failed' },
      { status: 500 }
    );
  }
}