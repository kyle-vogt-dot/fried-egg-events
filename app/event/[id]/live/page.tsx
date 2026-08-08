'use client';

import { useState, useEffect, useMemo } from 'react';
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

function defaultHoles(numHoles: number) {
  return Array.from({ length: numHoles }, (_, i) => ({
    hole: i + 1,
    par: 4,
    yardage: 400 + i * 10,
    handicap: i + 1,
  }));
}

function getHolesFromCourseData(courseData: any, numHoles: number = 18) {
  if (!courseData) return defaultHoles(numHoles);

  let holes: any[] = [];

  if (
    courseData.scorecard &&
    Array.isArray(courseData.scorecard) &&
    courseData.scorecard.length > 0
  ) {
    holes = courseData.scorecard;
  } else if (courseData.course) {
    const inner = courseData.course;
    if (inner.scorecard && Array.isArray(inner.scorecard)) {
      holes = inner.scorecard;
    } else if (inner.tees) {
      const maleTees = inner.tees.male || inner.tees;
      const teeSet = Array.isArray(maleTees) ? maleTees[0] : maleTees;
      if (teeSet?.holes) holes = teeSet.holes;
    }
  } else if (courseData.tees) {
    const maleTees = courseData.tees.male || courseData.tees;
    const teeSet = Array.isArray(maleTees) ? maleTees[0] : maleTees;
    if (teeSet?.holes) holes = teeSet.holes;
  } else if (courseData.holes) {
    holes = courseData.holes;
  }

  if (!holes.length) return defaultHoles(numHoles);

  return holes.slice(0, numHoles).map((h: any, i: number) => ({
    hole: Number(h.Hole || h.hole) || i + 1,
    par: Number(h.par || h.Par) || 4,
    yardage: Number(h.yardage || h.Yardage || h.distance) || 400,
    handicap: Number(h.handicap || h.Handicap) || i + 1,
  }));
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
function ScoreMark({
  score,
  par,
}: {
  score: number | null | undefined;
  par: number;
}) {
  if (score == null || score <= 0) {
    return <span className="text-gray-500">—</span>;
  }

  const diff = score - par;

  // Eagle or better: double circle
  if (diff <= -2) {
    return (
      <span className="inline-flex items-center justify-center w-9 h-9 rounded-full border-2 border-emerald-400">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full border-2 border-emerald-300 text-emerald-300 font-semibold text-sm">
          {score}
        </span>
      </span>
    );
  }

  // Birdie: single circle
  if (diff === -1) {
    return (
      <span className="inline-flex items-center justify-center w-9 h-9 rounded-full border-2 border-emerald-400 text-emerald-300 font-semibold text-sm">
        {score}
      </span>
    );
  }

  // Par: plain
  if (diff === 0) {
    return <span className="font-semibold text-white text-sm">{score}</span>;
  }

  // Bogey: single square
  if (diff === 1) {
    return (
      <span className="inline-flex items-center justify-center w-9 h-9 border-2 border-orange-400 text-orange-300 font-semibold text-sm">
        {score}
      </span>
    );
  }

  // Double bogey+: double square
  return (
    <span className="inline-flex items-center justify-center w-9 h-9 border-2 border-red-400">
      <span className="inline-flex items-center justify-center w-7 h-7 border-2 border-red-300 text-red-300 font-semibold text-sm">
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

  // Your score vs par (holes with scores only)
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

// Players only — never treat creator as “always clear” if you want to test as yourself:
const showBlurred = blurActive; // temporary test
// production:
// const showBlurred = blurActive && !isAdmin;

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
      const ids =
        teamRegs.length > 0
          ? teamRegs.map((r) => String(r.id))
          : [registrationId];

      let query = supabase.from('scores').select('*').in('registration_id', ids);

      if (selectedRoundId != null) {
        query = query.eq('round_id', selectedRoundId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Load scores error:', error);
        const { data: fallback } = await supabase
          .from('scores')
          .select('*')
          .in('registration_id', ids);
        const map: Record<number, number> = {};
        (fallback || []).forEach((s: any) => {
          if (Number(s.score) > 0) map[s.hole] = s.score;
        });
        setScores(map);
        return;
      }

      const map: Record<number, number> = {};
      (data || []).forEach((s: any) => {
        if (Number(s.score) > 0) map[s.hole] = s.score;
      });
      setScores(map);
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

  // Live leaderboard with per-hole scores + to-par
  useEffect(() => {
    if (activeTab !== 'leaderboard' || registrations.length === 0) return;

    const regIds = registrations.map((r) => String(r.id));
    const courseHoles = holes;

    const loadLb = async () => {
      let query = supabase.from('scores').select('*').in('registration_id', regIds);
      if (selectedRoundId != null) {
        query = query.eq('round_id', selectedRoundId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Leaderboard load error:', error);
        return;
      }

      // regId -> hole -> score
      const byReg: Record<string, Record<number, number>> = {};
      (data || []).forEach((s: any) => {
        const id = String(s.registration_id);
        if (!byReg[id]) byReg[id] = {};
        if (Number(s.score) > 0) byReg[id][s.hole] = Number(s.score);
      });

      const isTeam = (event?.max_teammates || 1) > 1;
      const groups: Record<
        string,
        { scores: Record<number, number>; taken: boolean }
      > = {};

      registrations.forEach((r) => {
        const key =
          isTeam && r.team_name
            ? r.team_name
            : r.player_name || 'Player';
        const id = String(r.id);
        const holeMap = byReg[id] || {};

        if (!groups[key]) {
          groups[key] = { scores: {}, taken: false };
        }

        // Team: take first member with scores (or min per hole)
        Object.entries(holeMap).forEach(([hStr, sc]) => {
          const h = Number(hStr);
          const prev = groups[key].scores[h];
          groups[key].scores[h] =
            prev !== undefined ? Math.min(prev, sc) : sc;
        });
        if (Object.keys(holeMap).length > 0) groups[key].taken = true;
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
  }, [activeTab, registrations, event, eventId, selectedRoundId, holes]);

  useEffect(() => {
    const existing = scores[currentHole];
    setScoreInput(existing != null && existing > 0 ? String(existing) : '');
  }, [currentHole, scores]);

  const totalScore = Object.values(scores).reduce(
    (a, b) => a + (Number(b) || 0),
    0
  );

  const goPrevHole = () => {
    setCurrentHole((h) => (h <= 1 ? numHoles : h - 1));
    setSaveMsg(null);
  };

  const goNextHole = () => {
    setCurrentHole((h) => (h >= numHoles ? 1 : h + 1));
    setSaveMsg(null);
  };

  const saveHoleAndAdvance = async () => {
    const num = scoreInput === '' ? 0 : parseInt(scoreInput, 10);
    if (!Number.isFinite(num) || num < 1) {
      alert('Enter a score for this hole');
      return;
    }

    const targets = Array.from(
      new Set(
        teamRegs
          .map((r) => (r?.id != null ? String(r.id) : ''))
          .filter((id) => id.length > 0)
      )
    );

    if (targets.length === 0 && registrationId) {
      targets.push(registrationId);
    }

    if (targets.length === 0) {
      alert(
        'No registration found for this team. Open the score link from the scorecard QR, or use ?team=<registration_id>.'
      );
      return;
    }

    setSaving(true);
    setSaveMsg(null);

    try {
      for (const regId of targets) {
        // Delete all rows for this hole/reg (avoids duplicates if round_id was null before)
        await supabase
          .from('scores')
          .delete()
          .eq('registration_id', regId)
          .eq('hole', currentHole);

        const { error: insErr } = await supabase.from('scores').insert({
          registration_id: regId,
          hole: currentHole,
          score: num,
          ...(selectedRoundId != null ? { round_id: selectedRoundId } : {}),
        });

        if (insErr) throw insErr;
      }

      setScores((prev) => ({ ...prev, [currentHole]: num }));
      setSaveMsg('Saved');
      setCurrentHole((h) => (h >= numHoles ? 1 : h + 1));
    } catch (err: any) {
      console.error(err);
      alert('Failed to save: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  // Circle / square styling relative to par for hole dots
  const holeDotClass = (h: number) => {
    if (h === currentHole) return 'bg-blue-600 text-white';
    const s = scores[h];
    if (s == null || s <= 0) return 'bg-gray-800 text-gray-500';
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
                  className="w-14 h-14 shrink-0 rounded-2xl bg-gray-800 hover:bg-gray-700 text-2xl font-bold"
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
                  onChange={(e) => setScoreInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveHoleAndAdvance();
                  }}
                  placeholder="Score"
                  className="flex-1 bg-gray-800 border border-emerald-600 rounded-2xl text-center text-4xl font-bold py-5 focus:outline-none focus:border-emerald-400"
                />

                <button
                  type="button"
                  onClick={goNextHole}
                  className="w-14 h-14 shrink-0 rounded-2xl bg-gray-800 hover:bg-gray-700 text-2xl font-bold"
                  aria-label="Next hole"
                >
                  →
                </button>
              </div>

              <button
                type="button"
                onClick={saveHoleAndAdvance}
                disabled={saving}
                className="mt-4 w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 py-4 rounded-2xl text-lg font-semibold"
              >
                {saving ? 'Saving…' : 'Enter'}
              </button>

              {saveMsg && (
                <p className="mt-3 text-center text-emerald-400 text-sm">
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
                    onClick={() => setCurrentHole(h)}
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
            {showBlurred && (
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
                vs par · tap a score for scorecard
              </p>
            </div>

            {leaderboard.length === 0 ? (
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
                const par = Number(holes.find((x) => x.hole === hole)?.par) || 4;
                const diff = s != null && s > 0 ? s - par : null;
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
    </div>
  );
}