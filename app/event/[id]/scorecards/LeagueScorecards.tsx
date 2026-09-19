'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import EventTabs from '@/app/components/EventTabs';
import BackButton from '@/app/components/BackButton';
import {
  holeMark,
  matchThruStatus,
  parseLineupIds,
  scoresFromRegs,
} from '@/app/libs/league-match';

export default function LeagueScorecards({ eventId }: { eventId: string }) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const [event, setEvent] = useState<any>(null);
  const [rounds, setRounds] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [lineups, setLineups] = useState<any[]>([]);
  const [playerScores, setPlayerScores] = useState<
    Record<string, Record<number, number>>
  >({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const holes = 9;

  useEffect(() => {
    const load = async () => {
      const id = parseInt(eventId, 10);
      const { data: ev } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', id)
        .single();
      setEvent(ev);
      const { data: roundsData } = await supabase
        .from('event_rounds')
        .select('*')
        .eq('event_id', id)
        .order('sort_order', { ascending: true });
      setRounds(roundsData || []);
      const { data: res } = await supabase
        .from('league_week_results')
        .select('*')
        .eq('event_id', id);
      setResults(res || []);
      const { data: matchRows } = await supabase
        .from('league_matches')
        .select('*')
        .eq('event_id', id);
      setMatches(matchRows || []);
      const { data: lu } = await supabase
        .from('league_lineups')
        .select('*')
        .eq('event_id', id);
      setLineups(lu || []);
      const ids = (lu || []).flatMap((row) =>
        parseLineupIds(row.registration_ids)
      );
      const loaded: Record<string, Record<number, number>> = {};
      if (ids.length) {
        const { data: scores } = await supabase
          .from('scores')
          .select('*')
          .in('registration_id', ids);
        for (const s of scores || []) {
          const rid = String(s.registration_id);
          const key = `${s.round_id}:${rid}`;
          if (!loaded[key]) loaded[key] = {};
          loaded[key][s.hole] = s.score;
        }
      }
      setPlayerScores(loaded);
      setLoading(false);
    };
    load();
  }, [eventId, supabase]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        Loading scorecards...
      </div>
    );
  }

  const submittedRoundIds = new Set(
    results.map((r) => Number(r.round_id))
  );
  const submittedMatches = matches.filter(
    (m) => m.away_team && submittedRoundIds.has(Number(m.round_id))
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
        <BackButton
          href="/events"
          className="mb-6 text-gray-400 hover:text-white"
        />
        <EventTabs eventId={eventId} variant="dayof" active="scorecards" />
        <h1 className="text-4xl font-bold mb-2">{event?.name}</h1>
        <p className="text-gray-400 mb-8">Submitted matches (read-only)</p>
        {submittedMatches.length === 0 ? (
          <p className="text-gray-400">No submitted matches yet.</p>
        ) : (
          <div className="space-y-4">
            {submittedMatches.map((m) => {
              const round = rounds.find(
                (r) => Number(r.id) === Number(m.round_id)
              );
              const homeLu = lineups.find(
                (l) =>
                  l.team_name === m.home_team &&
                  Number(l.round_id) === Number(m.round_id)
              );
              const awayLu = lineups.find(
                (l) =>
                  l.team_name === m.away_team &&
                  Number(l.round_id) === Number(m.round_id)
              );
              const homeIds = parseLineupIds(homeLu?.registration_ids);
              const awayIds = parseLineupIds(awayLu?.registration_ids);
              const homeScores: Record<number, number> = {};
              const awayScores: Record<number, number> = {};
              for (const id of homeIds) {
                const s = playerScores[`${m.round_id}:${id}`] || {};
                Object.assign(homeScores, s);
              }
              for (const id of awayIds) {
                const s = playerScores[`${m.round_id}:${id}`] || {};
                Object.assign(awayScores, s);
              }
              const status = matchThruStatus(
                m.home_team,
                m.away_team,
                homeScores,
                awayScores,
                holes
              );
              const open = openId === m.id;
              return (
                <div key={m.id} className="bg-gray-800 rounded-3xl p-5">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : m.id)}
                    className="w-full text-left"
                  >
                    <div className="font-semibold">
                      {round?.name || 'Week'} · {m.home_team} vs {m.away_team}
                    </div>
                    <div className="text-sm text-emerald-400 mt-1">
                      {status.header}
                    </div>
                  </button>
                  {open && (
                    <div className="mt-4 space-y-1 text-sm">
                      {Array.from({ length: holes }, (_, i) => {
                        const h = i + 1;
                        const hs = Number(homeScores[h] || 0);
                        const as = Number(awayScores[h] || 0);
                        const mark = holeMark(hs, as);
                        return (
                          <div
                            key={h}
                            className="grid grid-cols-4 gap-2 text-gray-300"
                          >
                            <span>{h}</span>
                            <span>{hs || '—'}</span>
                            <span className="text-center">
                              {mark === 'H' ? '½' : mark || '—'}
                            </span>
                            <span className="text-right">{as || '—'}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
