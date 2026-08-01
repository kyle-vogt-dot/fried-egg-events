import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(request: NextRequest) {
  const regId = request.nextUrl.searchParams.get('registration_id');
  const eventId = request.nextUrl.searchParams.get('event_id');

  console.log('confirm-addon-payment hit', { regId, eventId });

  if (!regId || regId === 'NaN' || regId === 'undefined') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // 1) Mark paid
  const { data: updatedRows, error: updateError } = await supabase
    .from('event_registrations')
    .update({ paid_addons: true })
    .eq('id', regId)
    .select('id, player_name, player_email, addon_quantities, event_id, paid_addons');

  if (updateError) {
    console.error('confirm-addon-payment update error:', updateError);
  }

  const reg = updatedRows?.[0];

  // 2) Build receipt + email
  if (reg?.player_email) {
    try {
      const eventIdForQuery = eventId || String(reg.event_id);

      const { data: eventData } = await supabase
        .from('tournaments')
        .select('name')
        .eq('id', parseInt(eventIdForQuery, 10))
        .single();

      const { data: addonCatalog } = await supabase
        .from('event_addons')
        .select('*')
        .eq('event_id', parseInt(eventIdForQuery, 10));

      const quantities = reg.addon_quantities || {};
      const lines: { name: string; qty: number; unit: number; lineTotal: number }[] = [];

      (addonCatalog || []).forEach((addon: any) => {
        // keys may be string or number in JSON
        const qty = Number(quantities[addon.id] ?? quantities[String(addon.id)] ?? 0);
        if (qty > 0) {
          const unit = Number(addon.price_per_unit || 0);
          lines.push({
            name: addon.name,
            qty,
            unit,
            lineTotal: qty * unit,
          });
        }
      });

      const total = lines.reduce((sum, l) => sum + l.lineTotal, 0);
      const eventName = eventData?.name || 'your event';

      const rowsHtml =
        lines.length > 0
          ? lines
              .map(
                (l) => `
            <tr>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;">${l.name}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${l.qty}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">$${l.unit.toFixed(2)}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">$${l.lineTotal.toFixed(2)}</td>
            </tr>`
              )
              .join('')
          : `<tr><td colspan="4" style="padding:12px;">Add-ons paid</td></tr>`;

      await resend.emails.send({
        from: 'Fried Egg Events <noreply@friedeggevents.app>', // your verified domain
        to: [reg.player_email],
        subject: `Add-on payment confirmed – ${eventName}`,
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111;">
            <h2 style="margin-bottom:8px;">Payment confirmed</h2>
            <p>Hi ${reg.player_name || 'there'},</p>
            <p>Thanks for your payment. Here are the add-ons for <strong>${eventName}</strong>:</p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;">
              <thead>
                <tr style="background:#f3f4f6;text-align:left;">
                  <th style="padding:8px 12px;">Item</th>
                  <th style="padding:8px 12px;text-align:center;">Qty</th>
                  <th style="padding:8px 12px;text-align:right;">Each</th>
                  <th style="padding:8px 12px;text-align:right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
            <p style="font-size:18px;"><strong>Total paid: $${total.toFixed(2)}</strong></p>
            <p style="color:#666;font-size:13px;">You're all set — see you at the event.</p>
            <p>— Fried Egg Events</p>
          </div>
        `,
      });

      console.log('Addon receipt emailed to', reg.player_email);
    } catch (emailErr) {
      console.error('Receipt email failed:', emailErr);
      // still redirect — payment already recorded
    }
  }

  const redirectTo = eventId
    ? `/event/${eventId}?payment=success&type=addon&registration_id=${regId}`
    : '/';

  return NextResponse.redirect(new URL(redirectTo, request.url));
}