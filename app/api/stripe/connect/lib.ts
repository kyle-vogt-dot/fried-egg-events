import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { loadEventAccess } from '@/app/libs/event-admin';

export function getStripe(isDemo: boolean) {
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

export function connectColumns(isDemo: boolean) {
  return isDemo
    ? {
        accountId: 'stripe_connect_account_id_test' as const,
        ready: 'stripe_connect_ready_test' as const,
      }
    : {
        accountId: 'stripe_connect_account_id' as const,
        ready: 'stripe_connect_ready' as const,
      };
}

export function storedConnectAccountId(event: any, isDemo: boolean) {
  return String(event?.[connectColumns(isDemo).accountId] || '').trim();
}

export function storedConnectReady(event: any, isDemo: boolean) {
  return !!event?.[connectColumns(isDemo).ready];
}

export function isModeMismatchError(err: any) {
  const code = String(err?.code || err?.raw?.code || '');
  const msg = String(err?.message || err?.raw?.message || '');
  return (
    code === 'resource_missing' ||
    /no such account/i.test(msg) ||
    /created in test mode/i.test(msg) ||
    /created in live mode/i.test(msg) ||
    /test mode.*live/i.test(msg) ||
    /live mode.*test/i.test(msg) ||
    /similar object exists in (test|live) mode/i.test(msg)
  );
}

export async function retrieveAccountInCurrentMode(
  stripe: Stripe,
  accountId: string
) {
  try {
    const account = await stripe.accounts.retrieve(accountId);
    return { account };
  } catch (err: any) {
    if (isModeMismatchError(err)) {
      return { mismatch: true as const };
    }
    throw err;
  }
}

export async function loadTournamentServiceRole(eventId: number) {
  const admin = supabaseAdmin();
  const { data: event, error } = await admin
    .from('tournaments')
    .select(
      'id, created_by, is_demo, stripe_connect_account_id, stripe_connect_ready, stripe_connect_account_id_test, stripe_connect_ready_test'
    )
    .eq('id', eventId)
    .maybeSingle();
  return { admin, event, error };
}

export async function saveConnectAccount(
  admin: ReturnType<typeof supabaseAdmin>,
  eventId: number,
  isDemo: boolean,
  accountId: string | null,
  ready: boolean
) {
  const cols = connectColumns(isDemo);
  return admin
    .from('tournaments')
    .update({
      [cols.accountId]: accountId,
      [cols.ready]: ready,
    })
    .eq('id', eventId);
}

export async function saveConnectReady(
  admin: { from: (relation: string) => any },
  eventId: number,
  isDemo: boolean,
  ready: boolean
) {
  const cols = connectColumns(isDemo);
  const { data, error } = await admin
    .from('tournaments')
    .update({ [cols.ready]: ready })
    .eq('id', eventId)
    .select('id');
  const rowCount = data?.length ?? 0;
  if (error) {
    console.error(`Connect ready update failed (${cols.ready}):`, error);
  } else if (rowCount === 0) {
    console.error(
      `Connect ready update matched 0 rows (${cols.ready}) event_id=${eventId}`
    );
  }
  return { data, error, rowCount };
}

export async function createExpressAccount(stripe: Stripe) {
  return stripe.accounts.create({
    type: 'express',
    country: 'US',
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });
}

export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key);
}

export function parseEventId(raw: unknown): number | null {
  const n =
    typeof raw === 'number' ? raw : parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function accountIdSuffix(accountId: string | null | undefined) {
  if (!accountId) return null;
  const id = String(accountId);
  return id.length <= 4 ? id : id.slice(-4);
}

export function appOrigin(request: NextRequest) {
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

export async function requireEventConnectAccess(eventId: number) {
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
    return {
      error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }),
    };
  }

  const admin = supabaseAdmin();
  const access = await loadEventAccess(admin, eventId, user);
  if (!access.event) {
    return {
      error: NextResponse.json({ error: 'Event not found' }, { status: 404 }),
    };
  }
  if (!access.isCreator && !access.isPlatform) {
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return { user, event: access.event, admin };
}
