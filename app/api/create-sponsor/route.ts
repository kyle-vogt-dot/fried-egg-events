import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      event_id,
      package_id,
      company_name,
      contact_name,
      contact_email,
      website_url,
      amount_paid,
    } = body;

    if (!event_id || !package_id || !company_name || !contact_email) {
      return NextResponse.json(
        { error: 'event_id, package_id, company_name, and contact_email are required' },
        { status: 400 }
      );
    }

    const { data: pkg, error: pkgErr } = await supabaseAdmin
      .from('event_sponsor_packages')
      .select('id, price, max_quantity, times_sold, active, event_id')
      .eq('id', package_id)
      .single();

    if (pkgErr || !pkg || !pkg.active) {
      return NextResponse.json({ error: 'Package not found or inactive' }, { status: 404 });
    }

    if (Number(pkg.event_id) !== Number(event_id)) {
      return NextResponse.json({ error: 'Package does not match event' }, { status: 400 });
    }

    if (
      pkg.max_quantity != null &&
      Number(pkg.times_sold) >= Number(pkg.max_quantity)
    ) {
      return NextResponse.json({ error: 'Package is sold out' }, { status: 400 });
    }

    const { data: row, error } = await supabaseAdmin
      .from('event_sponsors')
      .insert({
        event_id: Number(event_id),
        package_id: Number(package_id),
        company_name: String(company_name).trim(),
        contact_name: contact_name ? String(contact_name).trim() : null,
        contact_email: String(contact_email).trim().toLowerCase(),
        website_url: website_url ? String(website_url).trim() : null,
        amount_paid: amount_paid != null ? Number(amount_paid) : Number(pkg.price),
        paid: false,
        payment_method: null,
      })
      .select('id')
      .single();

    if (error || !row) {
      console.error(error);
      return NextResponse.json(
        { error: error?.message || 'Could not create sponsor' },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: row.id });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || 'Server error' },
      { status: 500 }
    );
  }
}