import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const {
      discount_code_id,
      event_id,
      registration_id,
      user_id,
      player_email,
      amount_saved,
    } = await request.json();

    if (!discount_code_id || !event_id) {
      return NextResponse.json(
        { success: false, error: 'discount_code_id and event_id are required' },
        { status: 400 }
      );
    }

    // 1. Re-validate the code
    const { data: code, error: codeError } = await supabase
      .from('discount_codes')
      .select('*')
      .eq('id', discount_code_id)
      .eq('active', true)
      .single();

    if (codeError || !code) {
      return NextResponse.json(
        { success: false, error: 'Code not found or inactive' },
        { status: 400 }
      );
    }

    if (code.expires_at && new Date(code.expires_at) < new Date()) {
      return NextResponse.json(
        { success: false, error: 'Code expired' },
        { status: 400 }
      );
    }

    if (code.max_uses != null && Number(code.times_used) >= Number(code.max_uses)) {
      return NextResponse.json(
        { success: false, error: 'Code has reached its usage limit' },
        { status: 400 }
      );
    }

    // 2. Insert redemption
    const { error: redeemError } = await supabase
      .from('discount_redemptions')
      .insert({
        discount_code_id,
        event_id: Number(event_id),
        registration_id: registration_id || null,
        user_id: user_id || null,
        player_email: player_email || null,
        amount_saved: Number(amount_saved || 0),
      });

    if (redeemError) {
      console.error('Redeem insert error:', redeemError);
      return NextResponse.json(
        { success: false, error: 'Failed to record redemption' },
        { status: 500 }
      );
    }

    // 3. Increment times_used
    const { error: updateError } = await supabase
      .from('discount_codes')
      .update({ times_used: Number(code.times_used || 0) + 1 })
      .eq('id', discount_code_id);

    if (updateError) {
      console.error('times_used update error:', updateError);
      // Non-fatal — redemption already recorded
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { success: false, error: err.message || 'Server error' },
      { status: 500 }
    );
  }
}