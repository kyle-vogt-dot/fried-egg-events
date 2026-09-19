export function isLeagueEvent(event: any) {
  return event?.event_kind === 'league';
}

export function parseLineupIds(raw: any): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function holeMark(
  home: number,
  away: number
): 'W' | 'L' | 'H' | null {
  if (!(home > 0) || !(away > 0)) return null;
  if (home < away) return 'W';
  if (home > away) return 'L';
  return 'H';
}

export function sideStatusLabel(
  myWins: number,
  oppWins: number,
  thru: number
) {
  if (!(thru > 0)) return '';
  const diff = myWins - oppWins;
  if (diff === 0) return 'AS';
  if (diff > 0) return `${diff} up`;
  return `${-diff} down`;
}

export function matchThruStatus(
  homeName: string,
  awayName: string,
  homeScores: Record<number, number>,
  awayScores: Record<number, number>,
  holes = 9
) {
  let homeWins = 0;
  let awayWins = 0;
  let thru = 0;
  for (let h = 1; h <= holes; h++) {
    const hs = Number(homeScores[h] || 0);
    const as = Number(awayScores[h] || 0);
    if (hs <= 0 || as <= 0) continue;
    thru = h;
    if (hs < as) homeWins += 1;
    else if (as < hs) awayWins += 1;
  }
  const diff = homeWins - awayWins;
  const done = thru >= holes;
  if (thru === 0) {
    return {
      thru: 0,
      header: 'Not started',
      homeWins,
      awayWins,
      diff: 0,
      final: false,
    };
  }
  if (diff === 0) {
    return {
      thru,
      header: done ? 'Final · AS' : `AS thru ${thru}`,
      homeWins,
      awayWins,
      diff: 0,
      final: done,
    };
  }
  if (diff > 0) {
    return {
      thru,
      header: done
        ? `Final · ${homeName} ${diff} up`
        : `${homeName} ${diff} up thru ${thru}`,
      homeWins,
      awayWins,
      diff,
      final: done,
    };
  }
  return {
    thru,
    header: done
      ? `Final · ${awayName} ${-diff} up`
      : `${awayName} ${-diff} up thru ${thru}`,
    homeWins,
    awayWins,
    diff,
    final: done,
  };
}

export function computeSidePoints(
  myScores: Record<number, number>,
  oppScores: Record<number, number>,
  holes: number,
  pointsPerHole: number,
  halved: number,
  matchWinBonus: number
) {
  let holePoints = 0;
  let holesWon = 0;
  let oppWon = 0;
  for (let h = 1; h <= holes; h++) {
    const a = Number(myScores[h] || 0);
    const b = Number(oppScores[h] || 0);
    if (a <= 0 || b <= 0) continue;
    if (a < b) {
      holePoints += pointsPerHole;
      holesWon += 1;
    } else if (a === b) {
      holePoints += halved;
    } else {
      oppWon += 1;
    }
  }
  const bonus = holesWon > oppWon ? matchWinBonus : 0;
  return {
    holePoints,
    bonus,
    total: holePoints + bonus,
    holesWon,
    oppWon,
  };
}

export function scoresFromRegs(
  ids: string[],
  playerScores: Record<string, Record<number, number>>
): Record<number, number> {
  const out: Record<number, number> = {};
  for (const id of ids) {
    const s = playerScores[String(id)] || {};
    for (const [k, v] of Object.entries(s)) {
      const hole = Number(k);
      const score = Number(v);
      if (!(score > 0)) continue;
      if (out[hole] == null) out[hole] = score;
    }
  }
  return out;
}
