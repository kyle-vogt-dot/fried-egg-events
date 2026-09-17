import { NextRequest, NextResponse } from 'next/server';
import {
  getStripe,
  loadTournamentServiceRole,
  parseEventId,
  requireEventConnectAccess,
  retrieveAccountInCurrentMode,
  saveConnectAccount,
  saveConnectReady,
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
      const saved = await saveConnectReady(admin, eventId, isDemo, false);
      if (saved.error) {
        return NextResponse.json(
          { error: saved.error.message },
          { status: 500 }
        );
      }
      return NextResponse.json({
        ready: false,
        account_id: null,
      });
    }

    const retrieved = await retrieveAccountInCurrentMode(stripe, accountId);
    if ('mismatch' in retrieved) {
      const { error: clearErr } = await saveConnectAccount(
        admin,
        eventId,
        isDemo,
        null,
        false
      );
      if (clearErr) {
        return NextResponse.json({ error: clearErr.message }, { status: 500 });
      }
      const saved = await saveConnectReady(admin, eventId, isDemo, false);
      if (saved.error) {
        return NextResponse.json(
          { error: saved.error.message },
          { status: 500 }
        );
      }
      return NextResponse.json({
        ready: false,
        account_id: null,
      });
    }

    const ready = !!(
      retrieved.account.charges_enabled && retrieved.account.payouts_enabled
    );
    const saved = await saveConnectReady(admin, eventId, isDemo, ready);
    if (saved.error) {
      return NextResponse.json({ error: saved.error.message }, { status: 500 });
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
