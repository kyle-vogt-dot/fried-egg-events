import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const isListable = (r: any) => {
  if (r.refunded === true) return false;
  if (r.paid === true) return true;
  const m = String(r.payment_method || '').toLowerCase();
  return [
    'comp',
    'complimentary',
    'cash',
    'manual',
    'checkin',
    'payment_link',
  ].includes(m);
};

export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const { event_id, team_name, registration_id, round_id } = await req.json();
    if (!event_id || !team_name || !registration_id) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const sb = admin();
    const { data: regs } = await sb
      .from('event_registrations')
      .select('*')
      .eq('event_id', event_id)
      .eq('team_name', team_name);

    const onRound = (r: any) => {
      if (round_id == null || Number(round_id) === 0) return true;
      const ids: number[] = Array.isArray(r.selected_round_ids)
        ? r.selected_round_ids.map(Number)
        : [];
      if (r.round_id) ids.push(Number(r.round_id));
      if (ids.length === 0) return true;
      return ids.includes(Number(round_id));
    };

    const teamRegs = (regs || []).filter(isListable).filter(onRound);
    const teamAll = (regs || []).filter(isListable);
    const pool = teamRegs.length > 0 ? teamRegs : teamAll;

    const callerRows = pool.filter(
      (r) =>
        r.user_id === user.id ||
        String(r.player_email || '').toLowerCase() ===
          String(user.email || '').toLowerCase()
    );

    if (!callerRows.length) {
      return NextResponse.json(
        { error: 'You are not on this team' },
        { status: 403 }
      );
    }

    const target =
      callerRows.find((r) => Number(r.id) === Number(registration_id)) ||
      callerRows[0];

    await sb
      .from('event_registrations')
      .update({ is_captain: false })
      .in(
        'id',
        pool.map((r) => r.id)
      );

    await sb
      .from('event_registrations')
      .update({ is_captain: true })
      .eq('id', target.id);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || 'Failed' },
      { status: 500 }
    );
  }
}