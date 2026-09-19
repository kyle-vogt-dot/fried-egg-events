import { NextRequest, NextResponse } from 'next/server';
import {
  appOrigin,
  createExpressAccount,
  getStripe,
  prefillConnectBusinessProfile,
  isModeMismatchError,
  loadTournamentServiceRole,
  parseEventId,
  requireEventConnectAccess,
  retrieveAccountInCurrentMode,
  saveConnectAccount,
  storedConnectAccountId,
} from '../lib';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const eventId = parseEventId(body?.event_id);
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
    let accountId = storedConnectAccountId(event, isDemo);

    if (accountId) {
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
          return NextResponse.json(
            { error: clearErr.message },
            { status: 500 }
          );
        }
        accountId = '';
      }
    }

    if (!accountId) {
      const account = await createExpressAccount(stripe, eventId);
      accountId = account.id;
      const { error: saveErr } = await saveConnectAccount(
        admin,
        eventId,
        isDemo,
        accountId,
        false
      );
      if (saveErr) {
        return NextResponse.json({ error: saveErr.message }, { status: 500 });
      }
    }

    await prefillConnectBusinessProfile(stripe, accountId, eventId);

    const origin = appOrigin(request);
    const linkParams = {
      account: accountId,
      refresh_url: `${origin}/event/${eventId}/manage?connect=refresh`,
      return_url: `${origin}/event/${eventId}/manage?connect=return`,
      type: 'account_onboarding' as const,
    };

    try {
      const accountLink = await stripe.accountLinks.create(linkParams);
      return NextResponse.json({ url: accountLink.url });
    } catch (err: any) {
      if (!isModeMismatchError(err)) throw err;

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

      const account = await createExpressAccount(stripe, eventId);
      accountId = account.id;
      const { error: saveErr } = await saveConnectAccount(
        admin,
        eventId,
        isDemo,
        accountId,
        false
      );
      if (saveErr) {
        return NextResponse.json({ error: saveErr.message }, { status: 500 });
      }

      const accountLink = await stripe.accountLinks.create({
        ...linkParams,
        account: accountId,
      });
      return NextResponse.json({ url: accountLink.url });
    }
  } catch (err: any) {
    console.error('Stripe connect account-link error:', err);
    return NextResponse.json(
      { error: err.message || 'Stripe Connect failed' },
      { status: 500 }
    );
  }
}
