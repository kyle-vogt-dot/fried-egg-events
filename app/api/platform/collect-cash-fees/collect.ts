import {
  computeCashPlatformFeeDue,
  resolveFeeConfig,
} from '@/app/libs/cash-platform-fee';
import {
  getStripe,
  storedConnectAccountId,
  supabaseAdmin,
} from '@/app/api/stripe/connect/lib';

export function paidCollected(payments: any[]) {
  return (payments || [])
    .filter((p: any) => String(p.status || '').toLowerCase() === 'paid')
    .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
}

export function outstandingFromDue(due: number, collected: number) {
  return Math.max(0, Math.round((due - collected) * 100) / 100);
}

export type CollectResult = {
  eventId: number;
  name: string;
  amount: number;
  ok: boolean;
  error?: string;
  collected?: number;
};

export async function listOutstandingCashFeeEvents() {
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
  if (!ids.length) return [];

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

  return (events || []).map((event: any) => {
    const feeCfg = resolveFeeConfig(feeSettings, event);
    const { due } = computeCashPlatformFeeDue({
      registrations: regsByEvent.get(Number(event.id)) || [],
      event,
      rounds: roundsByEvent.get(Number(event.id)) || [],
      ...feeCfg,
    });
    const collected = paidCollected(payByEvent.get(Number(event.id)) || []);
    const outstanding = outstandingFromDue(due, collected);
    return {
      event,
      due,
      collected,
      outstanding,
    };
  });
}

export async function collectCashFeesForEvent(
  event: any
): Promise<CollectResult> {
  const admin = supabaseAdmin();
  const eventId = Number(event.id);
  const name = String(event.name || `Event ${eventId}`);
  const isDemo = !!event.is_demo;
  const accountId = storedConnectAccountId(event, isDemo);

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
  const collectedSoFar = paidCollected(payments || []);
  const outstanding = outstandingFromDue(due, collectedSoFar);
  const outstandingCents = Math.round(outstanding * 100);

  if (outstandingCents <= 0) {
    return { eventId, name, amount: 0, ok: true, collected: 0 };
  }

  if (!accountId) {
    return {
      eventId,
      name,
      amount: outstanding,
      ok: false,
      error: 'no Connect',
    };
  }

  try {
    const stripe = getStripe(isDemo);
    const balance = await stripe.balance.retrieve(
      {},
      { stripeAccount: accountId }
    );
    const availableCents = (balance.available || [])
      .filter((b) => b.currency === 'usd')
      .reduce((s, b) => s + Number(b.amount || 0), 0);

    if (availableCents < outstandingCents) {
      return {
        eventId,
        name,
        amount: outstanding,
        ok: false,
        error: `insufficient_balance (available $${(availableCents / 100).toFixed(2)})`,
      };
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
      return {
        eventId,
        name,
        amount: outstanding,
        ok: false,
        error: insErr.message,
      };
    }

    return {
      eventId,
      name,
      amount: outstanding,
      ok: true,
      collected: outstanding,
    };
  } catch (err: any) {
    const code = String(err?.code || err?.raw?.code || '');
    const msg = String(err?.message || 'Collect cash fees failed');
    if (code === 'balance_insufficient' || /insufficient.*balance/i.test(msg)) {
      return {
        eventId,
        name,
        amount: outstanding,
        ok: false,
        error: 'insufficient_balance',
      };
    }
    return { eventId, name, amount: outstanding, ok: false, error: msg };
  }
}
