import { parseLineupIds } from '@/app/libs/league-match';

export function autoCheckinEnabled(event: any) {
  return event?.auto_checkin_lineup !== false;
}

export async function applyAutoCheckinForRound(
  supabase: { from: (t: string) => any },
  event: any,
  roundId: number
) {
  if (!autoCheckinEnabled(event)) return { applied: false };
  const eventId = Number(event?.id);
  const need = Math.max(1, Number(event?.players_per_match) || 2);
  if (!eventId || !roundId) return { applied: false };

  const { data: matches } = await supabase
    .from('league_matches')
    .select('home_team, away_team')
    .eq('event_id', eventId)
    .eq('round_id', roundId);

  const required = new Set<string>();
  for (const m of matches || []) {
    if (m.home_team) required.add(String(m.home_team));
    if (m.away_team) required.add(String(m.away_team));
  }
  if (required.size === 0) return { applied: false };

  const { data: lineupRows } = await supabase
    .from('league_lineups')
    .select('team_name, registration_ids')
    .eq('event_id', eventId)
    .eq('round_id', roundId);

  const byTeam: Record<string, string[]> = {};
  for (const row of lineupRows || []) {
    byTeam[row.team_name] = parseLineupIds(row.registration_ids);
  }
  for (const team of required) {
    if ((byTeam[team] || []).length < need) return { applied: false };
  }

  const lineupIds = new Set<string>();
  for (const team of required) {
    for (const id of byTeam[team]) lineupIds.add(String(id));
  }

  const { data: regs } = await supabase
    .from('event_registrations')
    .select('id, round_checkins')
    .eq('event_id', eventId);

  const key = String(roundId);
  for (const r of regs || []) {
    const map = { ...(r.round_checkins || {}) };
    const inLineup = lineupIds.has(String(r.id));
    map[key] = inLineup;
    await supabase
      .from('event_registrations')
      .update({ round_checkins: map })
      .eq('id', r.id);
  }
  return { applied: true };
}
