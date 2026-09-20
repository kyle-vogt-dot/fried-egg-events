'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { isLeagueEvent } from '@/app/libs/league-match';
import LeagueLeaderboard from './LeagueLeaderboard';
import LiveEventPage from '../live/page';

/** Player leaderboard. Admin leaderboard is /event/[id]/manage/leaderboard. */
export default function EventLeaderboardPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const eventId = params.id as string;
  const roundQuery = Number(searchParams.get('round') || '');
  const initialRoundId =
    Number.isFinite(roundQuery) && roundQuery > 0 ? roundQuery : null;

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', parseInt(eventId, 10))
        .single();
      setEvent(data);
      setLoading(false);
    };
    load();
  }, [eventId, supabase]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        Loading leaderboard...
      </div>
    );
  }

  if (isLeagueEvent(event)) {
    const viewQuery = searchParams.get('view');
    const initialView =
      viewQuery === 'season' || viewQuery === 'tonight'
        ? viewQuery
        : 'tonight';
    return (
      <LeagueLeaderboard
        eventId={eventId}
        initialRoundId={initialRoundId}
        initialView={initialView}
      />
    );
  }

  return <LiveEventPage initialTab="leaderboard" />;
}
