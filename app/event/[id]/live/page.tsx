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

  if (courseData.scorecard && Array.isArray(courseData.scorecard) && courseData.scorecard.length > 0) {
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
  // scores keyed by registration_id (number as string in object keys is fine)
  const [scores, setScores] = useState<Record<number, number>>({});
  const [activeTab, setActiveTab] = useState<'scorecard' | 'leaderboard'>('scorecard');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const numHoles = useMemo(() => {
    const n = Number(event?.number_of_holes || 18);
    return n === 9 ? 9 : 18;
  }, [event]);

  const holes = useMemo(
    () => getHolesFromCourseData(event?.course_data, numHoles),
    [event?.course_data, numHoles]
  );

  // Resolve this team's registration rows from ?team=
  const teamRegs = useMemo(() => {
    if (!teamParam || !registrations.length) return [];
    return registrations.filter(
      (r) =>
        String(r.id) === teamParam ||
        r.team_name === teamParam ||
        r.player_name === teamParam
    );
  }, [registrations, teamParam]);

  // One registration drives the scorecard (team scramble = first member)
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

  // Load event, rounds, registrations
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

      // Prefer ?round=, else first round, else null
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

  // Load existing scores for this registration + round
  useEffect(() => {
    const loadScores = async () => {
      if (!registrationId) {
        setScores({});
        return;
      }

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
        // Fallback without round filter
        const { data: fallback } = await supabase
          .from('scores')
          .select('*')
          .eq('registration_id', registrationId);
        const map: Record<number, number> = {};
        (fallback || []).forEach((s: any) => {
          map[s.hole] = s.score;
        });
        setScores(map);
        return;
      }

      const map: Record<number, number> = {};
      (data || []).forEach((s: any) => {
        map[s.hole] = s.score;
      });
      setScores(map);
    };

    loadScores();
  }, [registrationId, selectedRoundId]);

  const frontCount = Math.min(9, numHoles);
  const backCount = Math.max(0, numHoles - 9);

  const frontScore = Array.from(
    { length: frontCount },
    (_, i) => scores[i + 1] || 0
  ).reduce((a, b) => a + b, 0);

  const backScore = Array.from(
    { length: backCount },
    (_, i) => scores[i + 10] || 0
  ).reduce((a, b) => a + b, 0);

  const totalScore = frontScore + backScore;

  const frontPar = holes
    .slice(0, frontCount)
    .reduce((sum, h) => sum + (h?.par || 4), 0);
  const backPar = holes
    .slice(frontCount, numHoles)
    .reduce((sum, h) => sum + (h?.par || 4), 0);
  const frontYds = holes
    .slice(0, frontCount)
    .reduce((sum, h) => sum + (h?.yardage || 0), 0);
  const backYds = holes
    .slice(frontCount, numHoles)
    .reduce((sum, h) => sum + (h?.yardage || 0), 0);

  const updateScore = (hole: number, value: string) => {
    const num = value === '' ? 0 : parseInt(value, 10);
    setScores((prev) => ({
      ...prev,
      [hole]: Number.isFinite(num) ? num : 0,
    }));
    setSaveMsg(null);
  };

  const saveScores = async () => {
    if (!registrationId) {
      alert('Could not find your registration. Check the link (?team=...).');
      return;
    }

    const entries = Object.entries(scores).filter(
      ([, score]) => score != null && Number(score) > 0
    );

    if (entries.length === 0) {
      alert('Enter at least one score before saving.');
      return;
    }

    setSaving(true);
    setSaveMsg(null);

    try {
      const rows = entries.map(([hole, score]) => ({
        registration_id: Number(registrationId),
        hole: parseInt(hole, 10),
        score: Number(score),
        ...(selectedRoundId != null ? { round_id: selectedRoundId } : {}),
      }));

      // Also write the same scores to every teammate registration (scramble)
      // so admin grouping still works if it keys off any member
      const targets =
        teamRegs.length > 0 ? teamRegs.map((r) => r.id) : [registrationId];

      const allRows = targets.flatMap((regId) =>
        entries.map(([hole, score]) => ({
          registration_id: Number(regId),
          hole: parseInt(hole, 10),
          score: Number(score),
          ...(selectedRoundId != null ? { round_id: selectedRoundId } : {}),
        }))
      );

      const { error } = await supabase.from('scores').upsert(allRows, {
        onConflict:
          selectedRoundId != null
            ? 'registration_id,hole,round_id'
            : 'registration_id,hole',
      });

      if (error) {
        // Fallback delete + insert for primary only
        console.warn('Upsert failed, trying delete+insert', error);
        let del = supabase
          .from('scores')
          .delete()
          .eq('registration_id', registrationId);
        if (selectedRoundId != null) del = del.eq('round_id', selectedRoundId);
        await del;

        const { error: insErr } = await supabase.from('scores').insert(rows);
        if (insErr) throw insErr;
      }

      setSaveMsg('✅ Scores saved — admin scoring & leaderboard will update');
    } catch (err: any) {
      console.error(err);
      alert('Failed to save scores: ' + (err.message || 'Unknown error'));
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
            Open this page from a scorecard QR / link that includes{' '}
            <code className="text-teal-400">?team=YourTeamName</code>
          </p>
        </div>
      </div>
    );
  }

  const teeTime = selectedRound
    ? formatRoundTime(selectedRound.start_time)
    : null;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">{teamLabel}</h1>
            <p className="text-gray-400 mt-1">
              {event?.course || 'Tournament'} · {numHoles} Holes
              {selectedRound ? ` · ${selectedRound.name}` : ''}
              {teeTime ? ` · ${teeTime}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {rounds.length > 0 && (
              <select
                value={selectedRoundId ?? ''}
                onChange={(e) =>
                  setSelectedRoundId(
                    e.target.value ? parseInt(e.target.value, 10) : null
                  )
                }
                className="bg-gray-800 border border-gray-600 rounded-2xl px-4 py-3"
              >
                {rounds.map((r) => {
                  const t = formatRoundTime(r.start_time);
                  return (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {t ? ` · ${t}` : ''}
                    </option>
                  );
                })}
              </select>
            )}
            <div className="text-sm bg-green-600 px-6 py-3 rounded-3xl font-medium">
              LIVE
            </div>
          </div>
        </div>

        <div className="flex border-b border-gray-700 mb-8">
          <button
            onClick={() => setActiveTab('scorecard')}
            className={`flex-1 md:flex-none px-8 py-4 text-lg font-medium ${
              activeTab === 'scorecard'
                ? 'border-b-4 border-blue-500 text-white'
                : 'text-gray-400'
            }`}
          >
            My Scorecard
          </button>
          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`flex-1 md:flex-none px-8 py-4 text-lg font-medium ${
              activeTab === 'leaderboard'
                ? 'border-b-4 border-blue-500 text-white'
                : 'text-gray-400'
            }`}
          >
            Leaderboard
          </button>
        </div>

        {activeTab === 'scorecard' && (
          <div className="bg-gray-900 rounded-3xl p-4 md:p-6 overflow-x-auto">
            <table className="w-full border-collapse min-w-[900px]">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-800">
                  <th className="text-left py-4 px-4 font-medium">HOLE</th>
                  {Array.from({ length: frontCount }, (_, i) => (
                    <th key={i} className="text-center py-4 px-2 font-bold text-sm">
                      {i + 1}
                    </th>
                  ))}
                  <th className="text-center py-4 px-4 font-bold bg-gray-700">
                    OUT
                  </th>
                  {Array.from({ length: backCount }, (_, i) => (
                    <th
                      key={i + 10}
                      className="text-center py-4 px-2 font-bold text-sm"
                    >
                      {i + 10}
                    </th>
                  ))}
                  {numHoles > 9 && (
                    <th className="text-center py-4 px-4 font-bold bg-gray-700">
                      IN
                    </th>
                  )}
                  <th className="text-center py-4 px-4 font-bold bg-gray-700">
                    TOTAL
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* PAR */}
                <tr className="border-b border-gray-700">
                  <td className="py-3 px-4 font-bold bg-gray-800 text-gray-300">
                    PAR
                  </td>
                  {holes.slice(0, frontCount).map((h, i) => (
                    <td key={i} className="text-center py-3">
                      {h?.par || 4}
                    </td>
                  ))}
                  <td className="text-center font-bold text-emerald-400">
                    {frontPar}
                  </td>
                  {holes.slice(frontCount, numHoles).map((h, i) => (
                    <td key={i + 10} className="text-center py-3">
                      {h?.par || 4}
                    </td>
                  ))}
                  {numHoles > 9 && (
                    <td className="text-center font-bold text-emerald-400">
                      {backPar}
                    </td>
                  )}
                  <td className="text-center font-bold text-emerald-400">
                    {frontPar + backPar}
                  </td>
                </tr>

                {/* YDS */}
                <tr className="border-b border-gray-700">
                  <td className="py-3 px-4 font-bold bg-gray-800 text-gray-300">
                    YDS
                  </td>
                  {holes.slice(0, frontCount).map((h, i) => (
                    <td key={i} className="text-center py-3 text-sm">
                      {h?.yardage || '—'}
                    </td>
                  ))}
                  <td className="text-center font-bold text-emerald-400">
                    {frontYds || '—'}
                  </td>
                  {holes.slice(frontCount, numHoles).map((h, i) => (
                    <td key={i + 10} className="text-center py-3 text-sm">
                      {h?.yardage || '—'}
                    </td>
                  ))}
                  {numHoles > 9 && (
                    <td className="text-center font-bold text-emerald-400">
                      {backYds || '—'}
                    </td>
                  )}
                  <td className="text-center font-bold text-emerald-400">
                    {frontYds + backYds || '—'}
                  </td>
                </tr>

                {/* HCP */}
                <tr className="border-b border-gray-700">
                  <td className="py-3 px-4 font-bold bg-gray-800 text-gray-300">
                    HCP
                  </td>
                  {holes.slice(0, frontCount).map((h, i) => (
                    <td key={i} className="text-center py-3 text-sm">
                      {h?.handicap || '—'}
                    </td>
                  ))}
                  <td className="text-center text-gray-500">—</td>
                  {holes.slice(frontCount, numHoles).map((h, i) => (
                    <td key={i + 10} className="text-center py-3 text-sm">
                      {h?.handicap || '—'}
                    </td>
                  ))}
                  {numHoles > 9 && (
                    <td className="text-center text-gray-500">—</td>
                  )}
                  <td className="text-center text-gray-500">—</td>
                </tr>

                {/* SCORE */}
                <tr className="border-b border-gray-700 bg-emerald-900/20">
                  <td className="py-4 px-4 font-bold bg-emerald-900/30">
                    {teamLabel}
                  </td>

                  {Array.from({ length: frontCount }, (_, i) => {
                    const hole = i + 1;
                    return (
                      <td key={hole} className="text-center p-1">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={20}
                          value={scores[hole] || ''}
                          onChange={(e) => updateScore(hole, e.target.value)}
                          className="w-12 md:w-14 bg-gray-800 border border-emerald-600 rounded-2xl text-center py-3 text-lg focus:outline-none focus:border-emerald-400"
                        />
                      </td>
                    );
                  })}

                  <td className="text-center font-bold text-emerald-400 text-lg border-l-2 border-r-2 border-emerald-500">
                    {frontScore || '—'}
                  </td>

                  {Array.from({ length: backCount }, (_, i) => {
                    const hole = i + 10;
                    return (
                      <td key={hole} className="text-center p-1">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={20}
                          value={scores[hole] || ''}
                          onChange={(e) => updateScore(hole, e.target.value)}
                          className="w-12 md:w-14 bg-gray-800 border border-emerald-600 rounded-2xl text-center py-3 text-lg focus:outline-none focus:border-emerald-400"
                        />
                      </td>
                    );
                  })}

                  {numHoles > 9 && (
                    <td className="text-center font-bold text-emerald-400 text-lg">
                      {backScore || '—'}
                    </td>
                  )}
                  <td className="text-center font-bold text-2xl text-white">
                    {totalScore || '—'}
                  </td>
                </tr>
              </tbody>
            </table>

            <button
              onClick={saveScores}
              disabled={saving}
              className="mt-8 w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 py-5 md:py-6 rounded-3xl text-xl md:text-2xl font-semibold"
            >
              {saving ? 'Saving...' : '💾 Save Scores'}
            </button>

            {saveMsg && (
              <p className="mt-4 text-center text-emerald-400">{saveMsg}</p>
            )}
          </div>
        )}

        {activeTab === 'leaderboard' && (
          <div className="bg-gray-900 rounded-3xl p-10 text-center text-gray-400 py-20">
            <p className="mb-4">Full leaderboard is on the event Leaderboard page.</p>
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