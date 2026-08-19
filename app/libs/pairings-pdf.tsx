import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

type Slot = 'A' | 'B' | 'C' | 'D';

export function formatRoundTime(startTime: string | null | undefined) {
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

function formatPairing(hole: number | null, slot: Slot | null) {
  if (!hole || !slot) return '';
  return `${hole} - ${slot}`;
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

const isListable = (r: any) => {
  if (r.refunded === true) return false;
  if (r.paid === true) return true;
  const m = String(r.payment_method || '').toLowerCase();
  return [
    'comp',
    'complimentary',
    'cash',
    'manual',
    'checkin',
    'payment_link',
  ].includes(m);
};

function isTeamEvent(event: any) {
  const mt = Number(event?.max_teammates || 0);
  if (mt > 1) return true;
  const t = String(event?.event_type || '').toLowerCase();
  if (t.includes('scramble') || t.includes('best ball') || t.includes('team')) {
    return true;
  }
  if (t.includes('stroke') || t.includes('individual') || t.includes('medal')) {
    return false;
  }
  return mt > 1;
}

export type PairingPdfRow = {
  holeSlot: string;
  time: string;
  team: string;
  players: string;
};

function buildRowsForRound(
  event: any,
  regs: any[],
  rounds: any[],
  roundId: number | null
): PairingPdfRow[] {
  const teamMode = isTeamEvent(event);
  let filtered = regs.filter(isListable);

  if (roundId != null) {
    filtered = filtered.filter((r) => {
      const ids: number[] = r.selected_round_ids || [];
      if (!ids.length) return rounds.length <= 1;
      return ids.includes(roundId);
    });
  }

  const byTeam: Record<string, any[]> = {};
  for (const r of filtered) {
    const groupKey = teamMode
      ? r.team_name || `Individual:${r.id}`
      : `Individual:${r.id}`;
    if (!byTeam[groupKey]) byTeam[groupKey] = [];
    byTeam[groupKey].push(r);
  }

  const rows = Object.entries(byTeam).map(([key, players]) => {
    const first = players[0];
    const { hole, slot, tee_time } = getRoundPairing(first, roundId);
    const displayName = key.startsWith('Individual:')
      ? first.player_name || 'Individual'
      : key;
    return {
      holeSlot: formatPairing(hole, slot) || '—',
      time: tee_time ? String(tee_time).slice(0, 5) : '',
      team: displayName,
      players: players.map((p) => p.player_name).join(', '),
      sortHole: hole ?? 999,
      sortSlot: slot || 'Z',
      sortTime: tee_time ? String(tee_time).slice(0, 5) : '99:99',
    };
  });

  rows.sort(
    (a, b) =>
      a.sortTime.localeCompare(b.sortTime) ||
      a.sortHole - b.sortHole ||
      a.sortSlot.localeCompare(b.sortSlot)
  );

  return rows.map(({ holeSlot, time, team, players }) => ({
    holeSlot,
    time,
    team,
    players,
  }));
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

function PairingsPageInner({
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
  rows: PairingPdfRow[];
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
    <Page size="LETTER" style={pairPdfStyles.page}>
      <Text style={pairPdfStyles.brand}>Fried Egg Events</Text>
      <Text style={pairPdfStyles.title}>{eventName || 'Event'} — Pairings</Text>
      {dateStr ? <Text style={pairPdfStyles.subtitle}>{dateStr}</Text> : null}
      {course ? <Text style={pairPdfStyles.subtitle}>{course}</Text> : null}
      {(roundName || roundTime) && (
        <Text style={pairPdfStyles.subtitle}>
          {[roundName, roundTime].filter(Boolean).join(' · ')}
        </Text>
      )}

      <View style={pairPdfStyles.headerRow}>
        <Text style={pairPdfStyles.thHole}>Hole</Text>
        {showTime ? <Text style={pairPdfStyles.thTime}>Time</Text> : null}
        <Text style={pairPdfStyles.thTeam}>Team / Group</Text>
        <Text style={pairPdfStyles.thPlayers}>Players</Text>
      </View>

      {rows.length === 0 ? (
        <Text style={pairPdfStyles.empty}>No pairings set for this round.</Text>
      ) : (
        rows.map((r, i) => (
          <View key={`${r.holeSlot}-${i}`} style={pairPdfStyles.row} wrap={false}>
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

      <Text style={pairPdfStyles.footer}>friedeggevents.app · Pairings sheet</Text>
    </Page>
  );
}

export function PairingsPDFDoc({
  event,
  rounds,
  regs,
}: {
  event: any;
  rounds: any[];
  regs: any[];
}) {
  const sections =
    (rounds || []).length > 0
      ? rounds.map((round) => {
          const rows = buildRowsForRound(event, regs, rounds, Number(round.id));
          return {
            roundName: round.name,
            roundTime: round.start_time
              ? formatRoundTime(round.start_time)
              : '',
            showTime: rows.some((r) => !!r.time),
            rows,
          };
        })
      : [
          {
            roundName: undefined as string | undefined,
            roundTime: '',
            showTime: buildRowsForRound(event, regs, rounds, null).some(
              (r) => !!r.time
            ),
            rows: buildRowsForRound(event, regs, rounds, null),
          },
        ];

  return (
    <Document>
      {sections.map((s, i) => (
        <PairingsPageInner
          key={i}
          eventName={event?.name || 'Event'}
          course={event?.course}
          eventDate={event?.date}
          roundName={s.roundName}
          roundTime={s.roundTime || undefined}
          showTime={s.showTime}
          rows={s.rows}
        />
      ))}
    </Document>
  );
}