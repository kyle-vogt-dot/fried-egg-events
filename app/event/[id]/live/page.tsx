'use client';

import { useState, useEffect, useMemo } from 'react';
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

 const getHolesFromCourseData = (courseData: any, numHoles: number = 18) => {
  if (!courseData) {
    return Array.from({ length: numHoles }, () => ({ par: 4, yardage: 0, handicap: 0 }));
  }

  let holes: any[] = [];

  if (courseData.scorecard && Array.isArray(courseData.scorecard)) {
    holes = courseData.scorecard.map((h: any) => ({
      par: Number(h.Par) || 4,
      yardage: Number(h.yardage) || Number(h.distance) || 0,
      handicap: Number(h.Handicap) || 0,
      hole: Number(h.Hole) || 0
    }));
  } else if (courseData.holes && Array.isArray(courseData.holes)) {
    holes = courseData.holes;
  }

  return holes.length > 0 ? holes.slice(0, numHoles) : 
         Array.from({ length: numHoles }, () => ({ par: 4, yardage: 0, handicap: 0 }));
};
const holes = getHolesFromCourseData(event?.course_data, event?.number_of_holes || 18);
  const numHoles = event?.number_of_holes || 18;

  const frontHoles = holes.slice(0, 9);
  const backHoles = holes.slice(9, 18);

  const frontPar = frontHoles.reduce((sum, h) => sum + (h?.par || 4), 0);
  const backPar = backHoles.reduce((sum, h) => sum + (h?.par || 4), 0);
  const frontYds = frontHoles.reduce((sum, h) => sum + (h?.yardage || 0), 0);
  const backYds = backHoles.reduce((sum, h) => sum + (h?.yardage || 0), 0);

  const teamId = team?.id || 'team';
  const currentScores = playerScores[teamId] || {};

  const frontScore = Array.from({ length: 9 }, (_, i) => currentScores[i + 1] || 0).reduce((a, b) => a + b, 0);
  const backScore = Array.from({ length: 9 }, (_, i) => currentScores[i + 10] || 0).reduce((a, b) => a + b, 0);
  const totalScore = frontScore + backScore;

  const saveScores = async () => {
    setSaving(true);
    const teamMembers = getTeamMembers();
    try {
      const allScores: any[] = [];

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

      const { error } = await supabase.from('scores').upsert(allScores, { onConflict: 'registration_id,hole' });
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
        {/* Team Name at Top */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold">{team?.name}</h1>
            <p className="text-gray-400">{event?.course || 'Tournament'} • {numHoles} Holes</p>
          </div>
          <div className="text-sm bg-green-600 px-6 py-3 rounded-3xl">LIVE</div>
        </div>

        <div className="flex border-b border-gray-700 mb-8">
          <button onClick={() => setActiveTab('scorecard')} className={`flex-1 md:flex-none px-8 py-4 text-lg font-medium ${activeTab === 'scorecard' ? 'border-b-4 border-blue-500 text-white' : 'text-gray-400'}`}>My Scorecard</button>
          <button onClick={() => setActiveTab('leaderboard')} className={`flex-1 md:flex-none px-8 py-4 text-lg font-medium ${activeTab === 'leaderboard' ? 'border-b-4 border-blue-500 text-white' : 'text-gray-400'}`}>Leaderboard</button>
        </div>

        {activeTab === 'scorecard' && (
          <div className="bg-gray-900 rounded-3xl p-6 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-800">
                  <th className="text-left py-5 px-6 font-medium">HOLE</th>
                  {Array.from({ length: 9 }, (_, i) => <th key={i} className="text-center py-5 px-3 font-bold text-sm">{i+1}</th>)}
                  <th className="text-center py-5 px-6 font-bold bg-gray-700">OUT</th>
                  {Array.from({ length: 9 }, (_, i) => <th key={i} className="text-center py-5 px-3 font-bold text-sm">{i+10}</th>)}
                  <th className="text-center py-5 px-6 font-bold bg-gray-700">IN</th>
                  <th className="text-center py-5 px-6 font-bold bg-gray-700">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {/* PAR */}
                <tr className="border-b border-gray-700">
                  <td className="py-4 px-6 font-bold bg-gray-800 text-gray-300">PAR</td>
                  {holes.slice(0,9).map((h,i) => <td key={i} className="text-center py-4">{h?.par||4}</td>)}
                  <td className="text-center font-bold text-emerald-400">{frontPar}</td>
                  {holes.slice(9,18).map((h,i) => <td key={i} className="text-center py-4">{h?.par||4}</td>)}
                  <td className="text-center font-bold text-emerald-400">{backPar}</td>
                  <td className="text-center font-bold text-emerald-400">{frontPar + backPar}</td>
                </tr>

                {/* YDS */}
                <tr className="border-b border-gray-700">
                  <td className="py-4 px-6 font-bold bg-gray-800 text-gray-300">YDS</td>
                  {holes.slice(0,9).map((h,i) => <td key={i} className="text-center py-4 text-sm">{h?.yardage||'—'}</td>)}
                  <td className="text-center font-bold text-emerald-400">{frontYds}</td>
                  {holes.slice(9,18).map((h,i) => <td key={i} className="text-center py-4 text-sm">{h?.yardage||'—'}</td>)}
                  <td className="text-center font-bold text-emerald-400">{backYds}</td>
                  <td className="text-center font-bold text-emerald-400">{frontYds + backYds}</td>
                </tr>

                {/* HCP */}
                <tr className="border-b border-gray-700">
                  <td className="py-4 px-6 font-bold bg-gray-800 text-gray-300">HCP</td>
                  {holes.slice(0,9).map((h,i) => <td key={i} className="text-center py-4 text-sm">{h?.handicap||'—'}</td>)}
                  <td className="text-center font-bold text-emerald-400">—</td>
                  {holes.slice(9,18).map((h,i) => <td key={i} className="text-center py-4 text-sm">{h?.handicap||'—'}</td>)}
                  <td className="text-center font-bold text-emerald-400">—</td>
                  <td className="text-center font-bold text-emerald-400">—</td>
                </tr>

                {/* YOUR SCORE ROW */}
                <tr className="border-b border-gray-700 bg-emerald-900/20">
                  <td className="py-5 px-6 font-bold bg-emerald-900/30">{team?.name}</td>
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
                  <td className="text-center font-bold text-emerald-400">{frontScore}</td>
                  <td className="text-center font-bold text-emerald-400">{backScore}</td>
                  <td className="text-center font-bold text-2xl text-white">{totalScore}</td>
                </tr>
              </tbody>
            </table>

            <button
              onClick={saveScores}
              disabled={saving}
              className="mt-10 w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 py-6 rounded-3xl text-2xl font-semibold"
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