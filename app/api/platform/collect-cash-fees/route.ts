import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { loadEventAccess } from '@/app/libs/event-admin';
import { parseEventId, supabaseAdmin } from '@/app/api/stripe/connect/lib';
import {
  collectCashFeesForEvent,
  listOutstandingCashFeeEvents,
} from './collect';

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

export async function GET() {
  try {
    const auth = await requirePlatformUser();
    if ('error' in auth) return auth.error;

    const rows = await listOutstandingCashFeeEvents();
    const fees = rows.map((row) => ({
      event_id: row.event.id,
      due: row.due,
      collected: row.collected,
      outstanding: row.outstanding,
    }));
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

    const result = await collectCashFeesForEvent(access.event);
    if (result.ok) {
      return NextResponse.json({
        collected: result.collected || 0,
        outstanding: result.collected ? 0 : 0,
      });
    }
    if (result.error === 'no Connect') {
      return NextResponse.json(
        { error: 'Connect payouts are not set up for this event' },
        { status: 400 }
      );
    }
    if (/insufficient_balance/i.test(String(result.error || ''))) {
      return NextResponse.json(
        { error: 'insufficient_balance', available: 0 },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: result.error || 'Collect cash fees failed' },
      { status: 500 }
    );
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
