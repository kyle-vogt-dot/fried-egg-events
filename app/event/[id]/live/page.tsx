'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

function formatRoundTime(startTime: string | null | undefined) {
  if (!startTime) return null;
  const parts = String(startTime).slice(0, 5).split(':');
  if (parts.length < 2) return String(startTime);
  let h = parseInt(parts[0], 10);
  const m = parts[1];
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

type SkinRow = {
  key: string; // team name or player name
  skins: number;
  holes: number[]; // hole numbers won
  amount: number;
};

function computeBirdieSkins(opts: {
  participants: { key: string; scores: Record<number, number> }[];
  parMap: Record<number, number>;
  holes: number[];
  entryFee: number;
}): { rows: SkinRow[]; pot: number; skinValue: number } {
  const { participants, parMap, holes, entryFee } = opts;
  const pot = participants.length * Math.max(0, entryFee);
  const wins: Record<string, number[]> = {};
  participants.forEach((p) => (wins[p.key] = []));

  for (const hole of holes) {
    const par = parMap[hole] || 4;
    // birdie or better among skins players who have a score
    const entries = participants
      .map((p) => ({ key: p.key, score: p.scores[hole] }))
      .filter((e) => e.score != null && e.score > 0 && e.score <= par - 1);

    if (entries.length === 0) continue;

    const best = Math.min(...entries.map((e) => e.score));
    const winners = entries.filter((e) => e.score === best);
    // unique winner only
    if (winners.length === 1) {
      wins[winners[0].key].push(hole);
    }
  }

  const totalSkins = Object.values(wins).reduce((s, h) => s + h.length, 0);
  const skinValue = totalSkins > 0 ? pot / totalSkins : 0;

  const rows: SkinRow[] = participants
    .map((p) => ({
      key: p.key,
      skins: wins[p.key].length,
      holes: wins[p.key],
      amount: wins[p.key].length * skinValue,
    }))
    .sort((a, b) => b.skins - a.skins || b.amount - a.amount);

  return { rows, pot, skinValue };
}

function defaultHoles(numHoles: number) {
  return Array.from({ length: numHoles }, (_, i) => ({
    hole: i + 1,
    par: 4,
    yardage: 400 + i * 10,
    handicap: i + 1,
  }));
}

function yardsFromScorecardHole(h: any): number {
  const top = Number(h.yardage ?? h.Yardage ?? h.yards ?? h.distance ?? 0);
  if (top > 0) return top;
  const tees = h.tees;
  if (!tees || typeof tees !== 'object') return 0;
  for (const key of Object.keys(tees)) {
    const y = Number(tees[key]?.yards ?? tees[key]?.yardage ?? 0);
    if (y > 0) return y;
  }
  return 0;
}

function getHolesFromCourseData(courseData: any, numHoles: number = 18) {
  if (!courseData) return defaultHoles(numHoles);

  const root = courseData.course || courseData.data || courseData;
  let raw: any[] = [];

  if (Array.isArray(root.scorecard) && root.scorecard.length > 0) {
    raw = root.scorecard;
  } else if (Array.isArray(root.holes) && typeof root.holes[0] === 'object') {
    raw = root.holes;
  } else if (root.tees) {
    const tees = root.tees;
    const male = tees.male || tees.Men || tees.men;
    const list = Array.isArray(male)
      ? male
      : Array.isArray(tees)
        ? tees
        : [];
    const teeSet = list[0];
    if (teeSet?.holes) raw = teeSet.holes;
    else if (teeSet?.scorecard) raw = teeSet.scorecard;
  }

  if (!raw.length) return defaultHoles(numHoles);

  return raw.slice(0, numHoles).map((h: any, i: number) => {
    const par = Number(h.Par ?? h.par ?? 0);
    const handicap = Number(h.Handicap ?? h.handicap ?? 0);
    const yardage = yardsFromScorecardHole(h);
    return {
      hole: Number(h.Hole ?? h.hole ?? i + 1),
      par: par > 0 ? par : 4,
      yardage: yardage > 0 ? yardage : 400,
      handicap: handicap > 0 ? handicap : i + 1,
    };
  });
}

function getStartingHole(
  player: any,
  roundId: number | null,
  numHoles: number
) {
  if (!player) return 1;
  if (roundId != null) {
    const map = player.round_pairings || {};
    const entry = map[String(roundId)] || map[roundId];
    if (entry?.hole) {
      const h = Number(entry.hole);
      if (h >= 1 && h <= numHoles) return h;
    }
  }
  if (player.pairing_hole) {
    const h = Number(player.pairing_hole);
    if (h >= 1 && h <= numHoles) return h;
  }
  return 1;
}

function normName(s: string) {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function formatToPar(toPar: number | null | undefined) {
  if (toPar == null) return '—';
  if (toPar === 0) return 'E';
  if (toPar > 0) return `+${toPar}`;
  return String(toPar);
}

function lockKey(roundId: number | null) {
  return roundId != null ? String(roundId) : 'all';
}

function isScoresLocked(reg: any, roundId: number | null) {
  const map = reg?.scores_locked_by_round || {};
  return map[lockKey(roundId)] === true;
}

/** First hole 1..numHoles with no positive score, or null if complete */
function findFirstMissingHole(
  scores: Record<number, number>,
  numHoles: number
): number | null {
  for (let h = 1; h <= numHoles; h++) {
    if (!(scores[h] != null && Number(scores[h]) > 0)) return h;
  }
  return null;
}

function ScoreMark({
  score,
  par,
}: {
  score: number | null | undefined;
  par: number;
}) {
  if (score == null || score <= 0) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 text-gray-500 text-sm">
        —
      </span>
    );
  }

  const diff = score - par;
  const base =
    'inline-flex items-center justify-center w-8 h-8 text-sm font-semibold';

  // Eagle or better — double circle
  if (diff <= -2) {
    return (
      <span className={`${base} rounded-full border-2 border-emerald-400`}>
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-emerald-300 text-emerald-300 text-xs">
          {score}
        </span>
      </span>
    );
  }

  // Birdie — circle
  if (diff === -1) {
    return (
      <span
        className={`${base} rounded-full border-2 border-emerald-400 text-emerald-300`}
      >
        {score}
      </span>
    );
  }

  // Par — same footprint, no border
  if (diff === 0) {
    return <span className={`${base} text-white`}>{score}</span>;
  }

  // Bogey — square
  if (diff === 1) {
    return (
      <span
        className={`${base} border-2 border-orange-400 text-orange-300 rounded-sm`}
      >
        {score}
      </span>
    );
  }

  // Double+ — double square
  return (
    <span className={`${base} border-2 border-red-400 rounded-sm`}>
      <span className="inline-flex items-center justify-center w-5 h-5 border border-red-300 text-red-300 text-xs">
        {score}
      </span>
    </span>
  );
}
type LbRow = {
  name: string;
  total: number;
  holesPlayed: number;
  toPar: number | null;
  scores: Record<number, number>;
};

export default function LiveEventPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const eventId = params.id as string;
  const teamParam = searchParams.get('team');
  const roundParam = searchParams.get('round');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [event, setEvent] = useState<any>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [rounds, setRounds] = useState<any[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState<number | null>(null);
  const [scores, setScores] = useState<Record<number, number>>({});
  const [activeTab, setActiveTab] = useState<'scorecard' | 'leaderboard'>(
    'scorecard'
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [currentHole, setCurrentHole] = useState(1);
  const [scoreInput, setScoreInput] = useState('');
  const [startHoleReady, setStartHoleReady] = useState(false);

  const [leaderboard, setLeaderboard] = useState<LbRow[]>([]);
  const [scorecardTeam, setScorecardTeam] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submittingFinal, setSubmittingFinal] = useState(false);

    const [boardView, setBoardView] = useState<'stroke' | 'skins'>('stroke');
  const [skinsBoard, setSkinsBoard] = useState<{
    rows: SkinRow[];
    pot: number;
    skinValue: number;
    playerCount: number;
    teamCount: number;
  } | null>(null);

  // After a local save, ignore remote reloads briefly so realtime doesn't wipe other holes
  const ignoreRemoteUntilRef = useRef(0);
  const scoresRef = useRef(scores);
  scoresRef.current = scores;

  const numHoles = useMemo(() => {
    const n = Number(event?.number_of_holes || 18);
    return n === 9 ? 9 : 18;
  }, [event]);

  const holes = useMemo(
    () => getHolesFromCourseData(event?.course_data, numHoles),
    [event?.course_data, numHoles]
  );

  const teamRegs = useMemo(() => {
    if (!teamParam || !registrations.length) return [];

    const raw = decodeURIComponent(teamParam).trim();
    const q = normName(raw);

    const byId = registrations.filter((r) => String(r.id) === raw);
    if (byId.length) return byId;

    const byTeam = registrations.filter(
      (r) => normName(r.team_name || '') === q
    );
    if (byTeam.length) return byTeam;

    return registrations.filter((r) => normName(r.player_name || '') === q);
  }, [registrations, teamParam]);

  const primaryReg =
    teamRegs.find((r) => r?.id != null && String(r.id).length > 0) ||
    teamRegs[0] ||
    null;

  const registrationId =
    primaryReg?.id != null ? String(primaryReg.id) : null;

  const teamLabel =
    primaryReg?.team_name ||
    primaryReg?.player_name ||
    teamParam ||
    'Your Team';

  const scoresLocked = useMemo(
    () => isScoresLocked(primaryReg, selectedRoundId),
    [primaryReg, selectedRoundId]
  );

  const selectedRound = useMemo(
    () => rounds.find((r) => r.id === selectedRoundId) || null,
    [rounds, selectedRoundId]
  );

  const holeInfo = holes.find((h) => h.hole === currentHole) || {
    hole: currentHole,
    par: 4,
    yardage: 0,
    handicap: currentHole,
  };

  const myToPar = useMemo(() => {
    let strokes = 0;
    let parSum = 0;
    let played = 0;
    for (let h = 1; h <= numHoles; h++) {
      const s = scores[h];
      if (s != null && s > 0) {
        strokes += s;
        const info = holes.find((x) => x.hole === h);
        parSum += Number(info?.par) || 4;
        played += 1;
      }
    }
    return played > 0 ? strokes - parSum : null;
  }, [scores, holes, numHoles]);

  const allHolesScored = useMemo(
    () => findFirstMissingHole(scores, numHoles) == null && numHoles > 0,
    [scores, numHoles]
  );

  const scorecardRow = useMemo(
    () => leaderboard.find((r) => r.name === scorecardTeam) || null,
    [leaderboard, scorecardTeam]
  );

  const blurHole =
    event?.leaderboard_blur_hole != null &&
    Number(event.leaderboard_blur_hole) > 0
      ? Number(event.leaderboard_blur_hole)
      : null;

  const blurActive = useMemo(() => {
    if (!blurHole) return false;
    return leaderboard.some((row) => Number(row.holesPlayed) >= blurHole);
  }, [blurHole, leaderboard]);

  const showBlurred = blurActive && !isAdmin;

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const id = parseInt(eventId);

      const { data: eventData } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', id)
        .single();
      setEvent(eventData);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user && eventData) {
        const isCreator = eventData.created_by === user.id;
        const { data: adminRow } = await supabase
          .from('event_admins')
          .select('id')
          .eq('event_id', id)
          .or(`user_id.eq.${user.id},email.eq.${user.email}`)
          .maybeSingle();
        setIsAdmin(isCreator || !!adminRow);
      } else {
        setIsAdmin(false);
      }

      const { data: roundsData } = await supabase
        .from('event_rounds')
        .select('*')
        .eq('event_id', id)
        .order('sort_order', { ascending: true });

      const roundList = roundsData || [];
      setRounds(roundList);

      if (roundParam && roundList.some((r) => String(r.id) === roundParam)) {
        setSelectedRoundId(parseInt(roundParam, 10));
      } else if (roundList.length > 0) {
        setSelectedRoundId(roundList[0].id);
      } else {
        setSelectedRoundId(null);
      }

      const { data: regData } = await supabase
        .from('event_registrations')
        .select('*')
        .eq('event_id', id);
      setRegistrations(regData || []);

      setLoading(false);
    };

    fetchData();
  }, [eventId, teamParam, roundParam]);

  useEffect(() => {
    if (!primaryReg || startHoleReady) return;
    const n = Number(event?.number_of_holes || 18) === 9 ? 9 : 18;
    const start = getStartingHole(primaryReg, selectedRoundId, n);
    setCurrentHole(start);
    setStartHoleReady(true);
  }, [primaryReg, selectedRoundId, event, startHoleReady]);

  useEffect(() => {
    if (!registrationId) {
      setScores({});
      return;
    }

    const loadScores = async () => {
      // Don't clobber local card right after a hole save
      if (Date.now() < ignoreRemoteUntilRef.current) return;

      const ids =
        teamRegs.length > 0
          ? teamRegs.map((r) => String(r.id))
          : [registrationId];

      let query = supabase
        .from('scores')
        .select('*')
        .in('registration_id', ids);

      if (selectedRoundId != null) {
        query = query.eq('round_id', selectedRoundId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Load scores error:', error);
        return;
      }

      // Build map from DB. Prefer primary reg when multiple team rows exist.
      const byReg: Record<string, Record<number, number>> = {};
      (data || []).forEach((s: any) => {
        const rid = String(s.registration_id);
        if (!byReg[rid]) byReg[rid] = {};
        if (Number(s.score) > 0) byReg[rid][s.hole] = Number(s.score);
      });

      const preferred =
        (registrationId && byReg[registrationId]) ||
        Object.values(byReg).sort(
          (a, b) => Object.keys(b).length - Object.keys(a).length
        )[0] ||
        {};

      // Merge: never drop a hole we already have locally if DB omitted it briefly
      setScores((prev) => {
        const next = { ...preferred };
        Object.entries(prev).forEach(([hStr, sc]) => {
          const h = Number(hStr);
          if (Number(sc) > 0 && !(next[h] > 0)) {
            next[h] = Number(sc);
          }
        });
        return next;
      });
    };

    loadScores();

    const channel = supabase
      .channel(`live-scores-${registrationId}-${selectedRoundId || 'all'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scores',
        },
        () => {
          loadScores();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [registrationId, selectedRoundId, teamRegs]);

    const isPlayingSkins = (reg: any) => {
    if (reg.playing_skins === true) return true;
    if (reg.addons_selected?.Skins || reg.addons_selected?.skins) return true;
    return false;
  };

  useEffect(() => {
    if (activeTab !== 'leaderboard' || registrations.length === 0) return;

    const regIds = registrations.map((r) => String(r.id));
    const courseHoles = holes;

    const loadLb = async () => {
      let query = supabase
        .from('scores')
        .select('*')
        .in('registration_id', regIds);
      if (selectedRoundId != null) {
        query = query.eq('round_id', selectedRoundId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Leaderboard load error:', error);
        return;
      }

      const byReg: Record<string, Record<number, number>> = {};
      (data || []).forEach((s: any) => {
        const id = String(s.registration_id);
        if (!byReg[id]) byReg[id] = {};
        if (Number(s.score) > 0) byReg[id][s.hole] = Number(s.score);
      });

      const isTeam = (event?.max_teammates || 1) > 1;
      const groups: Record<string, { scores: Record<number, number> }> = {};

      registrations.forEach((r) => {
        const key =
          isTeam && r.team_name ? r.team_name : r.player_name || 'Player';
        const id = String(r.id);
        const holeMap = byReg[id] || {};

        if (!groups[key]) groups[key] = { scores: {} };

        Object.entries(holeMap).forEach(([hStr, sc]) => {
          const h = Number(hStr);
          const prev = groups[key].scores[h];
          groups[key].scores[h] =
            prev !== undefined ? Math.min(prev, sc) : sc;
        });
      });

      const rows: LbRow[] = Object.entries(groups)
        .map(([name, g]) => {
          let total = 0;
          let parSum = 0;
          let holesPlayed = 0;
          const scoresMap = g.scores;
          Object.entries(scoresMap).forEach(([hStr, sc]) => {
            const h = Number(hStr);
            if (sc > 0) {
              total += sc;
              holesPlayed += 1;
              const info = courseHoles.find((x) => x.hole === h);
              parSum += Number(info?.par) || 4;
            }
          });
          return {
            name,
            total,
            holesPlayed,
            toPar: holesPlayed > 0 ? total - parSum : null,
            scores: scoresMap,
          };
        })
        .filter((r) => r.holesPlayed > 0)
        .sort((a, b) => {
          if (a.toPar != null && b.toPar != null && a.toPar !== b.toPar) {
            return a.toPar - b.toPar;
          }
          return a.total - b.total;
        });

      setLeaderboard(rows);

            // Skins board (same score map)
      if (event?.enable_skins) {
        const skinsRegs = registrations.filter(isPlayingSkins);
        if (skinsRegs.length === 0) {
          setSkinsBoard({
            rows: [],
            pot: 0,
            skinValue: 0,
            playerCount: 0,
            teamCount: 0,
          });
        } else {
          const isTeamEvent = (event?.max_teammates || 1) > 1;
          const grouped: Record<string, any[]> = {};
          for (const reg of skinsRegs) {
            const key =
              isTeamEvent && reg.team_name
                ? reg.team_name
                : reg.player_name || 'Unknown';
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(reg);
          }

          const participants = Object.keys(grouped).map((key) => {
            const members = grouped[key];
            const scoresMap: Record<number, number> = {};
            for (const reg of members) {
              const holeMap = byReg[String(reg.id)] || {};
              Object.entries(holeMap).forEach(([hStr, sc]) => {
                const h = Number(hStr);
                const s = Number(sc);
                if (s > 0) {
                  scoresMap[h] =
                    scoresMap[h] !== undefined
                      ? Math.min(scoresMap[h], s)
                      : s;
                }
              });
            }
            return { key, scores: scoresMap };
          });

          const parMap: Record<number, number> = {};
          const holeList: number[] = [];
          for (let h = 1; h <= numHoles; h++) {
            parMap[h] = Number(courseHoles.find((x) => x.hole === h)?.par) || 4;
            holeList.push(h);
          }

          const result = computeBirdieSkins({
            participants,
            parMap,
            holes: holeList,
            entryFee: Number(event?.skins_fee) || 0,
          });

          setSkinsBoard({
            ...result,
            playerCount: skinsRegs.length,
            teamCount: participants.length,
          });
        }
      } else {
        setSkinsBoard(null);
      }
    };

    

    loadLb();

    const channel = supabase
      .channel(`player-lb-${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scores' },
        () => loadLb()
      )
      .subscribe();

    const poll = setInterval(loadLb, 3000);

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
    }, [activeTab, registrations, event, eventId, selectedRoundId, holes, numHoles]);

  useEffect(() => {
    const existing = scores[currentHole];
    setScoreInput(existing != null && existing > 0 ? String(existing) : '');
  }, [currentHole, scores]);

  const totalScore = Object.values(scores).reduce(
    (a, b) => a + (Number(b) || 0),
    0
  );

  const goPrevHole = () => {
    if (scoresLocked) return;
    setCurrentHole((h) => (h <= 1 ? numHoles : h - 1));
    setSaveMsg(null);
  };

  const goNextHole = () => {
    if (scoresLocked) return;
    setCurrentHole((h) => (h >= numHoles ? 1 : h + 1));
    setSaveMsg(null);
  };

  /** Save only this hole — never deletes other holes */
  const persistHoleScore = async (hole: number, num: number) => {
    const targets = Array.from(
      new Set(
        teamRegs
          .map((r) => (r?.id != null ? String(r.id) : ''))
          .filter((id) => id.length > 0)
      )
    );
    if (targets.length === 0 && registrationId) targets.push(registrationId);
    if (targets.length === 0) {
      throw new Error(
        'No registration found for this team. Open from scorecard QR or ?team=…'
      );
    }

    for (const regId of targets) {
      // Only this hole — scoped by round when possible
      if (selectedRoundId != null) {
        await supabase
          .from('scores')
          .delete()
          .eq('registration_id', regId)
          .eq('hole', hole)
          .eq('round_id', selectedRoundId);

        // Also clear legacy rows for this hole with null round_id (old saves)
        await supabase
          .from('scores')
          .delete()
          .eq('registration_id', regId)
          .eq('hole', hole)
          .is('round_id', null);
      } else {
        await supabase
          .from('scores')
          .delete()
          .eq('registration_id', regId)
          .eq('hole', hole);
      }

      const { error: insErr } = await supabase.from('scores').insert({
        registration_id: regId,
        hole,
        score: num,
        ...(selectedRoundId != null ? { round_id: selectedRoundId } : {}),
      });
      if (insErr) throw insErr;
    }
  };

  const tryOpenSubmitOrMissed = (map: Record<number, number>) => {
    const missing = findFirstMissingHole(map, numHoles);
    if (missing == null) {
      setSaveMsg(null);
      setShowSubmitModal(true);
      return;
    }
    setShowSubmitModal(false);
    setCurrentHole(missing);
    setSaveMsg(`Missed score on hole ${missing}`);
  };

  const saveHoleAndAdvance = async () => {
    if (scoresLocked) {
      alert(
        'Scores are submitted. Ask an event admin to edit if something is wrong.'
      );
      return;
    }

    const num = scoreInput === '' ? 0 : parseInt(scoreInput, 10);
    if (!Number.isFinite(num) || num < 1) {
      alert('Enter a score for this hole');
      return;
    }

    setSaving(true);
    setSaveMsg(null);

    try {
      // Optimistic: keep every other hole; only change this one
      const nextScores = { ...scoresRef.current, [currentHole]: num };
      setScores(nextScores);
      ignoreRemoteUntilRef.current = Date.now() + 2500;

      await persistHoleScore(currentHole, num);

      setSaveMsg('Saved');

      const missing = findFirstMissingHole(nextScores, numHoles);
      if (missing == null) {
        setShowSubmitModal(true);
      } else {
        // Prefer next hole in sequence; if that one is filled, still advance
        // but if user skipped ahead, surface first gap when they finish a "full" pass
        const nextHole = currentHole >= numHoles ? 1 : currentHole + 1;
        setCurrentHole(nextHole);
      }
    } catch (err: any) {
      console.error(err);
      alert('Failed to save: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const openReviewSubmit = () => {
    if (scoresLocked) return;
    tryOpenSubmitOrMissed(scoresRef.current);
  };

  const submitFinalScores = async () => {
    if (scoresLocked) {
      setShowSubmitModal(false);
      return;
    }

    const missing = findFirstMissingHole(scoresRef.current, numHoles);
    if (missing != null) {
      setShowSubmitModal(false);
      setCurrentHole(missing);
      setSaveMsg(`Missed score on hole ${missing}`);
      return;
    }

    const targets = Array.from(
      new Set(
        teamRegs
          .map((r) => (r?.id != null ? String(r.id) : ''))
          .filter((id) => id.length > 0)
      )
    );
    if (targets.length === 0 && registrationId) targets.push(registrationId);
    if (targets.length === 0) {
      alert('No registration found');
      return;
    }

    setSubmittingFinal(true);
    const key = lockKey(selectedRoundId);

    try {
      for (const regId of targets) {
        const reg = registrations.find((r) => String(r.id) === regId);
        const existing = (reg?.scores_locked_by_round || {}) as Record<
          string,
          boolean
        >;
        const updatedMap = { ...existing, [key]: true };

        const { error } = await supabase
          .from('event_registrations')
          .update({ scores_locked_by_round: updatedMap })
          .eq('id', regId);

        if (error) throw error;
      }

      setRegistrations((prev) =>
        prev.map((r) => {
          if (!targets.includes(String(r.id))) return r;
          return {
            ...r,
            scores_locked_by_round: {
              ...(r.scores_locked_by_round || {}),
              [key]: true,
            },
          };
        })
      );

      setShowSubmitModal(false);
      setSaveMsg('Submitted');
      alert(
        'Scores submitted. An admin can still edit if something looks wrong.'
      );
    } catch (err: any) {
      console.error(err);
      alert('Submit failed: ' + (err.message || 'Unknown error'));
    } finally {
      setSubmittingFinal(false);
    }
  };

  const holeDotClass = (h: number) => {
    if (h === currentHole) return 'bg-blue-600 text-white rounded-full';
    const s = scores[h];
    if (s == null || s <= 0) return 'bg-gray-800 text-gray-500 rounded-full';
    const par = Number(holes.find((x) => x.hole === h)?.par) || 4;
    const diff = s - par;
    if (diff <= -2)
      return 'bg-emerald-600 text-white ring-2 ring-emerald-300 rounded-full';
    if (diff === -1)
      return 'bg-emerald-800 text-emerald-200 ring-2 ring-emerald-400 rounded-full';
    if (diff === 0) return 'bg-gray-700 text-white rounded-full';
    if (diff === 1)
      return 'bg-orange-900 text-orange-200 border-2 border-orange-400 rounded-md';
    return 'bg-red-900 text-red-200 border-2 border-red-400 rounded-md';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center text-xl">
        Loading live scorecard...
      </div>
    );
  }

  if (!primaryReg) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-8 text-center">
        <div>
          <p className="text-2xl mb-2">Team not found</p>
          <p className="text-gray-400">
            Open this page from a scorecard QR / link with{' '}
            <code className="text-teal-400">?team=...</code>
          </p>
        </div>
      </div>
    );
  }

  const teeTime = selectedRound
    ? formatRoundTime(selectedRound.start_time)
    : null;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <div className="max-w-lg mx-auto w-full flex-1 flex flex-col p-4 md:p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl font-bold">{teamLabel}</h1>
            <p className="text-gray-400 text-sm">
              {event?.course || 'Tournament'}
              {selectedRound ? ` · ${selectedRound.name}` : ''}
              {teeTime ? ` · ${teeTime}` : ''}
            </p>
            {scoresLocked && (
              <p className="text-emerald-400 text-xs mt-1 font-medium">
                Submitted · admin can still edit if needed
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {rounds.length > 0 && (
              <select
                value={selectedRoundId ?? ''}
                onChange={(e) => {
                  setStartHoleReady(false);
                  setSelectedRoundId(
                    e.target.value ? parseInt(e.target.value, 10) : null
                  );
                }}
                className="bg-gray-800 border border-gray-600 rounded-xl px-3 py-2 text-sm"
              >
                {rounds.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}
            <span className="text-xs bg-green-600 px-3 py-2 rounded-full font-medium">
              LIVE
            </span>
          </div>
        </div>

        <div className="flex border-b border-gray-700 mb-6">
          <button
            onClick={() => setActiveTab('scorecard')}
            className={`flex-1 py-3 font-medium ${
              activeTab === 'scorecard'
                ? 'border-b-2 border-blue-500 text-white'
                : 'text-gray-400'
            }`}
          >
            Score
          </button>
          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`flex-1 py-3 font-medium ${
              activeTab === 'leaderboard'
                ? 'border-b-2 border-blue-500 text-white'
                : 'text-gray-400'
            }`}
          >
            Leaderboard
          </button>
        </div>

        {activeTab === 'scorecard' && (
          <div className="flex-1 flex flex-col">
            <div className="text-center mb-2">
              <p className="text-4xl font-bold tracking-tight">
                Hole {holeInfo.hole}{' '}
                <span className="text-gray-400 font-semibold text-2xl">
                  · Par {holeInfo.par}
                </span>
              </p>
              <p className="text-gray-400 mt-2 text-base">
                {holeInfo.yardage ? `${holeInfo.yardage} yds` : '—'} · HCP{' '}
                {holeInfo.handicap || '—'}
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Total {totalScore || '—'} ·{' '}
                <span
                  className={
                    myToPar == null
                      ? ''
                      : myToPar < 0
                        ? 'text-emerald-400 font-semibold'
                        : myToPar > 0
                          ? 'text-orange-400 font-semibold'
                          : 'text-white font-semibold'
                  }
                >
                  {formatToPar(myToPar)}
                </span>
              </p>
            </div>

            <div className="flex-1 min-h-[40px]" />

            <div className="bg-gray-900 border border-gray-700 rounded-3xl p-5 mb-6">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={goPrevHole}
                  disabled={scoresLocked}
                  className="w-14 h-14 shrink-0 rounded-2xl bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-2xl font-bold"
                  aria-label="Previous hole"
                >
                  ←
                </button>

                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={15}
                  value={scoreInput}
                  disabled={scoresLocked}
                  onChange={(e) => setScoreInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !scoresLocked) saveHoleAndAdvance();
                  }}
                  placeholder="Score"
                  className="flex-1 bg-gray-800 border border-emerald-600 rounded-2xl text-center text-4xl font-bold py-5 focus:outline-none focus:border-emerald-400 disabled:opacity-50"
                />

                <button
                  type="button"
                  onClick={goNextHole}
                  disabled={scoresLocked}
                  className="w-14 h-14 shrink-0 rounded-2xl bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-2xl font-bold"
                  aria-label="Next hole"
                >
                  →
                </button>
              </div>

              {!scoresLocked ? (
                <button
                  type="button"
                  onClick={saveHoleAndAdvance}
                  disabled={saving}
                  className="mt-4 w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 py-4 rounded-2xl text-lg font-semibold"
                >
                  {saving ? 'Saving…' : 'Enter'}
                </button>
              ) : (
                <p className="mt-4 text-center text-emerald-400 font-medium">
                  Card submitted
                </p>
              )}

              {!scoresLocked && (
                <button
                  type="button"
                  onClick={openReviewSubmit}
                  className="mt-3 w-full bg-indigo-600 hover:bg-indigo-700 py-3 rounded-2xl text-sm font-semibold"
                >
                  Review & submit card
                </button>
              )}

              {saveMsg && (
                <p
                  className={`mt-3 text-center text-sm font-medium ${
                    saveMsg.startsWith('Missed')
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {saveMsg}
                </p>
              )}
            </div>

            <div className="flex flex-wrap justify-center gap-1.5 pb-4">
              {Array.from({ length: numHoles }, (_, i) => {
                const h = i + 1;
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => {
                      if (!scoresLocked) {
                        setCurrentHole(h);
                        setSaveMsg(null);
                      }
                    }}
                    className={`w-8 h-8 text-xs font-medium ${holeDotClass(h)}`}
                  >
                    {h}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'leaderboard' && (
          <div className="relative bg-gray-900 rounded-3xl overflow-hidden">
            {showBlurred && boardView === 'stroke' && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-950/80 backdrop-blur-md rounded-3xl">
                <div className="text-center px-6">
                  <p className="text-xl font-semibold mb-2">
                    Leaderboard hidden
                  </p>
                  <p className="text-gray-400 text-sm max-w-xs">
                    Standings blur once any team has completed {blurHole}{' '}
                    holes.
                  </p>
                </div>
              </div>
            )}

            <div className="px-5 py-4 border-b border-gray-700">
              <h2 className="font-semibold">Live Leaderboard</h2>
              <p className="text-xs text-gray-500 mt-1">
                {boardView === 'skins'
                  ? 'Birdie or better, alone · gross'
                  : 'vs par · tap a score for scorecard'}
              </p>

              {event?.enable_skins && (
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => setBoardView('stroke')}
                    className={`px-4 py-1.5 rounded-full text-xs font-medium ${
                      boardView === 'stroke'
                        ? 'bg-white text-black'
                        : 'bg-gray-800 text-gray-400'
                    }`}
                  >
                    Stroke
                  </button>
                  <button
                    type="button"
                    onClick={() => setBoardView('skins')}
                    className={`px-4 py-1.5 rounded-full text-xs font-medium ${
                      boardView === 'skins'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-gray-800 text-gray-400'
                    }`}
                  >
                    Skins
                  </button>
                </div>
              )}
            </div>

            {boardView === 'skins' && event?.enable_skins ? (
              <div className="p-4">
                <div className="flex flex-wrap gap-3 text-xs text-gray-400 mb-4">
                  <span>
                    Pot:{' '}
                    <span className="text-emerald-400 font-semibold">
                      ${(skinsBoard?.pot || 0).toFixed(2)}
                    </span>
                  </span>
                  <span>
                    {skinsBoard?.playerCount || 0} in
                    {skinsBoard?.teamCount
                      ? ` · ${skinsBoard.teamCount} teams`
                      : ''}
                  </span>
                  <span>
                    /skin ${(skinsBoard?.skinValue || 0).toFixed(2)}
                  </span>
                </div>

                {(skinsBoard?.rows || []).length === 0 ? (
                  <p className="text-gray-500 p-6 text-center text-sm">
                    No skins players yet, or no unique birdies scored.
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-800">
                    {(skinsBoard?.rows || []).map((row, i) => (
                      <li
                        key={row.key}
                        className="flex items-center justify-between px-2 py-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-7 h-7 shrink-0 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold">
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{row.key}</p>
                            <p className="text-xs text-gray-500">
                              {row.holes.length
                                ? row.holes.map((h) => `H${h}`).join(', ')
                                : '—'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right ml-3">
                          <p className="text-emerald-400 font-bold">
                            {row.skins} skin{row.skins === 1 ? '' : 's'}
                          </p>
                          <p className="text-sm text-gray-300">
                            ${row.amount.toFixed(2)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : leaderboard.length === 0 ? (
              <p className="text-gray-500 p-8 text-center">No scores yet.</p>
            ) : (
              <ul
                className={`divide-y divide-gray-800 ${
                  showBlurred ? 'opacity-40 pointer-events-none' : ''
                }`}
              >
                {leaderboard.map((row, i) => (
                  <li key={row.name}>
                    <button
                      type="button"
                      onClick={() => setScorecardTeam(row.name)}
                      className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-800/80 transition-colors"
                      title="View scorecard"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-sm font-bold ${
                            i === 0
                              ? 'bg-amber-500 text-black'
                              : i === 1
                                ? 'bg-gray-400 text-black'
                                : i === 2
                                  ? 'bg-amber-800 text-white'
                                  : 'bg-gray-800 text-gray-400'
                          }`}
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{row.name}</p>
                          <p className="text-xs text-gray-500">
                            {row.holesPlayed} hole
                            {row.holesPlayed === 1 ? '' : 's'} · tap for
                            scorecard
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-2xl font-bold tabular-nums ml-3 ${
                          row.toPar == null
                            ? 'text-gray-500'
                            : row.toPar < 0
                              ? 'text-emerald-400'
                              : row.toPar > 0
                                ? 'text-orange-400'
                                : 'text-white'
                        }`}
                      >
                        {formatToPar(row.toPar)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      {scorecardRow && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold">{scorecardRow.name}</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Thru {scorecardRow.holesPlayed}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScorecardTeam(null)}
                className="text-gray-400 hover:text-white text-sm"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-6">
              {Array.from({ length: numHoles }, (_, i) => {
                const hole = i + 1;
                const s = scorecardRow.scores[hole];
                const par =
                  Number(holes.find((x) => x.hole === hole)?.par) || 4;
                return (
                  <div
                    key={hole}
                    className="bg-gray-900 rounded-xl p-3 text-center"
                  >
                    <div className="text-xs text-gray-500">
                      H{hole} · p{par}
                    </div>
                    <div className="mt-1 flex justify-center min-h-[2.25rem] items-center">
                      <ScoreMark score={s} par={par} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between text-sm border-t border-gray-700 pt-4">
              <span className="text-gray-400">vs par</span>
              <span
                className={
                  scorecardRow.toPar == null
                    ? 'text-gray-400'
                    : scorecardRow.toPar < 0
                      ? 'text-emerald-400 font-semibold'
                      : scorecardRow.toPar > 0
                        ? 'text-orange-400 font-semibold'
                        : 'text-white font-semibold'
                }
              >
                {formatToPar(scorecardRow.toPar)}
              </span>
            </div>
          </div>
        </div>
      )}

            {showSubmitModal && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 md:p-6">
            <h2 className="text-2xl font-bold mb-1">Review your scorecard</h2>
            <p className="text-sm text-gray-400 mb-4">
              {teamLabel}
              {selectedRound ? ` · ${selectedRound.name}` : ''} · confirm then
              submit. After submit, only an admin can change scores.
            </p>

            {/* Traditional scorecard — swipe/scroll sideways if needed */}
            <div className="overflow-x-auto -mx-1 px-1 pb-2">
              <table className="border-collapse text-sm min-w-[640px] w-full">
                <thead>
                  <tr className="bg-gray-950">
                    <th className="text-left py-2.5 px-2 font-semibold text-gray-300 sticky left-0 bg-gray-950 z-10 min-w-[52px]">
                      HOLE
                    </th>
                    {Array.from({ length: Math.min(9, numHoles) }, (_, i) => (
                      <th
                        key={`h-${i + 1}`}
                        className="text-center py-2.5 px-1.5 font-medium text-gray-300 w-9"
                      >
                        {i + 1}
                      </th>
                    ))}
                    <th className="text-center py-2.5 px-2 font-semibold text-emerald-400 bg-gray-900/80">
                      OUT
                    </th>
                    {numHoles > 9 &&
                      Array.from({ length: numHoles - 9 }, (_, i) => (
                        <th
                          key={`h-${i + 10}`}
                          className="text-center py-2.5 px-1.5 font-medium text-gray-300 w-9"
                        >
                          {i + 10}
                        </th>
                      ))}
                    {numHoles > 9 && (
                      <th className="text-center py-2.5 px-2 font-semibold text-emerald-400 bg-gray-900/80">
                        IN
                      </th>
                    )}
                    <th className="text-center py-2.5 px-2 font-semibold text-white bg-gray-900">
                      TOT
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* PAR row */}
                  <tr className="border-t border-gray-700">
                    <td className="py-2 px-2 font-semibold text-gray-400 sticky left-0 bg-gray-800 z-10">
                      PAR
                    </td>
                    {Array.from({ length: Math.min(9, numHoles) }, (_, i) => {
                      const par = Number(holes[i]?.par) || 4;
                      return (
                        <td
                          key={`p-${i + 1}`}
                          className="text-center py-2 px-1.5 text-gray-400"
                        >
                          {par}
                        </td>
                      );
                    })}
                    <td className="text-center py-2 px-2 font-semibold text-emerald-400/80 bg-gray-900/40">
                      {Array.from({ length: Math.min(9, numHoles) }, (_, i) =>
                        Number(holes[i]?.par) || 4
                      ).reduce((a, b) => a + b, 0)}
                    </td>
                    {numHoles > 9 &&
                      Array.from({ length: numHoles - 9 }, (_, i) => {
                        const par = Number(holes[i + 9]?.par) || 4;
                        return (
                          <td
                            key={`p-${i + 10}`}
                            className="text-center py-2 px-1.5 text-gray-400"
                          >
                            {par}
                          </td>
                        );
                      })}
                    {numHoles > 9 && (
                      <td className="text-center py-2 px-2 font-semibold text-emerald-400/80 bg-gray-900/40">
                        {Array.from({ length: numHoles - 9 }, (_, i) =>
                          Number(holes[i + 9]?.par) || 4
                        ).reduce((a, b) => a + b, 0)}
                      </td>
                    )}
                    <td className="text-center py-2 px-2 font-semibold text-gray-300 bg-gray-900/60">
                      {Array.from({ length: numHoles }, (_, i) =>
                        Number(holes[i]?.par) || 4
                      ).reduce((a, b) => a + b, 0)}
                    </td>
                  </tr>

                  {/* SCORE row */}
                  <tr className="border-t border-gray-700">
                    <td className="py-2.5 px-2 font-semibold text-white sticky left-0 bg-gray-800 z-10">
                      SCORE
                    </td>
                    {Array.from({ length: Math.min(9, numHoles) }, (_, i) => {
                      const hole = i + 1;
                      const s = scores[hole];
                      const par = Number(holes[i]?.par) || 4;
                      return (
                        <td key={`s-${hole}`} className="text-center py-2.5 px-1">
                          <div className="flex justify-center">
                            <ScoreMark
                              score={s != null && s > 0 ? s : null}
                              par={par}
                            />
                          </div>
                        </td>
                      );
                    })}
                    <td className="text-center py-2.5 px-2 font-bold text-emerald-400 text-base bg-gray-900/40">
                      {Array.from({ length: Math.min(9, numHoles) }, (_, i) =>
                        scores[i + 1] > 0 ? scores[i + 1] : 0
                      ).reduce((a, b) => a + b, 0) || '—'}
                    </td>
                    {numHoles > 9 &&
                      Array.from({ length: numHoles - 9 }, (_, i) => {
                        const hole = i + 10;
                        const s = scores[hole];
                        const par = Number(holes[i + 9]?.par) || 4;
                        return (
                          <td
                            key={`s-${hole}`}
                            className="text-center py-2.5 px-1"
                          >
                            <div className="flex justify-center">
                              <ScoreMark
                                score={s != null && s > 0 ? s : null}
                                par={par}
                              />
                            </div>
                          </td>
                        );
                      })}
                    {numHoles > 9 && (
                      <td className="text-center py-2.5 px-2 font-bold text-emerald-400 text-base bg-gray-900/40">
                        {Array.from({ length: numHoles - 9 }, (_, i) =>
                          scores[i + 10] > 0 ? scores[i + 10] : 0
                        ).reduce((a, b) => a + b, 0) || '—'}
                      </td>
                    )}
                    <td className="text-center py-2.5 px-2 font-bold text-white text-lg bg-gray-900/60">
                      {totalScore || '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mb-4 md:hidden">
              Swipe sideways to see the full card →
            </p>

            <div className="flex justify-between items-center text-sm border-t border-gray-700 pt-4 mb-6">
              <span className="text-gray-400">vs par</span>
              <span
                className={`text-xl font-bold ${
                  myToPar == null
                    ? 'text-gray-400'
                    : myToPar < 0
                      ? 'text-emerald-400'
                      : myToPar > 0
                        ? 'text-orange-400'
                        : 'text-white'
                }`}
              >
                {formatToPar(myToPar)}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={submitFinalScores}
                disabled={submittingFinal}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 py-4 rounded-2xl font-semibold"
              >
                {submittingFinal ? 'Submitting…' : 'Submit scorecard'}
              </button>
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                disabled={submittingFinal}
                className="flex-1 bg-gray-700 hover:bg-gray-600 py-4 rounded-2xl font-semibold"
              >
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}