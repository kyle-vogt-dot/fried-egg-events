'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  canEditTeamRoster,
  captainOfTeam,
  teamMembers,
} from '@/app/libs/league-roster';

export default function LeagueRosterTab({
  event,
  teamRoster,
  currentUser,
  isEventAdmin,
  myRegs,
  onRefresh,
}: {
  event: any;
  teamRoster: any[];
  currentUser: any;
  isEventAdmin: boolean;
  myRegs: any[];
  onRefresh: () => void;
}) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const teamName =
    myRegs.find((r) => r.team_name)?.team_name ||
    teamRoster.find(
      (r) =>
        r.user_id === currentUser?.id ||
        String(r.player_email || '').toLowerCase() ===
          String(currentUser?.email || '').toLowerCase()
    )?.team_name ||
    '';

  const roster = teamMembers(teamRoster, teamName);
  const maxRoster =
    Number(event.roster_max) || Number(event.max_teammates) || 6;
  const spotsLeft = Math.max(0, maxRoster - roster.length);
  const captain = captainOfTeam(roster);
  const canEdit = canEditTeamRoster({
    members: roster,
    user: currentUser,
    isEventAdmin,
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const callRoster = async (body: Record<string, any>) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const res = await fetch('/api/team-roster', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({
        event_id: event.id,
        team_name: teamName,
        ...body,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
  };

  if (!teamName) {
    return (
      <p className="text-sm text-gray-400">You are not on a team yet.</p>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-semibold mb-3">{teamName} roster</h3>
        <ul className="space-y-2">
          {roster.map((m) => {
            const isCaptain = String(captain?.id) === String(m.id);
            return (
              <li key={m.id} className="bg-gray-800 rounded-xl px-3 py-2">
                {editingId === String(m.id) ? (
                  <div className="space-y-2">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        className="flex-1 py-2 rounded-lg bg-emerald-700 text-sm"
                        onClick={async () => {
                          const name = editName.trim();
                          if (!name) return alert('Name is required');
                          setSaving(true);
                          try {
                            await callRoster({
                              action: 'edit',
                              registration_id: m.id,
                              player_name: name,
                              player_email: editEmail.trim().toLowerCase(),
                            });
                            setEditingId(null);
                            onRefresh();
                          } catch (e: any) {
                            alert(e.message || 'Could not save');
                          } finally {
                            setSaving(false);
                          }
                        }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="px-3 py-2 text-sm text-gray-400"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm truncate">
                        {m.player_name || 'Player'}
                        {isCaptain && (
                          <span className="text-amber-400 text-xs ml-2">
                            Captain
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {m.player_email || 'no email'}
                      </p>
                    </div>
                    {canEdit && (
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          className="text-xs text-teal-400"
                          onClick={() => {
                            setEditingId(String(m.id));
                            setEditName(m.player_name || '');
                            setEditEmail(m.player_email || '');
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-xs text-red-400"
                          onClick={async () => {
                            if (
                              !confirm(
                                `Remove ${m.player_name || 'this player'} from the team?`
                              )
                            )
                              return;
                            setSaving(true);
                            try {
                              await callRoster({
                                action: 'remove',
                                registration_id: m.id,
                              });
                              onRefresh();
                            } catch (e: any) {
                              alert(e.message || 'Could not remove');
                            } finally {
                              setSaving(false);
                            }
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-gray-500 mt-3">
          {roster.length}/{maxRoster}
          {spotsLeft > 0 ? ` · ${spotsLeft} open` : ' · Full'}
        </p>
        {canEdit ? (
          <div className="mt-3 space-y-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name"
              disabled={spotsLeft <= 0 || saving}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm disabled:opacity-50"
            />
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Email (optional)"
              disabled={spotsLeft <= 0 || saving}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm disabled:opacity-50"
            />
            <button
              type="button"
              disabled={saving || spotsLeft <= 0}
              className="w-full py-2 rounded-xl bg-teal-700 text-sm font-medium disabled:opacity-50 disabled:bg-gray-700"
              onClick={async () => {
                if (spotsLeft <= 0) return;
                const name = newName.trim();
                if (!name) return alert('Name is required');
                setSaving(true);
                try {
                  await callRoster({
                    action: 'add',
                    player_name: name,
                    player_email: newEmail.trim().toLowerCase(),
                  });
                  setNewName('');
                  setNewEmail('');
                  onRefresh();
                } catch (e: any) {
                  alert(e.message || 'Could not add player');
                } finally {
                  setSaving(false);
                }
              }}
            >
              {spotsLeft <= 0
                ? `Roster full (${roster.length}/${maxRoster})`
                : 'Add player'}
            </button>
          </div>
        ) : (
          <p className="text-sm text-gray-400 mt-3">
            Ask your captain to add players.
          </p>
        )}
      </div>
    </div>
  );
}
