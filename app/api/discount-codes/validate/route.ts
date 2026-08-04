import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { code, eventId, baseAmount } = await request.json();

    if (!code || !eventId) {
      return NextResponse.json({ valid: false, error: 'Code and event required' }, { status: 400 });
    }

    const normalized = String(code).trim().toUpperCase();

    const { data: rows, error } = await supabase
      .from('discount_codes')
      .select('*')
      .ilike('code', normalized)
      .eq('active', true)
      .limit(5);

    if (error) {
      console.error(error);
      return NextResponse.json({ valid: false, error: 'Lookup failed' }, { status: 500 });
    }

    // Prefer event-specific code, else global (event_id null)
    const match =
      (rows || []).find((r) => r.event_id === Number(eventId)) ||
      (rows || []).find((r) => r.event_id == null);

    if (!match) {
      return NextResponse.json({ valid: false, error: 'Invalid code' });
    }

    if (match.expires_at && new Date(match.expires_at) < new Date()) {
      return NextResponse.json({ valid: false, error: 'Code expired' });
    }

    if (match.max_uses != null && Number(match.times_used) >= Number(match.max_uses)) {
      return NextResponse.json({ valid: false, error: 'Code has reached its usage limit' });
    }

    const base = Number(baseAmount || 0);
    let amountSaved = 0;

    if (match.discount_type === 'percent') {
      amountSaved = (base * Number(match.amount)) / 100;
    } else {
      amountSaved = Number(match.amount);
    }

    // Never discount below $0
    amountSaved = Math.min(Math.max(amountSaved, 0), base);

    return NextResponse.json({
      valid: true,
      code: match.code,
      discount_code_id: match.id,
      discount_type: match.discount_type,
      amount: Number(match.amount),
      amount_saved: Number(amountSaved.toFixed(2)),
      label: match.label,
      scope: match.event_id == null ? 'global' : 'event',
      // UI rule: one player only
      one_player_only: true,
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ valid: false, error: err.message || 'Server error' }, { status: 500 });
  }
}