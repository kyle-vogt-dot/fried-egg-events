'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export default function LiveEventPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const eventId = params.id as string;
  const teamParam = searchParams.get('team');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [event, setEvent] = useState<any>(null);
  const [team, setTeam] = useState<any>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [playerScores, setPlayerScores] = useState<Record<string, Record<number, number>>>({});
  const [activeTab, setActiveTab] = useState<'scorecard' | 'leaderboard'>('scorecard');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const { data: eventData } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', parseInt(eventId))
        .single();
      setEvent(eventData);

      const { data: regData } = await supabase
        .from('event_registrations')
        .select('*')
        .eq('event_id', parseInt(eventId));
      setRegistrations(regData || []);

      if (teamParam) {
        const teamRegs = regData?.filter(r => 
          String(r.id) === teamParam || r.team_name === teamParam
        ) || [];
        setTeam(teamRegs[0] || { name: 'Your Team' });
      }
      setLoading(false);
    };

    fetchData();
  }, [eventId, teamParam, supabase]);

  const updateScore = (playerId: number, hole: number, score: number) => {
    setPlayerScores(prev => ({
      ...prev,
      [playerId]: { ...(prev[playerId] || {}), [hole]: score }
    }));
  };

  const getTeamMembers = () => registrations.filter(r => 
    r.checked_in && (r.team_name === team?.name || String(r.id) === teamParam)
  );

  // Robust course data extraction (same as PDF)
  const getHolesFromCourseData = (courseData: any) => {
    if (!courseData) return Array.from({ length: 18 }, () => ({ par: 4, yardage: 0, handicap: 0 }));

    let holes: any[] = [];

    if (courseData.holes && Array.isArray(courseData.holes)) {
      holes = courseData.holes;
    } else if (courseData.course?.holes && Array.isArray(courseData.course.holes)) {
      holes = courseData.course.holes;
    }

    return holes.length > 0 ? holes : Array.from({ length: 18 }, () => ({ par: 4, yardage: 0, handicap: 0 }));
  };

  const holes = getHolesFromCourseData(event?.course_data);
  const numHoles = event?.number_of_holes || 18;

  const saveScores = async () => {
    setSaving(true);
    const teamMembers = getTeamMembers();
    try {
      const allScores: { registration_id: number; hole: number; score: number }[] = [];

      for (const player of teamMembers) {
        const scoresForPlayer = playerScores[player.id] || {};
        Object.entries(scoresForPlayer).forEach(([hole, score]) => {
          allScores.push({
            registration_id: player.id,
            hole: parseInt(hole),
            score: score,
          });
        });
      }

      if (allScores.length === 0) {
        alert("No scores to save");
        return;
      }

      const { error } = await supabase
        .from('scores')
        .upsert(allScores, { onConflict: 'registration_id,hole' });

      if (error) throw error;
      alert("✅ Scores saved successfully!");
    } catch (err: any) {
      console.error(err);
      alert("Failed to save scores");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-12 text-center text-xl">Loading live scorecard...</div>;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold">{team?.name || 'Live Scorecard'}</h1>
            <p className="text-gray-400">{event?.course || 'Tournament'} • {numHoles} Holes</p>
          </div>
          <div className="text-sm bg-green-600 px-6 py-3 rounded-3xl">LIVE</div>
        </div>

        <div className="flex border-b border-gray-700 mb-8">
          <button
            onClick={() => setActiveTab('scorecard')}
            className={`flex-1 md:flex-none px-8 py-4 text-lg font-medium ${activeTab === 'scorecard' ? 'border-b-4 border-blue-500 text-white' : 'text-gray-400'}`}
          >
            My Scorecard
          </button>
          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`flex-1 md:flex-none px-8 py-4 text-lg font-medium ${activeTab === 'leaderboard' ? 'border-b-4 border-blue-500 text-white' : 'text-gray-400'}`}
          >
            Leaderboard
          </button>
        </div>

        {activeTab === 'scorecard' && (
          <div className="bg-gray-900 rounded-3xl p-6 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-800">
                  <th className="text-left py-5 px-6 font-medium">HOLE</th>
                  {Array.from({ length: numHoles }, (_, i) => (
                    <th key={i} className="text-center py-5 px-3 font-bold text-sm">{i + 1}</th>
                  ))}
                  <th className="text-center py-5 px-6 font-bold">OUT</th>
                  <th className="text-center py-5 px-6 font-bold">IN</th>
                  <th className="text-center py-5 px-6 font-bold">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {/* PAR Row */}
                <tr className="border-b border-gray-700">
                  <td className="py-4 px-6 font-bold bg-gray-800 text-gray-300">PAR</td>
                  {holes.slice(0, numHoles).map((hole: any, i: number) => (
                    <td key={i} className="text-center py-4 font-medium">{hole?.par || 4}</td>
                  ))}
                  <td className="text-center font-bold text-emerald-400">—</td>
                  <td className="text-center font-bold text-emerald-400">—</td>
                  <td className="text-center font-bold text-emerald-400">—</td>
                </tr>

                {/* YDS Row */}
                <tr className="border-b border-gray-700">
                  <td className="py-4 px-6 font-bold bg-gray-800 text-gray-300">YDS</td>
                  {holes.slice(0, numHoles).map((hole: any, i: number) => (
                    <td key={i} className="text-center py-4 text-sm">{hole?.yardage || '—'}</td>
                  ))}
                  <td className="text-center font-bold text-emerald-400">—</td>
                  <td className="text-center font-bold text-emerald-400">—</td>
                  <td className="text-center font-bold text-emerald-400">—</td>
                </tr>

                {/* HCP Row */}
                <tr className="border-b border-gray-700">
                  <td className="py-4 px-6 font-bold bg-gray-800 text-gray-300">HCP</td>
                  {holes.slice(0, numHoles).map((hole: any, i: number) => (
                    <td key={i} className="text-center py-4 text-sm">{hole?.handicap || '—'}</td>
                  ))}
                  <td className="text-center font-bold text-emerald-400">—</td>
                  <td className="text-center font-bold text-emerald-400">—</td>
                  <td className="text-center font-bold text-emerald-400">—</td>
                </tr>

                {/* YOUR SCORE Row - only row now */}
                <tr className="border-b border-gray-700 bg-emerald-900/20">
                  <td className="py-5 px-6 font-bold bg-emerald-900/30">YOUR SCORE</td>
                  {Array.from({ length: numHoles }, (_, i) => {
                    const hole = i + 1;
                    const score = playerScores[team?.id]?.[hole] ?? '';
                    return (
                      <td key={hole} className="text-center">
                        <input
                          type="number"
                          min="0"
                          max="20"
                          value={score}
                          onChange={(e) => updateScore(team?.id || 0, hole, parseInt(e.target.value) || 0)}
                          className="w-14 bg-gray-800 border border-emerald-600 rounded-2xl text-center py-4 text-xl focus:outline-none focus:border-emerald-500"
                        />
                      </td>
                    );
                  })}
                  <td className="text-center font-bold text-emerald-400">—</td>
                  <td className="text-center font-bold text-emerald-400">—</td>
                  <td className="text-center font-bold text-2xl text-white">—</td>
                </tr>
              </tbody>
            </table>

            <button
              onClick={saveScores}
              disabled={saving}
              className="mt-10 w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 py-6 rounded-3xl text-2xl font-semibold flex items-center justify-center gap-3"
            >
              {saving ? 'Saving...' : '💾 Save All Scores'}
            </button>
          </div>
        )}

        {activeTab === 'leaderboard' && (
          <div className="bg-gray-900 rounded-3xl p-10 text-center text-gray-400 py-20">
            Leaderboard tab coming next!
          </div>
        )}
      </div>
    </div>
  );
}