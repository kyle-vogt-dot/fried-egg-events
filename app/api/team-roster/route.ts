import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  assignCaptainIfNeeded,
  backfillEventCaptains,
  captainOfTeam,
  sameRosterPlayer,
  teamMembers,
} from '@/app/libs/league-roster';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function caller(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(
    'Bearer ',
    ''
  );
  if (!token) return null;
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const {
    data: { user },
  } = await userClient.auth.getUser();
  return user;
}

async function canManageTeam(
  sb: ReturnType<typeof admin>,
  user: { id: string; email?: string | null },
  eventId: number,
  teamName: string
) {
  const { data: event } = await sb
    .from('tournaments')
    .select('id, created_by, roster_max, max_teammates')
    .eq('id', eventId)
    .single();
  if (!event) return { ok: false as const, error: 'Event not found' };

  const email = String(user.email || '').toLowerCase();
  const isCreator = String(event.created_by || '') === String(user.id);
  const { data: adminRow } = await sb
    .from('event_admins')
    .select('id')
    .eq('event_id', eventId)
    .or(`user_id.eq.${user.id},email.eq."${email}"`)
    .maybeSingle();

  const { data: regs } = await sb
    .from('event_registrations')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });

  const members = teamMembers(regs || [], teamName);
  const isAdmin = isCreator || !!adminRow;
  if (members.length === 0 && !isAdmin) {
    return { ok: false as const, error: 'Team not found' };
  }

  const isCaptain = sameRosterPlayer(captainOfTeam(members), user);
  if (!isAdmin && !isCaptain) {
    return { ok: false as const, error: 'Not allowed' };
  }

  const maxRoster =
    Number(event.roster_max) || Number(event.max_teammates) || 6;

  return { ok: true as const, members, maxRoster };
}

export async function POST(req: NextRequest) {
  try {
    const user = await caller(req);
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const body = await req.json();
    const action = String(body.action || '');
    const eventId = Number(body.event_id);
    const teamName = String(body.team_name || '').trim();
    if (!eventId) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const sb = admin();
    if (action === 'backfill') {
      const email = String(user.email || '').toLowerCase();
      const { data: event } = await sb
        .from('tournaments')
        .select('id, created_by')
        .eq('id', eventId)
        .single();
      const isCreator =
        String(event?.created_by || '') === String(user.id);
      const { data: adminRow } = await sb
        .from('event_admins')
        .select('id')
        .eq('event_id', eventId)
        .or(`user_id.eq.${user.id},email.eq."${email}"`)
        .maybeSingle();
      const { data: mine } = await sb
        .from('event_registrations')
        .select('id')
        .eq('event_id', eventId)
        .or(
          `user_id.eq.${user.id},player_email.eq.${email}`
        )
        .limit(1);
      if (!isCreator && !adminRow && !(mine || []).length) {
        return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
      }
      await backfillEventCaptains(sb, eventId);
      return NextResponse.json({ ok: true });
    }

    if (!teamName) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const access = await canManageTeam(sb, user, eventId, teamName);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: 403 });
    }

    if (action === 'add') {
      const name = String(body.player_name || '').trim();
      const email = String(body.player_email || '')
        .trim()
        .toLowerCase();
      if (!name) {
        return NextResponse.json(
          { error: 'Name is required' },
          { status: 400 }
        );
      }
      if (access.members.length >= access.maxRoster) {
        return NextResponse.json(
          { error: `Roster full (${access.maxRoster}/${access.maxRoster})` },
          { status: 400 }
        );
      }
      const firstOnTeam = access.members.length === 0;
      const { error } = await sb.from('event_registrations').insert({
        event_id: eventId,
        player_name: name,
        player_email: email || null,
        team_name: teamName,
        paid: true,
        payment_method: 'roster',
        amount_paid: 0,
        checked_in: false,
        is_captain: firstOnTeam,
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (!firstOnTeam) {
        await assignCaptainIfNeeded(sb, eventId, teamName);
      }
      return NextResponse.json({ ok: true });
    }

    if (action === 'edit') {
      const registrationId = body.registration_id;
      const name = String(body.player_name || '').trim();
      const email = String(body.player_email || '')
        .trim()
        .toLowerCase();
      if (!registrationId || !name) {
        return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
      }
      const target = access.members.find(
        (r) => String(r.id) === String(registrationId)
      );
      if (!target) {
        return NextResponse.json(
          { error: 'Player is not on this team' },
          { status: 400 }
        );
      }
      const { error } = await sb
        .from('event_registrations')
        .update({
          player_name: name,
          player_email: email || null,
        })
        .eq('id', registrationId)
        .eq('event_id', eventId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === 'remove') {
      const registrationId = body.registration_id;
      if (!registrationId) {
        return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
      }
      const target = access.members.find(
        (r) => String(r.id) === String(registrationId)
      );
      if (!target) {
        return NextResponse.json(
          { error: 'Player is not on this team' },
          { status: 400 }
        );
      }
      const { error } = await sb
        .from('event_registrations')
        .delete()
        .eq('id', registrationId)
        .eq('event_id', eventId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || 'Failed' },
      { status: 500 }
    );
  }
}
