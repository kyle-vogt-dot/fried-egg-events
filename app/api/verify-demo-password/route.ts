import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();
    const attempt = String(password || '');

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data } = await sb
      .from('platform_settings')
      .select('demo_event_password')
      .eq('id', 1)
      .maybeSingle();

    const fromDb = (data?.demo_event_password || '').trim();
    const fromEnv = (process.env.DEMO_EVENT_PASSWORD || '').trim();
    const expected = fromDb || fromEnv;

    if (!expected || attempt !== expected) {
      return NextResponse.json(
        { ok: false, error: 'Invalid passcode' },
        { status: 401 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
}