export type AdminPerms = {
  manage: boolean;
  checkin: boolean;
  scoring: boolean;
  leaderboard: boolean;
  scorecards: boolean;
  income: boolean;
};

export const ALL_PERMS: AdminPerms = {
  manage: true,
  checkin: true,
  scoring: true,
  leaderboard: true,
  scorecards: true,
  income: true,
};

export async function loadEventAccess(
  supabase: any,
  eventId: number,
  user: { id: string; email?: string | null }
) {
  const email = (user.email || '').toLowerCase();

  await supabase
    .from('event_admins')
    .update({ user_id: user.id })
    .eq('email', email)
    .is('user_id', null);

  const { data: event } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', eventId)
    .single();

  if (!event) {
    return {
      event: null,
      allowed: false,
      isCreator: false,
      isPlatform: false,
      perms: ALL_PERMS,
    };
  }

  const isCreator = event.created_by === user.id;
  const isPlatform = ['kyle-vogt@hotmail.com'].includes(user.email || '');

  const { data: adminRow } = await supabase
    .from('event_admins')
    .select('id, permissions')
    .eq('event_id', eventId)
    .or(`user_id.eq.${user.id},email.eq."${email}"`)
    .maybeSingle();

  const allowed = isCreator || isPlatform || !!adminRow;
  const perms: AdminPerms =
    isCreator || isPlatform
      ? ALL_PERMS
      : { ...ALL_PERMS, ...(adminRow?.permissions || {}) };

  return { event, allowed, isCreator, isPlatform, perms };
}

export function canUse(perms: AdminPerms, page: keyof AdminPerms) {
  return perms[page] === true;
}