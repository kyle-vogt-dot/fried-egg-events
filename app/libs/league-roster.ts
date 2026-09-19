import { isListable } from '@/app/libs/event-emails';

export function isNamedTeam(teamName: any) {
  const name = String(teamName || '').trim();
  return !!name && name.toLowerCase() !== 'individual';
}

export function sameRosterPlayer(
  r: any,
  user: { id?: string | null; email?: string | null } | null
) {
  if (!r || !user) return false;
  if (user.id && r.user_id && String(r.user_id) === String(user.id)) {
    return true;
  }
  const email = String(user.email || '').toLowerCase();
  if (!email) return false;
  return String(r.player_email || '').toLowerCase() === email;
}

export function teamMembers(regs: any[], teamName: string) {
  return (regs || []).filter(
    (r) => isListable(r) && String(r.team_name || '') === String(teamName)
  );
}

/** Flagged captain, else first listable member. */
export function captainOfTeam(members: any[]) {
  const list = (members || []).filter(isListable);
  return list.find((r) => r.is_captain) || list[0] || null;
}

export function isCaptainOfTeam(
  members: any[],
  user: { id?: string | null; email?: string | null } | null
) {
  const cap = captainOfTeam(members);
  return !!(cap && sameRosterPlayer(cap, user));
}

export function canEditTeamRoster({
  members,
  user,
  isEventAdmin,
}: {
  members: any[];
  user: { id?: string | null; email?: string | null } | null;
  isEventAdmin: boolean;
}) {
  if (isEventAdmin) return true;
  return isCaptainOfTeam(members, user);
}

type Sb = { from: (t: string) => any };

/** First listable (or first row) on a team with no captain becomes captain. */
export async function assignCaptainIfNeeded(
  supabase: Sb,
  eventId: number,
  teamName: string | null | undefined,
  preferId?: string | number | null
) {
  if (!eventId || !isNamedTeam(teamName)) return { assigned: false };
  const { data: regs } = await supabase
    .from('event_registrations')
    .select('id, is_captain, paid, payment_method, refunded, created_at')
    .eq('event_id', eventId)
    .eq('team_name', String(teamName).trim())
    .order('created_at', { ascending: true });

  const rows = regs || [];
  if (rows.some((r: any) => r.is_captain)) return { assigned: false };

  const listable = rows.filter(isListable);
  const pool = listable.length ? listable : rows;
  if (!pool.length) return { assigned: false };

  const pick =
    listable.length === 0 && preferId != null
      ? pool.find((r: any) => String(r.id) === String(preferId)) || pool[0]
      : pool[0];

  const { error } = await supabase
    .from('event_registrations')
    .update({ is_captain: true })
    .eq('id', pick.id);
  if (error) return { assigned: false, error: error.message };
  return { assigned: true, id: pick.id };
}

export async function ensureCaptainsForRegistrationIds(
  supabase: Sb,
  ids: Array<string | number>
) {
  const unique = Array.from(new Set(ids.map(String).filter(Boolean)));
  if (!unique.length) return;
  const { data } = await supabase
    .from('event_registrations')
    .select('id, event_id, team_name')
    .in('id', unique);
  const seen = new Set<string>();
  for (const r of data || []) {
    const key = `${r.event_id}::${r.team_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await assignCaptainIfNeeded(
      supabase,
      Number(r.event_id),
      r.team_name,
      r.id
    );
  }
}

export async function backfillEventCaptains(supabase: Sb, eventId: number) {
  if (!eventId) return { updated: 0 };
  const { data: regs } = await supabase
    .from('event_registrations')
    .select(
      'id, team_name, is_captain, paid, payment_method, refunded, created_at'
    )
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });

  const byTeam = new Map<string, any[]>();
  for (const r of regs || []) {
    if (!isNamedTeam(r.team_name)) continue;
    const name = String(r.team_name).trim();
    if (!byTeam.has(name)) byTeam.set(name, []);
    byTeam.get(name)!.push(r);
  }

  let updated = 0;
  for (const [name, members] of byTeam) {
    if (members.some((m) => m.is_captain)) continue;
    const result = await assignCaptainIfNeeded(supabase, eventId, name);
    if (result.assigned) updated += 1;
  }
  return { updated };
}
