export type FormatPreset =
  | 'charity_scramble'
  | 'best_ball'
  | 'company_league'
  | 'stroke_play';

export type FormatPresetFields = {
  event_kind: 'one_day' | 'league';
  number_of_holes: 9 | 18;
  players_per_match: 1 | 2 | 4;
  roster_max: number;
  scoring_type: 'stroke' | 'match_play';
  play_format: string;
  format: string;
  default_competing: number;
  max_teammates: number;
  points_per_hole: number | null;
  halved_points: number | null;
  match_win_bonus: number | null;
  auto_checkin_lineup?: boolean;
};

const SCRAMBLE_OUTING: FormatPresetFields = {
  event_kind: 'one_day',
  number_of_holes: 18,
  players_per_match: 4,
  roster_max: 4,
  scoring_type: 'stroke',
  play_format: 'scramble',
  format: 'scramble',
  default_competing: 4,
  max_teammates: 4,
  points_per_hole: null,
  halved_points: null,
  match_win_bonus: null,
};

export const FORMAT_PRESETS: Record<FormatPreset, FormatPresetFields> = {
  charity_scramble: { ...SCRAMBLE_OUTING },
  best_ball: {
    event_kind: 'one_day',
    number_of_holes: 18,
    players_per_match: 4,
    roster_max: 4,
    scoring_type: 'stroke',
    play_format: 'best_ball',
    format: 'best_ball',
    default_competing: 4,
    max_teammates: 4,
    points_per_hole: null,
    halved_points: null,
    match_win_bonus: null,
  },
  company_league: {
    event_kind: 'league',
    number_of_holes: 9,
    players_per_match: 2,
    roster_max: 6,
    scoring_type: 'match_play',
    play_format: 'scramble',
    format: 'scramble',
    default_competing: 2,
    max_teammates: 2,
    points_per_hole: 1,
    halved_points: 0.5,
    match_win_bonus: 1,
    auto_checkin_lineup: true,
  },
  stroke_play: {
    event_kind: 'one_day',
    number_of_holes: 18,
    players_per_match: 1,
    roster_max: 1,
    scoring_type: 'stroke',
    play_format: 'individual',
    format: 'individual',
    default_competing: 1,
    max_teammates: 1,
    points_per_hole: null,
    halved_points: null,
    match_win_bonus: null,
  },
};

export function customPresetFields(
  holes: 9 | 18,
  whoPlays: 1 | 2 | 4
): FormatPresetFields {
  const team = whoPlays > 1;
  return {
    event_kind: 'one_day',
    number_of_holes: holes,
    players_per_match: whoPlays,
    roster_max: whoPlays,
    scoring_type: 'stroke',
    play_format: team ? 'scramble' : 'individual',
    format: team ? 'scramble' : 'individual',
    default_competing: whoPlays,
    max_teammates: whoPlays,
    points_per_hole: null,
    halved_points: null,
    match_win_bonus: null,
  };
}

export function playFormatOf(event: any): string {
  return String(event?.play_format || event?.format || '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function isTeamCloneFormat(event: any): boolean {
  const f = playFormatOf(event);
  return f === 'scramble' || f === 'alternate_shot' || f === 'alt_shot';
}

export function isBestBallFormat(event: any): boolean {
  return playFormatOf(event) === 'best_ball';
}

export function isIndividualFormat(event: any): boolean {
  const f = playFormatOf(event);
  return f === 'individual' || Number(event?.players_per_match || event?.roster_max) === 1;
}

export function resolvedEventKind(event: any): 'one_day' | 'league' | string {
  if (event?.event_kind === 'league') return 'league';
  if (event?.event_kind === 'one_day' || event?.event_kind === 'tournament') {
    return 'one_day';
  }
  return event?.event_kind || 'one_day';
}

export function resolvedScoringType(event: any): string {
  const raw = String(event?.scoring_type || '')
    .toLowerCase()
    .trim();
  if (raw) return raw;
  if (event?.event_kind === 'league') return 'match_play';
  return 'stroke';
}

export function scoringTypeLabel(event: any): string {
  const t = resolvedScoringType(event);
  if (t === 'match_play' || t.includes('match')) return 'Match play';
  if (t === 'stroke') return 'Stroke';
  return t.replace(/_/g, ' ');
}

export function playFormatLabel(event: any): string {
  const f = playFormatOf(event);
  if (f === 'scramble') return 'Scramble';
  if (f === 'best_ball') return 'Best ball';
  if (f === 'alt_shot' || f === 'alternate_shot') return 'Alternate shot';
  if (f === 'shamble') return 'Shamble';
  if (f === 'individual' || f === 'stroke') return 'Stroke play';
  if (f === 'match_play') return 'Match play';
  if (!f) return '';
  return f.replace(/_/g, ' ');
}

/** e.g. “Scramble · Match play · 2 of 6 · 9 holes” */
export function eventPlaySummary(event: any): string {
  if (!event) return '';
  const format = playFormatLabel(event);
  const scoring = scoringTypeLabel(event);
  const who = Number(event.players_per_match) || 0;
  const roster =
    Number(event.roster_max) || Number(event.max_teammates) || 0;
  const holes = Number(event.number_of_holes) || 0;
  const parts: string[] = [];
  if (format) parts.push(format);
  if (scoring && scoring.toLowerCase() !== format.toLowerCase()) {
    parts.push(scoring);
  }
  if (who > 0 && roster > 0) parts.push(`${who} of ${roster}`);
  else if (who > 0) parts.push(String(who));
  if (holes > 0) parts.push(`${holes} holes`);
  return parts.join(' · ');
}

export function resolvedPlayFormat(event: any): string {
  if (event?.play_format) return String(event.play_format);
  if (event?.format) return String(event.format);
  return 'stroke';
}

export function needsFormatPreset(event: any): boolean {
  if (!event) return true;
  if (event.play_format || event.scoring_type) return false;
  if (event.event_kind || event.format) return false;
  return true;
}

export function roundRobinPairings(
  teams: string[],
  weekIndex: number
): { home: string; away: string | null }[] {
  const list = [...teams];
  if (list.length % 2 === 1) list.push('__BYE__');
  const n = list.length;
  if (n < 2) return [];
  const rounds = n - 1;
  const rotation = ((weekIndex % rounds) + rounds) % rounds;
  const arr = [list[0], ...list.slice(1)];
  for (let i = 0; i < rotation; i++) {
    const last = arr.pop()!;
    arr.splice(1, 0, last);
  }
  const pairs: { home: string; away: string | null }[] = [];
  for (let i = 0; i < n / 2; i++) {
    const a = arr[i];
    const b = arr[n - 1 - i];
    if (a === '__BYE__') pairs.push({ home: b, away: null });
    else if (b === '__BYE__') pairs.push({ home: a, away: null });
    else pairs.push({ home: a, away: b });
  }
  return pairs;
}
