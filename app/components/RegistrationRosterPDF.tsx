import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 36,
    paddingHorizontal: 28,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  headerBand: {
    backgroundColor: '#0f766e',
    marginHorizontal: -28,
    marginTop: -28,
    paddingTop: 22,
    paddingBottom: 16,
    paddingHorizontal: 28,
    marginBottom: 14,
  },
  brand: {
    fontSize: 9,
    color: '#99f6e4',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: '#ccfbf1',
  },
  roundHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f0fdfa',
    borderWidth: 1,
    borderColor: '#99f6e4',
    borderRadius: 6,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  roundTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#0f766e',
  },
  roundMeta: {
    fontSize: 9,
    color: '#0d9488',
  },
  teamsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  teamCard: {
    width: '48.5%',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 6,
    marginBottom: 6,
    backgroundColor: '#fafafa',
  },
  teamHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  teamName: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#134e4a',
    maxWidth: '75%',
  },
  teamPairing: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#0f766e',
  },
  teamCount: {
    fontSize: 8,
    color: '#6b7280',
    marginBottom: 3,
  },
  playersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  playerChip: {
    width: '50%',
    paddingVertical: 2,
    paddingRight: 4,
  },
  playerName: {
    fontSize: 9,
    color: '#111827',
  },
  playerPairing: {
    fontSize: 8,
    color: '#0f766e',
  },
  empty: {
    fontSize: 9,
    color: '#9ca3af',
    marginTop: 8,
  },
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 28,
    right: 28,
    fontSize: 8,
    color: '#9ca3af',
    textAlign: 'center',
  },
});

function formatTime(startTime: string | null | undefined) {
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

function pairingLabel(reg: any, roundId: number): string {
  const map = reg.round_pairings || {};
  const entry = map[String(roundId)] || map[roundId];
  if (entry?.hole && entry?.slot) return `${entry.hole}${entry.slot}`;
  if (reg.pairing_hole && reg.pairing_slot) {
    return `${reg.pairing_hole}${reg.pairing_slot}`;
  }
  return '';
}

export function RegistrationRosterPDF({
  event,
  rounds,
  registrations,
}: {
  event: any;
  rounds: any[];
  registrations: any[];
}) {
  const dateStr = event?.date
    ? new Date(event.date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  const listable = (registrations || []).filter((r) => {
    if (r.refunded === true) return false;
    if (r.paid === true) return true;
    const m = String(r.payment_method || '').toLowerCase();
    return ['comp', 'complimentary', 'cash', 'manual', 'checkin', 'payment_link'].includes(
      m
    );
  });

  const byRound: Record<
    string,
    Record<string, { name: string; pairing: string }[]>
  > = {};

  for (const reg of listable) {
    const team = reg.team_name || 'Individual';
    const ids: number[] = Array.isArray(reg.selected_round_ids)
      ? (reg.selected_round_ids as any[])
          .map(Number)
          .filter((n: number) => Number.isFinite(n))
      : [];
    if (reg.round_id) ids.push(Number(reg.round_id));
    const rids = ids.length > 0 ? Array.from(new Set(ids)) : [0];

    for (const rid of rids) {
      const key = String(rid);
      if (!byRound[key]) byRound[key] = {};
      if (!byRound[key][team]) byRound[key][team] = [];
      byRound[key][team].push({
        name: reg.player_name || 'Player',
        pairing: pairingLabel(reg, rid),
      });
    }
  }

  for (const rid of Object.keys(byRound)) {
    for (const team of Object.keys(byRound[rid])) {
      byRound[rid][team].sort((a, b) => {
        if (a.pairing && b.pairing && a.pairing !== b.pairing) {
          return a.pairing.localeCompare(b.pairing, undefined, {
            numeric: true,
          });
        }
        if (a.pairing && !b.pairing) return -1;
        if (!a.pairing && b.pairing) return 1;
        return a.name.localeCompare(b.name);
      });
    }
  }

  const roundOrder =
    rounds?.length > 0
      ? rounds.map((r) => String(r.id))
      : Object.keys(byRound);

  const activeRounds = roundOrder.filter((rid) => byRound[rid]);

  if (activeRounds.length === 0) {
    return (
      <Document>
        <Page size="LETTER" style={styles.page}>
          <View style={styles.headerBand}>
            <Text style={styles.brand}>Fried Egg Events</Text>
            <Text style={styles.title}>{event?.name || 'Event'}</Text>
            <Text style={styles.subtitle}>
              {[dateStr, event?.course].filter(Boolean).join('  ·  ')}
            </Text>
          </View>
          <Text style={styles.empty}>No registered players yet.</Text>
          <Text style={styles.footer}>friedeggevents.app</Text>
        </Page>
      </Document>
    );
  }

  return (
    <Document>
      {activeRounds.map((rid) => {
        const teams = byRound[rid];
        const round = rounds.find((r) => String(r.id) === rid);
        const tee = formatTime(round?.start_time);

        const teamEntries = Object.entries(teams).sort(([aName, aPlayers], [bName, bPlayers]) => {
          const aPair =
            [...new Set(aPlayers.map((p) => p.pairing).filter(Boolean))][0] ||
            '';
          const bPair =
            [...new Set(bPlayers.map((p) => p.pairing).filter(Boolean))][0] ||
            '';
          if (aPair && bPair && aPair !== bPair) {
            return aPair.localeCompare(bPair, undefined, { numeric: true });
          }
          if (aPair && !bPair) return -1;
          if (!aPair && bPair) return 1;
          return aName.localeCompare(bName);
        });

        const roundTitle =
          round?.name || (rid === '0' ? 'Event' : `Round ${rid}`);

        return (
          <Page key={rid} size="LETTER" style={styles.page}>
            <View style={styles.headerBand} fixed>
              <Text style={styles.brand}>Fried Egg Events</Text>
              <Text style={styles.title}>{event?.name || 'Event'}</Text>
              <Text style={styles.subtitle}>
                {[dateStr, event?.course, event?.location]
                  .filter(Boolean)
                  .join('  ·  ')}
              </Text>
            </View>

            <View style={styles.roundHeader} wrap={false}>
              <Text style={styles.roundTitle}>{roundTitle}</Text>
              <Text style={styles.roundMeta}>
                {tee ? `Tee time ${tee}` : ''}
                {teamEntries.length
                  ? `${tee ? '  ·  ' : ''}${teamEntries.length} team${
                      teamEntries.length === 1 ? '' : 's'
                    }`
                  : ''}
              </Text>
            </View>

            <View style={styles.teamsRow}>
              {teamEntries.map(([team, players]) => {
                const pairings = [
                  ...new Set(players.map((p) => p.pairing).filter(Boolean)),
                ];
                const teamPairing =
                  pairings.length === 1 ? pairings[0] : '';

                return (
                  <View key={team} wrap={false} style={styles.teamCard}>
                    <View style={styles.teamHeaderRow}>
                      <Text style={styles.teamName}>{team}</Text>
                      {teamPairing ? (
                        <Text style={styles.teamPairing}>{teamPairing}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.teamCount}>
                      {players.length} player
                      {players.length === 1 ? '' : 's'}
                    </Text>

                    <View style={styles.playersGrid}>
                      {players.map((p, i) => (
                        <View key={`${team}-${i}`} style={styles.playerChip}>
                          <Text style={styles.playerName}>{p.name}</Text>
                          {!teamPairing && p.pairing ? (
                            <Text style={styles.playerPairing}>
                              {p.pairing}
                            </Text>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>

            <Text
              style={styles.footer}
              render={({ pageNumber, totalPages }) =>
                `${roundTitle}${tee ? ` · ${tee}` : ''} · friedeggevents.app · ${pageNumber}/${totalPages}`
              }
              fixed
            />
          </Page>
        );
      })}
    </Document>
  );
}