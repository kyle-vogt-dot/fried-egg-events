'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import ReactEasyCrop from 'react-easy-crop';
import { QRCodeCanvas } from 'qrcode.react';
import { Document, Page, Text, View, StyleSheet, PDFDownloadLink, Image } from '@react-pdf/renderer';


export default function EventAdminPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // ====================== STATE ======================

  const [selectedFlight, setSelectedFlight] = useState<string | 'all'>('all');
  const [showNet, setShowNet] = useState(false);
  const [event, setEvent] = useState<any>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [addons, setAddons] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'manage' | 'checkin' | 'scoring' | 'leaderboard' | 'scorecards' | 'pairings' | 'income'>('manage');
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Add-Admins
  const [admins, setAdmins] = useState<any[]>([]);
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');

  // Add-ons
  const [showAddOns, setShowAddOns] = useState(false);
  const [newAddon, setNewAddon] = useState({ name: '', quantity_available: 5, price_per_unit: 10 });

  // Flights
  const [showFlights, setShowFlights] = useState(false);
  const [newFlight, setNewFlight] = useState({ name: '', range: '' });

  // Sub Player Modal
  const [showSubModal, setShowSubModal] = useState(false);
  const [subPlayerReg, setSubPlayerReg] = useState<any>(null);
  const [subName, setSubName] = useState('');
  const [subEmail, setSubEmail] = useState('');

  // Add Player Modal
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerEmail, setNewPlayerEmail] = useState('');
  const [newPlayerTeam, setNewPlayerTeam] = useState('');

  // Payment Modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [currentPayReg, setCurrentPayReg] = useState<any>(null);

  // Selected add-on quantities
  const [selectedQuantities, setSelectedQuantities] = useState<Record<number, Record<number, number>>>({});

  // Course search
  const [courseSearch, setCourseSearch] = useState('');
  const [courseResults, setCourseResults] = useState<any[]>([]);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  

  // Scores
  const [playerScores, setPlayerScores] = useState<Record<number, Record<number, number>>>({});

  // ====================== AVAILABLE TEES ======================
  const availableTees = (() => {
    let teesData = event?.course_data?.tees || event?.course_data?.course?.tees;
    if (!teesData) return [];

    const flat: any[] = [];
    Object.keys(teesData).forEach((category) => {
      if (Array.isArray(teesData[category])) {
        teesData[category].forEach((tee: any) => {
          flat.push({
            ...tee,
            category,
            name: tee.name || tee.tee_name || tee.color || 'Unnamed Tee'
          });
        });
      }
    });
    return flat;
  })();

    // ====================== DERIVED TEAMS FOR SCORECARDS ======================
  const teams = useMemo(() => {
    if (!registrations || registrations.length === 0) return [];

    const grouped = registrations
      .filter((r: any) => r.checked_in) // only show checked-in teams/players
      .reduce((acc: any, reg: any) => {
        const teamName = (reg.team_name || reg.player_name || 'Solo Player').trim();
        
        if (!acc[teamName]) {
          acc[teamName] = {
            id: reg.id || `team-${teamName}`,
            name: teamName,
            players: [] as string[],
          };
        }
        if (reg.player_name) {
          acc[teamName].players.push(reg.player_name);
        }
        return acc;
      }, {} as any);

    return Object.values(grouped);
  }, [registrations]);

  // ====================== FETCH DATA ======================

  // ====================== FETCH ADMINS ======================
  const fetchAdmins = async () => {
    const { data } = await supabase
      .from('event_admins')
      .select('*')
      .eq('event_id', parseInt(eventId));
    setAdmins(data || []);
  };

  useEffect(() => {
    const fetchData = async () => {
      const { data: eventData } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', parseInt(eventId))
        .single();
      setEvent(eventData);

      const { data: regData } = await supabase
        .from('event_registrations')
        .select('*')
        .eq('event_id', parseInt(eventId));
      setRegistrations(regData || []);

      const { data: addonData } = await supabase
        .from('event_addons')
        .select('*')
        .eq('event_id', parseInt(eventId));
      setAddons(addonData || []);
    };

    fetchData();
  }, [eventId, supabase]);

  const fetchRegistrations = async () => {
    const { data } = await supabase
      .from('event_registrations')
      .select('*')
      .eq('event_id', parseInt(eventId));
    setRegistrations(data || []);
  };

  // ====================== HANDLERS ======================

  

  const handleEventChange = (field: string, value: any) => {
    setEvent((prev: any) => ({ ...prev, [field]: value }));
  };
  const getFlightFromHandicap = (handicap: number, flights: any[]) => {
  if (!flights || flights.length === 0) return '';

  // Sort flights by range (lowest handicap first)
  const sortedFlights = [...flights].sort((a, b) => {
    const rangeA = a.range || '';
    const rangeB = b.range || '';
    return rangeA.localeCompare(rangeB);
  });

  for (const flight of sortedFlights) {
    const range = flight.range || '';
    if (range.includes('<') && handicap < parseFloat(range.replace('<', ''))) {
      return flight.name;
    }
    if (range.includes('-')) {
      const [low, high] = range.split('-').map(Number);
      if (handicap >= low && handicap <= high) {
        return flight.name;
      }
    }
  }
  return flights[flights.length - 1]?.name || ''; // default to last flight
};

  const handleSaveEvent = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('tournaments')
      .update(event)
      .eq('id', parseInt(eventId));
    if (error) alert('Save failed: ' + error.message);
    else alert('Event updated successfully!');
    setSaving(false);
  };

  const handleAddAddon = async () => {
    if (!newAddon.name.trim()) return alert("Please enter an add-on name");
    const { data, error } = await supabase
      .from('event_addons')
      .insert({
        event_id: parseInt(eventId),
        name: newAddon.name.trim(),
        quantity_available: newAddon.quantity_available,
        price_per_unit: newAddon.price_per_unit,
      })
      .select()
      .single();
    if (error) alert("Failed to add add-on: " + error.message);
    else {
      setAddons((prev) => [...prev, data]);
      setNewAddon({ name: '', quantity_available: 5, price_per_unit: 10 });
    }
  };

  const handleDeleteAddon = async (addonId: number) => {
    if (!confirm("Delete this add-on?")) return;
    const { error } = await supabase.from('event_addons').delete().eq('id', addonId);
    if (error) alert("Failed to delete: " + error.message);
    else setAddons((prev) => prev.filter((a) => a.id !== addonId));
  };

  const handleAddFlight = () => {
    if (!newFlight.name.trim() || !newFlight.range.trim()) {
      alert("Please enter both flight name and range");
      return;
    }
    const currentFlights = event.flights || [];
    const updatedFlights = [...currentFlights, { 
      name: newFlight.name.trim(), 
      range: newFlight.range.trim() 
    }];
    handleEventChange('flights', updatedFlights);
    setNewFlight({ name: '', range: '' });
  };

  const handleDeleteFlight = (index: number) => {
    const currentFlights = event.flights || [];
    const updatedFlights = currentFlights.filter((_: any, i: number) => i !== index);
    handleEventChange('flights', updatedFlights);
  };
   const handleAddPlayer = async () => {
    if (!newPlayerName.trim()) return alert("Player name is required");
    const { error } = await supabase
      .from('event_registrations')
      .insert({
        event_id: parseInt(eventId),
        player_name: newPlayerName.trim(),
        player_email: newPlayerEmail.trim() || null,
        team_name: newPlayerTeam.trim() || null,
        paid: false,
        checked_in: false,
      });
    if (error) alert("Failed to add player: " + error.message);
    else {
      fetchRegistrations();
      setShowAddPlayerModal(false);
      setNewPlayerName('');
      setNewPlayerEmail('');
      setNewPlayerTeam('');
      alert("Player added successfully!");
    }
  };

  const handleSubstitutePlayer = async () => {
    if (!subName.trim()) return alert("Player name is required");
    await supabase.from('event_registrations').update({ player_name: subName.trim(), player_email: subEmail.trim() || null }).eq('id', subPlayerReg.id);
    fetchRegistrations();
    setShowSubModal(false);
    setSubName('');
    setSubEmail('');
  };

  const updateScore = (regId: number, hole: number, score: number) => {
    setPlayerScores(prev => ({ ...prev, [regId]: { ...(prev[regId] || {}), [hole]: score } }));
  };
  
  
  const openPaymentModal = (reg: any) => {
  setCurrentPayReg(reg);
  setShowPaymentModal(true);
};

const handlePaidCash = async () => {
  if (!currentPayReg) return;

  const { error } = await supabase
    .from('event_registrations')
    .update({ 
      paid_addons: true, 
      checked_in: true 
    })
    .eq('id', currentPayReg.id);

  if (error) {
    alert("Error marking add-ons as paid: " + error.message);
  } else {
    alert(`${currentPayReg.player_name} add-ons marked as paid cash and checked in.`);
    setShowPaymentModal(false);
    fetchRegistrations();
  }
};

const handleCheckout = async () => {
  if (!currentPayReg) return;

  const addonTotals = selectedQuantities[currentPayReg.id] || {};
  const addonCost = addons.reduce((sum: number, addon: any) => {
    const qty = addonTotals[addon.id] || 0;
    return sum + qty * (addon.price_per_unit || 0);
  }, 0);

  if (addonCost <= 0) return;

  try {
    // 1. Save the selected quantities to the database BEFORE opening Stripe
    const { error: saveError } = await supabase
      .from('event_registrations')
      .update({
        addon_quantities: addonTotals,   // ← Saves the exact quantities chosen
      })
      .eq('id', currentPayReg.id);

    if (saveError) {
      console.error('Failed to save addon quantities:', saveError);
    }

    // 2. Create Stripe checkout session
    const response = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registration_id: currentPayReg.id,
        amount: addonCost,
        player_name: currentPayReg.player_name,
        email: currentPayReg.player_email,
        description: `Add-ons for ${event?.name}`,
        event_name: event?.name,
        event_id: event?.id,
        type: 'addon_payment',
        success_url: `${window.location.origin}/event/${eventId}?success=addon&registration_id=${currentPayReg.id}`,
      }),
    });

    const { url } = await response.json();

    if (url) {
      window.open(url, '_blank');
    } else {
      alert('Failed to create payment link');
    }

    setShowPaymentModal(false);
  } catch (err) {
    console.error(err);
    alert('Error creating payment link');
  }
};

const [showAdmins, setShowAdmins] = useState(false);

  const handleRemovePlayer = async (reg: any) => {
    if (!confirm(`Remove ${reg.player_name}?`)) return;
    const { error } = await supabase.from('event_registrations').delete().eq('id', reg.id);
    if (error) alert("Failed to remove: " + error.message);
    else fetchRegistrations();
  };
  //Add Admin Handler
  const handleAddAdmin = async () => {
  if (!newAdminEmail.trim()) return alert("Email is required");

  const email = newAdminEmail.trim().toLowerCase();
  const name = newAdminName.trim();

  try {
    // 1. Check if user already exists
    const { data: existingUser } = await supabase
      .from('profiles')           // or 'auth.users' if you don't have a profiles table
      .select('id')
      .eq('email', email)
      .single();

    // 2. Add to event_admins
    const { data: newAdminRow, error: insertError } = await supabase
      .from('event_admins')
      .insert({
        event_id: parseInt(eventId),
        user_id: existingUser?.id || null,
        name: name || null,
        email: email,
        added_by: (await supabase.auth.getUser()).data.user?.id,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // 3. Send invitation email
    if (!existingUser) {
      // User doesn't exist yet → send invitation email
      const inviteLink = `${window.location.origin}/accept-invite?token=${newAdminRow.id}&event=${eventId}`;

      await fetch('/api/send-admin-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          name: name || 'there',
          eventName: event.name,
          inviteLink: inviteLink,
        }),
      });

      alert(`Invitation email sent to ${email}`);
    } else {
      alert(`${email} has been added as an admin and will be notified.`);
    }

    // Refresh the list
    fetchAdmins();
    setNewAdminName('');
    setNewAdminEmail('');

  } catch (err: any) {
    console.error(err);
    alert("Failed to add admin: " + err.message);
  }
};

  
 // Save player scores to database (keeps scores visible after saving)
const savePlayerScores = async (registrationId: number) => {
  const playerScoresForReg = playerScores[registrationId] || {};

  if (Object.keys(playerScoresForReg).length === 0) {
    alert("No scores entered for this player.");
    return;
  }

  const scoresToSave = Object.entries(playerScoresForReg).map(([hole, score]) => ({
    registration_id: registrationId,
    hole: parseInt(hole),
    score: score,
  }));

  const { error } = await supabase
    .from('scores')
    .upsert(scoresToSave, { onConflict: 'registration_id,hole' });

  if (error) {
    console.error('Failed to save scores:', error);
    alert('Failed to save scores: ' + (error.message || JSON.stringify(error)));
  } else {
    alert(`Score saved successfully for ${registrations.find(r => r.id === registrationId)?.player_name || 'player'}!`);
    // ← REMOVED the clear line so scores stay visible on screen
  }
};




  // ====================== COURSE SEARCH ======================
  const searchCourses = async (query: string) => {
    if (query.length < 3) {
      setCourseResults([]);
      return;
    }
    try {
      const res = await fetch(
        `https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(query)}`,
        { headers: { 'Authorization': `Key ${process.env.NEXT_PUBLIC_GOLF_COURSE_API_KEY}` } }
      );
      if (!res.ok) throw new Error(`API returned status ${res.status}`);
      const data = await res.json();
      setCourseResults(data.courses || data || []);
    } catch (err) {
      console.error('Course search error:', err);
      setCourseResults([]);
    }
  };

  const selectCourse = (course: any) => {
    const courseName = course.course_name || course.club_name || course.name || '';
    handleEventChange('course', courseName);
    handleEventChange('course_data', course);
    setCourseSearch(courseName);
    setCourseResults([]);
  };

  // ====================== SCORING HELPERS ======================
  const getHolesFromCourseData = (courseData: any, numHoles: number = 18) => {
  if (!courseData) {
    return Array.from({ length: numHoles }, () => ({ par: 4, yardage: 0, handicap: 0 }));
  }

  let holes: any[] = [];

  // GolfAPI common paths
  if (courseData.holes && Array.isArray(courseData.holes)) {
    holes = courseData.holes;
  } 
  else if (courseData.course?.holes && Array.isArray(courseData.course.holes)) {
    holes = courseData.course.holes;
  } 
  else if (courseData.tees) {
    const teeSets = Object.values(courseData.tees).flat();
    const firstTee = teeSets[0];

    // Stronger type guard to satisfy TypeScript
    if (firstTee && typeof firstTee === 'object' && 'holes' in firstTee && Array.isArray(firstTee.holes)) {
      holes = firstTee.holes;
    }
  }

  // Return only the requested number of holes
  return holes.length > 0 ? holes.slice(0, numHoles) : 
         Array.from({ length: numHoles }, () => ({ par: 4, yardage: 0, handicap: 0 }));
};


                    // ====================== SCORECARD PDF COMPONENT (Shorter OTHER TEAM row) ======================
  const ScorecardPDF = ({ team }: { team: any }) => {
    const teamMembers = registrations
      .filter((r: any) => r.checked_in && 
        (r.team_name === team.name || r.player_name === team.name))
      .map((r: any) => r.player_name || 'Player');

    const numHoles = event?.number_of_holes || 18;
    const holes = getHolesFromCourseData(event?.course_data, numHoles);

    const frontHoles = holes.slice(0, 9);
    const backHoles = holes.slice(9, 18);

    const calculateSum = (holeList: any[], key: string) => 
      holeList.reduce((sum: number, h: any) => sum + (Number(h?.[key]) || 0), 0);

    const frontPar = calculateSum(frontHoles, 'par');
    const frontYds = calculateSum(frontHoles, 'yardage');
    const backPar = calculateSum(backHoles, 'par');
    const backYds = calculateSum(backHoles, 'yardage');

    return (
      <Document>
        <Page size="A4" orientation="landscape" style={styles.page}>
          
          <View style={styles.frontHalf}>

            <View style={styles.topHeaderRow}>
              <View style={styles.headerLeft}>
                <Text style={styles.title}>{team.name}</Text>
                <Text style={styles.subtitle}>
                  {event?.course || 'Tournament'} • {numHoles} Holes
                </Text>
                <View style={styles.players}>
                  {teamMembers.map((name, i) => (
                    <Text key={i} style={styles.playerName}>{i + 1}. {name}</Text>
                  ))}
                </View>
              </View>

                                       <View style={styles.qrContainer}>
                <Image 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                    `${process.env.NEXT_PUBLIC_APP_URL || 'https://friedeggevents.app'}/event/${eventId}/live?team=${team.id}`
                  )}`} 
                  style={styles.qrImage} 
                />
              </View>
            </View>

            <View style={styles.scorecardTable}>
              
              <View style={styles.tableRow}>
                <View style={styles.labelCell}><Text style={styles.tableLabel}>HOLE</Text></View>
                {Array.from({ length: 9 }, (_, i) => (
                  <View key={i} style={styles.holeCell}>
                    <Text style={styles.holeNumber}>{i + 1}</Text>
                  </View>
                ))}
                <View style={styles.summaryCell}><Text style={styles.summaryLabel}>OUT</Text></View>
                {Array.from({ length: 9 }, (_, i) => (
                  <View key={i} style={styles.holeCell}>
                    <Text style={styles.holeNumber}>{i + 10}</Text>
                  </View>
                ))}
                <View style={styles.summaryCell}><Text style={styles.summaryLabel}>IN</Text></View>
                <View style={styles.totalCell}><Text style={styles.summaryLabel}>TOTAL</Text></View>
              </View>

              {/* PAR, YDS, HCP rows (unchanged) */}
              <View style={styles.tableRow}>
                <View style={styles.labelCell}><Text style={styles.tableLabel}>PAR</Text></View>
                {frontHoles.map((hole: any, i: number) => <View key={i} style={styles.holeCell}><Text style={styles.dataText}>{hole?.par || 4}</Text></View>)}
                <View style={styles.summaryCell}><Text style={styles.dataText}>{frontPar}</Text></View>
                {backHoles.map((hole: any, i: number) => <View key={i} style={styles.holeCell}><Text style={styles.dataText}>{hole?.par || 4}</Text></View>)}
                <View style={styles.summaryCell}><Text style={styles.dataText}>{backPar}</Text></View>
                <View style={styles.totalCell}><Text style={styles.dataText}>{frontPar + backPar}</Text></View>
              </View>

              <View style={styles.tableRow}>
                <View style={styles.labelCell}><Text style={styles.tableLabel}>YDS</Text></View>
                {frontHoles.map((hole: any, i: number) => <View key={i} style={styles.holeCell}><Text style={styles.dataText}>{hole?.yardage || '-'}</Text></View>)}
                <View style={styles.summaryCell}><Text style={styles.dataText}>{frontYds}</Text></View>
                {backHoles.map((hole: any, i: number) => <View key={i} style={styles.holeCell}><Text style={styles.dataText}>{hole?.yardage || '-'}</Text></View>)}
                <View style={styles.summaryCell}><Text style={styles.dataText}>{backYds}</Text></View>
                <View style={styles.totalCell}><Text style={styles.dataText}>{frontYds + backYds}</Text></View>
              </View>

              <View style={styles.tableRow}>
                <View style={styles.labelCell}><Text style={styles.tableLabel}>HCP</Text></View>
                {frontHoles.map((hole: any, i: number) => <View key={i} style={styles.holeCell}><Text style={styles.dataText}>{hole?.handicap || '-'}</Text></View>)}
                <View style={styles.summaryCell}><Text style={styles.dataText}> </Text></View>
                {backHoles.map((hole: any, i: number) => <View key={i} style={styles.holeCell}><Text style={styles.dataText}>{hole?.handicap || '-'}</Text></View>)}
                <View style={styles.summaryCell}><Text style={styles.dataText}> </Text></View>
                <View style={styles.totalCell}><Text style={styles.dataText}> </Text></View>
              </View>

                            {/* YOUR SCORE - tall row */}
              <View style={styles.scoreRow}>
                <View style={styles.scoreLabelCell}>
                  <Text style={styles.scoreLabel}>YOUR SCORE</Text>
                </View>
                {Array.from({ length: 9 }, (_, i) => (
                  <View key={i} style={styles.scoreCell}>
                    <Text style={styles.emptyScore}> </Text>
                  </View>
                ))}
                <View style={styles.summaryCellScore}><Text style={styles.emptyScore}> </Text></View>
                {Array.from({ length: 9 }, (_, i) => (
                  <View key={i} style={styles.scoreCell}>
                    <Text style={styles.emptyScore}> </Text>
                  </View>
                ))}
                <View style={styles.summaryCellScore}><Text style={styles.emptyScore}> </Text></View>
                <View style={styles.totalCellScore}><Text style={styles.emptyScore}> </Text></View>
              </View>

              {/* OTHER TEAM - much shorter */}
              <View style={styles.otherTeamScoreRow}>
                <View style={styles.otherTeamLabelCell}>
                  <Text style={styles.scoreLabel}>OTHER TEAM</Text>
                </View>
                {Array.from({ length: 9 }, (_, i) => (
                  <View key={i} style={styles.otherTeamScoreCell}>
                    <Text style={styles.emptyScore}> </Text>
                  </View>
                ))}
                <View style={styles.otherTeamSummaryCell}><Text style={styles.emptyScore}> </Text></View>
                {Array.from({ length: 9 }, (_, i) => (
                  <View key={i} style={styles.otherTeamScoreCell}>
                    <Text style={styles.emptyScore}> </Text>
                  </View>
                ))}
                <View style={styles.otherTeamSummaryCell}><Text style={styles.emptyScore}> </Text></View>
                <View style={styles.otherTeamTotalCell}><Text style={styles.emptyScore}> </Text></View>
              </View>

            </View>

          </View>

          <View style={styles.backHalf}>
            <View style={styles.backHeader}>
              <Text style={styles.backTitle}>Tournament Rules &amp; Information</Text>
            </View>
            <Text style={styles.rulesText}>
              {event?.rules || "• Play ready golf\n• Max score per hole is double par\n• Repair ball marks and rake bunkers\n• Please rake bunkers and fix ball marks"}
            </Text>
            
            <Text style={styles.sponsorTitle}>Thank You To Our Sponsors</Text>
            <View style={styles.sponsorArea}>
              <Text style={{ fontSize: 14, textAlign: 'center', color: '#666', marginTop: 40 }}>
                [Sponsor Logos Will Go Here]
              </Text>
            </View>
          </View>

          <Text style={styles.footer}>Powered by Fried Egg Events • Printed {new Date().toLocaleDateString()}</Text>
        </Page>
      </Document>
    );
  };

                // PDF Styles - OTHER TEAM row now much shorter
  const styles = StyleSheet.create({
    page: { 
      padding: 25, 
      backgroundColor: '#f8f8f8',
      flexDirection: 'column',
      justifyContent: 'space-between'
    },

    frontHalf: {
      height: '54%',
      borderBottom: '2px dashed #ccc',
      paddingBottom: 15,
    },

    topHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 18,
    },
    headerLeft: { flex: 1 },
    title: { fontSize: 34, fontWeight: 'bold', color: '#111', marginBottom: 4 },
    subtitle: { fontSize: 14, color: '#555' },
    players: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    playerName: { fontSize: 13.5, color: '#222' },

            qrContainer: { 
      alignItems: 'flex-end', 
      marginTop: -20   // raised higher
    },
    qrImage: { 
      width: 88, 
      height: 88     // made smaller
    },

    scorecardTable: {
      border: '1px solid #333',
      backgroundColor: '#fff',
    },
    tableRow: {
      flexDirection: 'row',
      borderBottom: '1px solid #ccc',
    },
    labelCell: {
      width: 82,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#f1f1f1',
      borderRight: '1px solid #333',
      paddingVertical: 6,
    },
    tableLabel: {
      fontSize: 9.5,
      fontWeight: 'bold',
      color: '#333',
      textAlign: 'center',
    },
    holeCell: {
      width: 37,
      height: 36,
      justifyContent: 'center',
      alignItems: 'center',
      borderRight: '1px solid #333',
    },
    holeNumber: { fontSize: 15, fontWeight: 'bold', color: '#111' },
    dataText: { fontSize: 11.5, color: '#222' },

    summaryCell: {
      width: 52,
      height: 36,
      justifyContent: 'center',
      alignItems: 'center',
      borderRight: '1px solid #333',
      backgroundColor: '#f1f1f1',
    },
    summaryLabel: {
      fontSize: 9.5,
      fontWeight: 'bold',
      color: '#333',
      textAlign: 'center',
    },
    totalCell: {
      width: 58,
      height: 36,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#f1f1f1',
    },

        /* Scoring rows */
    scoreRow: {
      flexDirection: 'row',
      borderTop: '3px solid #333',
    },
    scoreLabelCell: {
      width: 82,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#f1f1f1',
      borderRight: '1px solid #333',
      paddingVertical: 12,
      minHeight: 54,
    },
    scoreLabel: {                    // ← this was causing the red underline
      fontSize: 8.5,
      fontWeight: 'bold',
      color: '#333',
      textAlign: 'center',
    },
    scoreCell: {
      width: 37,
      height: 54,
      justifyContent: 'center',
      alignItems: 'center',
      borderRight: '1px solid #333',
      backgroundColor: '#fafafa',
    },
    summaryCellScore: {
      width: 52,
      height: 54,
      justifyContent: 'center',
      alignItems: 'center',
      borderRight: '1px solid #333',
      backgroundColor: '#fafafa',
    },
    totalCellScore: {
      width: 58,
      height: 54,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#fafafa',
    },
    emptyScore: {
      fontSize: 18,
      color: '#ddd',
    },

    /* OTHER TEAM - shorter row */
    otherTeamScoreRow: {
      flexDirection: 'row',
      borderTop: '2px solid #ccc',
    },
    otherTeamLabelCell: {
      width: 82,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#f1f1f1',
      borderRight: '1px solid #333',
      paddingVertical: 8,
      minHeight: 38,
    },
    otherTeamScoreCell: {
      width: 37,
      height: 38,
      justifyContent: 'center',
      alignItems: 'center',
      borderRight: '1px solid #333',
      backgroundColor: '#fafafa',
    },
    otherTeamSummaryCell: {
      width: 52,
      height: 38,
      justifyContent: 'center',
      alignItems: 'center',
      borderRight: '1px solid #333',
      backgroundColor: '#fafafa',
    },
    otherTeamTotalCell: {
      width: 58,
      height: 38,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#fafafa',
    },

    backHalf: {
      height: '42%',
      paddingTop: 15,
    },
    backHeader: { marginBottom: 10 },
    backTitle: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', color: '#111' },
    rulesText: { 
      fontSize: 10.5, 
      lineHeight: 1.45, 
      color: '#333',
      marginBottom: 18 
    },
    sponsorTitle: { 
      fontSize: 15, 
      textAlign: 'center', 
      marginBottom: 10,
      color: '#222' 
    },
    sponsorArea: { 
      height: 145, 
      border: '2px dashed #ccc', 
      justifyContent: 'center', 
      alignItems: 'center',
      backgroundColor: '#fff'
    },

    footer: { 
      position: 'absolute', 
      bottom: 12, 
      left: 30, 
      right: 30, 
      textAlign: 'center', 
      fontSize: 9, 
      color: '#999' 
    }
  });

   // ==================== GENERATE ALL SCORECARDS ====================
  const generateAllScorecards = async () => {
    try {
      const teamCount = teams.length;
      alert(`Generating scorecards for all ${teamCount} teams...`);
      console.log("✅ All scorecards generation triggered for", teams);
      
      // TODO Phase 2: real multi-team PDF
    } catch (error) {
      console.error("Failed to generate all scorecards:", error);
      alert("Error generating scorecards. Check console.");
    }
  };
  // ====================== RENDER ======================
  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <button 
          onClick={() => router.push(`/event/${eventId}`)} 
          className="mb-6 text-gray-400 hover:text-white flex items-center gap-2"
        >
          ← Back to Event
        </button>

        <h1 className="text-4xl font-bold mb-2">{event?.name || 'Loading...'}</h1>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-8 border-b border-gray-700 pb-4 overflow-x-auto">
          {(['manage', 'checkin', 'scoring', 'leaderboard', 'scorecards', 'pairings', 'income', ] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 rounded-2xl font-medium whitespace-nowrap transition-colors ${
                activeTab === tab ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        

       {/* ====================== MANAGE TAB (Mobile-Friendly + All Original Fields) ====================== */}
{activeTab === 'manage' && event && (
  <div className="bg-gray-800 rounded-3xl p-6 md:p-10 space-y-12">

    {/* Header */}
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <h2 className="text-3xl font-semibold">Edit Event Details</h2>
    </div>

    {/* Event Image */}
    <div>
      <h3 className="text-xl font-medium mb-4">Event Image</h3>
      <div className="flex flex-col md:flex-row gap-6 items-start">
        <div className="w-full md:w-80 h-52 bg-gray-900 rounded-3xl overflow-hidden border border-gray-700 flex-shrink-0">
          {event.image_url ? (
            <img src={event.image_url} alt={event.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-6xl text-gray-600">🏌️</div>
          )}
        </div>

        <div className="flex-1">
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const fileExt = file.name.split('.').pop();
                const fileName = `${Date.now()}.${fileExt}`;
                const filePath = `events/${eventId}/${fileName}`;

                const { error: uploadError } = await supabase.storage
                  .from('tournament-images')
                  .upload(filePath, file, { cacheControl: '3600', upsert: false });

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                  .from('tournament-images')
                  .getPublicUrl(filePath);

                handleEventChange('image_url', publicUrl);
                alert("Image uploaded successfully! Click 'Save Changes' to store it.");
              } catch (err: any) {
                alert("Failed to upload image: " + err.message);
              }
            }}
            className="block w-full text-sm text-gray-400 file:mr-4 file:py-4 file:px-6 file:rounded-3xl file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
          />
        </div>
      </div>
    </div>

    {/* Golf Course Search */}
    <div>
      <h3 className="text-xl font-medium mb-4">Golf Course</h3>
      <div className="relative">
        <input
          type="text"
          value={courseSearch}
          onChange={(e) => {
            setCourseSearch(e.target.value);
            if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
            searchTimeoutRef.current = setTimeout(() => searchCourses(e.target.value), 400);
          }}
          placeholder="Search courses (e.g. TPC Sugarloaf, Pebble Beach...)"
          className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5 text-base focus:outline-none focus:border-blue-500"
        />

        {courseResults.length > 0 && (
          <div className="absolute z-50 w-full mt-2 bg-gray-800 border border-gray-700 rounded-3xl shadow-2xl max-h-80 overflow-auto">
            {courseResults.map((course, idx) => (
              <div
                key={idx}
                onClick={() => selectCourse(course)}
                className="px-6 py-5 hover:bg-gray-700 cursor-pointer border-b border-gray-700 last:border-none"
              >
                <div className="font-medium">{course.course_name || course.name}</div>
                <div className="text-sm text-gray-400">
                  {course.club_name} • {course.location?.city}, {course.location?.state}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(event.course || event.course_data?.course_name || event.course_data?.name) && (
        <p className="text-green-400 mt-3 text-sm">
          Current course: <span className="font-medium">
            {event.course || event.course_data?.course_name || event.course_data?.name}
          </span>
        </p>
      )}
    </div>

    {/* THREE BUTTONS ROW - Below Golf Course */}
    <div className="flex flex-wrap gap-3">
      <button 
        onClick={() => setShowFlights(!showFlights)} 
        className="flex-1 sm:flex-none bg-purple-600 hover:bg-purple-700 px-6 py-4 rounded-3xl font-medium transition-colors"
      >
        {showFlights ? 'Hide Flights' : 'Manage Flights'}
      </button>

      <button 
        onClick={() => setShowAddOns(!showAddOns)} 
        className="flex-1 sm:flex-none bg-yellow-600 hover:bg-yellow-700 px-6 py-4 rounded-3xl font-medium transition-colors"
      >
        {showAddOns ? 'Hide Add-ons' : 'Manage Add-ons'}
      </button>

      <button 
        onClick={() => setShowAdmins(!showAdmins)} 
        className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 px-6 py-4 rounded-3xl font-medium transition-colors"
      >
        {showAdmins ? 'Hide Admins' : 'Manage Admins'}
      </button>
    </div>

    {/* Add-ons Panel */}
    {showAddOns && (
      <div className="bg-gray-900 border border-yellow-500/30 rounded-3xl p-8">
        <h3 className="text-xl font-medium mb-6">Manage Add-ons</h3>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end mb-8">
          <div className="md:col-span-5">
            <label className="block text-sm text-gray-400 mb-2">Add-on Name</label>
            <input value={newAddon.name} onChange={(e) => setNewAddon({ ...newAddon, name: e.target.value })} placeholder="Mulligans, Skins..." className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5" />
          </div>
          <div className="md:col-span-3">
            <label className="block text-sm text-gray-400 mb-2">Quantity Available</label>
            <input type="number" value={newAddon.quantity_available} onChange={(e) => setNewAddon({ ...newAddon, quantity_available: parseInt(e.target.value) || 1 })} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5" min="1" />
          </div>
          <div className="md:col-span-3">
            <label className="block text-sm text-gray-400 mb-2">Price per Unit ($)</label>
            <input type="number" value={newAddon.price_per_unit} onChange={(e) => setNewAddon({ ...newAddon, price_per_unit: parseFloat(e.target.value) || 0 })} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5" min="0" step="0.01" />
          </div>
          <div className="md:col-span-1">
            <button onClick={handleAddAddon} className="w-full h-12 bg-green-600 hover:bg-green-700 rounded-3xl font-medium">Add</button>
          </div>
        </div>

        {addons.length > 0 ? (
          <div className="space-y-3">
            {addons.map((addon: any) => (
              <div key={addon.id} className="flex justify-between items-center bg-gray-800 p-5 rounded-3xl">
                <div>
                  <span className="font-medium">{addon.name}</span>
                  <span className="ml-4 text-gray-400 text-sm">{addon.quantity_available} × ${addon.price_per_unit}</span>
                </div>
                <button onClick={() => handleDeleteAddon(addon.id)} className="text-red-400 hover:text-red-500 px-4 py-2 text-sm font-medium">Remove</button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-center py-8">No add-ons yet. Add one above.</p>
        )}
      </div>
    )}

    {/* Flights Panel */}
    {showFlights && (
      <div className="bg-gray-900 border border-purple-500/30 rounded-3xl p-8">
        <h3 className="text-xl font-medium mb-6">Manage Flights</h3>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end mb-8">
          <div className="md:col-span-4">
            <input value={newFlight.name} onChange={(e) => setNewFlight({ ...newFlight, name: e.target.value })} placeholder="Flight A..." className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5" />
          </div>
          <div className="md:col-span-4">
            <input value={newFlight.range} onChange={(e) => setNewFlight({ ...newFlight, range: e.target.value })} placeholder="<15 or 4.0-7.9" className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5" />
          </div>
          <div className="md:col-span-4">
            <button onClick={handleAddFlight} className="w-full bg-purple-600 hover:bg-purple-700 py-5 rounded-3xl font-medium">Add Flight</button>
          </div>
        </div>

        <div className="space-y-6">
          {(event.flights || []).map((flight: any, index: number) => (
            <div key={index} className="bg-gray-800 p-6 rounded-3xl">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className="font-semibold text-lg">{flight.name}</span>
                  <span className="ml-4 text-gray-400">Range: {flight.range}</span>
                </div>
                <button onClick={() => handleDeleteFlight(index)} className="text-red-500 hover:text-red-600 text-sm">Remove</button>
              </div>
              <label className="block text-sm text-gray-400 mb-2">Tees for this Flight</label>
              <select value={flight.tee || ''} onChange={(e) => {
                const updated = [...(event.flights || [])];
                updated[index] = { ...updated[index], tee: e.target.value };
                handleEventChange('flights', updated);
              }} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5">
                <option value="">Select Tees</option>
                {availableTees.map((tee: any, i: number) => {
                  const teeName = tee.name || tee.tee_name || tee.color || `Tee ${i+1}`;
                  const teeYards = tee.total_yards || tee.yardage || 0;
                  return <option key={i} value={teeName}>{teeName} ({teeYards} yds)</option>;
                })}
              </select>
            </div>
          ))}
        </div>

        {(event.flights || []).length === 0 && <p className="text-gray-400 text-center py-8">No flights added yet.</p>}
      </div>
    )}

    {/* Admins Panel */}
    {showAdmins && (
      <div className="bg-gray-900 border border-indigo-500/30 rounded-3xl p-8">
        {/* ... your admins panel code (same as before) ... */}
        <h3 className="text-xl font-medium mb-6 flex items-center gap-2">
          Event Admins <span className="text-sm bg-indigo-600 text-white px-3 py-1 rounded-full">{admins.length}</span>
        </h3>
        {/* (keep your existing admins list + add new admin form here) */}
      </div>
    )}

    {/* ====================== MAIN FORM FIELDS ====================== */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <label className="block text-sm text-gray-400 mb-2">Event Name</label>
        <input value={event.name || ''} onChange={(e) => handleEventChange('name', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5" />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-2">Event Type</label>
        <select value={event.event_type || ''} onChange={(e) => handleEventChange('event_type', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5">
          <option value="">Select Event Type</option>
          <option value="individual">Individual Stroke Play</option>
          <option value="2man-best-ball">2-Man Best Ball</option>
          <option value="2man-scramble">2-Man Scramble</option>
          <option value="4man-best-ball">4-Man Best Ball</option>
          <option value="4man-scramble">4-Man Scramble</option>
          <option value="skins">Skins Match</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-2">{event.event_type?.toLowerCase() === 'individual' ? 'Price' : 'Team Price'}</label>
        <input type="number" value={event.price || ''} onChange={(e) => handleEventChange('price', parseFloat(e.target.value) || 0)} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5" />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-2">Golfers per Team</label>
        <input type="number" value={event.max_teammates || 1} onChange={(e) => handleEventChange('max_teammates', parseInt(e.target.value) || 1)} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5" min="1" />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-2">Registration Open Date</label>
        <input type="date" value={event.registration_open_date || ''} onChange={(e) => handleEventChange('registration_open_date', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5" />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-2">Open Time</label>
        <input type="time" value={event.registration_open_time || ''} onChange={(e) => handleEventChange('registration_open_time', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5" />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-2">Event Date</label>
        <input type="date" value={event.date || ''} onChange={(e) => handleEventChange('date', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5" />
      </div>

      {/* Number of Holes Toggle */}
      <div className="md:col-span-2">
        <label className="block text-sm text-gray-400 mb-3">Number of Holes</label>
        <div className="flex gap-3 bg-gray-700 border border-gray-600 rounded-3xl p-1">
          <button type="button" onClick={() => handleEventChange('number_of_holes', 9)} className={`flex-1 py-4 rounded-3xl font-medium ${event?.number_of_holes === 9 ? 'bg-blue-600 text-white' : 'hover:bg-gray-600 text-gray-300'}`}>9 Holes</button>
          <button type="button" onClick={() => handleEventChange('number_of_holes', 18)} className={`flex-1 py-4 rounded-3xl font-medium ${event?.number_of_holes === 18 || !event?.number_of_holes ? 'bg-blue-600 text-white' : 'hover:bg-gray-600 text-gray-300'}`}>18 Holes</button>
        </div>
      </div>

      {/* Players per Hole */}
      <div>
        <label className="block text-sm text-gray-400 mb-2">Players per Hole</label>
        <input type="number" value={event.players_per_hole || 4} onChange={(e) => handleEventChange('players_per_hole', parseInt(e.target.value) || 4)} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5" min="1" />
      </div>

      {/* Start Format */}
      <div>
        <label className="block text-sm text-gray-400 mb-2">Start Format</label>
        <select value={event.start_format || 'shotgun'} onChange={(e) => handleEventChange('start_format', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5">
          <option value="shotgun">Shotgun Start</option>
          <option value="tee_times">Tee Times</option>
          <option value="double_tee">Double Tee</option>
        </select>
      </div>

      {event.start_format === 'tee_times' && (
        <div>
          <label className="block text-sm text-gray-400 mb-2">Minutes between Tee Times</label>
          <input type="number" value={event.tee_time_interval || 10} onChange={(e) => handleEventChange('tee_time_interval', parseInt(e.target.value) || 10)} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5" min="5" />
        </div>
      )}

      {/* Starting Hole */}
      <div>
        <label className="block text-sm text-gray-400 mb-2">Starting Hole</label>
        <select value={event.starting_hole || 1} onChange={(e) => handleEventChange('starting_hole', parseInt(e.target.value))} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5">
          {Array.from({ length: event?.number_of_holes || 18 }, (_, i) => (
            <option key={i + 1} value={i + 1}>Hole {i + 1}</option>
          ))}
        </select>
      </div>

      {/* Event Contact - Clean stacked */}
      <div className="md:col-span-2">
        <label className="block text-sm text-gray-400 mb-4">Event Contact (optional)</label>
        <div className="space-y-6">
          <div>
            <label className="block text-xs text-gray-500 mb-2">Contact Name</label>
            <input placeholder="Kyle Vogt" value={event.contact_name || ''} onChange={(e) => handleEventChange('contact_name', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5 text-base" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-2">Email Address</label>
            <input type="email" placeholder="kyle@friedeggevents.app" value={event.contact_email || ''} onChange={(e) => handleEventChange('contact_email', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5 text-base" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-2">Phone Number</label>
            <input type="tel" placeholder="(555) 123-4567" value={event.contact_phone || ''} onChange={(e) => handleEventChange('contact_phone', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5 text-base" />
          </div>
        </div>
      </div>

      {/* USGA Checkbox */}
      <div className="md:col-span-2">
        <label className="flex items-center gap-3 text-lg cursor-pointer">
          <input type="checkbox" checked={!!event?.usga_event} onChange={(e) => handleEventChange('usga_event', e.target.checked)} className="w-6 h-6 accent-blue-600" />
          <span className="font-medium">USGA Event (submit scores to USGA)</span>
        </label>
      </div>

      {/* Handicaps Checkbox */}
      <div className="md:col-span-2 mt-6 pt-8 border-t border-gray-700">
        <label className="flex items-center gap-3 text-lg cursor-pointer">
          <input type="checkbox" checked={!!event?.use_handicaps} onChange={(e) => handleEventChange('use_handicaps', e.target.checked)} className="w-6 h-6 accent-blue-600" />
          <span className="font-medium">Use Handicaps for this Event</span>
        </label>
        <p className="text-sm text-gray-500 mt-2 ml-9">
          When enabled, you can enter individual handicaps for each player or team in the Check-in tab.
        </p>
      </div>
    </div>

    {/* Save / Postpone / Delete Buttons */}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <button onClick={handleSaveEvent} disabled={saving} className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 py-5 rounded-3xl font-semibold text-lg">
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
      <button onClick={() => alert('Update the date and save to postpone the event')} className="bg-amber-600 hover:bg-amber-700 py-5 rounded-3xl font-semibold text-lg">
        Postpone Event
      </button>
      <button onClick={async () => {
        if (confirm('Delete this event permanently?')) {
          await supabase.from('tournaments').delete().eq('id', parseInt(eventId));
          router.push('/dashboard');
        }
      }} className="bg-red-600 hover:bg-red-700 py-5 rounded-3xl font-semibold text-lg">
        Delete Event
      </button>
    </div>

  </div>
)}


      {/* ====================== CHECK-IN TAB (Tighter Rows) ====================== */}
{activeTab === 'checkin' && (
  <div className="bg-gray-800 rounded-3xl p-6 md:p-8">

    {/* Title */}
    <h2 className="text-3xl font-semibold mb-6">Player Check-in</h2>

    {/* Search + Add Player */}
    <div className="flex flex-col sm:flex-row gap-4 mb-8">
      <input
        type="text"
        placeholder="Search by name or team..."
        value={searchTerm || ''}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="flex-1 bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4 focus:outline-none focus:border-blue-500 text-base"
      />
      
      <button
        onClick={() => setShowAddPlayerModal(true)}
        className="bg-blue-600 hover:bg-blue-700 px-8 py-4 rounded-3xl font-medium flex items-center justify-center gap-2 whitespace-nowrap"
      >
        + Add Player
      </button>
    </div>

    {registrations.length === 0 ? (
      <div className="text-center py-20 text-gray-400">
        No registrations yet for this event.
      </div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-900">
              <th className="text-left py-3 px-6 font-medium">Player Name</th>
              <th className="text-left py-3 px-6 font-medium">Team</th>
              {event?.use_handicaps && (
                <th className="text-center py-3 px-6 font-medium">Handicap</th>
              )}
              {(event?.flights && event.flights.length > 0) && (
                <th className="text-center py-3 px-6 font-medium">Flight</th>
              )}
              {addons.map((addon: any) => (
                <th key={addon.id} className="text-center py-3 px-6 font-medium">{addon.name}</th>
              ))}
              <th className="text-center py-3 px-6 font-medium">Add-on Total</th>
              <th className="text-center py-3 px-6 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {registrations
              .filter((reg: any) => 
                !searchTerm || 
                (reg.player_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (reg.team_name || '').toLowerCase().includes(searchTerm.toLowerCase())
              )
              .sort((a: any, b: any) => (a.player_name || '').localeCompare(b.player_name || ''))
              .map((reg: any) => {
                const isCheckedIn = reg.checked_in || false;
                const isPaidForAddons = reg.paid_addons || false;
                const addonTotals = reg.addon_quantities || selectedQuantities[reg.id] || {};

                const addonCost = addons.reduce((sum: number, addon: any) => {
                  const qty = addonTotals[addon.id] || 0;
                  return sum + qty * (addon.price_per_unit || 0);
                }, 0);

                const hasPaidAddons = isPaidForAddons && Object.keys(addonTotals).length > 0;

                return (
                  <tr key={reg.id} className="border-b border-gray-700 hover:bg-gray-750">
                    <td className="py-2 px-6 font-medium">{reg.player_name || 'Unknown'}</td>
                    <td className="py-2 px-6 text-gray-400">{reg.team_name || 'Individual'}</td>

                    {event?.use_handicaps && (
                      <td className="py-2 px-6 text-center">
                        <input
                          type="number"
                          value={reg.handicap ?? ''}
                          onChange={async (e) => {
                            const newHandicap = parseFloat(e.target.value) || 0;
                            const assignedFlight = getFlightFromHandicap(newHandicap, event.flights || []);

                            const { error } = await supabase
                              .from('event_registrations')
                              .update({ handicap: newHandicap, flight: assignedFlight })
                              .eq('id', reg.id);

                            if (error) console.error("Failed to save handicap:", error);
                            fetchRegistrations();
                          }}
                          className="w-20 bg-gray-700 border border-gray-600 rounded-xl text-center py-2 focus:outline-none focus:border-blue-500"
                        />
                      </td>
                    )}

                    {(event?.flights && event.flights.length > 0) && (
                      <td className="py-2 px-6 text-center font-medium">
                        {reg.flight || '—'}
                      </td>
                    )}

                    {addons.map((addon: any) => {
                      const qty = addonTotals[addon.id] || 0;
                      return (
                        <td key={addon.id} className="py-2 px-6 text-center">
                          {hasPaidAddons ? (
                            <div className="text-emerald-400 font-medium">{qty} × ${addon.price_per_unit}</div>
                          ) : (
                            <div className="flex flex-col items-center gap-1">
                              <input 
                                type="checkbox" 
                                checked={qty > 0} 
                                onChange={(e) => {
                                  const newQty = e.target.checked ? 1 : 0;
                                  setSelectedQuantities((prev) => ({
                                    ...prev,
                                    [reg.id]: { ...(prev[reg.id] || {}), [addon.id]: newQty }
                                  }));
                                }} 
                                className="w-5 h-5 accent-green-600" 
                              />
                              {addon.quantity_available > 1 && qty > 0 && (
                                <select value={qty} onChange={(e) => {
                                  const newQty = parseInt(e.target.value);
                                  setSelectedQuantities((prev) => ({
                                    ...prev,
                                    [reg.id]: { ...(prev[reg.id] || {}), [addon.id]: newQty }
                                  }));
                                }} className="bg-gray-700 border border-gray-600 rounded-xl text-xs px-2 py-1">
                                  {Array.from({ length: addon.quantity_available }, (_, i) => i + 1).map(n => (
                                    <option key={n} value={n}>{n}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}

                    <td className="py-2 px-6 text-center font-medium text-emerald-400">
                      ${addonCost.toFixed(2)}
                    </td>

                    <td className="py-2 px-6 text-center">
                      <div className="flex flex-wrap gap-3 justify-center">
                        {addonCost > 0 && !isPaidForAddons ? (
                          <button onClick={() => openPaymentModal(reg)} className="bg-amber-600 hover:bg-amber-700 px-6 py-2.5 rounded-2xl text-sm font-medium text-white">
                            Pay ${addonCost}
                          </button>
                        ) : (
                          <button 
                            onClick={async () => {
                              if (isCheckedIn) {
                                if (!confirm(`Un-check in ${reg.player_name}?`)) return;
                                await supabase.from('event_registrations').update({ checked_in: false }).eq('id', reg.id);
                              } else {
                                await supabase.from('event_registrations').update({ checked_in: true }).eq('id', reg.id);
                              }
                              fetchRegistrations();
                            }} 
                            className={`px-8 py-2.5 rounded-2xl text-sm font-medium transition-all ${isCheckedIn ? 'bg-green-600 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
                          >
                            {isCheckedIn ? '✓ Checked In' : 'Check In'}
                          </button>
                        )}

                        <div className="flex gap-2">
                          <button onClick={() => handleRemovePlayer(reg)} className="text-red-400 hover:text-red-500 text-sm font-medium px-4 py-2">Remove</button>
                          <button onClick={() => {
                            setSubPlayerReg(reg);
                            setSubName('');
                            setSubEmail('');
                            setShowSubModal(true);
                          }} className="text-blue-400 hover:text-blue-500 text-sm font-medium px-4 py-2">Sub Player</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    )}
  </div>
)}



                {/* ====================== MODALS ====================== */}

        {/* Sub Player Modal */}
        {showSubModal && subPlayerReg && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-gray-900 rounded-3xl p-10 max-w-md w-full mx-4">
              <h3 className="text-2xl font-semibold mb-6">Substitute Player</h3>
              <p className="text-gray-400 mb-8">Replace <span className="text-white font-medium">{subPlayerReg.player_name}</span></p>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">New Player Name</label>
                  <input type="text" value={subName} onChange={(e) => setSubName(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">New Player Email (optional)</label>
                  <input type="email" value={subEmail} onChange={(e) => setSubEmail(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4" />
                </div>
              </div>
              <div className="flex gap-4 mt-10">
                <button onClick={handleSubstitutePlayer} className="flex-1 bg-green-600 hover:bg-green-700 py-4 rounded-2xl font-semibold">Substitute Player</button>
                <button onClick={() => { setShowSubModal(false); setSubName(''); setSubEmail(''); }} className="flex-1 bg-gray-700 hover:bg-gray-600 py-4 rounded-2xl font-semibold">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Add Player Modal */}
        {showAddPlayerModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-gray-900 rounded-3xl p-10 max-w-md w-full mx-4">
              <h3 className="text-2xl font-semibold mb-8 text-center">Add New Player</h3>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Player Name</label>
                  <input type="text" value={newPlayerName} onChange={(e) => setNewPlayerName(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4" placeholder="Player name" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Email (optional)</label>
                  <input type="email" value={newPlayerEmail} onChange={(e) => setNewPlayerEmail(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4" placeholder="player@email.com" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Team Name (optional)</label>
                  <input type="text" value={newPlayerTeam} onChange={(e) => setNewPlayerTeam(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4" placeholder="Team name" />
                </div>
              </div>
              <div className="flex gap-4 mt-10">
                <button onClick={handleAddPlayer} className="flex-1 bg-blue-600 hover:bg-blue-700 py-4 rounded-2xl font-semibold">Add Player</button>
                <button onClick={() => { setShowAddPlayerModal(false); setNewPlayerName(''); setNewPlayerEmail(''); setNewPlayerTeam(''); }} className="flex-1 bg-gray-700 hover:bg-gray-600 py-4 rounded-2xl font-semibold">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* ====================== PAYMENT MODAL ====================== */}
        {showPaymentModal && currentPayReg && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-gray-900 rounded-3xl p-10 max-w-md w-full mx-4">
              <h3 className="text-2xl font-semibold mb-8 text-center">
                Payment for {currentPayReg.player_name}
              </h3>

              <div className="grid grid-cols-1 gap-4">
                <button
                  onClick={handleCheckout}
                  className="bg-green-600 hover:bg-green-700 py-5 rounded-2xl text-lg font-semibold"
                >
                  💳 Checkout with Card
                </button>

                <button
                  onClick={handlePaidCash}
                  className="bg-emerald-600 hover:bg-emerald-700 py-5 rounded-2xl text-lg font-semibold"
                >
                  💵 Paid Cash / Check In
                </button>
              </div>

              <button
                onClick={() => setShowPaymentModal(false)}
                className="w-full mt-6 py-4 text-gray-400 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

                           {/* ====================== SCORING TAB (Gross + Net Total) ====================== */}
{activeTab === 'scoring' && (
  <div className="bg-gray-800 rounded-3xl p-6 md:p-8">
    <div className="flex justify-between items-center mb-8">
      <h2 className="text-3xl font-semibold">Score Entry</h2>
      <p className="text-gray-400">
        {event?.course || 'No course selected'} • {event?.number_of_holes || 18} holes
      </p>
    </div>

    {registrations.filter(r => r.checked_in).length === 0 ? (
      <div className="text-center py-20 text-gray-400">
        No players checked in yet.<br />
        Go to the Check-in tab first.
      </div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[1700px]">
          <thead>
            {/* Hole Numbers Row */}
            <tr className="border-b border-gray-700 bg-gray-900">
              <th className="text-left py-4 px-6 font-medium w-52">Team / Player</th>

              {/* Front 9 - Holes 1-9 */}
              {Array.from({ length: 9 }, (_, i) => (
                <th key={i} className="text-center py-4 px-6 font-medium text-sm">
                  {i + 1}
                </th>
              ))}

              <th className="text-center py-4 px-6 font-medium text-emerald-400 leading-tight border-l-2 border-r-2 border-emerald-500">
                In
                <div className="text-xs text-gray-400 mt-1">
                  {(() => {
                    const front9Holes = getHolesFromCourseData(event?.course_data, 18).slice(0, 9);
                    const front9Par = front9Holes.reduce((sum, h) => sum + (h?.par || 4), 0);
                    const front9Yardage = front9Holes.reduce((sum, h) => sum + (h?.yardage || 0), 0);
                    return `P: ${front9Par} • Y: ${front9Yardage}`;
                  })()}
                </div>
              </th>

              {/* Back 9 - Holes 10-18 */}
              {Array.from({ length: 9 }, (_, i) => (
                <th key={i + 9} className="text-center py-4 px-6 font-medium text-sm">
                  {i + 10}
                </th>
              ))}

              <th className="text-center py-4 px-6 font-medium text-emerald-400">Out</th>
              <th className="text-center py-4 px-6 font-medium">Gross</th>

              {/* Net Total Column */}
              {event?.use_handicaps && (
                <th className="text-center py-4 px-6 font-medium text-emerald-400">Net</th>
              )}

              <th className="w-24"></th>
            </tr>

            {/* Par / Handicap / Yardage Row */}
            <tr className="border-b border-gray-800 bg-gray-900 text-xs">
              <th className="text-left py-4 px-6 font-medium">
                <div className="mt-6">Par</div>
                <div className="mt-6">Handicap</div>
                <div className="mt-6">Yardage</div>
              </th>

              {Array.from({ length: 9 }, (_, i) => {
                const holeData = getHolesFromCourseData(event?.course_data, 18)[i];
                return (
                  <th key={i} className="text-center py-2 px-2 text-[15px] leading-tight">
                    <div className="h-6"></div>
                    <div>{holeData?.par || 4}</div>
                    <div className="mt-6 text-blue-300">{holeData?.handicap || '-'}</div>
                    <div className="mt-6 text-amber-300">{holeData?.yardage || 0}</div>
                  </th>
                );
              })}

              <th className="text-center py-4 px-6 font-medium text-emerald-400 leading-tight border-l-2 border-r-2 border-emerald-500"></th>

              {Array.from({ length: 9 }, (_, i) => {
                const holeData = getHolesFromCourseData(event?.course_data, 18)[i + 9];
                return (
                  <th key={i + 9} className="text-center py-2 px-2 text-[15px] leading-tight">
                    <div className="h-6"></div>
                    <div>{holeData?.par || 4}</div>
                    <div className="mt-6 text-blue-300">{holeData?.handicap || '-'}</div>
                    <div className="mt-6 text-amber-300">{holeData?.yardage || 0}</div>
                  </th>
                );
              })}

              <th></th>
              {event?.use_handicaps && <th></th>}
              <th></th>
            </tr>
          </thead>

          <tbody>
            {(() => {
              const isTeamEvent = (event?.max_teammates || 1) > 1;

              const grouped = registrations
                .filter(r => r.checked_in)
                .reduce((acc: any, reg) => {
                  const key = isTeamEvent && reg.team_name ? reg.team_name : (reg.player_name || 'Unknown');
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(reg);
                  return acc;
                }, {});

              return Object.keys(grouped).map(teamKey => {
                const teamMembers = grouped[teamKey];
                const representativeId = teamMembers[0].id;

                const scores = playerScores[representativeId] || {};

                const front9 = Array.from({ length: 9 }, (_, i) => scores[i + 1] || 0).reduce((a, b) => a + b, 0);
                const back9 = Array.from({ length: 9 }, (_, i) => scores[i + 10] || 0).reduce((a, b) => a + b, 0);
                const gross = front9 + back9;

                // Net calculation
                let net = gross;
                if (event?.use_handicaps) {
                  const avgHandicap = teamMembers.reduce((sum: number, r: any) => sum + (r.handicap || 0), 0) / teamMembers.length;
                  net = Math.round(gross - avgHandicap);
                }

                return (
                  <tr key={teamKey} className="border-b border-gray-700 hover:bg-gray-700/50">
                    <td className="py-3 px-6 font-medium">
                      {teamKey}
                      {isTeamEvent && <div className="text-xs text-gray-400">{teamMembers.length} players</div>}
                    </td>

                    {/* Front 9 holes */}
                    {Array.from({ length: 9 }, (_, i) => {
                      const hole = i + 1;
                      const score = scores[hole];
                      const holeData = getHolesFromCourseData(event?.course_data, 18)[i];
                      const par = holeData?.par || 4;
                      const underPar = score != null ? Number(score) - par : 0;

                      const isBirdie = underPar === -1;
                      const isEagle = underPar === -2;
                      const isBogey = underPar === 1;
                      const isDoubleBogey = underPar >= 2;

                      return (
                        <td key={hole} className="text-center py-2 px-2">
                          <div className={`inline-flex items-center justify-center rounded-2xl transition-all
                            ${isBirdie ? 'ring-2 ring-green-400' : ''}
                            ${isEagle ? 'ring-4 ring-green-400 ring-offset-2 ring-offset-gray-700' : ''}
                            ${isBogey ? 'border-2 border-orange-400' : ''}
                            ${isDoubleBogey ? 'border-4 border-orange-400' : ''}
                          `}>
                            <input
                              type="number"
                              min="0"
                              max="20"
                              value={score || ''}
                              onChange={(e) => updateScore(representativeId, hole, parseInt(e.target.value) || 0)}
                              className="w-12 bg-gray-700 border border-gray-600 rounded-2xl text-center py-2 focus:outline-none focus:border-blue-500 no-spinner"
                            />
                          </div>
                        </td>
                      );
                    })}

                    <td className="text-center py-3 px-6 font-semibold text-emerald-400 text-lg border-l-2 border-r-2 border-emerald-500">
                      {front9}
                    </td>

                    {/* Back 9 holes */}
                    {Array.from({ length: 9 }, (_, i) => {
                      const hole = i + 10;
                      const score = scores[hole];
                      const holeData = getHolesFromCourseData(event?.course_data, 18)[i + 9];
                      const par = holeData?.par || 4;
                      const underPar = score != null ? Number(score) - par : 0;

                      const isBirdie = underPar === -1;
                      const isEagle = underPar === -2;
                      const isBogey = underPar === 1;
                      const isDoubleBogey = underPar >= 2;

                      return (
                        <td key={hole} className="text-center py-2 px-2">
                          <div className={`inline-flex items-center justify-center rounded-2xl transition-all
                            ${isBirdie ? 'ring-2 ring-green-400' : ''}
                            ${isEagle ? 'ring-4 ring-green-400 ring-offset-2 ring-offset-gray-700' : ''}
                            ${isBogey ? 'border-2 border-orange-400' : ''}
                            ${isDoubleBogey ? 'border-4 border-orange-400' : ''}
                          `}>
                            <input
                              type="number"
                              min="0"
                              max="20"
                              value={score || ''}
                              onChange={(e) => updateScore(representativeId, hole, parseInt(e.target.value) || 0)}
                              className="w-12 bg-gray-700 border border-gray-600 rounded-2xl text-center py-2 focus:outline-none focus:border-blue-500 no-spinner"
                            />
                          </div>
                        </td>
                      );
                    })}

                    <td className="text-center py-3 px-6 font-semibold text-emerald-400 text-lg">{back9}</td>

                    {/* Gross Total */}
                    <td className="text-center py-3 px-6 font-bold text-2xl text-white">{gross || '-'}</td>

                    {/* Net Total */}
                    {event?.use_handicaps && (
                      <td className="text-center py-3 px-6 font-bold text-2xl text-emerald-400">{net || '-'}</td>
                    )}

                    <td className="text-center py-3 px-6">
                      <button
                        onClick={async () => {
                          if (confirm(`Submit score for ${teamKey}?`)) {
                            await savePlayerScores(representativeId);
                          }
                        }}
                        className="bg-green-600 hover:bg-green-700 px-6 py-2.5 rounded-2xl text-sm font-medium"
                      >
                        Submit
                      </button>
                    </td>
                  </tr>
                );
              });
            })()}
          </tbody>
        </table>
      </div>
    )}
  </div>
)}


        {/* ====================== ALL OTHER TABS & MODALS ====================== */}
                             {/* ====================== LEADERBOARD TAB (Clean Header) ====================== */}
{activeTab === 'leaderboard' && (
  <div className="bg-gray-800 rounded-3xl p-6 md:p-8">

    {/* Clean Header - Title on top, course info below */}
    <div className="mb-8">
      <h2 className="text-3xl font-semibold">Leaderboard</h2>
      <p className="text-gray-400 mt-1">
        {event?.course || 'No course selected'} • Live standings
      </p>
    </div>

    {/* Flight Filters + Gross/Net Toggle */}
    <div className="flex flex-wrap items-center gap-3 mb-8">
      <button
        onClick={() => setSelectedFlight('all')}
        className={`px-5 py-2.5 rounded-3xl font-medium text-sm transition-all ${
          selectedFlight === 'all' ? 'bg-white text-black shadow-sm' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
        }`}
      >
        All Flights
      </button>

      {event?.flights && event.flights.length > 0 && event.flights.map((flight: any, index: number) => (
        <button
          key={index}
          onClick={() => setSelectedFlight(flight.name)}
          className={`px-5 py-2.5 rounded-3xl font-medium text-sm transition-all ${
            selectedFlight === flight.name ? 'bg-white text-black shadow-sm' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
          }`}
        >
          {flight.name}
        </button>
      ))}

      {event?.use_handicaps && (
        <button
          onClick={() => setShowNet(!showNet)}
          className="ml-auto flex items-center gap-2 bg-gray-700 hover:bg-gray-600 rounded-3xl px-2 py-1 text-sm font-medium"
        >
          <span className={`px-5 py-2 rounded-3xl transition-all ${!showNet ? 'bg-white text-black' : ''}`}>
            Gross Score
          </span>
          <span className={`px-5 py-2 rounded-3xl transition-all ${showNet ? 'bg-emerald-500 text-white' : ''}`}>
            Net (HDCP)
          </span>
        </button>
      )}
    </div>

    {/* Table (unchanged) */}
    {registrations.filter(r => r.checked_in).length === 0 ? (
      <div className="text-center py-20 text-gray-400">
        No players checked in yet.<br />
        Go to the Check-in tab first.
      </div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[1300px]">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-900">
              <th className="text-left py-4 px-6 font-medium w-16">Pos</th>
              <th className="text-left py-4 px-6 font-medium">Team</th>
              {Array.from({ length: event?.number_of_holes || 18 }, (_, i) => (
                <th key={i} className="text-center py-4 px-3 font-medium text-sm w-10">
                  {i + 1}
                </th>
              ))}
              <th className="text-center py-4 px-6 font-medium text-emerald-400">In</th>
              {event?.number_of_holes > 9 && (
                <th className="text-center py-4 px-6 font-medium text-emerald-400">Out</th>
              )}
              <th className="text-center py-4 px-6 font-medium">Total</th>
            </tr>
          </thead>

          <tbody>
            {(() => {
              let filteredRegs = registrations.filter(r => r.checked_in);
              if (selectedFlight !== 'all' && event?.flights) {
                filteredRegs = filteredRegs.filter(r => r.flight === selectedFlight);
              }

              const grouped = filteredRegs.reduce((acc: any, reg) => {
                const teamKey = reg.team_name || reg.player_name || 'Unknown';
                if (!acc[teamKey]) acc[teamKey] = [];
                acc[teamKey].push(reg);
                return acc;
              }, {});

              const rows = Object.keys(grouped).map(teamName => {
                const teamMembers = grouped[teamName];
                const scores: Record<number, number> = {};

                teamMembers.forEach((reg: any) => {
                  const regScores = playerScores[reg.id] || {};
                  Object.keys(regScores).forEach(holeKey => {
                    const hole = Number(holeKey);
                    const score = regScores[hole];
                    if (score !== undefined) {
                      scores[hole] = scores[hole] !== undefined 
                        ? Math.min(scores[hole], score) 
                        : score;
                    }
                  });
                });

                const numHoles = event?.number_of_holes || 18;
                const front9 = Array.from({ length: Math.min(9, numHoles) }, (_, i) => scores[i + 1] || 0).reduce((a, b) => a + b, 0);
                const back9 = numHoles > 9 
                  ? Array.from({ length: numHoles - 9 }, (_, i) => scores[i + 10] || 0).reduce((a, b) => a + b, 0)
                  : 0;
                let total = front9 + back9;

                if (showNet && event?.use_handicaps) {
                  const avgHandicap = teamMembers.reduce((sum: number, r: any) => sum + (r.handicap || 0), 0) / teamMembers.length;
                  total = Math.round(total - avgHandicap);
                }

                return { teamName, scores, front9, back9, total };
              }).sort((a, b) => a.total - b.total);

              let rank = 1;
              return rows.map((row, index) => {
                const prevTotal = index > 0 ? rows[index - 1].total : null;
                if (row.total !== prevTotal) rank = index + 1;

                const position = rank === 1 ? '1' : 
                                (rows[index - 1]?.total === row.total ? `T${rank}` : rank);

                return (
                  <tr key={row.teamName} className="border-b border-gray-700 hover:bg-gray-700/50">
                    <td className="py-5 px-6 font-bold text-lg text-center">{position}</td>
                    <td className="py-5 px-6 font-medium">{row.teamName}</td>

                    {Array.from({ length: event?.number_of_holes || 18 }, (_, i) => {
                      const hole = i + 1;
                      return (
                        <td key={hole} className="text-center py-5 px-2 font-medium text-gray-300">
                          {row.scores[hole] || '-'}
                        </td>
                      );
                    })}

                    <td className="text-center py-5 px-6 font-semibold text-emerald-400 text-lg">{row.front9}</td>
                    {event?.number_of_holes > 9 && (
                      <td className="text-center py-5 px-6 font-semibold text-emerald-400 text-lg">{row.back9}</td>
                    )}
                    <td className="text-center py-5 px-6 font-bold text-2xl text-white">{row.total || '-'}</td>
                  </tr>
                );
              });
            })()}
          </tbody>
        </table>
      </div>
    )}
  </div>
)}


{/* ====================== SCORECARDS TAB (REAL PDF DOWNLOAD) ====================== */}
{activeTab === 'scorecards' && (
  <div className="space-y-6">
    {/* Header with Generate All button */}
    <div className="flex justify-between items-center">
      <div>
        <h2 className="text-2xl font-bold">Scorecards</h2>
        <p className="text-gray-500">Download individual or all team scorecards as PDF</p>
      </div>
      
      <button
        onClick={generateAllScorecards}
        className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium flex items-center gap-2 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2" />
        </svg>
        Generate All Scorecards
      </button>
    </div>

    {/* Team Cards */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {teams.map((team: any) => (
        <div key={team.id} className="border border-gray-200 rounded-xl p-6 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="font-semibold text-lg">{team.name}</h3>
              <p className="text-sm text-gray-500">{team.players?.length || 0} players</p>
            </div>
            <div className="text-right">
              <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                Team {team.id.slice(0,4)}
              </span>
            </div>
          </div>

          {/* QR Code Placeholder (will be real later) */}
          <div className="bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg h-32 flex items-center justify-center mb-4">
            <div className="text-center">
              <div className="text-4xl mb-1">📱</div>
              <p className="text-xs text-gray-500">QR Code for Live Scoring</p>
            </div>
          </div>

          {/* Download Button */}
          <PDFDownloadLink
            document={<ScorecardPDF team={team} />}
            fileName={`${team.name.replace(/\s+/g, '-')}-scorecard.pdf`}
            className="block w-full text-center bg-black hover:bg-gray-800 text-white py-3 rounded-lg font-medium transition-colors"
          >
            {({ loading }) => 
              loading ? "Generating PDF..." : "📄 Download PDF Scorecard"
            }
          </PDFDownloadLink>
        </div>
      ))}
    </div>

    {teams.length === 0 && (
      <div className="text-center py-12 text-gray-400">
        No teams found. Add teams in the Manage tab.
      </div>
    )}
  </div>
)}
        

      </div>
    </div>
  );
}
           