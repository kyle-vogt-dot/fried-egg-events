import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ALLOWED = ['kyle-vogt@hotmail.com'];

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requirePlatformAdmin(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
  if (!token) return { error: 'Not signed in', user: null as any, sb: null as any };

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user?.email || !ALLOWED.includes(user.email)) {
    return { error: 'Forbidden', user, sb: null as any };
  }

  return { error: null, user, sb: admin() };
}

export async function GET(req: NextRequest) {
  const gate = await requirePlatformAdmin(req);
  if (gate.error || !gate.sb) {
    return NextResponse.json({ error: gate.error }, { status: 401 });
  }
  const { data } = await gate.sb
    .from('platform_settings')
    .select('demo_event_password')
    .eq('id', 1)
    .maybeSingle();
  return NextResponse.json({
    has_password: !!(
      data?.demo_event_password || process.env.DEMO_EVENT_PASSWORD
    ),
  });
}

export async function POST(req: NextRequest) {
  const gate = await requirePlatformAdmin(req);
  if (gate.error || !gate.sb) {
    return NextResponse.json({ error: gate.error }, { status: 401 });
  }

  const { password } = await req.json();
  const value = String(password || '').trim();
  if (value.length < 6) {
    return NextResponse.json(
      { error: 'Password must be at least 6 characters' },
      { status: 400 }
    );
  }

  const { data: existing } = await gate.sb
    .from('platform_settings')
    .select('id')
    .eq('id', 1)
    .maybeSingle();

  if (existing) {
    const { error } = await gate.sb
      .from('platform_settings')
      .update({
        demo_event_password: value,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await gate.sb.from('platform_settings').insert({
      id: 1,
      demo_event_password: value,
      platform_fee: 3,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}