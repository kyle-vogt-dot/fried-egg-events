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

function getStartingHole(player: any, roundId: number | null, numHoles: number) {
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

  // Hole-by-hole UI
  const [currentHole, setCurrentHole] = useState(1);
  const [scoreInput, setScoreInput] = useState('');
  const [startHoleReady, setStartHoleReady] = useState(false);

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
    return registrations.filter(
      (r) =>
        String(r.id) === teamParam ||
        r.team_name === teamParam ||
        r.player_name === teamParam
    );
  }, [registrations, teamParam]);

  const primaryReg = teamRegs[0] || null;
  const registrationId = primaryReg?.id ?? null;

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

  // Set starting hole from pairings once we have reg + round
  useEffect(() => {
    if (!primaryReg || startHoleReady) return;
    const n = Number(event?.number_of_holes || 18) === 9 ? 9 : 18;
    const start = getStartingHole(primaryReg, selectedRoundId, n);
    setCurrentHole(start);
    setStartHoleReady(true);
  }, [primaryReg, selectedRoundId, event, startHoleReady]);

  // Load scores + realtime
  useEffect(() => {
    if (!registrationId) {
      setScores({});
      return;
    }

    const loadScores = async () => {
      let query = supabase
        .from('scores')
        .select('*')
        .eq('registration_id', registrationId);

      if (selectedRoundId != null) {
        query = query.eq('round_id', selectedRoundId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Load scores error:', error);
        return;
      }

      const map: Record<number, number> = {};
      (data || []).forEach((s: any) => {
        map[s.hole] = s.score;
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
          filter: `registration_id=eq.${registrationId}`,
        },
        () => {
          loadScores();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [registrationId, selectedRoundId]);

  // Keep input in sync when hole or scores change
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
    if (!registrationId) {
      alert('Could not find your registration. Check the link (?team=...).');
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
      const targets =
        teamRegs.length > 0 ? teamRegs.map((r) => r.id) : [registrationId];

      const allRows = targets.map((regId) => ({
        registration_id: Number(regId),
        hole: currentHole,
        score: num,
        ...(selectedRoundId != null ? { round_id: selectedRoundId } : {}),
      }));

      const { error } = await supabase.from('scores').upsert(allRows, {
        onConflict:
          selectedRoundId != null
            ? 'registration_id,hole,round_id'
            : 'registration_id,hole',
      });

      if (error) throw error;

      setScores((prev) => ({ ...prev, [currentHole]: num }));
      setSaveMsg('Saved');
      // advance to next hole (wrap)
      setCurrentHole((h) => (h >= numHoles ? 1 : h + 1));
    } catch (err: any) {
      console.error(err);
      alert('Failed to save: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
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
        {/* Header */}
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
            {/* Hole header — centered */}
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
                Total: {totalScore || '—'}
              </p>
            </div>

            {/* Spacer pushes entry box toward bottom */}
            <div className="flex-1 min-h-[40px]" />

            {/* Score entry box */}
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

            {/* Mini hole dots */}
            <div className="flex flex-wrap justify-center gap-1.5 pb-4">
              {Array.from({ length: numHoles }, (_, i) => {
                const h = i + 1;
                const has = scores[h] != null && scores[h] > 0;
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setCurrentHole(h)}
                    className={`w-8 h-8 rounded-full text-xs font-medium ${
                      h === currentHole
                        ? 'bg-blue-600 text-white'
                        : has
                          ? 'bg-emerald-900 text-emerald-300'
                          : 'bg-gray-800 text-gray-500'
                    }`}
                  >
                    {h}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'leaderboard' && (
          <div className="bg-gray-900 rounded-3xl p-8 text-center text-gray-400">
            <p className="mb-4">Full leaderboard is on the event page.</p>
            <a
              href={`/event/${eventId}/leaderboard`}
              className="text-blue-400 hover:text-blue-300 underline"
            >
              Open Leaderboard →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}