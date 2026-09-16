import { NextRequest, NextResponse } from 'next/server';
import {
  getStripe,
  loadTournamentServiceRole,
  parseEventId,
  requireEventConnectAccess,
  retrieveAccountInCurrentMode,
  saveConnectAccount,
  storedConnectAccountId,
} from '../lib';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const eventId = parseEventId(request.nextUrl.searchParams.get('event_id'));
    if (eventId == null) {
      return NextResponse.json({ error: 'event_id is required' }, { status: 400 });
    }

    const access = await requireEventConnectAccess(eventId);
    if ('error' in access) return access.error;

    const loaded = await loadTournamentServiceRole(eventId);
    if (loaded.error) {
      return NextResponse.json(
        { error: loaded.error.message },
        { status: 500 }
      );
    }
    if (!loaded.event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const { admin, event } = loaded;
    const isDemo = !!event.is_demo;
    const stripe = getStripe(isDemo);
    const accountId = storedConnectAccountId(event, isDemo);

    if (!accountId) {
      const { error: saveErr } = await saveConnectAccount(
        admin,
        eventId,
        isDemo,
        null,
        false
      );
      if (saveErr) {
        return NextResponse.json({ error: saveErr.message }, { status: 500 });
      }
      return NextResponse.json({
        ready: false,
        account_id: null,
      });
    }

    const retrieved = await retrieveAccountInCurrentMode(stripe, accountId);
    if ('mismatch' in retrieved) {
      const { error: saveErr } = await saveConnectAccount(
        admin,
        eventId,
        isDemo,
        null,
        false
      );
      if (saveErr) {
        return NextResponse.json({ error: saveErr.message }, { status: 500 });
      }
      return NextResponse.json({
        ready: false,
        account_id: null,
      });
    }

    const ready = !!(
      retrieved.account.charges_enabled && retrieved.account.payouts_enabled
    );
    const { error: saveErr } = await saveConnectAccount(
      admin,
      eventId,
      isDemo,
      accountId,
      ready
    );
    if (saveErr) {
      return NextResponse.json({ error: saveErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ready,
      account_id: accountId,
    });
  } catch (err: any) {
    console.error('Stripe connect status error:', err);
    return NextResponse.json(
      { error: err.message || 'Stripe Connect status failed' },
      { status: 500 }
    );
  }
}
