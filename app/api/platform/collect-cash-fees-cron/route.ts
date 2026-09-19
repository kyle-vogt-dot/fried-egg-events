/**
 * Weekly cash platform fee collect.
 * Env: CRON_SECRET=
 * Auth: Authorization: Bearer ${CRON_SECRET}  or  ?secret=
 */
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import {
  collectCashFeesForEvent,
  listOutstandingCashFeeEvents,
} from '../collect-cash-fees/collect';

export const runtime = 'nodejs';

const REPORT_TO = 'kyle-vogt@hotmail.com';

function authorizeCron(request: NextRequest) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return false;
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const query = (request.nextUrl.searchParams.get('secret') || '').trim();
  return bearer === secret || query === secret;
}

async function runCron() {
  const rows = await listOutstandingCashFeeEvents();
  const targets = rows.filter((row) => row.outstanding > 0);

  const results = [];
  for (const row of targets) {
    const accountId = String(
      row.event.is_demo
        ? row.event.stripe_connect_account_id_test ||
            row.event.stripe_connect_account_id
        : row.event.stripe_connect_account_id || ''
    ).trim();
    if (!accountId) {
      results.push({
        eventId: Number(row.event.id),
        name: String(row.event.name || `Event ${row.event.id}`),
        amount: row.outstanding,
        ok: false,
        error: 'no Connect',
      });
      continue;
    }
    results.push(await collectCashFeesForEvent(row.event));
  }

  const ok = results.filter((r) => r.ok && (r.collected || 0) > 0);
  const failed = results.filter((r) => !r.ok);
  const skippedZero = results.filter((r) => r.ok && !(r.collected || 0));

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey && (failed.length > 0 || ok.length > 0)) {
    const resend = new Resend(resendKey);
    const from = 'Fried Egg Events <noreply@friedeggevents.app>';

    if (failed.length > 0) {
      const lines = failed
        .map(
          (r) =>
            `${r.name} · $${Number(r.amount || 0).toFixed(2)} · ${r.error || 'failed'}`
        )
        .join('\n');
      await resend.emails.send({
        from,
        to: [REPORT_TO],
        subject: `Cash fee collect · ${ok.length} ok · ${failed.length} failed`,
        text: `Cash platform fee collect\n\n${lines}\n`,
      });
    }

    if (ok.length > 0) {
      const lines = ok
        .map(
          (r) =>
            `${r.name} · $${Number(r.collected || r.amount || 0).toFixed(2)}`
        )
        .join('\n');
      await resend.emails.send({
        from,
        to: [REPORT_TO],
        subject: `Cash fee collect · ${ok.length} ok · ${failed.length} failed`,
        text: `Collected cash platform fees:\n\n${lines}\n`,
      });
    }
  }

  return {
    ran: targets.length,
    ok: ok.length,
    failed: failed.length,
    skipped: skippedZero.length,
  };
}

export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const summary = await runCron();
    return NextResponse.json(summary);
  } catch (err: any) {
    console.error('collect-cash-fees-cron error:', err);
    return NextResponse.json(
      { error: err.message || 'Cron collect failed' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
