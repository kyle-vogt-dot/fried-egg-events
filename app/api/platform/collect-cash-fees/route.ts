import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { loadEventAccess } from '@/app/libs/event-admin';
import {
  computeCashPlatformFeeDue,
  resolveFeeConfig,
} from '@/app/libs/cash-platform-fee';
import {
  getStripe,
  parseEventId,
  storedConnectAccountId,
  supabaseAdmin,
} from '@/app/api/stripe/connect/lib';

export const runtime = 'nodejs';

const PLATFORM_EMAILS = ['kyle-vogt@hotmail.com'];

async function requirePlatformUser() {
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
  if (!PLATFORM_EMAILS.includes(user.email || '')) {
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }
  return { user };
}

function paidCollected(payments: any[]) {
  return (payments || [])
    .filter((p: any) => String(p.status || '').toLowerCase() === 'paid')
    .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
}

export async function GET() {
  try {
    const auth = await requirePlatformUser();
    if ('error' in auth) return auth.error;

    const admin = supabaseAdmin();
    const [{ data: events }, { data: feeSettings }] = await Promise.all([
      admin
        .from('tournaments')
        .select(
          'id, name, date, price, pricing_mode, max_teammates, is_demo, stripe_connect_account_id, stripe_connect_account_id_test'
        )
        .eq('is_active', true),
      admin
        .from('platform_settings')
        .select('platform_fee, platform_fee_percent')
        .eq('id', 1)
        .single(),
    ]);

    const ids = (events || []).map((e: any) => e.id);
    if (!ids.length) {
      return NextResponse.json({ fees: [] });
    }

    const [{ data: regs }, { data: rounds }, { data: payments }] =
      await Promise.all([
        admin.from('event_registrations').select('*').in('event_id', ids),
        admin.from('event_rounds').select('*').in('event_id', ids),
        admin
          .from('platform_fee_payments')
          .select('event_id, amount, status')
          .in('event_id', ids),
      ]);

    const regsByEvent = new Map<number, any[]>();
    for (const r of regs || []) {
      const id = Number(r.event_id);
      if (!regsByEvent.has(id)) regsByEvent.set(id, []);
      regsByEvent.get(id)!.push(r);
    }
    const roundsByEvent = new Map<number, any[]>();
    for (const r of rounds || []) {
      const id = Number(r.event_id);
      if (!roundsByEvent.has(id)) roundsByEvent.set(id, []);
      roundsByEvent.get(id)!.push(r);
    }
    const payByEvent = new Map<number, any[]>();
    for (const p of payments || []) {
      const id = Number(p.event_id);
      if (!payByEvent.has(id)) payByEvent.set(id, []);
      payByEvent.get(id)!.push(p);
    }

    const fees = (events || []).map((event: any) => {
      const feeCfg = resolveFeeConfig(feeSettings, event);
      const { due } = computeCashPlatformFeeDue({
        registrations: regsByEvent.get(Number(event.id)) || [],
        event,
        rounds: roundsByEvent.get(Number(event.id)) || [],
        ...feeCfg,
      });
      const collected = paidCollected(payByEvent.get(Number(event.id)) || []);
      const outstanding = Math.max(
        0,
        Math.round((due - collected) * 100) / 100
      );
      return {
        event_id: event.id,
        due,
        collected,
        outstanding,
      };
    });

    return NextResponse.json({ fees });
  } catch (err: any) {
    console.error('collect-cash-fees GET error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to load cash fees' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const eventId = parseEventId(body?.eventId ?? body?.event_id);
    if (eventId == null) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
    }

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

    const admin = supabaseAdmin();
    const access = await loadEventAccess(admin, eventId, user);
    if (!access.event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    if (!access.isCreator && !access.isPlatform) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const event = access.event;
    const isDemo = !!event.is_demo;
    const accountId = storedConnectAccountId(event, isDemo);
    if (!accountId) {
      return NextResponse.json(
        { error: 'Connect payouts are not set up for this event' },
        { status: 400 }
      );
    }

    const [{ data: regs }, { data: rounds }, { data: feeSettings }, { data: payments }] =
      await Promise.all([
        admin.from('event_registrations').select('*').eq('event_id', eventId),
        admin.from('event_rounds').select('*').eq('event_id', eventId),
        admin
          .from('platform_settings')
          .select('platform_fee, platform_fee_percent')
          .eq('id', 1)
          .single(),
        admin
          .from('platform_fee_payments')
          .select('amount, status')
          .eq('event_id', eventId),
      ]);

    const feeCfg = resolveFeeConfig(feeSettings, event);
    const { due } = computeCashPlatformFeeDue({
      registrations: regs || [],
      event,
      rounds: rounds || [],
      ...feeCfg,
    });
    const collected = (payments || [])
      .filter((p: any) => String(p.status || '').toLowerCase() === 'paid')
      .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const outstanding = Math.max(0, Math.round((due - collected) * 100) / 100);
    const outstandingCents = Math.round(outstanding * 100);

    if (outstandingCents <= 0) {
      return NextResponse.json({ collected: 0, outstanding: 0 });
    }

    const stripe = getStripe(isDemo);
    const balance = await stripe.balance.retrieve({}, { stripeAccount: accountId });
    const availableCents = (balance.available || [])
      .filter((b) => b.currency === 'usd')
      .reduce((s, b) => s + Number(b.amount || 0), 0);

    if (availableCents < outstandingCents) {
      return NextResponse.json(
        {
          error: 'insufficient_balance',
          available: availableCents / 100,
        },
        { status: 409 }
      );
    }

    let stripeTransferId: string;
    try {
      const charge = await stripe.charges.create({
        amount: outstandingCents,
        currency: 'usd',
        source: accountId,
        metadata: {
          event_id: String(eventId),
          type: 'cash_platform_fee',
        },
      });
      stripeTransferId = charge.id;
    } catch (debitErr: any) {
      const transfer = await stripe.transfers.create(
        {
          amount: outstandingCents,
          currency: 'usd',
          metadata: {
            event_id: String(eventId),
            type: 'cash_platform_fee',
          },
        },
        { stripeAccount: accountId }
      );
      stripeTransferId = transfer.id;
      if (!transfer?.id) throw debitErr;
    }

    const { error: insErr } = await admin.from('platform_fee_payments').insert({
      event_id: eventId,
      amount: outstanding,
      currency: 'usd',
      source: 'connect_debit',
      stripe_transfer_id: stripeTransferId,
      status: 'paid',
    });
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({
      collected: outstanding,
      stripe_transfer_id: stripeTransferId,
      outstanding: 0,
    });
  } catch (err: any) {
    const code = String(err?.code || err?.raw?.code || '');
    const msg = String(err?.message || '');
    if (
      code === 'balance_insufficient' ||
      /insufficient.*balance/i.test(msg)
    ) {
      return NextResponse.json(
        { error: 'insufficient_balance', available: 0 },
        { status: 409 }
      );
    }
    console.error('collect-cash-fees error:', err);
    return NextResponse.json(
      { error: err.message || 'Collect cash fees failed' },
      { status: 500 }
    );
  }
}
