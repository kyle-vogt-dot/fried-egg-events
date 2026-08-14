'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
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

function getPairingForRound(
  player: any,
  roundId: number | 'all'
): { hole: number | null; slot: string | null; label: string } {
  if (roundId !== 'all') {
    const map = player.round_pairings || {};
    const entry = map[String(roundId)] || map[roundId as number];
    if (entry?.hole && entry?.slot) {
      return {
        hole: Number(entry.hole),
        slot: entry.slot,
        label: `${entry.hole} - ${entry.slot}`,
      };
    }
    return { hole: null, slot: null, label: '—' };
  }

  if (player.pairing_hole && player.pairing_slot) {
    return {
      hole: Number(player.pairing_hole),
      slot: player.pairing_slot,
      label: `${player.pairing_hole} - ${player.pairing_slot}`,
    };
  }

  const map = player.round_pairings || {};
  const first = Object.values(map)[0] as any;
  if (first?.hole && first?.slot) {
    return {
      hole: Number(first.hole),
      slot: first.slot,
      label: `${first.hole} - ${first.slot}`,
    };
  }

  return { hole: null, slot: null, label: '—' };
}

function countTeams(regs: any[]) {
  const names = new Set(
    regs
      .map((r) => (r.team_name || '').trim())
      .filter((n) => n && n.toLowerCase() !== 'individual')
  );
  return names.size;
}

export default function RegisteredPlayersPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const eventId = params.id;

  const [event, setEvent] = useState<any>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [rounds, setRounds] = useState<any[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState<number | 'all'>('all');
  const [loading, setLoading] = useState(true);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const fetchData = async () => {
      const id = parseInt(eventId);

      const { data: eventData } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', id)
        .single();

      if (eventData) setEvent(eventData);

      const { data: roundsData } = await supabase
        .from('event_rounds')
        .select('*')
        .eq('event_id', id)
        .order('sort_order', { ascending: true });

      setRounds(roundsData || []);

      if (roundsData && roundsData.length > 0) {
        setSelectedRoundId(roundsData[0].id);
      }

      const { data: regData } = await supabase
        .from('event_registrations')
        .select('*')
        .eq('event_id', id)
        .order('created_at', { ascending: true });

      const isListableReg = (r: any) => {
        if (r.paid === true) return true;
        const m = String(r.payment_method || '').toLowerCase();
        return ['comp', 'complimentary', 'cash', 'manual', 'checkin'].includes(m);
      };

      setRegistrations((regData || []).filter(isListableReg));
      setLoading(false);
    };

    fetchData();
  }, [eventId]);

  const selectedRound = useMemo(() => {
    if (selectedRoundId === 'all') return null;
    return rounds.find((r) => r.id === selectedRoundId) || null;
  }, [rounds, selectedRoundId]);

  const filteredRegistrations = useMemo(() => {
    if (selectedRoundId === 'all') return registrations;

    return registrations.filter((r) => {
      const ids: number[] = r.selected_round_ids || [];
      if (!ids.length) return rounds.length <= 1;
      return ids.includes(selectedRoundId as number);
    });
  }, [registrations, selectedRoundId, rounds.length]);

  const grouped = useMemo(() => {
    return filteredRegistrations.reduce(
      (acc: Record<string, any[]>, reg: any) => {
        const team = reg.team_name || 'Individual';
        if (!acc[team]) acc[team] = [];
        acc[team].push(reg);
        return acc;
      },
      {}
    );
  }, [filteredRegistrations]);

  const sortedTeamEntries = useMemo(() => {
    return Object.entries(grouped).sort(([, aPlayers], [, bPlayers]) => {
      const a = getPairingForRound(aPlayers[0], selectedRoundId);
      const b = getPairingForRound(bPlayers[0], selectedRoundId);

      const aHole = a.hole ?? 999;
      const bHole = b.hole ?? 999;
      if (aHole !== bHole) return aHole - bHole;
      const aSlot = a.slot === 'B' ? 1 : 0;
      const bSlot = b.slot === 'B' ? 1 : 0;
      return aSlot - bSlot;
    });
  }, [grouped, selectedRoundId]);

  const teamCount = useMemo(
    () => countTeams(filteredRegistrations),
    [filteredRegistrations]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        Loading registered players...
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        Event not found
      </div>
    );
  }

  const headerTeeTime = selectedRound
    ? formatRoundTime(selectedRound.start_time)
    : null;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <button
          onClick={() => router.push(`/event/${eventId}`)}
          className="text-gray-400 hover:text-white flex items-center gap-2 mb-6"
        >
          ← Back to Event Details
        </button>

        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-10">
          <div>
            <h1 className="text-4xl font-bold">{event.name}</h1>
            <p className="text-gray-400 mt-2">
              Registered Players ({filteredRegistrations.length}
              {selectedRoundId !== 'all' ? ' in this round' : ''}
              {teamCount > 0
                ? ` · ${teamCount} team${teamCount === 1 ? '' : 's'}`
                : ''}
              )
              {event.course ? ` · ${event.course}` : ''}
              {headerTeeTime ? ` · ${headerTeeTime}` : ''}
            </p>
            {selectedRound && (
              <p className="text-sm text-teal-400 mt-1">
                Showing: {selectedRound.name}
                {headerTeeTime ? ` (${headerTeeTime})` : ''}
              </p>
            )}
          </div>

          {rounds.length > 0 && (
            <div className="w-full lg:w-72">
              <label className="block text-sm text-gray-400 mb-2">
                View pairings by round
              </label>
              <select
                value={
                  selectedRoundId === 'all' ? 'all' : String(selectedRoundId)
                }
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedRoundId(v === 'all' ? 'all' : parseInt(v, 10));
                }}
                className="w-full bg-gray-800 border border-gray-600 rounded-2xl px-5 py-4 text-white"
              >
                <option value="all">All rounds</option>
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
            </div>
          )}
        </div>

        {filteredRegistrations.length === 0 ? (
          <div className="bg-gray-800 rounded-3xl p-16 text-center">
            <p className="text-2xl text-gray-400">
              {selectedRoundId === 'all'
                ? 'No players have registered yet.'
                : 'No players registered for this round.'}
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {sortedTeamEntries.map(([teamName, players]) => {
              const teamPairing = getPairingForRound(
                players[0],
                selectedRoundId
              );

              return (
                <div key={teamName} className="bg-gray-800 rounded-3xl p-8">
                  <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
                    <div>
                      <h2 className="text-2xl font-semibold">{teamName}</h2>
                      <p className="text-sm text-teal-400 mt-1">
                        Pairing: {teamPairing.label}
                      </p>
                    </div>
                    <span className="text-gray-400">
                      {players.length} player
                      {players.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-700">
                          <th className="text-left py-5 px-8 font-medium text-gray-400">
                            Player
                          </th>
                          <th className="text-left py-5 px-8 font-medium text-gray-400">
                            Team
                          </th>
                          <th className="text-left py-5 px-8 font-medium text-gray-400">
                            Handicap
                          </th>
                          <th className="text-left py-5 px-8 font-medium text-gray-400">
                            Pairings
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {players.map((player: any) => {
                          const pairing = getPairingForRound(
                            player,
                            selectedRoundId
                          );
                          return (
                            <tr
                              key={player.id}
                              className="border-b border-gray-700 last:border-none hover:bg-gray-750"
                            >
                              <td className="py-5 px-8 font-medium">
                                {player.player_name || 'Unknown Player'}
                              </td>
                              <td className="py-5 px-8 text-gray-300">
                                {player.team_name || '—'}
                              </td>
                              <td className="py-5 px-8 text-gray-300">
                                {player.handicap !== null &&
                                player.handicap !== undefined
                                  ? player.handicap
                                  : 'N/A'}
                              </td>
                              <td className="py-5 px-8 text-teal-300 font-medium">
                                {pairing.label}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}