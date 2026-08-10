'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { QRCodeCanvas } from 'qrcode.react';
import QRCode from 'qrcode';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  PDFDownloadLink,
  pdf,
  Image,
} from '@react-pdf/renderer';

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

function defaultHoles(numHoles: number) {
  return Array.from({ length: numHoles }, (_, i) => ({
    hole: i + 1,
    par: 4,
    yardage: 400,
    handicap: i + 1,
  }));
}

function yardsFromScorecardHole(h: any): number {
  const top = Number(h.yardage ?? h.Yardage ?? h.yards ?? h.distance ?? 0);
  if (top > 0) return top;

  const tees = h.tees;
  if (!tees || typeof tees !== 'object') return 0;

  for (const key of Object.keys(tees)) {
    const y = Number(tees[key]?.yards ?? tees[key]?.yardage ?? 0);
    if (y > 0) return y;
  }
  return 0;
}

function getHolesFromCourseData(courseData: any, numHoles: number = 18) {
  if (!courseData) return defaultHoles(numHoles);

  const root = courseData.course || courseData.data || courseData;
  let raw: any[] = [];

  if (Array.isArray(root.scorecard) && root.scorecard.length > 0) {
    raw = root.scorecard;
  } else if (Array.isArray(root.holes) && typeof root.holes[0] === 'object') {
    raw = root.holes;
  } else if (root.tees) {
    const tees = root.tees;
    const male = tees.male || tees.Men || tees.men;
    const list = Array.isArray(male)
      ? male
      : Array.isArray(tees)
        ? tees
        : [];
    const teeSet = list[0];
    if (teeSet?.holes) raw = teeSet.holes;
    else if (teeSet?.scorecard) raw = teeSet.scorecard;
  }

  if (!raw.length) return defaultHoles(numHoles);

  return raw.slice(0, numHoles).map((h: any, i: number) => {
    const par = Number(h.Par ?? h.par ?? 0);
    const handicap = Number(h.Handicap ?? h.handicap ?? 0);
    const yardage = yardsFromScorecardHole(h);

    return {
      hole: Number(h.Hole ?? h.hole ?? i + 1),
      par: par > 0 ? par : 4,
      yardage: yardage > 0 ? yardage : 400,
      handicap: handicap > 0 ? handicap : i + 1,
    };
  });
}

function getPairingLabel(reg: any, roundId: number | 'all') {
  if (roundId !== 'all') {
    const map = reg.round_pairings || {};
    const entry = map[String(roundId)] || map[roundId as number];
    if (entry?.hole && entry?.slot) return `${entry.hole}${entry.slot}`;
  }
  if (reg.pairing_hole && reg.pairing_slot) {
    return `${reg.pairing_hole}${reg.pairing_slot}`;
  }
  return '—';
}

const pdfStyles = StyleSheet.create({
  page: {
    padding: 24,
    fontSize: 9,
    fontFamily: 'Helvetica',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingBottom: 8,
  },
  headerLeft: {
    flex: 1,
    paddingRight: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 3,
  },
  subtitle: {
    fontSize: 9,
    color: '#444',
    marginBottom: 2,
  },
  qrBox: {
    width: 72,
    height: 72,
  },
  teamBox: {
    marginBottom: 10,
    padding: 8,
    backgroundColor: '#f3f4f6',
  },
  teamName: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  players: {
    marginTop: 3,
    fontSize: 8,
    color: '#333',
  },
  table: {
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  labelCell: {
    width: 46,
    textAlign: 'left',
    paddingVertical: 5,
    paddingLeft: 3,
    fontSize: 8,
    fontWeight: 'bold',
    borderWidth: 0.5,
    borderColor: '#999',
    justifyContent: 'center',
  },
  cell: {
    width: 26,
    textAlign: 'center',
    paddingVertical: 5,
    fontSize: 8,
    borderWidth: 0.5,
    borderColor: '#999',
    justifyContent: 'center',
  },
  totalCell: {
    width: 32,
    textAlign: 'center',
    paddingVertical: 5,
    fontSize: 8,
    fontWeight: 'bold',
    borderWidth: 0.5,
    borderColor: '#666',
    backgroundColor: '#eee',
    justifyContent: 'center',
  },
  scoreCell: {
    width: 26,
    height: 22,
    borderWidth: 0.6,
    borderColor: '#333',
  },
  scoreTotalCell: {
    width: 32,
    height: 22,
    borderWidth: 0.6,
    borderColor: '#333',
    backgroundColor: '#f5f5f5',
  },
  scoreLabelCell: {
    width: 46,
    height: 22,
    borderWidth: 0.6,
    borderColor: '#333',
    paddingLeft: 3,
    fontSize: 8,
    fontWeight: 'bold',
    justifyContent: 'center',
  },
  headerCellText: {
    color: '#fff',
    fontSize: 8,
    textAlign: 'center',
  },
  footer: {
    marginTop: 14,
    fontSize: 8,
    color: '#666',
  },
});

function ScorecardPDF({
  event,
  team,
  holes,
  numHoles,
  roundName,
  pairing,
  isTeamEvent,
  qrDataUrl,
}: {
  event: any;
  team: { name: string; players: string[]; id: string | number };
  holes: any[];
  numHoles: number;
  roundName?: string;
  pairing?: string;
  isTeamEvent: boolean;
  qrDataUrl?: string | null;
}) {
  const frontCount = Math.min(9, numHoles);
  const backCount = Math.max(0, numHoles - 9);

  const frontPar = holes
    .slice(0, frontCount)
    .reduce((s, h) => s + (Number(h?.par) || 4), 0);
  const backPar = holes
    .slice(frontCount, numHoles)
    .reduce((s, h) => s + (Number(h?.par) || 4), 0);
  const frontYds = holes
    .slice(0, frontCount)
    .reduce((s, h) => s + (Number(h?.yardage) || 0), 0);
  const backYds = holes
    .slice(frontCount, numHoles)
    .reduce((s, h) => s + (Number(h?.yardage) || 0), 0);

  const scoreRows = isTeamEvent
    ? [team.name]
    : team.players?.length
      ? team.players
      : [team.name];

  return (
    <Document>
      <Page size="LETTER" style={pdfStyles.page}>
        <View style={pdfStyles.headerRow}>
          <View style={pdfStyles.headerLeft}>
            <Text style={pdfStyles.title}>{event?.name || 'Tournament'}</Text>
            <Text style={pdfStyles.subtitle}>
              {event?.course || ''}
              {event?.location ? ` · ${event.location}` : ''}
            </Text>
            {roundName ? (
              <Text style={pdfStyles.subtitle}>Round: {roundName}</Text>
            ) : null}
            <Text style={pdfStyles.subtitle}>
              {numHoles}-Hole Scorecard
              {pairing && pairing !== '—' ? ` · Starting: ${pairing}` : ''}
            </Text>
          </View>
          {qrDataUrl ? (
            <View style={pdfStyles.qrBox}>
              <Image src={qrDataUrl} style={{ width: 72, height: 72 }} />
            </View>
          ) : null}
        </View>

        <View style={pdfStyles.teamBox}>
          <Text style={pdfStyles.teamName}>{team.name}</Text>
          {isTeamEvent && team.players?.length > 0 ? (
            <Text style={pdfStyles.players}>{team.players.join('  ·  ')}</Text>
          ) : null}
        </View>

        <View style={pdfStyles.table}>
          <View style={pdfStyles.row}>
            <View style={[pdfStyles.labelCell, { backgroundColor: '#111' }]}>
              <Text style={{ color: '#fff', fontSize: 8, fontWeight: 'bold' }}>
                HOLE
              </Text>
            </View>
            {Array.from({ length: frontCount }, (_, i) => (
              <View
                key={i}
                style={[pdfStyles.cell, { backgroundColor: '#111' }]}
              >
                <Text style={pdfStyles.headerCellText}>{i + 1}</Text>
              </View>
            ))}
            <View style={[pdfStyles.totalCell, { backgroundColor: '#111' }]}>
              <Text style={pdfStyles.headerCellText}>OUT</Text>
            </View>
            {Array.from({ length: backCount }, (_, i) => (
              <View
                key={i + 10}
                style={[pdfStyles.cell, { backgroundColor: '#111' }]}
              >
                <Text style={pdfStyles.headerCellText}>{i + 10}</Text>
              </View>
            ))}
            {numHoles > 9 && (
              <View style={[pdfStyles.totalCell, { backgroundColor: '#111' }]}>
                <Text style={pdfStyles.headerCellText}>IN</Text>
              </View>
            )}
            <View style={[pdfStyles.totalCell, { backgroundColor: '#111' }]}>
              <Text style={pdfStyles.headerCellText}>TOT</Text>
            </View>
          </View>

          <View style={pdfStyles.row}>
            <View style={pdfStyles.labelCell}>
              <Text>PAR</Text>
            </View>
            {holes.slice(0, frontCount).map((h, i) => (
              <View key={i} style={pdfStyles.cell}>
                <Text>{h?.par || 4}</Text>
              </View>
            ))}
            <View style={pdfStyles.totalCell}>
              <Text>{frontPar}</Text>
            </View>
            {holes.slice(frontCount, numHoles).map((h, i) => (
              <View key={i + 10} style={pdfStyles.cell}>
                <Text>{h?.par || 4}</Text>
              </View>
            ))}
            {numHoles > 9 && (
              <View style={pdfStyles.totalCell}>
                <Text>{backPar}</Text>
              </View>
            )}
            <View style={pdfStyles.totalCell}>
              <Text>{frontPar + backPar}</Text>
            </View>
          </View>

          <View style={pdfStyles.row}>
            <View style={pdfStyles.labelCell}>
              <Text>YDS</Text>
            </View>
            {holes.slice(0, frontCount).map((h, i) => (
              <View key={i} style={pdfStyles.cell}>
                <Text>{h?.yardage || '—'}</Text>
              </View>
            ))}
            <View style={pdfStyles.totalCell}>
              <Text>{frontYds || '—'}</Text>
            </View>
            {holes.slice(frontCount, numHoles).map((h, i) => (
              <View key={i + 10} style={pdfStyles.cell}>
                <Text>{h?.yardage || '—'}</Text>
              </View>
            ))}
            {numHoles > 9 && (
              <View style={pdfStyles.totalCell}>
                <Text>{backYds || '—'}</Text>
              </View>
            )}
            <View style={pdfStyles.totalCell}>
              <Text>{frontYds + backYds || '—'}</Text>
            </View>
          </View>

          <View style={pdfStyles.row}>
            <View style={pdfStyles.labelCell}>
              <Text>HCP</Text>
            </View>
            {holes.slice(0, frontCount).map((h, i) => (
              <View key={i} style={pdfStyles.cell}>
                <Text>{h?.handicap || '—'}</Text>
              </View>
            ))}
            <View style={pdfStyles.totalCell}>
              <Text>—</Text>
            </View>
            {holes.slice(frontCount, numHoles).map((h, i) => (
              <View key={i + 10} style={pdfStyles.cell}>
                <Text>{h?.handicap || '—'}</Text>
              </View>
            ))}
            {numHoles > 9 && (
              <View style={pdfStyles.totalCell}>
                <Text>—</Text>
              </View>
            )}
            <View style={pdfStyles.totalCell}>
              <Text>—</Text>
            </View>
          </View>

          {scoreRows.map((label, idx) => (
            <View key={idx} style={pdfStyles.row}>
              <View style={pdfStyles.scoreLabelCell}>
                <Text>{String(label).slice(0, 10)}</Text>
              </View>
              {Array.from({ length: frontCount }, (_, i) => (
                <View key={i} style={pdfStyles.scoreCell} />
              ))}
              <View style={pdfStyles.scoreTotalCell} />
              {Array.from({ length: backCount }, (_, i) => (
                <View key={i + 10} style={pdfStyles.scoreCell} />
              ))}
              {numHoles > 9 && <View style={pdfStyles.scoreTotalCell} />}
              <View style={pdfStyles.scoreTotalCell} />
            </View>
          ))}
        </View>

        <Text style={pdfStyles.footer}>
          Scan QR for live scoring · Fried Egg Events
        </Text>
      </Page>
    </Document>
  );
}

export default function EventScorecardsPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [event, setEvent] = useState<any>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [rounds, setRounds] = useState<any[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState<number | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [qrMap, setQrMap] = useState<Record<string, string>>({});

  // Manual course scorecard editor
  const [editHoles, setEditHoles] = useState<
    { hole: number; par: number; yardage: number; handicap: number }[]
  >([]);
  const [showScorecardEditor, setShowScorecardEditor] = useState(false);
  const [savingScorecard, setSavingScorecard] = useState(false);
  const [scorecardMsg, setScorecardMsg] = useState('');

  const numHoles = useMemo(() => {
    const n = Number(event?.number_of_holes || 18);
    return n === 9 ? 9 : 18;
  }, [event]);

  const holes = useMemo(
    () => getHolesFromCourseData(event?.course_data, numHoles),
    [event?.course_data, numHoles]
  );

  // Keep editor in sync when course data / hole count changes
  useEffect(() => {
    setEditHoles(holes.map((h) => ({ ...h })));
  }, [holes]);

  const selectedRound = useMemo(() => {
    if (selectedRoundId === 'all') return null;
    return rounds.find((r) => r.id === selectedRoundId) || null;
  }, [rounds, selectedRoundId]);

  const isTeamEvent = (event?.max_teammates || 1) > 1;

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const id = parseInt(eventId);

      const { data: eventData } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', id)
        .single();
      setEvent(eventData);

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
        .eq('event_id', id);
      setRegistrations(regData || []);

      setLoading(false);
    };

    fetchData();
  }, [eventId]);

  const updateHole = (
    index: number,
    field: 'par' | 'yardage' | 'handicap',
    value: string
  ) => {
    const n = parseInt(value, 10);
    setEditHoles((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        [field]: Number.isFinite(n) ? n : 0,
      };
      return next;
    });
  };

  const saveScorecard = async () => {
    setSavingScorecard(true);
    setScorecardMsg('');
    try {
      const scorecard = editHoles.map((h) => ({
        Hole: h.hole,
        Par: h.par > 0 ? h.par : 4,
        yardage: h.yardage > 0 ? h.yardage : 0,
        Handicap: h.handicap > 0 ? h.handicap : h.hole,
      }));

      const nextCourseData = {
        ...(event?.course_data || {}),
        name: event?.course_data?.name || event?.course || '',
        scorecard,
        scorecard_source: 'manual',
      };

      const { error } = await supabase
        .from('tournaments')
        .update({ course_data: nextCourseData })
        .eq('id', parseInt(eventId, 10));

      if (error) throw error;

      setEvent((prev: any) =>
        prev ? { ...prev, course_data: nextCourseData } : prev
      );
      setScorecardMsg('Scorecard saved — scoring & PDFs will use these values.');
    } catch (e: any) {
      console.error(e);
      setScorecardMsg(e.message || 'Save failed');
    } finally {
      setSavingScorecard(false);
    }
  };

  // Scorecards from registered players + pairings (NOT check-in)
  const teams = useMemo(() => {
    const filtered = registrations.filter((r) => {
      if (selectedRoundId === 'all') return true;
      const ids: number[] = r.selected_round_ids || [];
      if (!ids.length) return rounds.length <= 1;
      return ids.includes(selectedRoundId as number);
    });

    const teamMode = (event?.max_teammates || 1) > 1;

    const grouped = filtered.reduce((acc: any, reg: any) => {
      const key =
        teamMode && reg.team_name
          ? reg.team_name
          : reg.player_name || 'Solo';
      if (!acc[key]) {
        acc[key] = {
          id: reg.id,
          name: key,
          players: [] as string[],
          regs: [] as any[],
        };
      }
      if (reg.player_name) acc[key].players.push(reg.player_name);
      acc[key].regs.push(reg);
      return acc;
    }, {});

    return (Object.values(grouped) as any[]).sort((a, b) => {
      const aP = getPairingLabel(a.regs[0], selectedRoundId);
      const bP = getPairingLabel(b.regs[0], selectedRoundId);
      if (aP === '—' && bP !== '—') return 1;
      if (aP !== '—' && bP === '—') return -1;
      const cmp = aP.localeCompare(bP);
      if (cmp !== 0) return cmp;
      return String(a.name).localeCompare(String(b.name));
    });
  }, [registrations, selectedRoundId, rounds.length, event]);

  const liveBase =
    typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || '';

  const liveUrlForTeam = (teamName: string) => {
    const q = new URLSearchParams();
    q.set('team', teamName);
    if (selectedRoundId !== 'all') q.set('round', String(selectedRoundId));
    return `${liveBase}/event/${eventId}/live?${q.toString()}`;
  };

  useEffect(() => {
    const build = async () => {
      if (!teams.length) {
        setQrMap({});
        return;
      }
      const next: Record<string, string> = {};
      for (const team of teams) {
        const url = liveUrlForTeam(team.name);
        try {
          next[team.name] = await QRCode.toDataURL(url, {
            width: 200,
            margin: 1,
            errorCorrectionLevel: 'M',
          });
        } catch (e) {
          console.error('QR failed', team.name, e);
        }
      }
      setQrMap(next);
    };
    build();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams, selectedRoundId, eventId]);

  const generateAllScorecards = async () => {
    if (teams.length === 0) return;
    setGeneratingAll(true);
    try {
      for (const team of teams) {
        const pairing = getPairingLabel(team.regs[0], selectedRoundId);
        const doc = (
          <ScorecardPDF
            event={event}
            team={team}
            holes={holes}
            numHoles={numHoles}
            roundName={selectedRound?.name}
            pairing={pairing}
            isTeamEvent={isTeamEvent}
            qrDataUrl={qrMap[team.name] || null}
          />
        );
        const blob = await pdf(doc).toBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${String(team.name).replace(/\s+/g, '-')}-scorecard.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch (e) {
      console.error(e);
      alert('Failed generating some PDFs');
    } finally {
      setGeneratingAll(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        Loading scorecards...
      </div>
    );
  }

  const headerTeeTime = selectedRound
    ? formatRoundTime(selectedRound.start_time)
    : null;

  const pairedCount = teams.filter(
    (t) => getPairingLabel(t.regs[0], selectedRoundId) !== '—'
  ).length;

  const totalPar = editHoles.reduce((s, h) => s + (h.par > 0 ? h.par : 4), 0);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <button
          onClick={() => router.back()}
          className="mb-6 text-gray-400 hover:text-white"
        >
          ← Back
        </button>

        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-10">
          <div>
            <h1 className="text-4xl font-bold">{event?.name}</h1>
            <p className="text-gray-400 mt-1">
              Scorecards · {event?.course || 'Course'}
              {headerTeeTime ? ` · ${headerTeeTime}` : ''}
            </p>
            {selectedRound && (
              <p className="text-sm text-teal-400 mt-1">
                Round: {selectedRound.name}
              </p>
            )}
            {teams.length > 0 && (
              <p className="text-sm text-gray-500 mt-1">
                {teams.length} group{teams.length === 1 ? '' : 's'}
                {pairedCount > 0
                  ? ` · ${pairedCount} with starting hole`
                  : ' · set pairings to show starting holes'}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
            {rounds.length > 0 && (
              <div className="w-full sm:w-64">
                <label className="block text-sm text-gray-400 mb-2">Round</label>
                <select
                  value={
                    selectedRoundId === 'all' ? 'all' : String(selectedRoundId)
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    setSelectedRoundId(v === 'all' ? 'all' : parseInt(v, 10));
                  }}
                  className="w-full bg-gray-800 border border-gray-600 rounded-2xl px-5 py-4"
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

            <button
              onClick={generateAllScorecards}
              disabled={generatingAll || teams.length === 0}
              className="px-6 py-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-2xl font-medium whitespace-nowrap"
            >
              {generatingAll ? 'Generating...' : '📄 Generate All PDFs'}
            </button>
          </div>
        </div>

        {/* ===== Course scorecard editor ===== */}
        <div className="bg-gray-800 border border-gray-700 rounded-3xl p-6 mb-10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
            <div>
              <h2 className="text-xl font-semibold">Course scorecard</h2>
              <p className="text-sm text-gray-400 mt-1">
                Set par, yardage, and handicap for each hole. Saved on this
                event so scoring, leaderboard, and PDFs all match.
                {event?.course_data?.scorecard_source === 'manual' && (
                  <span className="text-emerald-400"> · Manual values saved</span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowScorecardEditor((v) => !v)}
              className="px-5 py-3 bg-gray-700 hover:bg-gray-600 rounded-2xl text-sm font-medium"
            >
              {showScorecardEditor ? 'Hide editor' : 'Edit scorecard'}
            </button>
          </div>

          {showScorecardEditor && (
            <>
              <div className="overflow-x-auto mt-4">
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="text-gray-400 text-left border-b border-gray-700">
                      <th className="py-3 pr-3">Hole</th>
                      <th className="py-3 pr-3">Par</th>
                      <th className="py-3 pr-3">Yards</th>
                      <th className="py-3">Handicap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editHoles.map((h, i) => (
                      <tr
                        key={h.hole}
                        className="border-b border-gray-800 last:border-none"
                      >
                        <td className="py-2.5 pr-3 font-medium">{h.hole}</td>
                        <td className="py-2.5 pr-3">
                          <input
                            type="number"
                            min={3}
                            max={6}
                            value={h.par || ''}
                            onChange={(e) =>
                              updateHole(i, 'par', e.target.value)
                            }
                            className="w-16 bg-gray-900 border border-gray-600 rounded-xl px-3 py-2"
                          />
                        </td>
                        <td className="py-2.5 pr-3">
                          <input
                            type="number"
                            min={0}
                            value={h.yardage || ''}
                            onChange={(e) =>
                              updateHole(i, 'yardage', e.target.value)
                            }
                            className="w-24 bg-gray-900 border border-gray-600 rounded-xl px-3 py-2"
                          />
                        </td>
                        <td className="py-2.5">
                          <input
                            type="number"
                            min={1}
                            max={18}
                            value={h.handicap || ''}
                            onChange={(e) =>
                              updateHole(i, 'handicap', e.target.value)
                            }
                            className="w-16 bg-gray-900 border border-gray-600 rounded-xl px-3 py-2"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-4 mt-5">
                <button
                  type="button"
                  onClick={saveScorecard}
                  disabled={savingScorecard}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 px-6 py-3 rounded-2xl font-medium"
                >
                  {savingScorecard ? 'Saving…' : 'Save scorecard'}
                </button>
                <span className="text-sm text-gray-400">
                  Total par: <span className="text-white font-medium">{totalPar}</span>
                </span>
                {scorecardMsg && (
                  <span
                    className={`text-sm ${
                      scorecardMsg.includes('failed') ||
                      scorecardMsg.includes('Save failed')
                        ? 'text-red-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {scorecardMsg}
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {teams.length === 0 ? (
          <div className="bg-gray-800 rounded-3xl p-16 text-center text-gray-400">
            No registered players
            {selectedRoundId !== 'all' ? ' for this round' : ''}.
            <br />
            Register players and save pairings, then print scorecards.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.map((team: any) => {
              const pairing = getPairingLabel(team.regs[0], selectedRoundId);
              const liveUrl = liveUrlForTeam(team.name);

              return (
                <div
                  key={team.name}
                  className="bg-gray-800 border border-gray-700 rounded-3xl p-6 flex flex-col"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-semibold text-xl">{team.name}</h3>
                      <p className="text-sm text-gray-400 mt-1">
                        {team.players?.length || 0} player
                        {(team.players?.length || 0) !== 1 ? 's' : ''}
                        {pairing !== '—'
                          ? ` · Start ${pairing}`
                          : ' · No pairing yet'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {(team.players || []).join(', ')}
                      </p>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-4 flex justify-center mb-4">
                    <QRCodeCanvas value={liveUrl} size={140} level="M" />
                  </div>
                  <p className="text-xs text-center text-gray-500 mb-4 break-all">
                    Live: {liveUrl}
                  </p>

                  <PDFDownloadLink
                    document={
                      <ScorecardPDF
                        event={event}
                        team={team}
                        holes={holes}
                        numHoles={numHoles}
                        roundName={selectedRound?.name}
                        pairing={pairing}
                        isTeamEvent={isTeamEvent}
                        qrDataUrl={qrMap[team.name] || null}
                      />
                    }
                    fileName={`${String(team.name).replace(/\s+/g, '-')}-scorecard.pdf`}
                    className="mt-auto block w-full text-center bg-black hover:bg-gray-800 text-white py-3 rounded-2xl font-medium transition-colors"
                  >
                    {({ loading: pdfLoading }) =>
                      pdfLoading
                        ? 'Generating PDF...'
                        : '📄 Download PDF Scorecard'
                    }
                  </PDFDownloadLink>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}