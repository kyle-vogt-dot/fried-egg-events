'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  PDFDownloadLink,
} from '@react-pdf/renderer';

type Slot = 'A' | 'B' | 'C' | 'D';
type StartFormat = 'shotgun' | 'tee_times' | 'double_tee';

type TeamRow = {
  team_name: string;
  player_count: number;
  player_names: string[];
  registration_ids: number[];
  registration_rows: any[];
  pairing_hole: number | null;
  pairing_slot: Slot | null;
  tee_time: string | null;
  first_registered_at: string;
};

function formatPairing(hole: number | null, slot: Slot | null) {
  if (!hole || !slot) return '';
  return `${hole} - ${slot}`;
}

function parsePairing(value: string): { hole: number; slot: Slot } | null {
  const cleaned = value.trim().toUpperCase().replace(/\s+/g, ' ');
  const match = cleaned.match(/^(\d+)\s*-?\s*([ABCD])$/);
  if (!match) return null;
  const hole = parseInt(match[1], 10);
  const slot = match[2] as Slot;
  if (!hole || !['A', 'B', 'C', 'D'].includes(slot)) return null;
  return { hole, slot };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatRoundTime(startTime: string | null | undefined) {
  if (!startTime) return '';
  const parts = String(startTime).slice(0, 5).split(':');
  if (parts.length < 2) return String(startTime);
  let h = parseInt(parts[0], 10);
  const m = parts[1];
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

/** "08:00" + minutes → "08:10" */
function addMinutesToTime(hhmm: string, minutes: number): string {
  const [hStr, mStr] = String(hhmm).slice(0, 5).split(':');
  let h = parseInt(hStr || '8', 10);
  let m = parseInt(mStr || '0', 10);
  if (Number.isNaN(h)) h = 8;
  if (Number.isNaN(m)) m = 0;
  const total = h * 60 + m + minutes;
  const nh = Math.floor(((total % (24 * 60)) + 24 * 60) % (24 * 60) / 60);
  const nm = ((total % 60) + 60) % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

function getRoundPairing(reg: any, roundId: number | null) {
  if (!roundId) {
    return {
      hole: reg.pairing_hole ?? null,
      slot: (['A', 'B', 'C', 'D'].includes(reg.pairing_slot)
        ? reg.pairing_slot
        : null) as Slot | null,
      tee_time: reg.pairing_tee_time ?? null,
    };
  }
  const map = reg.round_pairings || {};
  const entry = map[String(roundId)] || map[roundId];
  if (entry?.hole && ['A', 'B', 'C', 'D'].includes(entry.slot)) {
    return {
      hole: Number(entry.hole),
      slot: entry.slot as Slot,
      tee_time: entry.tee_time || null,
    };
  }
  return { hole: null, slot: null, tee_time: null };
}

const pairPdfStyles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 40,
    paddingHorizontal: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#111',
  },
  brand: { fontSize: 10, color: '#666', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 10, color: '#444', marginBottom: 2 },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    borderBottomColor: '#111',
    paddingBottom: 6,
    marginTop: 16,
    marginBottom: 4,
  },
  thHole: { width: 70, fontWeight: 'bold' },
  thTime: { width: 70, fontWeight: 'bold' },
  thTeam: { flex: 1, fontWeight: 'bold' },
  thPlayers: { flex: 1.4, fontWeight: 'bold' },
  row: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: '#ddd',
  },
  tdHole: { width: 70 },
  tdTime: { width: 70 },
  tdTeam: { flex: 1, fontWeight: 'bold' },
  tdPlayers: { flex: 1.4, color: '#333' },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 8,
    color: '#888',
    textAlign: 'center',
  },
  empty: { marginTop: 24, color: '#666' },
});

function PairingsPDF({
  eventName,
  course,
  eventDate,
  roundName,
  roundTime,
  showTime,
  rows,
}: {
  eventName: string;
  course?: string;
  eventDate?: string;
  roundName?: string;
  roundTime?: string;
  showTime: boolean;
  rows: { holeSlot: string; time: string; team: string; players: string }[];
}) {
  const dateStr = eventDate
    ? new Date(String(eventDate) + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  return (
    <Document>
      <Page size="LETTER" style={pairPdfStyles.page}>
        <Text style={pairPdfStyles.brand}>Fried Egg Events</Text>
        <Text style={pairPdfStyles.title}>
          {eventName || 'Event'} — Pairings
        </Text>
        {dateStr ? (
          <Text style={pairPdfStyles.subtitle}>{dateStr}</Text>
        ) : null}
        {course ? (
          <Text style={pairPdfStyles.subtitle}>{course}</Text>
        ) : null}
        {(roundName || roundTime) && (
          <Text style={pairPdfStyles.subtitle}>
            {[roundName, roundTime].filter(Boolean).join(' · ')}
          </Text>
        )}

        <View style={pairPdfStyles.headerRow}>
          <Text style={pairPdfStyles.thHole}>Hole</Text>
          {showTime ? (
            <Text style={pairPdfStyles.thTime}>Time</Text>
          ) : null}
          <Text style={pairPdfStyles.thTeam}>Team / Group</Text>
          <Text style={pairPdfStyles.thPlayers}>Players</Text>
        </View>

        {rows.length === 0 ? (
          <Text style={pairPdfStyles.empty}>
            No pairings set for this round.
          </Text>
        ) : (
          rows.map((r, i) => (
            <View
              key={`${r.holeSlot}-${i}`}
              style={pairPdfStyles.row}
              wrap={false}
            >
              <Text style={pairPdfStyles.tdHole}>{r.holeSlot || '—'}</Text>
              {showTime ? (
                <Text style={pairPdfStyles.tdTime}>
                  {r.time ? formatRoundTime(r.time) : '—'}
                </Text>
              ) : null}
              <Text style={pairPdfStyles.tdTeam}>{r.team}</Text>
              <Text style={pairPdfStyles.tdPlayers}>{r.players}</Text>
            </View>
          ))
        )}

        <Text style={pairPdfStyles.footer}>
          friedeggevents.app · Pairings sheet
        </Text>
      </Page>
    </Document>
  );
}

export default function EventPairingsPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [event, setEvent] = useState<any>(null);
  const [rounds, setRounds] = useState<any[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState<number | null>(null);
  const [allRegs, setAllRegs] = useState<any[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [draftTimes, setDraftTimes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  // Individual start settings
  const [startFormat, setStartFormat] = useState<StartFormat>('shotgun');
  const [pairStartTime, setPairStartTime] = useState('08:00');
  const [intervalMin, setIntervalMin] = useState(10);
  const [primaryHole, setPrimaryHole] = useState(1);
  const [secondaryHole, setSecondaryHole] = useState(10);

  const numHoles = useMemo(() => {
    const n = Number(event?.number_of_holes || 18);
    return n === 9 ? 9 : 18;
  }, [event]);

  const isTeamEvent = useMemo(() => {
    const mt = Number(event?.max_teammates || 0);
    if (mt > 1) return true;
    const t = String(event?.event_type || '').toLowerCase();
    if (
      t.includes('scramble') ||
      t.includes('best ball') ||
      t.includes('team')
    )
      return true;
    if (
      t.includes('stroke') ||
      t.includes('individual') ||
      t.includes('medal')
    )
      return false;
    // Fallback: any multi-player team_name used often → team
    return mt > 1;
  }, [event]);

  const slotsPerHole = isTeamEvent ? 2 : 4;
  const slotLetters: Slot[] = isTeamEvent
    ? ['A', 'B']
    : ['A', 'B', 'C', 'D'];

  const availableSlots = useMemo(() => {
    const slots: string[] = [];
    for (let h = 1; h <= numHoles; h++) {
      for (const s of slotLetters) {
        slots.push(`${h} - ${s}`);
      }
    }
    return slots;
  }, [numHoles, slotLetters]);

  const selectedRound = useMemo(
    () => rounds.find((r) => r.id === selectedRoundId) || null,
    [rounds, selectedRoundId]
  );

  const pdfRows = useMemo(() => {
    const rows = teams.map((t) => {
      const label = (draft[t.team_name] || '').trim();
      const parsed = label ? parsePairing(label) : null;
      return {
        holeSlot: label || '—',
        time: draftTimes[t.team_name] || '',
        team: t.team_name,
        players: t.player_names.join(', '),
        sortHole: parsed?.hole ?? 999,
        sortSlot: parsed
          ? slotLetters.indexOf(parsed.slot)
          : 99,
        sortTime: draftTimes[t.team_name] || '99:99',
      };
    });
    rows.sort(
      (a, b) =>
        a.sortTime.localeCompare(b.sortTime) ||
        a.sortHole - b.sortHole ||
        a.sortSlot - b.sortSlot
    );
    return rows.map(({ holeSlot, time, team, players }) => ({
      holeSlot,
      time,
      team,
      players,
    }));
  }, [teams, draft, draftTimes, slotLetters]);

  const pdfFileName = `${String(event?.name || 'event')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')}-pairings${
    selectedRound
      ? `-${String(selectedRound.name)
          .replace(/[^a-z0-9]+/gi, '-')
          .replace(/^-|-$/g, '')}`
      : ''
  }.pdf`;

  const buildTeamsForRound = (regs: any[], roundId: number | null) => {
    let filtered = regs;

    if (roundId != null) {
      filtered = regs.filter((r) => {
        const ids: number[] = r.selected_round_ids || [];
        if (!ids.length) return rounds.length <= 1;
        return ids.includes(roundId);
      });
    }

    const byTeam: Record<string, any[]> = {};
    for (const r of filtered) {
      // Individual events: one row per player
      const key =
        isTeamEvent || (r.team_name && r.team_name.trim())
          ? r.team_name || `Individual:${r.id}`
          : `Individual:${r.id}`;
      // Force per-player when individual event
      const groupKey = isTeamEvent
        ? r.team_name || `Individual:${r.id}`
        : `Individual:${r.id}`;
      if (!byTeam[groupKey]) byTeam[groupKey] = [];
      byTeam[groupKey].push(r);
    }

    const teamRows: TeamRow[] = Object.entries(byTeam).map(
      ([key, players]) => {
        const first = players[0];
        const { hole, slot, tee_time } = getRoundPairing(first, roundId);

        const displayName = key.startsWith('Individual:')
          ? first.player_name || 'Individual'
          : key;

        return {
          team_name: displayName,
          player_count: players.length,
          player_names: players.map((p) => p.player_name),
          registration_ids: players.map((p) => p.id),
          registration_rows: players,
          pairing_hole: hole,
          pairing_slot: slot,
          tee_time: tee_time,
          first_registered_at: first.created_at,
        };
      }
    );

    teamRows.sort(
      (a, b) =>
        new Date(a.first_registered_at).getTime() -
        new Date(b.first_registered_at).getTime()
    );

    return teamRows;
  };

  const load = async () => {
    setLoading(true);
    setMessage(null);

    const id = parseInt(eventId);

    const { data: ev } = await supabase
      .from('tournaments')
      .select('*')
      .eq('id', id)
      .single();
    setEvent(ev);

    // Prefer round start_time if present
    if (ev?.date) {
      /* keep pairStartTime as-is unless empty */
    }

    const { data: roundsData } = await supabase
      .from('event_rounds')
      .select('*')
      .eq('event_id', id)
      .order('sort_order', { ascending: true });

    const roundList = roundsData || [];
    setRounds(roundList);

    const { data: regs } = await supabase
      .from('event_registrations')
      .select('*')
      .eq('event_id', id)
      .eq('paid', true)
      .order('created_at', { ascending: true });

    setAllRegs(regs || []);

    let roundId = selectedRoundId;
    if (roundId == null && roundList.length > 0) {
      roundId = roundList[0].id;
      setSelectedRoundId(roundId);
      if (roundList[0].start_time) {
        setPairStartTime(String(roundList[0].start_time).slice(0, 5));
      }
    }

    // isTeamEvent depends on event — build after setEvent via effect below
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // Rebuild when event/regs/round ready
  useEffect(() => {
    if (!event) return;
    const teamRows = buildTeamsForRound(allRegs, selectedRoundId);
    setTeams(teamRows);

    const nextDraft: Record<string, string> = {};
    const nextTimes: Record<string, string> = {};
    for (const t of teamRows) {
      nextDraft[t.team_name] = formatPairing(t.pairing_hole, t.pairing_slot);
      nextTimes[t.team_name] = t.tee_time
        ? String(t.tee_time).slice(0, 5)
        : '';
    }
    setDraft(nextDraft);
    setDraftTimes(nextTimes);
    setMessage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoundId, allRegs, event, isTeamEvent]);

  /** Team: one slot per team (A/B). Individual: one slot per player (A–D). */
  const applyAssignments = (orderedTeams: TeamRow[], mode: 'order' | 'random') => {
    const list = mode === 'random' ? shuffle(orderedTeams) : [...orderedTeams];
    const next: Record<string, string> = {};
    const nextTimes: Record<string, string> = {};

    if (isTeamEvent) {
      list.forEach((team, index) => {
        if (index >= availableSlots.length) {
          next[team.team_name] = '';
          nextTimes[team.team_name] = '';
          return;
        }
        next[team.team_name] = availableSlots[index];
        nextTimes[team.team_name] = pairStartTime;
      });
        } else {
      // --- Individual: order by handicap, else random ---
      const hasAnyHandicap = list.some(
        (t) =>
          t.registration_rows[0]?.handicap != null &&
          t.registration_rows[0]?.handicap !== ''
      );

      let ordered = [...list];
      if (mode === 'random' || !hasAnyHandicap) {
        ordered = shuffle(list);
      } else {
        ordered.sort((a, b) => {
          const ha = Number(a.registration_rows[0]?.handicap);
          const hb = Number(b.registration_rows[0]?.handicap);
          const aN = Number.isFinite(ha) ? ha : 999;
          const bN = Number.isFinite(hb) ? hb : 999;
          return aN - bN;
        });
      }

      // Groups of 4
      const groups: TeamRow[][] = [];
      for (let i = 0; i < ordered.length; i += 4) {
        groups.push(ordered.slice(i, i + 4));
      }

      if (startFormat === 'shotgun') {
        // Spread across holes, same start time
        groups.forEach((group, gi) => {
          const hole = (gi % numHoles) + 1;
          group.forEach((player, pi) => {
            const slot = slotLetters[pi] || 'A';
            next[player.team_name] = formatPairing(hole, slot);
            nextTimes[player.team_name] = pairStartTime;
          });
        });
      } else if (startFormat === 'double_tee') {
        // Half the field on primary hole, half on secondary — parallel times
        const half = Math.ceil(groups.length / 2);
        groups.forEach((group, gi) => {
          const onPrimary = gi < half;
          const hole = onPrimary ? primaryHole : secondaryHole;
          const timeIndex = onPrimary ? gi : gi - half;
          const time = addMinutesToTime(pairStartTime, timeIndex * intervalMin);
          group.forEach((player, pi) => {
            const slot = slotLetters[pi] || 'A';
            next[player.team_name] = formatPairing(hole, slot);
            nextTimes[player.team_name] = time;
          });
        });
      } else {
        // tee_times: ALL groups on the same starting hole, staggered times
        groups.forEach((group, gi) => {
          const hole = primaryHole;
          const time = addMinutesToTime(pairStartTime, gi * intervalMin);
          group.forEach((player, pi) => {
            const slot = slotLetters[pi] || 'A';
            next[player.team_name] = formatPairing(hole, slot);
            nextTimes[player.team_name] = time;
          });
        });
      }
    }

    // Preserve any teams not in list
    for (const t of teams) {
      if (!(t.team_name in next)) {
        next[t.team_name] = draft[t.team_name] || '';
        nextTimes[t.team_name] = draftTimes[t.team_name] || '';
      }
    }

    setDraft(next);
    setDraftTimes(nextTimes);
    setMessage(
      mode === 'random'
        ? 'Randomized (not saved — click Save Pairings)'
        : `Assigned (${isTeamEvent ? 'teams A/B' : startFormat.replace('_', ' ')}) — not saved yet`
    );
  };

  const handleManualChange = (teamName: string, value: string) => {
    const parsed = value.trim() === '' ? null : parsePairing(value);

    setDraft((prev) => {
      const next = { ...prev };

      if (!parsed) {
        next[teamName] = value;
        return next;
      }

      // Individual: only A–D valid; team: only A–B
      if (isTeamEvent && (parsed.slot === 'C' || parsed.slot === 'D')) {
        setMessage('Team events use slots A and B only.');
        return prev;
      }

      const targetLabel = formatPairing(parsed.hole, parsed.slot);

      const occupant = Object.entries(next).find(([name, label]) => {
        if (name === teamName) return false;
        const p = parsePairing(label);
        return p?.hole === parsed.hole && p?.slot === parsed.slot;
      });

      if (occupant) {
        const oldValue = next[teamName] || '';
        next[occupant[0]] = oldValue;
        next[teamName] = targetLabel;
        setDraftTimes((times) => {
          const tnext = { ...times };
          const tmp = tnext[teamName] || '';
          tnext[teamName] = tnext[occupant[0]] || '';
          tnext[occupant[0]] = tmp;
          return tnext;
        });
        setMessage(
          `Swapped ${teamName} ↔ ${occupant[0]} (${targetLabel}). Click Save Pairings.`
        );
      } else {
        next[teamName] = targetLabel;
        setMessage(`Set ${teamName} → ${targetLabel}. Click Save Pairings.`);
      }

      return next;
    });
  };

  const savePairings = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const used = new Map<string, string>();
      for (const [teamName, label] of Object.entries(draft)) {
        if (!label.trim()) continue;
        const parsed = parsePairing(label);
        if (!parsed) {
          alert(
            `Invalid pairing for ${teamName}: "${label}". Use format like 1 - A`
          );
          setSaving(false);
          return;
        }
        if (parsed.hole < 1 || parsed.hole > numHoles) {
          alert(`Hole must be 1–${numHoles} (${teamName})`);
          setSaving(false);
          return;
        }
        if (isTeamEvent && (parsed.slot === 'C' || parsed.slot === 'D')) {
          alert(`Team events only use A/B (${teamName})`);
          setSaving(false);
          return;
        }
        const key = `${parsed.hole}-${parsed.slot}`;
        if (used.has(key)) {
          alert(
            `Duplicate slot ${formatPairing(parsed.hole, parsed.slot)}: ${used.get(key)} and ${teamName}`
          );
          setSaving(false);
          return;
        }
        used.set(key, teamName);
      }

      const roundKey =
        selectedRoundId != null ? String(selectedRoundId) : null;

      for (const team of teams) {
        const label = (draft[team.team_name] || '').trim();
        const parsed = label ? parsePairing(label) : null;
        const teeTime = (draftTimes[team.team_name] || '').trim() || null;

        for (const reg of team.registration_rows) {
          const existing = { ...(reg.round_pairings || {}) };

          if (roundKey) {
            if (parsed) {
              existing[roundKey] = {
                hole: parsed.hole,
                slot: parsed.slot,
                tee_time: teeTime,
              };
            } else {
              delete existing[roundKey];
            }
          }

          const payload: any = {
            round_pairings: existing,
            pairing_hole: parsed?.hole ?? null,
            pairing_slot: parsed?.slot ?? null,
          };

          const { error } = await supabase
            .from('event_registrations')
            .update(payload)
            .eq('id', reg.id);

          if (error) throw error;

          reg.round_pairings = existing;
          reg.pairing_hole = payload.pairing_hole;
          reg.pairing_slot = payload.pairing_slot;
        }
      }

      setMessage(
        `✅ Pairings saved${
          selectedRound ? ` for ${selectedRound.name}` : ''
        }`
      );
      await load();
    } catch (err: any) {
      console.error(err);
      alert('Failed to save pairings: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const clearAll = () => {
    const next: Record<string, string> = {};
    const nextTimes: Record<string, string> = {};
    for (const t of teams) {
      next[t.team_name] = '';
      nextTimes[t.team_name] = '';
    }
    setDraft(next);
    setDraftTimes(nextTimes);
    setMessage('Cleared all pairings for this round (not saved yet)');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        Loading pairings...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-8">
        <button
          onClick={() => router.back()}
          className="text-gray-400 hover:text-white"
        >
          ← Back
        </button>

        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold">{event?.name}</h1>
            <p className="text-gray-400 mt-1">
              Pairings · {numHoles} holes ·{' '}
              {isTeamEvent
                ? `teams · ${slotsPerHole} per hole (A/B)`
                : `individual · ${slotsPerHole} players per tee box`}
              {selectedRound
                ? ` · ${selectedRound.name}${
                    selectedRound.start_time
                      ? ` (${formatRoundTime(selectedRound.start_time)})`
                      : ''
                  }`
                : ''}
            </p>
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            {rounds.length > 0 && (
              <select
                value={selectedRoundId ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedRoundId(v ? parseInt(v, 10) : null);
                }}
                className="bg-gray-800 border border-gray-600 rounded-2xl px-5 py-3 min-w-[200px]"
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

                        <button
              onClick={() => applyAssignments(teams, 'order')}
              className="bg-gray-700 hover:bg-gray-600 px-5 py-3 rounded-2xl font-medium"
            >
              {isTeamEvent ? 'Auto (order)' : 'Auto (handicap)'}
            </button>
            <button
              onClick={() => applyAssignments(teams, 'random')}
              className="bg-indigo-600 hover:bg-indigo-700 px-5 py-3 rounded-2xl font-medium"
            >
              Randomize
            </button>
            <button
              onClick={clearAll}
              className="bg-gray-700 hover:bg-gray-600 px-5 py-3 rounded-2xl font-medium"
            >
              Clear
            </button>
            <button
              onClick={savePairings}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 px-5 py-3 rounded-2xl font-medium"
            >
              {saving ? 'Saving...' : 'Save Pairings'}
            </button>

            <PDFDownloadLink
              document={
                <PairingsPDF
                  eventName={event?.name || 'Event'}
                  course={event?.course}
                  eventDate={event?.date}
                  roundName={selectedRound?.name}
                  roundTime={
                    selectedRound?.start_time
                      ? formatRoundTime(selectedRound.start_time)
                      : undefined
                  }
                  showTime={!isTeamEvent}
                  rows={pdfRows}
                />
              }
              fileName={pdfFileName}
              className="bg-emerald-700 hover:bg-emerald-800 px-5 py-3 rounded-2xl font-medium text-center"
            >
              {({ loading: pdfLoading }) =>
                pdfLoading ? 'Preparing PDF…' : '📄 Download PDF'
              }
            </PDFDownloadLink>
          </div>
        </div>

        {/* Individual start-format controls */}
        {!isTeamEvent && (
          <div className="bg-gray-800 rounded-3xl p-6 space-y-4">
            <h2 className="text-lg font-semibold">Start format</h2>
            <div className="flex flex-wrap gap-3">
              {(
                [
                  ['shotgun', 'Shotgun'],
                  ['tee_times', 'Tee times'],
                  ['double_tee', 'Double tee'],
                ] as [StartFormat, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStartFormat(value)}
                  className={`px-5 py-3 rounded-2xl font-medium ${
                    startFormat === value
                      ? 'bg-teal-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Start time
                </label>
                <input
                  type="time"
                  value={pairStartTime}
                  onChange={(e) => setPairStartTime(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3"
                />
              </div>

              {startFormat !== 'shotgun' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Interval (minutes)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={30}
                    value={intervalMin}
                    onChange={(e) =>
                      setIntervalMin(Math.max(1, parseInt(e.target.value) || 10))
                    }
                    className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3"
                  />
                </div>
              )}

              {startFormat !== 'shotgun' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    {startFormat === 'double_tee'
                      ? 'First hole'
                      : 'Starting hole'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={numHoles}
                    value={primaryHole}
                    onChange={(e) =>
                      setPrimaryHole(
                        Math.min(
                          numHoles,
                          Math.max(1, parseInt(e.target.value) || 1)
                        )
                      )
                    }
                    className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3"
                  />
                </div>
              )}

                            {startFormat === 'double_tee' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Second hole
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={numHoles}
                    value={secondaryHole}
                    onChange={(e) =>
                      setSecondaryHole(
                        Math.min(
                          numHoles,
                          Math.max(1, parseInt(e.target.value) || 10)
                        )
                      )
                    }
                    className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3"
                  />
                </div>
              )}
            </div>

            <p className="text-sm text-gray-500">
              {startFormat === 'shotgun' &&
                'Groups of 4 are spread across holes; everyone shares the same start time.'}
                                          {startFormat === 'tee_times' &&
                `All groups start on hole ${primaryHole}. Groups of 4 every ${intervalMin} min. Ordered by handicap (or random if none).`}
              {startFormat === 'double_tee' &&
                `Half the field on hole ${primaryHole}, half on hole ${secondaryHole}, same tee times on both. Ordered by handicap (or random if none).`}
            </p>
          </div>
        )}

        {message && (
          <div className="bg-gray-800 border border-gray-700 rounded-2xl px-5 py-4 text-sm text-gray-300">
            {message}
          </div>
        )}

        {teams.length === 0 ? (
          <div className="bg-gray-800 rounded-3xl p-12 text-center text-gray-400">
            No paid {isTeamEvent ? 'teams' : 'players'} for this round.
            {rounds.length > 1
              ? ' Switch rounds above, or wait for registrations that include this round.'
              : ' Pairings only use completed (paid) registrations.'}
          </div>
        ) : (
          <div className="bg-gray-800 rounded-3xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400 text-sm">
                    <th className="py-4 px-6">
                      {isTeamEvent ? 'Team' : 'Player'}
                    </th>
                    <th className="py-4 px-6">
                      {isTeamEvent ? 'Players' : '—'}
                    </th>
                    <th className="py-4 px-6 w-40">Hole / slot</th>
                    {!isTeamEvent && (
                      <th className="py-4 px-6 w-36">Tee time</th>
                    )}
                    <th className="py-4 px-6">Quick pick</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team) => (
                    <tr
                      key={team.team_name}
                      className="border-b border-gray-700/60"
                    >
                      <td className="py-4 px-6 font-medium">
                        {team.team_name}
                        {isTeamEvent && (
                          <div className="text-xs text-gray-500 mt-1">
                            {team.player_names.join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-6 text-gray-400">
                        {isTeamEvent ? team.player_count : '—'}
                      </td>
                      <td className="py-4 px-6">
                        <input
                          value={draft[team.team_name] ?? ''}
                          onChange={(e) =>
                            handleManualChange(team.team_name, e.target.value)
                          }
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (!v) return;
                            const parsed = parsePairing(v);
                            if (parsed) {
                              handleManualChange(
                                team.team_name,
                                formatPairing(parsed.hole, parsed.slot)
                              );
                            }
                          }}
                          placeholder={
                            isTeamEvent ? 'e.g. 1 - A' : 'e.g. 1 - A'
                          }
                          className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3"
                        />
                      </td>
                      {!isTeamEvent && (
                        <td className="py-4 px-6">
                          <input
                            type="time"
                            value={draftTimes[team.team_name] || ''}
                            onChange={(e) =>
                              setDraftTimes((prev) => ({
                                ...prev,
                                [team.team_name]: e.target.value,
                              }))
                            }
                            className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3"
                          />
                        </td>
                      )}
                      <td className="py-4 px-6">
                        <select
                          value={draft[team.team_name] || ''}
                          onChange={(e) =>
                            handleManualChange(team.team_name, e.target.value)
                          }
                          className="bg-gray-900 border border-gray-600 rounded-xl px-4 py-3"
                        >
                          <option value="">—</option>
                          {availableSlots.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="text-sm text-gray-500 space-y-1">
          <p>
            • <strong>Team events:</strong> up to 2 teams per hole (A/B).
          </p>
          <p>
            • <strong>Individual:</strong> 4 players per tee box (A–D). Choose
            Shotgun, Tee times, or Double tee, then Auto / Randomize.
          </p>
          <p>
            • Pairings are stored <strong>per round</strong>. Always click{' '}
            <strong>Save Pairings</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}