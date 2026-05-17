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
      [playerId]: {
        ...(prev[playerId] || {}),
        [hole]: score
      }
    }));
  };

  const getTeamMembers = () => {
    return registrations.filter(r => 
      r.checked_in && 
      (r.team_name === team?.name || String(r.id) === teamParam)
    );
  };

  const numHoles = event?.number_of_holes || 18;

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

        {/* Tabs */}
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

        {/* SCORECARD TAB - FIXED INPUTS */}
        {activeTab === 'scorecard' && (
          <div className="bg-gray-900 rounded-3xl p-6 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-800">
                  <th className="text-left py-5 px-6 font-medium">Player</th>
                  {Array.from({ length: numHoles }, (_, i) => (
                    <th key={i} className="text-center py-5 px-3 font-bold text-sm">{i + 1}</th>
                  ))}
                  <th className="text-center py-5 px-6 font-bold">OUT</th>
                  <th className="text-center py-5 px-6 font-bold">IN</th>
                  <th className="text-center py-5 px-6 font-bold">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {getTeamMembers().map((player: any) => {
                  const scores = playerScores[player.id] || {};
                  const frontTotal = Array.from({ length: 9 }, (_, i) => scores[i + 1] || 0).reduce((a, b) => a + b, 0);
                  const backTotal = Array.from({ length: 9 }, (_, i) => scores[i + 10] || 0).reduce((a, b) => a + b, 0);
                  const grandTotal = frontTotal + backTotal;

                  return (
                    <tr key={player.id} className="border-b border-gray-700 hover:bg-gray-800">
                      <td className="py-5 px-6 font-medium">{player.player_name}</td>
                      {Array.from({ length: numHoles }, (_, i) => {
                        const hole = i + 1;
                        return (
                          <td key={hole} className="text-center">
                            <input
                              type="number"
                              min="0"
                              max="20"
                              value={scores[hole] ?? ''}
                              onChange={(e) => updateScore(player.id, hole, parseInt(e.target.value) || 0)}
                              className="w-14 bg-gray-800 border border-gray-600 rounded-2xl text-center py-4 text-xl focus:outline-none focus:border-blue-500"
                            />
                          </td>
                        );
                      })}
                      <td className="text-center font-bold text-emerald-400">{frontTotal || '-'}</td>
                      <td className="text-center font-bold text-emerald-400">{backTotal || '-'}</td>
                      <td className="text-center font-bold text-2xl text-white">{grandTotal || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <button
              onClick={() => alert('Scores saved! (Supabase save coming in next step)')}
              className="mt-8 w-full bg-green-600 hover:bg-green-700 py-5 rounded-3xl text-xl font-semibold"
            >
              Save Scores
            </button>
          </div>
        )}

        {/* LEADERBOARD TAB (placeholder for now) */}
        {activeTab === 'leaderboard' && (
          <div className="bg-gray-900 rounded-3xl p-10 text-center text-gray-400">
            Leaderboard coming in the next update (with flight filter)
          </div>
        )}
      </div>
    </div>
  );
}