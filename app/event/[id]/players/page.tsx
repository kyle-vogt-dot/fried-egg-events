'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export default function RegisteredPlayersPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const [event, setEvent] = useState<any>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const fetchData = async () => {
      // Fetch event
      const { data: eventData } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', parseInt(eventId))
        .single();

      if (eventData) setEvent(eventData);

      // Fetch registrations with new columns
      const { data: regData, error } = await supabase
        .from('event_registrations')
        .select('*')
        .eq('event_id', parseInt(eventId))
        .order('created_at', { ascending: true });

      if (error) {
        console.error("Error fetching registrations:", error);
      } else {
        console.log("Fetched registrations:", regData);
        setRegistrations(regData || []);
      }

      setLoading(false);
    };

    fetchData();
  }, [eventId]);

  if (loading) {
    return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading registered players...</div>;
  }

  if (!event) {
    return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Event not found</div>;
  }

  // Group by team name
  const grouped = registrations.reduce((acc: Record<string, any[]>, reg: any) => {
    const team = reg.team_name || 'Individual';
    if (!acc[team]) acc[team] = [];
    acc[team].push(reg);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-10">
          <div>
            <button 
              onClick={() => router.push(`/event/${eventId}`)}
              className="text-gray-400 hover:text-white flex items-center gap-2 mb-4"
            >
              ← Back to Event Details
            </button>
            <h1 className="text-4xl font-bold">{event.name}</h1>
            <p className="text-gray-400">Registered Players ({registrations.length})</p>
          </div>
          
          <button
            onClick={() => router.push(`/event/${eventId}/admin`)}
            className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-2xl font-medium"
          >
            Go to Full Admin
          </button>
        </div>

        {registrations.length === 0 ? (
          <div className="bg-gray-800 rounded-3xl p-16 text-center">
            <p className="text-2xl text-gray-400">No players have registered yet.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {Object.entries(grouped).map(([teamName, players]) => (
              <div key={teamName} className="bg-gray-800 rounded-3xl p-8">
                <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
                  <h2 className="text-2xl font-semibold">{teamName}</h2>
                  <span className="text-gray-400">
                    {players.length} player{players.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left py-5 px-8 font-medium text-gray-400">Player</th>
                        <th className="text-left py-5 px-8 font-medium text-gray-400">Team Name</th>
                        <th className="text-left py-5 px-8 font-medium text-gray-400">Handicap</th>
                        <th className="text-left py-5 px-8 font-medium text-gray-400">Pairings / Tee Time</th>
                        <th className="text-left py-5 px-8 font-medium text-gray-400">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {players.map((player: any) => (
                        <tr key={player.id} className="border-b border-gray-700 last:border-none hover:bg-gray-750">
                          <td className="py-5 px-8 font-medium">
                            {player.player_name || 'Unknown Player'}
                          </td>
                          <td className="py-5 px-8 text-gray-300">
                            {player.team_name || '—'}
                          </td>
                          <td className="py-5 px-8 text-gray-300">
                            {player.handicap !== null && player.handicap !== undefined 
                              ? player.handicap 
                              : 'N/A'}
                          </td>
                          <td className="py-5 px-8 text-gray-300">
                            {player.tee_time || 'N/A'}
                          </td>
                          <td className="py-5 px-8">
                            {player.paid ? (
                              <span className="text-green-400">✅ Paid</span>
                            ) : (
                              <span className="text-yellow-400">⏳ Pending</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}