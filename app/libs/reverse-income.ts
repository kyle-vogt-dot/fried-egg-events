const INCOME_REVERSE_CATEGORIES = new Set([
  'registration',
  'greens',
  'entry',
  'addon',
  'add-on',
  'addons',
]);

function isReverseCategory(category: unknown) {
  return INCOME_REVERSE_CATEGORIES.has(String(category || '').toLowerCase());
}

function amountsClose(a: unknown, b: unknown) {
  return Math.abs(Number(a) - Number(b)) < 0.02;
}

export async function reverseRegistrationIncome(
  supabase: { from: (table: string) => any },
  opts: {
    eventId: number;
    registrationId: string | number;
    playerName?: string | null;
    playerEmail?: string | null;
    amount?: number | null;
  }
) {
  const eventId = Number(opts.eventId);
  const registrationId = opts.registrationId;
  const name = String(opts.playerName || '').trim();
  const email = String(opts.playerEmail || '').trim().toLowerCase();
  const amount =
    opts.amount != null && Number.isFinite(Number(opts.amount))
      ? Number(opts.amount)
      : null;

  const { data: entries, error } = await supabase
    .from('event_income_entries')
    .select('*')
    .eq('event_id', eventId);

  if (error) {
    console.error('Income reverse load failed:', error);
    return { error, reversed: 0 };
  }

  const positives = (entries || []).filter(
    (row: any) =>
      Number(row.amount) > 0 && isReverseCategory(row.category)
  );

  let targets = positives.filter(
    (row: any) =>
      row.registration_id != null &&
      String(row.registration_id) === String(registrationId)
  );

  if (targets.length === 0) {
    const nameEmailHits = positives.filter((row: any) => {
      const label = String(row.label || '').toLowerCase();
      const rowName = String(row.player_name || '').trim().toLowerCase();
      const rowEmail = String(row.player_email || '').trim().toLowerCase();
      const nameOk =
        !!name &&
        (rowName === name.toLowerCase() ||
          label.includes(name.toLowerCase()));
      const emailOk =
        !!email && (rowEmail === email || label.includes(email));
      return nameOk || emailOk;
    });

    if (amount != null && amount > 0) {
      const amtHits = nameEmailHits.filter((row: any) =>
        amountsClose(row.amount, amount)
      );
      targets = amtHits.length ? amtHits : nameEmailHits;
    } else {
      targets = nameEmailHits;
    }
  }

  if (targets.length === 0) {
    return { reversed: 0 };
  }

  const ids = targets.map((row: any) => row.id);
  const { error: delErr } = await supabase
    .from('event_income_entries')
    .delete()
    .in('id', ids);

  if (!delErr) {
    return { reversed: ids.length };
  }

  console.error('Income reverse delete failed:', delErr);

  const negatives = targets.map((row: any) => ({
    event_id: eventId,
    registration_id: registrationId,
    label: `Refund – ${name || row.label || 'player'}`,
    category: row.category || 'registration',
    amount: -Math.abs(Number(row.amount) || 0),
  }));

  const { error: insErr } = await supabase
    .from('event_income_entries')
    .insert(negatives);

  if (insErr) {
    console.error('Income reverse insert failed:', insErr);
    return { error: insErr, reversed: 0 };
  }

  return { reversed: negatives.length, fallback: 'negative_rows' as const };
}
