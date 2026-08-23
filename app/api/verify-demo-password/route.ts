import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();
    const expected = process.env.DEMO_EVENT_PASSWORD || '';
    if (!expected || !password || String(password) !== expected) {
      return NextResponse.json({ ok: false, error: 'Invalid passcode' }, { status: 401 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
}