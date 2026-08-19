export const isListableReg = (r: any) => {
  if (r.refunded === true) return false;
  if (r.paid === true) return true;
  const m = String(r.payment_method || '').toLowerCase();
  return ['comp', 'complimentary', 'cash', 'manual', 'checkin', 'payment_link'].includes(m);
};

export const normalizeEmail = (e: string) => String(e || '').trim().toLowerCase();

export function roundIdsOf(r: any): number[] {
  const ids: number[] = Array.isArray(r.selected_round_ids)
    ? r.selected_round_ids.map(Number)
    : [];
  if (r.round_id) ids.push(Number(r.round_id));
  return Array.from(new Set(ids));
}

export type EmailAudience = 'everyone' | 'captains' | 'captains_open';

export const TEMPLATES: Record<
  string,
  { label: string; audience: EmailAudience; subject: string; body: string }
> = {
  fill_team: {
    label: 'Fill your team',
    audience: 'captains_open',
    subject: '{{event_name}} — please fill {{team_name}}',
    body: `Hi {{first_name}},

You're the contact for {{team_name}} at {{event_name}} on {{date}} ({{course}}).

Open spots: {{spots_left}}

Please forward this email to your teammates so they can register themselves. Each player needs their own signup.

Thanks,
{{organizer_name}}`,
  },
  pairings: {
    label: 'Pairings & what to expect',
    audience: 'everyone',
    subject: '{{event_name}} — pairings and what to expect',
    body: `Hi {{first_name}},

You're registered for {{event_name}} on {{date}} at {{course}}.

Team: {{team_name}}
{{round_line}}
{{tee_line}}

What to expect:
- Arrive a bit early for check-in
- Bring a photo ID if the course asks
- Live scoring: {{live_link}}
- Leaderboard: {{leaderboard_link}}

See you there,
{{organizer_name}}`,
  },
  custom: {
    label: 'Custom',
    audience: 'everyone',
    subject: '{{event_name}}',
    body: `Hi {{first_name}},

`,
  },
};

export function firstName(full: string) {
  const n = String(full || '').trim();
  return n.split(/\s+/)[0] || 'there';
}

export function applyVars(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k) => vars[k] ?? '');
}

export function buildCaptainMap(
  regs: any[],
  rounds: any[],
  maxTeamSize: number
) {
  const listable = regs.filter((r) => isListableReg(r) && r.team_name);
  const byKey = new Map<string, any[]>();

  for (const r of listable) {
    const rids = roundIdsOf(r);
    const keys = rids.length ? rids : [0];
    for (const rid of keys) {
      const key = `${r.team_name}::${rid}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(r);
    }
  }

  for (const arr of byKey.values()) {
    arr.sort((a, b) => Number(a.id) - Number(b.id));
  }

  const captains = new Map<
    string,
    {
      email: string;
      name: string;
      teams: { team: string; roundName: string; spotsLeft: number; joinLink: string }[];
    }
  >();

  for (const [key, members] of byKey) {
    const captain = members[0];
    const email = normalizeEmail(captain.player_email);
    if (!email) continue;
    const [team, ridStr] = key.split('::');
    const rid = Number(ridStr);
    const round = rounds.find((x) => Number(x.id) === rid);
    const spotsLeft = Math.max(0, maxTeamSize - members.length);
    const entry = {
      team,
      roundName: round?.name || (rid ? `Round ${rid}` : ''),
      spotsLeft,
      joinLink: '',
    };
    if (!captains.has(email)) {
      captains.set(email, {
        email,
        name: captain.player_name || 'Captain',
        teams: [entry],
      });
    } else {
      captains.get(email)!.teams.push(entry);
    }
  }

  return captains;
}