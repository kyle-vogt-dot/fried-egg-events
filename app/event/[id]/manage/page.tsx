'use client';

import { useState, useEffect, useRef } from 'react';

import { createBrowserClient } from '@supabase/ssr';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import EventEmailsPanel from '@/app/components/EventEmailsPanel';
import EventTabs from '@/app/components/EventTabs';
import BackButton from '@/app/components/BackButton';
import { loadEventAccess, canUse } from '@/app/libs/event-admin';
import {
  DEFAULT_PLATFORM_FEE_PERCENT,
  resolvePlatformFeePercent,
} from '@/app/libs/platform-fee';



const teamSizeFromEventType = (type: string) => {
  if (!type) return 1;
  if (type === 'individual') return 1;
  if (type.startsWith('2man')) return 2;
  if (type.startsWith('4man')) return 4;
  return 1; // other / unknown
};

const ROUND_FORMATS = [
  { value: 'stroke', label: 'Stroke' },
  { value: 'scramble', label: 'Scramble' },
  { value: 'shamble', label: 'Shamble' },
  { value: 'alt_shot', label: 'Alt shot' },
  { value: 'best_ball', label: 'Best ball' },
] as const;

function startTypeLabel(type?: string | null) {
  if (type === 'tee_times') return 'Tee times';
  if (type === 'double_tee') return 'Double tee';
  return 'Shotgun';
}

function formatLabel(type?: string | null) {
  const v = normalizeRoundFormat(type);
  return ROUND_FORMATS.find((f) => f.value === v)?.label || v || '';
}

function normalizeRoundFormat(type?: string | null) {
  const t = String(type || '').toLowerCase();
  if (t.includes('shamble')) return 'shamble';
  if (t.includes('scramble')) return 'scramble';
  if (t.includes('best')) return 'best_ball';
  if (t.includes('alt')) return 'alt_shot';
  if (
    t === 'stroke' ||
    t === 'individual' ||
    t.includes('stroke')
  ) {
    return 'stroke';
  }
  return t && ROUND_FORMATS.some((f) => f.value === t) ? t : '';
}

function courseDisplayName(course: any): string {
  if (!course) return '';
  return (
    course.course_name ||
    course.name ||
    course.club_name ||
    course.course?.course_name ||
    course.course?.name ||
    course.course?.club_name ||
    ''
  );
}

function tomorrowDateStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function roundHasGreensFee(fee: unknown) {
  return String(fee ?? '').trim() !== '';
}

function hasFilledAmount(value: unknown) {
  const s = String(value ?? '').trim();
  if (s === '') return false;
  const n = Number(s);
  return Number.isFinite(n) && n > 0;
}

function amountInputValue(value: unknown) {
  if (value == null || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return '';
  return String(value);
}

function parseAmountOrNull(raw: string) {
  const s = raw.trim();
  if (s === '') return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function formatRoundClock(t?: string | null) {
  if (!t) return '';
  return String(t).slice(0, 5);
}

function formatEventDate(dateStr?: string | null) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function AccordionSection({
  title,
  complete,
  summary,
  startOpen,
  locked,
  children,
}: {
  title: string;
  complete: boolean;
  summary?: string;
  startOpen: boolean;
  locked?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(startOpen);
  return (
    <div
      className={`rounded-3xl border border-gray-700 bg-gray-800/40 overflow-hidden ${
        locked ? 'opacity-50' : ''
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start justify-between gap-4 px-6 py-5 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className={complete ? 'text-emerald-400' : 'text-gray-500'}>
              {complete ? '✓' : '○'}
            </span>
            <span className="text-lg font-semibold">{title}</span>
          </div>
          {complete && summary && !open ? (
            <p className="text-sm text-gray-400 mt-1 ml-7 truncate">{summary}</p>
          ) : null}
        </div>
        <span className="text-gray-400 shrink-0">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open ? <div className="px-6 pb-6 space-y-6">{children}</div> : null}
    </div>
  );
}


export default function EventManagePage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

    const searchParams = useSearchParams();

  const [needsPayoutSetup, setNeedsPayoutSetup] = useState(false);
  const [stripeConnecting, setStripeConnecting] = useState(false);
  const [payoutBannerDismissed, setPayoutBannerDismissed] = useState(false);


  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [event, setEvent] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platformFeePercent, setPlatformFeePercent] = useState(
    DEFAULT_PLATFORM_FEE_PERCENT
  );

  const [courseSearch, setCourseSearch] = useState('');
  const [courseResults, setCourseResults] = useState<any[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);

  const [showFlights, setShowFlights] = useState(false);
  const [showAddOns, setShowAddOns] = useState(false);
  const [showAdmins, setShowAdmins] = useState(false);
  const [showRounds, setShowRounds] = useState(false);
  const [showAllSettings, setShowAllSettings] = useState(false);
  const [saving, setSaving] = useState(false);
const [deleting, setDeleting] = useState(false); // ← here with the rest
  const [duplicating, setDuplicating] = useState(false);

  const [newFlight, setNewFlight] = useState({ name: '', range: '' });
  const [newAddon, setNewAddon] = useState({
    name: '',
    quantity_available: 5,
    price_per_unit: 10,
  });
  const [addons, setAddons] = useState<any[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [onlyAdmin, setOnlyAdmin] = useState(false);

    const [showSponsors, setShowSponsors] = useState(false);
  const [sponsorPackages, setSponsorPackages] = useState<any[]>([]);
  const [sponsors, setSponsors] = useState<any[]>([]);
  const [newPackage, setNewPackage] = useState({
    name: '',
    description: '',
    price: 200,
    max_quantity: '' as string | number,
    includes_players: 0,
  });

  const [rounds, setRounds] = useState<any[]>([]);
  const [roundMode, setRoundMode] = useState<'single' | 'multi'>('single');
  const [expandedRoundId, setExpandedRoundId] = useState<number | 'new' | null>(
    null
  );
  const [doubleTeeHole2, setDoubleTeeHole2] = useState(10);
    const [newRound, setNewRound] = useState({
    name: '',
    course: '',
    format: 'stroke',
    start_format: 'shotgun',
    starting_hole: 1,
    starting_hole_2: 10,
    max_teams: 18,
    max_players: 72,
    greens_fee: '' as string,
    price: '' as string,
    date: '',
    start_time: '',
    registration_open_date: '',
    registration_open_time: '',
    registration_close_date: '',
    registration_close_time: '',
  });
  const [roundCourseQuery, setRoundCourseQuery] = useState<
    Record<string, string>
  >({});
  const [roundCourseResults, setRoundCourseResults] = useState<
    Record<string, any[]>
  >({});
  const roundSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
const [adminPerms, setAdminPerms] = useState({
  manage: true,
  checkin: true,
  scoring: true,
  leaderboard: true,
  scorecards: true,
  income: true,
});

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onlyAdminKey = `friedegg:only-admin:${eventId}`;

         useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      // 1) Returning from Stripe? Refresh flags first
      if (searchParams.get('stripe_return') === '1') {
        try {
          await fetch('/api/stripe/refresh', { method: 'POST' });
        } catch (e) {
          console.error('Stripe refresh failed', e);
        }
      }

      // 2) Read profile and decide banner
      try {
        const { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .select(
            'stripe_account_id, stripe_payouts_enabled, stripe_charges_enabled'
          )
          .eq('id', user.id)
          .maybeSingle();

        if (profileErr) {
          console.error('Stripe profile check error:', profileErr);
        }

        const missing =
          !profile?.stripe_account_id ||
          profile?.stripe_payouts_enabled !== true;

        setNeedsPayoutSetup(missing);

        if (searchParams.get('setup_payouts') === '1' && missing) {
          setNeedsPayoutSetup(true);
        }
      } catch (err) {
        console.error('Stripe profile check failed:', err);
        setNeedsPayoutSetup(true);
      }

      const { data: eventData, error: eventError } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', parseInt(eventId))
        .single();

      if (eventError || !eventData) {
        setError('Event not found');
        setLoading(false);
        return;
      }

      const courseName =
        eventData.course || courseDisplayName(eventData.course_data) || '';
      const synced = {
        ...eventData,
        course: courseName,
        location:
          eventData.location ||
          (typeof eventData.course_data?.location === 'string'
            ? eventData.course_data.location
            : ''),
        max_teammates: teamSizeFromEventType(eventData.event_type || ''),
      };
      setEvent(synced);
      setCourseSearch(courseName);
      setSelectedCourse(eventData.course_data || null);

      const access = await loadEventAccess(
        supabase,
        parseInt(eventId),
        user
      );

      setIsAdmin(access.allowed && canUse(access.perms, 'manage'));

      if (!access.allowed || !canUse(access.perms, 'manage')) {
        router.push(`/event/${eventId}`);
        return;
      }

      const { data: addonData } = await supabase
        .from('event_addons')
        .select('*')
        .eq('event_id', parseInt(eventId));
      setAddons(addonData || []);
      const { data: pkgData } = await supabase
        .from('event_sponsor_packages')
        .select('*')
        .eq('event_id', parseInt(eventId))
        .order('sort_order', { ascending: true });
      setSponsorPackages(pkgData || []);

      const { data: sponsorData } = await supabase
        .from('event_sponsors')
        .select('*')
        .eq('event_id', parseInt(eventId))
        .order('created_at', { ascending: false });
      setSponsors(sponsorData || []);

      await fetchAdmins();

      const { data: roundsData, error: roundsError } = await supabase
        .from('event_rounds')
        .select('*')
        .eq('event_id', parseInt(eventId))
        .order('sort_order', { ascending: true });

      if (roundsError) {
        console.error('Rounds load error:', roundsError);
      }
      setRounds(roundsData || []);
      setRoundMode((roundsData || []).length > 1 ? 'multi' : 'single');

      const { data: feeData } = await supabase
        .from('platform_settings')
        .select('platform_fee_percent')
        .eq('id', 1)
        .single();

      setPlatformFeePercent(
        resolvePlatformFeePercent(feeData?.platform_fee_percent)
      );

      setLoading(false);
    };

    fetchData();
  }, [eventId, supabase, router, searchParams]);

  useEffect(() => {
    try {
      setOnlyAdmin(localStorage.getItem(onlyAdminKey) === '1');
    } catch {
      /* ignore */
    }
  }, [onlyAdminKey]);

  const fetchAdmins = async () => {
    const { data } = await supabase
      .from('event_admins')
      .select('id, name, email, user_id, permissions')
      .eq('event_id', parseInt(eventId));
    setAdmins(data || []);
  };

  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push(
          '/login?redirect=' + encodeURIComponent(window.location.pathname)
        );
      }
    };
    checkSession();
  }, [supabase, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-8 overflow-x-hidden">
  <div className="max-w-6xl mx-auto w-full">
          <div className="w-12 h-12 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin mx-auto mb-6"></div>
          <p className="text-gray-400">Loading event details...</p>
        </div>
      </div>
    );
  }

  if (error || !isAdmin) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-12 text-center">
        <p className="text-red-400 text-xl">{error || 'Access Denied'}</p>
        <BackButton
          href="/events"
          className="mt-6 px-6 py-3 bg-gray-700 rounded-2xl inline-block"
        />
      </div>
    );
  }

  const availableTees = (() => {
    if (!event?.course_data) return [];
    let teesData = event.course_data?.tees || event.course_data?.course?.tees;
    if (!teesData) return [];

    const flat: any[] = [];
    Object.keys(teesData).forEach((category) => {
      if (Array.isArray(teesData[category])) {
        teesData[category].forEach((tee: any) => {
          flat.push({
            ...tee,
            category,
            name: tee.name || tee.tee_name || tee.color || 'Unnamed Tee',
          });
        });
      }
    });
    return flat;
  })();

  const handleEventChange = (field: string, value: any) => {
    setEvent((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleEventTypeChange = (value: string) => {
    setEvent((prev: any) => ({
      ...prev,
      event_type: value,
      max_teammates: teamSizeFromEventType(value),
    }));
  };

  const debouncedSearch = (query: string) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => searchCourses(query), 500);
  };

  const searchCourses = async (query: string) => {
    if (query.length < 3) {
      setCourseResults([]);
      return;
    }

    try {
      const res = await fetch(`/api/golf-search?q=${encodeURIComponent(query)}`);

      if (!res.ok) {
        setCourseResults([
          {
            name: query,
            location: 'Atlanta Area, GA',
            id: 'mock-' + Date.now(),
          },
        ]);
        return;
      }

      const data = await res.json();
      setCourseResults(data.results || data.courses || data || []);
    } catch (err) {
      console.error('Course search failed:', err);
      setCourseResults([
        {
          name: query,
          location: 'Atlanta Area, GA',
          id: 'mock-' + Date.now(),
        },
      ]);
    }
  };

  const selectCourse = async (basicCourse: any) => {
    const courseName =
      basicCourse.name || basicCourse.course_name || basicCourse.club_name || '';
    setCourseSearch(courseName);

    try {
      const res = await fetch(
        `/api/golf-course-details?id=${encodeURIComponent(basicCourse.id || '')}&name=${encodeURIComponent(courseName)}`
      );
      let fullData;

      if (res.ok) {
        fullData = await res.json();
      } else {
        throw new Error('Details API failed');
      }

      handleEventChange('course', courseName);
      handleEventChange('course_data', fullData);
      setSelectedCourse(fullData);

      const { error } = await supabase
        .from('tournaments')
        .update({ course: courseName, course_data: fullData })
        .eq('id', parseInt(eventId));

      if (error) console.error('Failed to save course data:', error);

      setEvent((prev: any) => ({
        ...prev,
        course: courseName,
        course_data: fullData,
      }));
      setCourseResults([]);

      alert(`✅ Loaded real data for: ${courseName}`);
    } catch (err) {
      console.error('Details fetch failed:', err);

      const mockFullCourse = {
        name: courseName,
        course_name: courseName,
        scorecard: Array.from({ length: 18 }, (_, i) => ({
          Hole: i + 1,
          Par: [4, 5, 4, 4, 3, 4, 5, 4, 4, 4, 5, 4, 3, 4, 5, 4, 3, 4][i],
          yardage: [
            450, 520, 380, 410, 190, 430, 550, 390, 420, 460, 530, 400, 210, 440,
            560, 380, 220, 450,
          ][i],
          Handicap: (i % 18) + 1,
        })),
      };

      handleEventChange('course', courseName);
      handleEventChange('course_data', mockFullCourse);
      setSelectedCourse(mockFullCourse);

      await supabase
        .from('tournaments')
        .update({ course: courseName, course_data: mockFullCourse })
        .eq('id', parseInt(eventId));

      setEvent((prev: any) => ({
        ...prev,
        course: courseName,
        course_data: mockFullCourse,
      }));
      setCourseResults([]);

      alert(`⚠️ Using mock data for ${courseName}`);
    }
  };
    const handleConnectPayouts = async () => {
    setStripeConnecting(true);
    try {
      const res = await fetch('/api/stripe/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: parseInt(eventId, 10) }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not start Stripe setup');
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      alert('Stripe setup started, but no redirect URL was returned.');
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Stripe Connect failed');
    } finally {
      setStripeConnecting(false);
    }
  };
const handleSaveEvent = async () => {
  setSaving(true);
  const payload = {
    ...event,
    max_teammates:
      Number(event.default_competing) ||
      Number(event.roster_max) ||
      teamSizeFromEventType(event.event_type || ''),
  };

  const { error } = await supabase
    .from('tournaments')
    .update(payload)
    .eq('id', parseInt(eventId));

  if (error) {
    alert('Save failed: ' + error.message);
    setSaving(false);
    return;
  }

  // Sync Skins add-on so check-in / payments work like other add-ons
  try {
    if (event.enable_skins && Number(event.skins_fee) > 0) {
      const { data: existing } = await supabase
        .from('event_addons')
        .select('id')
        .eq('event_id', parseInt(eventId))
        .eq('name', 'Skins')
        .maybeSingle();

      if (existing?.id) {
        await supabase
          .from('event_addons')
          .update({
            price_per_unit: Number(event.skins_fee),
            quantity_available: 999,
          })
          .eq('id', existing.id);
      } else {
        await supabase.from('event_addons').insert({
          event_id: parseInt(eventId),
          name: 'Skins',
          price_per_unit: Number(event.skins_fee),
          quantity_available: 999,
        });
      }
    } else {
      await supabase
        .from('event_addons')
        .delete()
        .eq('event_id', parseInt(eventId))
        .eq('name', 'Skins');
    }
  } catch (e) {
    console.error('Skins add-on sync failed', e);
  }

  alert('Event saved!');
  setSaving(false);
};
  

  const handleAddAdmin = async () => {
  if (!newAdminEmail.trim()) return alert('Email is required');

  const email = newAdminEmail.trim().toLowerCase();
  const name = newAdminName.trim();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    const { error: insertError } = await supabase.from('event_admins').insert({
      event_id: parseInt(eventId),
      user_id: existingUser?.id || null,
      name: name || null,
      email: email,
      added_by: user?.id || null,
      permissions: adminPerms,
    });

    if (insertError) throw insertError;

    // Send invite email
    try {
      const res = await fetch('/api/send-admin-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email,
          eventName: event?.name || 'your event',
          eventId: eventId,
          inviterName:
            user?.user_metadata?.full_name || user?.email || 'An organizer',
          role: 'admin',
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        alert(
          `✅ Admin added for ${email}, but the invite email failed.\n\n${result.error || ''}`
        );
      } else {
        alert(`✅ Admin invitation sent to ${email}`);
      }
    } catch {
      alert(`✅ Admin added for ${email}, but the invite email could not be sent.`);
    }

    fetchAdmins();
    setNewAdminName('');
    setNewAdminEmail('');
    setAdminPerms({
      manage: true,
      checkin: true,
      scoring: true,
      leaderboard: true,
      scorecards: true,
      income: true,
    });
  } catch (err: any) {
    console.error(err);
    alert('Failed to add admin: ' + err.message);
  }
};

  const handleAddFlight = () => {
    if (!newFlight.name.trim()) return alert('Flight name is required');
    const updatedFlights = [
      ...(event.flights || []),
      {
        name: newFlight.name.trim(),
        range: newFlight.range.trim(),
      },
    ];
    handleEventChange('flights', updatedFlights);
    setNewFlight({ name: '', range: '' });
  };

  const handleDeleteFlight = (index: number) => {
    const updatedFlights = (event.flights || []).filter(
      (_: any, i: number) => i !== index
    );
    handleEventChange('flights', updatedFlights);
  };

  const handleDeleteAdmin = async (adminId: number, email: string) => {
    if (!confirm(`Remove ${email} as an admin?`)) return;

    try {
      const { error } = await supabase
        .from('event_admins')
        .delete()
        .eq('id', adminId);

      if (error) throw error;

      alert(`✅ ${email} has been removed as admin.`);
      fetchAdmins();
    } catch (err: any) {
      console.error(err);
      alert('Failed to remove admin: ' + err.message);
    }
  };

  const handleAddAddon = async () => {
    if (!newAddon.name.trim()) return alert('Add-on name is required');
    const { error } = await supabase.from('event_addons').insert({
      event_id: parseInt(eventId),
      name: newAddon.name.trim(),
      quantity_available: newAddon.quantity_available,
      price_per_unit: newAddon.price_per_unit,
    });
    if (error) alert('Failed to add add-on');
    else {
      const { data } = await supabase
        .from('event_addons')
        .select('*')
        .eq('event_id', parseInt(eventId));
      setAddons(data || []);
      setNewAddon({ name: '', quantity_available: 5, price_per_unit: 10 });
    }
  };

  const handleDeleteAddon = async (id: number) => {
    if (!confirm('Remove this add-on?')) return;
    await supabase.from('event_addons').delete().eq('id', id);
    const { data } = await supabase
      .from('event_addons')
      .select('*')
      .eq('event_id', parseInt(eventId));
    setAddons(data || []);
  };

    const handleAddSponsorPackage = async () => {
    if (!newPackage.name.trim()) return alert('Package name is required');
    const price = Number(newPackage.price);
    if (Number.isNaN(price) || price < 0) return alert('Enter a valid price');

    const maxQty =
      newPackage.max_quantity === '' || newPackage.max_quantity == null
        ? null
        : parseInt(String(newPackage.max_quantity), 10);

    const { error } = await supabase.from('event_sponsor_packages').insert({
      event_id: parseInt(eventId),
      name: newPackage.name.trim(),
      description: newPackage.description.trim() || null,
      price,
      max_quantity: maxQty,
      includes_players: Number(newPackage.includes_players) || 0,
      sort_order: sponsorPackages.length,
      active: true,
      times_sold: 0,
    });

    if (error) {
      alert('Failed to add package: ' + error.message);
      return;
    }

    const { data } = await supabase
      .from('event_sponsor_packages')
      .select('*')
      .eq('event_id', parseInt(eventId))
      .order('sort_order', { ascending: true });
    setSponsorPackages(data || []);
    setNewPackage({
      name: '',
      description: '',
      price: 200,
      max_quantity: '',
      includes_players: 0,
    });
  };

  const handleTogglePackageActive = async (id: number, active: boolean) => {
    const { error } = await supabase
      .from('event_sponsor_packages')
      .update({ active: !active })
      .eq('id', id);
    if (error) {
      alert(error.message);
      return;
    }
    setSponsorPackages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, active: !active } : p))
    );
  };

  const handleDeleteSponsorPackage = async (id: number) => {
    if (!confirm('Remove this sponsor package?')) return;
    const { error } = await supabase
      .from('event_sponsor_packages')
      .delete()
      .eq('id', id);
    if (error) {
      alert(error.message);
      return;
    }
    setSponsorPackages((prev) => prev.filter((p) => p.id !== id));
  };

  const handleLoadDefaultPackages = async () => {
    if (sponsorPackages.length > 0) {
      if (!confirm('Add default packages on top of existing ones?')) return;
    }
    const defaults = [
      {
        name: 'Title Sponsor',
        description:
          'Event naming rights, logo on event page, featured placement, up to 2 teams included',
        price: 5000,
        max_quantity: 1,
        includes_players: 8,
        sort_order: 1,
      },
      {
        name: 'Gold Sponsor',
        description: 'Prominent logo, 1 team included, website recognition',
        price: 2500,
        max_quantity: 4,
        includes_players: 4,
        sort_order: 2,
      },
      {
        name: 'Silver Sponsor',
        description: 'Logo on event page, 2 player spots',
        price: 1000,
        max_quantity: 8,
        includes_players: 2,
        sort_order: 3,
      },
      {
        name: 'Hole Sponsor',
        description: 'Tee sign at one hole + listing on event page',
        price: 200,
        max_quantity: 18,
        includes_players: 0,
        sort_order: 4,
      },
      {
        name: 'Contest Sponsor',
        description: 'Signage at contest hole + announcement recognition',
        price: 500,
        max_quantity: 4,
        includes_players: 0,
        sort_order: 5,
      },
    ].map((d) => ({
      ...d,
      event_id: parseInt(eventId),
      active: true,
      times_sold: 0,
    }));

    const { error } = await supabase
      .from('event_sponsor_packages')
      .insert(defaults);
    if (error) {
      alert(error.message);
      return;
    }
    const { data } = await supabase
      .from('event_sponsor_packages')
      .select('*')
      .eq('event_id', parseInt(eventId))
      .order('sort_order', { ascending: true });
    setSponsorPackages(data || []);
  };

    const reloadRounds = async () => {
    const { data: roundsData, error: roundsError } = await supabase
      .from('event_rounds')
      .select('*')
      .eq('event_id', parseInt(eventId))
      .order('sort_order', { ascending: true });
    if (roundsError) {
      console.error('Rounds load error:', roundsError);
    }
    setRounds(roundsData || []);
  };

  const defaultRoundCaps = () => {
    const isTeam = Number(event?.roster_max) >= 2;
    const fieldCap = Number(event?.max_players) || 72;
    const roster = Number(event?.roster_max) || 4;
    if (!isTeam) {
      return { max_players: fieldCap, max_teams: null as number | null };
    }
    const maxTeams = Math.max(1, Math.floor(fieldCap / roster));
    return { max_teams: maxTeams, max_players: maxTeams * roster };
  };

    const handleAddRound = async () => {
    const caps = defaultRoundCaps();
    const isTeam = Number(event?.roster_max) >= 2;
    const name =
      newRound.name.trim() || `Round ${rounds.length + 1}`;
    const greensFee = parseAmountOrNull(String(newRound.greens_fee ?? ''));
    const entryPrice = parseAmountOrNull(String(newRound.price ?? ''));
    const maxTeams = isTeam
      ? Math.max(1, Number(newRound.max_teams) || caps.max_teams || 1)
      : null;
    const maxPlayers = isTeam
      ? maxTeams! * (Number(event.roster_max) || 4)
      : Math.max(1, Number(newRound.max_players) || caps.max_players || 72);

    const base: Record<string, any> = {
      event_id: parseInt(eventId),
      name,
      start_time: newRound.start_time.trim() || null,
      max_teams: maxTeams,
      max_players: maxPlayers,
      pay_separately: entryPrice != null,
      sort_order: rounds.length,
    };
    if (entryPrice != null) {
      base.price = entryPrice;
    }
    if (greensFee != null) {
      base.greens_fee = greensFee;
    }
    const extras: Record<string, any> = {
      course: newRound.course.trim() || event?.course || null,
      course_data: (newRound as any).course_data || null,
      format: newRound.format || null,
      start_format: newRound.start_format || 'shotgun',
      starting_hole:
        newRound.start_format === 'shotgun'
          ? null
          : Number(newRound.starting_hole) || 1,
      starting_hole_2:
        newRound.start_format === 'double_tee'
          ? Number(newRound.starting_hole_2) || 10
          : null,
      date: newRound.date || event?.date || null,
    };
    if (entryPrice != null) {
      extras.registration_open_date =
        newRound.registration_open_date ||
        event?.registration_open_date ||
        null;
      extras.registration_open_time =
        newRound.registration_open_time ||
        event?.registration_open_time ||
        null;
      extras.registration_close_date =
        newRound.registration_close_date ||
        event?.registration_close_date ||
        null;
      extras.registration_close_time =
        newRound.registration_close_time ||
        event?.registration_close_time ||
        null;
    }

    let { error } = await supabase
      .from('event_rounds')
      .insert({ ...base, ...extras });
    if (error) {
      ({ error } = await supabase.from('event_rounds').insert(base));
    }

    if (error) {
      alert('Failed to add round: ' + error.message);
      return;
    }

    await reloadRounds();
    const nextCaps = defaultRoundCaps();
    setNewRound({
      name: '',
      course: event?.course || '',
      format: 'stroke',
      start_format: 'shotgun',
      starting_hole: 1,
      starting_hole_2: 10,
      max_teams: nextCaps.max_teams || 18,
      max_players: nextCaps.max_players || 72,
      greens_fee: '',
      price: '',
      date: event?.date || '',
      start_time: '',
      registration_open_date: event?.registration_open_date || '',
      registration_open_time: event?.registration_open_time || '',
      registration_close_date: event?.registration_close_date || '',
      registration_close_time: event?.registration_close_time || '',
    });
    setExpandedRoundId(null);
    setRoundCourseQuery((prev) => {
      const next = { ...prev };
      delete next.new;
      return next;
    });
    setRoundCourseResults((prev) => {
      const next = { ...prev };
      delete next.new;
      return next;
    });
  };

  const persistRound = async (id: number, patch: Record<string, any>) => {
    setRounds((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
    const { error } = await supabase
      .from('event_rounds')
      .update(patch)
      .eq('id', id);
    if (error) {
      const allowed = [
        'name',
        'greens_fee',
        'max_players',
        'max_teams',
        'price',
        'pay_separately',
        'start_time',
        'sort_order',
      ];
      const slim = Object.fromEntries(
        Object.entries(patch).filter(([k]) => allowed.includes(k))
      );
      if (Object.keys(slim).length) {
        await supabase.from('event_rounds').update(slim).eq('id', id);
      }
    }
  };

  const searchRoundCourses = (key: string, query: string) => {
    setRoundCourseQuery((prev) => ({ ...prev, [key]: query }));
    if (roundSearchTimeoutRef.current) {
      clearTimeout(roundSearchTimeoutRef.current);
    }
    roundSearchTimeoutRef.current = setTimeout(async () => {
      if (query.length < 3) {
        setRoundCourseResults((prev) => ({ ...prev, [key]: [] }));
        return;
      }
      try {
        const res = await fetch(
          `/api/golf-search?q=${encodeURIComponent(query)}`
        );
        if (!res.ok) {
          setRoundCourseResults((prev) => ({ ...prev, [key]: [] }));
          return;
        }
        const data = await res.json();
        setRoundCourseResults((prev) => ({
          ...prev,
          [key]: data.results || data.courses || data || [],
        }));
      } catch {
        setRoundCourseResults((prev) => ({ ...prev, [key]: [] }));
      }
    }, 500);
  };

  const selectRoundCourse = async (
    key: string,
    basicCourse: any,
    apply: (name: string, data: any) => void
  ) => {
    const courseName =
      basicCourse.name ||
      basicCourse.course_name ||
      basicCourse.club_name ||
      '';
    setRoundCourseQuery((prev) => ({ ...prev, [key]: courseName }));
    setRoundCourseResults((prev) => ({ ...prev, [key]: [] }));
    try {
      const res = await fetch(
        `/api/golf-course-details?id=${encodeURIComponent(
          basicCourse.id || ''
        )}&name=${encodeURIComponent(courseName)}`
      );
      const fullData = res.ok ? await res.json() : basicCourse;
      apply(courseName, fullData);
    } catch {
      apply(courseName, basicCourse);
    }
  };

  const openNewRoundForm = () => {
    const caps = defaultRoundCaps();
    setNewRound({
      name: '',
      course: courseLabel || event?.course || '',
      format: 'stroke',
      start_format: 'shotgun',
      starting_hole: 1,
      starting_hole_2: 10,
      max_teams: caps.max_teams || 18,
      max_players: caps.max_players || 72,
      greens_fee: '',
      price: '',
      date: event?.date || '',
      start_time: '',
      registration_open_date: event?.registration_open_date || '',
      registration_open_time: event?.registration_open_time || '',
      registration_close_date: event?.registration_close_date || '',
      registration_close_time: event?.registration_close_time || '',
    });
    setRoundCourseQuery((prev) => ({
      ...prev,
      new: courseLabel || event?.course || '',
    }));
    setExpandedRoundId('new');
  };



const handleDuplicateEvent = async () => {
  if (!event) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    alert('Please log in to duplicate this event.');
    return;
  }

  const ok = confirm(
    `Duplicate “${event.name}”? Copies settings, rounds, add-ons, course, pricing, and image. Does not copy players, scores, check-ins, emails, or books.`
  );
  if (!ok) return;

  setDuplicating(true);
  try {
    const rest = { ...event };
    delete rest.id;
    delete rest.created_at;
    delete rest.updated_at;

    const { data: newEvent, error: insertError } = await supabase
      .from('tournaments')
      .insert({
        ...rest,
        name: `Copy of ${event.name || 'Event'}`,
        date: tomorrowDateStr(),
        is_demo: false,
        created_by: user.id,
        is_active: true,
      })
      .select('id')
      .single();

    if (insertError || !newEvent?.id) {
      throw new Error(insertError?.message || 'Could not create the copy');
    }

    const newId = newEvent.id;
    const warnings: string[] = [];

    if (rounds.length > 0) {
      const roundRows = rounds.map((r: any, i: number) => ({
        event_id: newId,
        name: r.name,
        start_time: r.start_time || null,
        max_teams: r.max_teams,
        max_players: r.max_players,
        pay_separately: !!r.pay_separately,
        price: r.price,
        greens_fee: r.greens_fee,
        sort_order: r.sort_order ?? i,
      }));
      const { error: roundsErr } = await supabase
        .from('event_rounds')
        .insert(roundRows);
      if (roundsErr) {
        console.error('Duplicate rounds failed:', roundsErr);
        warnings.push('rounds');
      }
    }

    if (addons.length > 0) {
      const addonRows = addons.map((a: any) => ({
        event_id: newId,
        name: a.name,
        quantity_available: a.quantity_available,
        price_per_unit: a.price_per_unit,
      }));
      const { error: addonsErr } = await supabase
        .from('event_addons')
        .insert(addonRows);
      if (addonsErr) {
        console.error('Duplicate add-ons failed:', addonsErr);
        warnings.push('add-ons');
      }
    }

    if (warnings.length > 0) {
      alert(
        `Event copied, but ${warnings.join(' and ')} did not copy. You can add them on the new manage page.`
      );
    }

    router.push(`/event/${newId}/manage`);
  } catch (e: any) {
    console.error(e);
    alert(e.message || 'Failed to duplicate event');
  } finally {
    setDuplicating(false);
  }
};

const handleDeleteEvent = async () => {
  if (!event) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || event.created_by !== user.id) {
    alert('Only the event creator can delete this event.');
    return;
  }

  const ok = confirm(
    `Delete “${event.name}” permanently?\n\nThis removes registrations, rounds, scores, add-ons, sponsors, and income/expense rows for this event. This cannot be undone.`
  );
  if (!ok) return;

  const double = confirm('Type-level confirm: really delete this event?');
  if (!double) return;

  setDeleting(true);
  const id = parseInt(eventId, 10);

  try {
    // Order: children first (skip any table that doesn't exist)
    const steps: { table: string; column?: string }[] = [
      { table: 'scores' }, // may be via registration_id — see note below
      { table: 'event_refunds' },
      { table: 'event_income_entries' },
      { table: 'event_expenses' },
      { table: 'event_sponsors' },
      { table: 'event_sponsor_packages' },
      { table: 'event_addons' },
      { table: 'event_admins' },
      { table: 'event_rounds' },
      { table: 'event_registrations' },
    ];

    for (const step of steps) {
      if (step.table === 'scores') {
        // scores linked by registration_id
        const { data: regs } = await supabase
          .from('event_registrations')
          .select('id')
          .eq('event_id', id);
        const regIds = (regs || []).map((r) => r.id);
        if (regIds.length > 0) {
          const { error } = await supabase
            .from('scores')
            .delete()
            .in('registration_id', regIds);
          if (error) console.warn('scores delete:', error.message);
        }
        continue;
      }

      const { error } = await supabase
        .from(step.table)
        .delete()
        .eq('event_id', id);
      if (error) {
        // table may not exist or RLS — log and continue when possible
        console.warn(`${step.table} delete:`, error.message);
      }
    }

    const { error: eventErr } = await supabase
      .from('tournaments')
      .delete()
      .eq('id', id)
      .eq('created_by', user.id); // extra safety

    if (eventErr) throw eventErr;

    alert('Event deleted.');
    router.push('/events');
  } catch (e: any) {
    console.error(e);
    alert(e.message || 'Failed to delete event');
  } finally {
    setDeleting(false);
  }
};

  const teamSize = teamSizeFromEventType(event.event_type || '');
  const isTeamEvent = Number(event?.roster_max) >= 2;
  const holeCount = Number(event?.number_of_holes) || 18;

  const courseLabel =
    event?.course || courseDisplayName(event?.course_data) || '';
  const rosterSize = Number(event?.roster_max);
  const hasRoster = event?.roster_max != null && rosterSize >= 1;
  const hasFieldCap =
    event?.max_players != null && Number(event.max_players) >= 1;
  const priceSet = event?.price != null && event.price !== '';
  const isFree = event?.price != null && Number(event.price) === 0;
  const basicsComplete = Boolean(
    String(event?.name || '').trim() && event?.date && courseLabel
  );
  const fieldComplete = hasRoster && hasFieldCap;
  const roundsComplete =
    (rounds && rounds.length > 0) || Boolean(event?.date && courseLabel);
  const moneyComplete = priceSet || isFree;
  const registrationComplete = Boolean(
    event?.registration_open_date &&
      event?.registration_open_time &&
      event?.registration_close_date &&
      event?.registration_close_time
  );
  const peopleComplete = onlyAdmin || admins.length > 0;
  const moreComplete = Boolean(
    String(event?.contact_name || '').trim() ||
      String(event?.contact_email || '').trim()
  );
  const setupUnlocked =
    basicsComplete &&
    fieldComplete &&
    roundsComplete &&
    moneyComplete &&
    registrationComplete &&
    peopleComplete &&
    moreComplete;

  const basicsSummary = [courseLabel, formatEventDate(event?.date)]
    .filter(Boolean)
    .join(' · ');
  const fieldSummary = [
    hasRoster
      ? rosterSize === 1
        ? 'Individual'
        : `${rosterSize}-person roster`
      : null,
    hasFieldCap ? `cap ${event.max_players}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const roundsSummary =
    roundMode === 'multi'
      ? `${rounds.length || 0} round${rounds.length === 1 ? '' : 's'}`
      : 'Single round';
  const moneySummary = isFree
    ? 'Free'
    : priceSet
      ? `$${Number(event.price).toFixed(2)}`
      : '';
  const registrationSummary = [
    event?.registration_open_date
      ? `Opens ${formatEventDate(event.registration_open_date)}`
      : null,
    event?.registration_close_date
      ? `closes ${formatEventDate(event.registration_close_date)}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const peopleSummary = onlyAdmin
    ? 'Only admin'
    : admins.length
      ? `${admins.length} invited admin${admins.length === 1 ? '' : 's'}`
      : '';
  const moreSummary =
    String(event?.contact_name || '').trim() ||
    String(event?.contact_email || '').trim();

  const copyLiveLink = async () => {
    const url = `${window.location.origin}/event/${eventId}/live`;
    try {
      await navigator.clipboard.writeText(url);
      alert('Live link copied');
    } catch {
      alert(url);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-8 overflow-x-hidden">
      <div className="max-w-6xl mx-auto">
        <BackButton
          href="/events"
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6"
        />

        <EventTabs eventId={eventId} variant="manage" active="manage" />

        <h1 className="text-4xl font-bold mb-2">{event.name}</h1>
        <p className="text-gray-400 mb-6">Manage Event Details</p>

        <div className="space-y-4">
          <AccordionSection
            title="Day of"
            complete={setupUnlocked}
            startOpen={true}
            locked={!setupUnlocked}
          >
            {!setupUnlocked ? (
              <p className="text-sm text-gray-400">
                Finish setup to unlock day-of tools
              </p>
            ) : null}
            <div
              className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 ${
                setupUnlocked ? '' : 'pointer-events-none'
              }`}
            >
              <button
                type="button"
                onClick={() => router.push(`/event/${eventId}/check-in`)}
                className="bg-gray-700 hover:bg-gray-600 px-5 py-4 rounded-2xl font-medium"
              >
                Check-in
              </button>
              <button
                type="button"
                onClick={() => router.push(`/event/${eventId}/scoring`)}
                className="bg-gray-700 hover:bg-gray-600 px-5 py-4 rounded-2xl font-medium"
              >
                Scoring
              </button>
              <button
                type="button"
                onClick={() => router.push(`/event/${eventId}/live`)}
                className="bg-gray-700 hover:bg-gray-600 px-5 py-4 rounded-2xl font-medium"
              >
                Live
              </button>
              <button
                type="button"
                onClick={copyLiveLink}
                className="bg-gray-800 hover:bg-gray-700 px-5 py-4 rounded-2xl font-medium"
              >
                Copy live link
              </button>
              <button
                type="button"
                onClick={() => router.push(`/event/${eventId}/pairings`)}
                className="bg-gray-700 hover:bg-gray-600 px-5 py-4 rounded-2xl font-medium"
              >
                Pairings
              </button>
              <button
                type="button"
                onClick={() => router.push(`/event/${eventId}/scorecards`)}
                className="bg-gray-700 hover:bg-gray-600 px-5 py-4 rounded-2xl font-medium"
              >
                Scorecards
              </button>
              <button
                type="button"
                onClick={() => router.push(`/event/${eventId}/contacts`)}
                className="bg-gray-700 hover:bg-gray-600 px-5 py-4 rounded-2xl font-medium"
              >
                Contacts PDF
              </button>
            </div>
          </AccordionSection>

          <AccordionSection
            title="Event basics"
            complete={basicsComplete}
            summary={basicsSummary}
            startOpen={!basicsComplete}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Event Name
                </label>
                <input
                  value={event.name || ''}
                  onChange={(e) => handleEventChange('name', e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Date of Event
                </label>
                <input
                  type="date"
                  value={event.date || ''}
                  onChange={(e) => handleEventChange('date', e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Description
              </label>
              <textarea
                value={event.description || ''}
                onChange={(e) =>
                  handleEventChange('description', e.target.value)
                }
                rows={5}
                placeholder="18-hole stroke play..."
                className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5 text-base focus:outline-none focus:border-blue-500 resize-y min-h-[120px]"
              />
            </div>
            <div>
              <h3 className="text-xl font-medium mb-4">Golf Course</h3>
              <div className="relative">
                <input
                  type="text"
                  value={courseSearch}
                  onChange={(e) => {
                    setCourseSearch(e.target.value);
                    debouncedSearch(e.target.value);
                  }}
                  placeholder={courseLabel || 'Start typing course name...'}
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5 text-base focus:outline-none focus:border-blue-500"
                />
                {courseResults.map((course, idx) => (
                  <div
                    key={idx}
                    onClick={async () => {
                      await selectCourse(course);
                    }}
                    className="px-6 py-5 hover:bg-gray-700 cursor-pointer border-b border-gray-700 last:border-none bg-gray-800"
                  >
                    <div className="font-medium">
                      {course.name || course.course_name || 'Unknown Course'}
                    </div>
                    <div className="text-sm text-gray-400">
                      {course.club_name ||
                        course.city ||
                        course.location?.city ||
                        ''}{' '}
                      • {course.state || course.location?.state || ''}
                    </div>
                  </div>
                ))}
              </div>
              {courseLabel && (
                <p className="text-green-400 mt-3 text-sm">
                  Current course:{' '}
                  <span className="font-medium">{courseLabel}</span>
                  {event.location ? (
                    <span className="text-gray-400"> · {event.location}</span>
                  ) : null}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-3">
                Number of Holes
              </label>
              <div className="flex gap-3 bg-gray-700 border border-gray-600 rounded-3xl p-1">
                <button
                  type="button"
                  onClick={() => handleEventChange('number_of_holes', 9)}
                  className={`flex-1 py-4 rounded-3xl font-medium ${
                    event?.number_of_holes === 9
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-gray-600 text-gray-300'
                  }`}
                >
                  9 Holes
                </button>
                <button
                  type="button"
                  onClick={() => handleEventChange('number_of_holes', 18)}
                  className={`flex-1 py-4 rounded-3xl font-medium ${
                    event?.number_of_holes === 18 || !event?.number_of_holes
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-gray-600 text-gray-300'
                  }`}
                >
                  18 Holes
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Minutes between Tee Times
              </label>
              <input
                type="number"
                value={event.tee_time_interval || 10}
                onChange={(e) =>
                  handleEventChange(
                    'tee_time_interval',
                    parseInt(e.target.value) || 10
                  )
                }
                className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
                min="5"
              />
            </div>
            <div>
              <h3 className="text-xl font-medium mb-4">Event Image</h3>
              <div className="flex flex-col md:flex-row gap-6 items-start">
                <div className="w-full md:w-80 h-52 bg-gray-900 rounded-3xl overflow-hidden border border-gray-700 flex-shrink-0">
                  {event.image_url ? (
                    <img
                      src={event.image_url}
                      alt={event.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-6xl text-gray-600">
                      🏌️
                    </div>
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
                          .upload(filePath, file, {
                            cacheControl: '3600',
                            upsert: false,
                          });
                        if (uploadError) throw uploadError;
                        const {
                          data: { publicUrl },
                        } = supabase.storage
                          .from('tournament-images')
                          .getPublicUrl(filePath);
                        handleEventChange('image_url', publicUrl);
                        alert(
                          "Image uploaded successfully! Click 'Save Changes' to store it."
                        );
                      } catch (err: any) {
                        alert('Failed to upload image: ' + err.message);
                      }
                    }}
                    className="block w-full text-sm text-gray-400 file:mr-4 file:py-4 file:px-6 file:rounded-3xl file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </AccordionSection>

          <AccordionSection
            title="Field & teams"
            complete={fieldComplete}
            summary={fieldSummary}
            startOpen={!fieldComplete}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => {
                  handleEventChange('roster_max', 1);
                  handleEventChange('default_competing', 1);
                }}
                className={`text-left p-6 rounded-2xl border-2 ${
                  Number(event.roster_max) === 1
                    ? 'border-emerald-500 bg-emerald-900/30'
                    : 'border-gray-700 bg-gray-800'
                }`}
              >
                <div className="font-semibold text-lg">Individual</div>
                <p className="text-sm text-gray-400 mt-1">One person.</p>
              </button>
              <button
                type="button"
                onClick={() => {
                  const n = Math.max(2, Number(event.roster_max) || 4);
                  handleEventChange('roster_max', n);
                  handleEventChange('default_competing', n);
                }}
                className={`text-left p-6 rounded-2xl border-2 ${
                  Number(event.roster_max) >= 2
                    ? 'border-emerald-500 bg-emerald-900/30'
                    : 'border-gray-700 bg-gray-800'
                }`}
              >
                <div className="font-semibold text-lg">Team</div>
                <p className="text-sm text-gray-400 mt-1">Roster of 2 or more.</p>
              </button>
            </div>
            {Number(event.roster_max) >= 2 && (
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Roster size
                </label>
                <input
                  type="number"
                  min="2"
                  value={event.roster_max ?? ''}
                  onChange={(e) => {
                    const n =
                      e.target.value === ''
                        ? null
                        : parseInt(e.target.value, 10) || null;
                    handleEventChange('roster_max', n);
                    if (n != null) handleEventChange('default_competing', n);
                  }}
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
                />
              </div>
            )}
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Field cap
              </label>
              <input
                type="number"
                min="1"
                value={event.max_players ?? ''}
                onChange={(e) =>
                  handleEventChange(
                    'max_players',
                    e.target.value === ''
                      ? null
                      : parseInt(e.target.value, 10) || null
                  )
                }
                placeholder="e.g. 72"
                className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
              />
              <p className="text-xs text-gray-500 mt-2">
                Registration stops at this number (Sold Out). Leave blank for
                unlimited.
              </p>
            </div>
            <div className="md:col-span-2 mt-6 pt-8 border-t border-gray-700">
            <label className="flex items-center gap-3 text-lg cursor-pointer">
              <input
                type="checkbox"
                checked={!!event?.use_handicaps}
                onChange={(e) =>
                  handleEventChange('use_handicaps', e.target.checked)
                }
                className="w-6 h-6 accent-blue-600"
              />
              <span className="font-medium">Use Handicaps for this Event</span>
            </label>
            <p className="text-sm text-gray-500 mt-2 ml-9">
              When enabled, you can enter individual handicaps in the Check-in tab.
            </p>
          </div>
            <div className="bg-gray-900 border border-purple-500/30 rounded-3xl p-8 mt-8">
            <h3 className="text-xl font-medium mb-6">Manage Flights</h3>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end mb-8">
              <div className="md:col-span-4">
                <input
                  value={newFlight.name}
                  onChange={(e) =>
                    setNewFlight({ ...newFlight, name: e.target.value })
                  }
                  placeholder="Flight A..."
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
                />
              </div>
              <div className="md:col-span-4">
                <input
                  value={newFlight.range}
                  onChange={(e) =>
                    setNewFlight({ ...newFlight, range: e.target.value })
                  }
                  placeholder="<15 or 4.0-7.9"
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
                />
              </div>
              <div className="md:col-span-4">
                <button
                  onClick={handleAddFlight}
                  className="w-full bg-purple-600 hover:bg-purple-700 py-5 rounded-3xl font-medium"
                >
                  Add Flight
                </button>
              </div>
            </div>

            <div className="space-y-6">
              {(event.flights || []).map((flight: any, index: number) => (
                <div key={index} className="bg-gray-800 p-6 rounded-3xl">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <span className="font-semibold text-lg">{flight.name}</span>
                      <span className="ml-4 text-gray-400">
                        Range: {flight.range}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteFlight(index)}
                      className="text-red-500 hover:text-red-600 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Tees for this Flight
                  </label>
                  <select
                    value={flight.tee || ''}
                    onChange={(e) => {
                      const updated = [...(event.flights || [])];
                      updated[index] = { ...updated[index], tee: e.target.value };
                      handleEventChange('flights', updated);
                    }}
                    className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
                  >
                    <option value="">Select Tees</option>
                    {availableTees.map((tee: any, i: number) => {
                      const teeName =
                        tee.name || tee.tee_name || tee.color || `Tee ${i + 1}`;
                      const teeYards = tee.total_yards || tee.yardage || 0;
                      return (
                        <option key={i} value={teeName}>
                          {teeName} ({teeYards} yds)
                        </option>
                      );
                    })}
                  </select>
                </div>
              ))}
            </div>

            {(event.flights || []).length === 0 && (
              <p className="text-gray-400 text-center py-8">
                No flights added yet. Add one above!
              </p>
            )}
          </div>

          </AccordionSection>

          <AccordionSection
            title="Rounds"
            complete={roundsComplete}
            summary={roundsSummary}
            startOpen={!roundsComplete}
          >
            <div className="flex gap-3 bg-gray-700 border border-gray-600 rounded-3xl p-1">
              <button
                type="button"
                onClick={() => setRoundMode('single')}
                className={`flex-1 py-4 rounded-3xl font-medium ${
                  roundMode === 'single'
                    ? 'bg-blue-600 text-white'
                    : 'hover:bg-gray-600 text-gray-300'
                }`}
              >
                Single round
              </button>
              <button
                type="button"
                onClick={() => setRoundMode('multi')}
                className={`flex-1 py-4 rounded-3xl font-medium ${
                  roundMode === 'multi'
                    ? 'bg-blue-600 text-white'
                    : 'hover:bg-gray-600 text-gray-300'
                }`}
              >
                Multi-round
              </button>
            </div>

            {roundMode === 'single' ? (
              <div className="space-y-6">
                <p className="text-sm text-gray-400">
                  Uses the course and date from Event basics
                  {courseLabel || event.date
                    ? ` (${[courseLabel, formatEventDate(event.date)]
                        .filter(Boolean)
                        .join(' · ')})`
                    : ''}
                  .
                </p>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    {Number(event.roster_max) > 1
                      ? 'Price per team'
                      : 'Price per player'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amountInputValue(event.price)}
                    onChange={(e) =>
                      handleEventChange(
                        'price',
                        parseAmountOrNull(e.target.value)
                      )
                    }
                    placeholder="Event price"
                    className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Greens fee per person
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amountInputValue(event.greens_fee)}
                    onChange={(e) =>
                      handleEventChange(
                        'greens_fee',
                        parseAmountOrNull(e.target.value)
                      )
                    }
                    placeholder="None"
                    className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Format
                  </label>
                  <select
                    value={normalizeRoundFormat(event.event_type) || ''}
                    onChange={(e) =>
                      handleEventChange('event_type', e.target.value)
                    }
                    className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
                  >
                    <option value="">Select format</option>
                    {ROUND_FORMATS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Start type
                  </label>
                  <select
                    value={event.start_format || 'shotgun'}
                    onChange={(e) =>
                      handleEventChange('start_format', e.target.value)
                    }
                    className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
                  >
                    <option value="shotgun">Shotgun</option>
                    <option value="tee_times">Tee times</option>
                    <option value="double_tee">Double tee</option>
                  </select>
                </div>
                {(event.start_format || 'shotgun') === 'tee_times' && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      Starting hole
                    </label>
                    <select
                      value={event.starting_hole || 1}
                      onChange={(e) =>
                        handleEventChange(
                          'starting_hole',
                          parseInt(e.target.value)
                        )
                      }
                      className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
                    >
                      {Array.from({ length: holeCount }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          Hole {i + 1}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {(event.start_format || 'shotgun') === 'double_tee' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        Starting hole 1
                      </label>
                      <select
                        value={event.starting_hole || 1}
                        onChange={(e) =>
                          handleEventChange(
                            'starting_hole',
                            parseInt(e.target.value)
                          )
                        }
                        className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
                      >
                        {Array.from({ length: holeCount }, (_, i) => (
                          <option key={i + 1} value={i + 1}>
                            Hole {i + 1}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        Starting hole 2
                      </label>
                      <select
                        value={doubleTeeHole2 || 10}
                        onChange={(e) =>
                          setDoubleTeeHole2(parseInt(e.target.value) || 10)
                        }
                        className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
                      >
                        {Array.from({ length: holeCount }, (_, i) => (
                          <option key={i + 1} value={i + 1}>
                            Hole {i + 1}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {rounds.map((round) => {
                  const startType = round.start_format || 'shotgun';
                  const key = String(round.id);
                  const courseValue =
                    roundCourseQuery[key] ??
                    round.course ??
                    courseLabel ??
                    '';
                  const results = roundCourseResults[key] || [];
                  const expanded = expandedRoundId === round.id;
                  const unitWord =
                    Number(event.roster_max) > 1 ? 'team' : 'player';
                  const summary = [
                    round.name || 'Round',
                    round.course || courseLabel,
                    formatLabel(round.format || round.event_type),
                    startTypeLabel(startType),
                    formatEventDate(round.date || event.date),
                    formatRoundClock(round.start_time),
                    hasFilledAmount(round.price)
                      ? `$${Number(round.price).toFixed(2)} per ${unitWord}`
                      : null,
                    hasFilledAmount(round.greens_fee)
                      ? `Greens $${Number(round.greens_fee).toFixed(2)}/person`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <div
                      key={round.id}
                      className="bg-gray-900 border border-gray-700 rounded-3xl overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedRoundId(expanded ? null : round.id)
                        }
                        className="w-full text-left px-6 py-4 flex items-center justify-between gap-3"
                      >
                        <span className="font-medium truncate">{summary}</span>
                        <span className="text-gray-400 text-sm shrink-0">
                          {expanded ? 'Hide' : 'Edit'}
                        </span>
                      </button>
                      {expanded && (
                        <div className="px-6 pb-6 space-y-4 border-t border-gray-800 pt-4">
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">
                          Round name
                        </label>
                        <input
                          value={round.name || ''}
                          onChange={(e) =>
                            persistRound(round.id, { name: e.target.value })
                          }
                          className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm text-gray-400 mb-2">
                            Round date
                          </label>
                          <input
                            type="date"
                            value={round.date || event.date || ''}
                            onChange={(e) =>
                              persistRound(round.id, { date: e.target.value })
                            }
                            className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-400 mb-2">
                            Round start time
                          </label>
                          <input
                            type="time"
                            value={formatRoundClock(round.start_time)}
                            onChange={(e) =>
                              persistRound(round.id, {
                                start_time: e.target.value || null,
                              })
                            }
                            className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">
                          Course
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={courseValue}
                            onChange={(e) => {
                              searchRoundCourses(key, e.target.value);
                              persistRound(round.id, {
                                course: e.target.value,
                              });
                            }}
                            placeholder={courseLabel || 'Search course…'}
                            className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                          />
                          {results.length > 0 && (
                            <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded-2xl max-h-56 overflow-auto">
                              {results.map((course: any, idx: number) => (
                                <div
                                  key={course.id ?? idx}
                                  onClick={() =>
                                    selectRoundCourse(
                                      key,
                                      course,
                                      (name, data) =>
                                        persistRound(round.id, {
                                          course: name,
                                          course_data: data,
                                        })
                                    )
                                  }
                                  className="px-4 py-3 hover:bg-gray-700 cursor-pointer border-b border-gray-700 last:border-none text-sm"
                                >
                                  <div className="font-medium">
                                    {course.name ||
                                      course.course_name ||
                                      'Unknown Course'}
                                  </div>
                                  <div className="text-gray-400">
                                    {course.club_name ||
                                      course.city ||
                                      course.location?.city ||
                                      ''}{' '}
                                    • {course.state || course.location?.state || ''}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">
                          {isTeamEvent ? 'Max teams' : 'Max players'}
                        </label>
                        {isTeamEvent ? (
                          <input
                            type="number"
                            min={1}
                            value={round.max_teams ?? ''}
                            onChange={(e) => {
                              const maxTeams =
                                parseInt(e.target.value, 10) || 0;
                              persistRound(round.id, {
                                max_teams: maxTeams,
                                max_players:
                                  maxTeams * (Number(event.roster_max) || 4),
                              });
                            }}
                            className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                          />
                        ) : (
                          <input
                            type="number"
                            min={1}
                            value={round.max_players ?? ''}
                            onChange={(e) =>
                              persistRound(round.id, {
                                max_players:
                                  parseInt(e.target.value, 10) || 0,
                              })
                            }
                            className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                          />
                        )}
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">
                          {Number(event.roster_max) > 1
                            ? 'Price per team'
                            : 'Price per player'}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={amountInputValue(round.price)}
                          onChange={(e) => {
                            const n = parseAmountOrNull(e.target.value);
                            persistRound(round.id, {
                              price: n,
                              pay_separately: n != null,
                            });
                          }}
                          placeholder="Use event price"
                          className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">
                          Greens fee per person
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={amountInputValue(round.greens_fee)}
                          onChange={(e) => {
                            persistRound(round.id, {
                              greens_fee: parseAmountOrNull(e.target.value),
                            });
                          }}
                          placeholder="None"
                          className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                        />
                      </div>
                      {hasFilledAmount(round.price) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm text-gray-400 mb-2">
                              Registration opens
                            </label>
                            <input
                              type="date"
                              value={
                                round.registration_open_date ||
                                event.registration_open_date ||
                                ''
                              }
                              onChange={(e) =>
                                persistRound(round.id, {
                                  registration_open_date: e.target.value,
                                })
                              }
                              className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-400 mb-2">
                              Open time
                            </label>
                            <input
                              type="time"
                              value={formatRoundClock(
                                round.registration_open_time ||
                                  event.registration_open_time
                              )}
                              onChange={(e) =>
                                persistRound(round.id, {
                                  registration_open_time: e.target.value || null,
                                })
                              }
                              className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-400 mb-2">
                              Registration closes
                            </label>
                            <input
                              type="date"
                              value={
                                round.registration_close_date ||
                                event.registration_close_date ||
                                ''
                              }
                              onChange={(e) =>
                                persistRound(round.id, {
                                  registration_close_date: e.target.value,
                                })
                              }
                              className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-400 mb-2">
                              Close time
                            </label>
                            <input
                              type="time"
                              value={formatRoundClock(
                                round.registration_close_time ||
                                  event.registration_close_time
                              )}
                              onChange={(e) =>
                                persistRound(round.id, {
                                  registration_close_time:
                                    e.target.value || null,
                                })
                              }
                              className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                            />
                          </div>
                        </div>
                      )}
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">
                          Format
                        </label>
                        <select
                          value={
                            normalizeRoundFormat(round.format || round.event_type) ||
                            ''
                          }
                          onChange={(e) =>
                            persistRound(round.id, { format: e.target.value })
                          }
                          className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                        >
                          <option value="">Select format</option>
                          {ROUND_FORMATS.map((f) => (
                            <option key={f.value} value={f.value}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">
                          Start type
                        </label>
                        <select
                          value={startType}
                          onChange={(e) =>
                            persistRound(round.id, {
                              start_format: e.target.value,
                            })
                          }
                          className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                        >
                          <option value="shotgun">Shotgun</option>
                          <option value="tee_times">Tee times</option>
                          <option value="double_tee">Double tee</option>
                        </select>
                      </div>
                      {startType === 'tee_times' && (
                        <div>
                          <label className="block text-sm text-gray-400 mb-2">
                            Starting hole
                          </label>
                          <select
                            value={round.starting_hole || 1}
                            onChange={(e) =>
                              persistRound(round.id, {
                                starting_hole: parseInt(e.target.value),
                              })
                            }
                            className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                          >
                            {Array.from({ length: holeCount }, (_, i) => (
                              <option key={i + 1} value={i + 1}>
                                Hole {i + 1}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      {startType === 'double_tee' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm text-gray-400 mb-2">
                              Starting hole 1
                            </label>
                            <select
                              value={round.starting_hole || 1}
                              onChange={(e) =>
                                persistRound(round.id, {
                                  starting_hole: parseInt(e.target.value),
                                })
                              }
                              className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                            >
                              {Array.from({ length: holeCount }, (_, i) => (
                                <option key={i + 1} value={i + 1}>
                                  Hole {i + 1}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm text-gray-400 mb-2">
                              Starting hole 2
                            </label>
                            <select
                              value={round.starting_hole_2 || 10}
                              onChange={(e) =>
                                persistRound(round.id, {
                                  starting_hole_2: parseInt(e.target.value),
                                })
                              }
                              className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                            >
                              {Array.from({ length: holeCount }, (_, i) => (
                                <option key={i + 1} value={i + 1}>
                                  Hole {i + 1}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {expandedRoundId === 'new' ? (
                <div className="bg-gray-800 border border-dashed border-gray-600 rounded-3xl p-6 space-y-4">
                  <div className="font-medium">New round</div>
                  <input
                    value={newRound.name}
                    onChange={(e) =>
                      setNewRound({ ...newRound, name: e.target.value })
                    }
                    placeholder="Round name"
                    className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        Round date
                      </label>
                      <input
                        type="date"
                        value={newRound.date || event.date || ''}
                        onChange={(e) =>
                          setNewRound({ ...newRound, date: e.target.value })
                        }
                        className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        Round start time
                      </label>
                      <input
                        type="time"
                        value={newRound.start_time}
                        onChange={(e) =>
                          setNewRound({
                            ...newRound,
                            start_time: e.target.value,
                          })
                        }
                        className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      Course
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={
                          roundCourseQuery.new ??
                          newRound.course ??
                          courseLabel ??
                          ''
                        }
                        onChange={(e) => {
                          searchRoundCourses('new', e.target.value);
                          setNewRound({
                            ...newRound,
                            course: e.target.value,
                          });
                        }}
                        placeholder={courseLabel || 'Search course…'}
                        className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                      />
                      {(roundCourseResults.new || []).length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded-2xl max-h-56 overflow-auto">
                          {(roundCourseResults.new || []).map(
                            (course: any, idx: number) => (
                              <div
                                key={course.id ?? idx}
                                onClick={() =>
                                  selectRoundCourse('new', course, (name, data) =>
                                    setNewRound({
                                      ...newRound,
                                      course: name,
                                      course_data: data,
                                    } as any)
                                  )
                                }
                                className="px-4 py-3 hover:bg-gray-700 cursor-pointer border-b border-gray-700 last:border-none text-sm"
                              >
                                <div className="font-medium">
                                  {course.name ||
                                    course.course_name ||
                                    'Unknown Course'}
                                </div>
                                <div className="text-gray-400">
                                  {course.club_name ||
                                    course.city ||
                                    course.location?.city ||
                                    ''}{' '}
                                  • {course.state || course.location?.state || ''}
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      {isTeamEvent ? 'Max teams' : 'Max players'}
                    </label>
                    {isTeamEvent ? (
                      <input
                        type="number"
                        min={1}
                        value={newRound.max_teams}
                        onChange={(e) =>
                          setNewRound({
                            ...newRound,
                            max_teams: parseInt(e.target.value) || 0,
                          })
                        }
                        className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                      />
                    ) : (
                      <input
                        type="number"
                        min={1}
                        value={newRound.max_players}
                        onChange={(e) =>
                          setNewRound({
                            ...newRound,
                            max_players: parseInt(e.target.value) || 0,
                          })
                        }
                        className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      {Number(event.roster_max) > 1
                        ? 'Price per team'
                        : 'Price per player'}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newRound.price}
                      onChange={(e) =>
                        setNewRound({
                          ...newRound,
                          price: e.target.value,
                        })
                      }
                      placeholder="Use event price"
                      className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      Greens fee per person
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newRound.greens_fee}
                      onChange={(e) =>
                        setNewRound({
                          ...newRound,
                          greens_fee: e.target.value,
                        })
                      }
                      placeholder="None"
                      className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                    />
                  </div>
                  {hasFilledAmount(newRound.price) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">
                          Registration opens
                        </label>
                        <input
                          type="date"
                          value={
                            newRound.registration_open_date ||
                            event.registration_open_date ||
                            ''
                          }
                          onChange={(e) =>
                            setNewRound({
                              ...newRound,
                              registration_open_date: e.target.value,
                            })
                          }
                          className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">
                          Open time
                        </label>
                        <input
                          type="time"
                          value={
                            newRound.registration_open_time ||
                            formatRoundClock(event.registration_open_time)
                          }
                          onChange={(e) =>
                            setNewRound({
                              ...newRound,
                              registration_open_time: e.target.value,
                            })
                          }
                          className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">
                          Registration closes
                        </label>
                        <input
                          type="date"
                          value={
                            newRound.registration_close_date ||
                            event.registration_close_date ||
                            ''
                          }
                          onChange={(e) =>
                            setNewRound({
                              ...newRound,
                              registration_close_date: e.target.value,
                            })
                          }
                          className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">
                          Close time
                        </label>
                        <input
                          type="time"
                          value={
                            newRound.registration_close_time ||
                            formatRoundClock(event.registration_close_time)
                          }
                          onChange={(e) =>
                            setNewRound({
                              ...newRound,
                              registration_close_time: e.target.value,
                            })
                          }
                          className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                        />
                      </div>
                    </div>
                  )}
                  <select
                    value={newRound.format}
                    onChange={(e) =>
                      setNewRound({ ...newRound, format: e.target.value })
                    }
                    className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                  >
                    {ROUND_FORMATS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={newRound.start_format}
                    onChange={(e) =>
                      setNewRound({ ...newRound, start_format: e.target.value })
                    }
                    className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                  >
                    <option value="shotgun">Shotgun</option>
                    <option value="tee_times">Tee times</option>
                    <option value="double_tee">Double tee</option>
                  </select>
                  {newRound.start_format === 'tee_times' && (
                    <select
                      value={newRound.starting_hole}
                      onChange={(e) =>
                        setNewRound({
                          ...newRound,
                          starting_hole: parseInt(e.target.value) || 1,
                        })
                      }
                      className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                    >
                      {Array.from({ length: holeCount }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          Hole {i + 1}
                        </option>
                      ))}
                    </select>
                  )}
                  {newRound.start_format === 'double_tee' && (
                    <div className="grid grid-cols-2 gap-4">
                      <select
                        value={newRound.starting_hole}
                        onChange={(e) =>
                          setNewRound({
                            ...newRound,
                            starting_hole: parseInt(e.target.value) || 1,
                          })
                        }
                        className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                      >
                        {Array.from({ length: holeCount }, (_, i) => (
                          <option key={i + 1} value={i + 1}>
                            Hole {i + 1}
                          </option>
                        ))}
                      </select>
                      <select
                        value={newRound.starting_hole_2}
                        onChange={(e) =>
                          setNewRound({
                            ...newRound,
                            starting_hole_2: parseInt(e.target.value) || 10,
                          })
                        }
                        className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
                      >
                        {Array.from({ length: holeCount }, (_, i) => (
                          <option key={i + 1} value={i + 1}>
                            Hole {i + 1}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleAddRound}
                    className="w-full bg-teal-600 hover:bg-teal-700 py-4 rounded-3xl font-medium"
                  >
                    Save round
                  </button>
                </div>
                ) : (
                  <button
                    type="button"
                    onClick={openNewRoundForm}
                    className="w-full bg-teal-600 hover:bg-teal-700 py-4 rounded-3xl font-medium"
                  >
                    + Add round
                  </button>
                )}
              </div>
            )}
          </AccordionSection>

          <AccordionSection
            title="Price, add-ons & payouts"
            complete={moneyComplete}
            summary={moneySummary}
            startOpen={!moneyComplete}
          >
                    {/* Pricing Mode */}
<div className="bg-gray-900 border border-gray-700 rounded-2xl px-5 py-4 mt-8 mb-2">
  <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
    {/* Toggle */}
    <div className="flex items-center justify-center sm:justify-start gap-3 text-sm shrink-0">
      <span
        className={
          (event.pricing_mode || 'event') === 'event'
            ? 'text-white'
            : 'text-gray-500'
        }
      >
        Event
      </span>
      <button
        type="button"
        onClick={() =>
          handleEventChange(
            'pricing_mode',
            (event.pricing_mode || 'event') === 'event' ? 'per_round' : 'event'
          )
        }
        className={`relative w-14 h-8 rounded-full transition-colors ${
          (event.pricing_mode || 'event') === 'per_round'
            ? 'bg-blue-600'
            : 'bg-gray-600'
        }`}
      >
        <span
          className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white transition-transform ${
            (event.pricing_mode || 'event') === 'per_round'
              ? 'translate-x-6'
              : 'translate-x-0'
          }`}
        />
      </button>
      <span
        className={
          (event.pricing_mode || 'event') === 'per_round'
            ? 'text-white'
            : 'text-gray-500'
        }
      >
        Per-round
      </span>
    </div>

    {/* Description */}
    <p className="text-xs text-gray-400 text-center sm:text-left leading-relaxed sm:border-l sm:border-gray-700 sm:pl-6">
      {(event.pricing_mode || 'event') === 'per_round'
        ? 'Event price ignored. Players only pay for rounds they select.'
        : 'Players pay the event price (plus any rounds marked pay separately).'}
    </p>
  </div>
</div>


            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
            <label className="block text-sm text-gray-400 mb-2">
              {(event.pricing_mode || 'event') === 'per_round'
                ? 'Base Event Price (ignored in per-round mode)'
                : teamSize > 1
                  ? 'Price per team'
                  : 'Price per player'}
            </label>
            
            <input
              type="number"
              value={event.price || ''}
              onChange={(e) =>
                handleEventChange('price', parseFloat(e.target.value) || 0)
              }
              className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
              disabled={(event.pricing_mode || 'event') === 'per_round'}
            />
                        {teamSize > 1 && (event.pricing_mode || 'event') !== 'per_round' && (
              <p className="text-xs text-gray-500 mt-2">
                Captain pays this once at checkout. Teammates are added after
                payment (or later in My Events).
              </p>
            )}
          </div>
              <div>
            <label className="block text-sm text-gray-400 mb-2">
              Greens fees <span className="text-gray-500">(per player)</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={event?.greens_fee ?? 0}
              onChange={(e) =>
                handleEventChange('greens_fee', Number(e.target.value) || 0)
              }
              className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
            />
            <p className="text-xs text-gray-500 mt-2">
              Used on Income and for “refund minus greens fees.”
            </p>
          </div>
            </div>
            <div className="md:col-span-2 mt-4 pt-6 border-t border-gray-700">
  <label className="flex items-center gap-3 text-lg cursor-pointer">
    <input
      type="checkbox"
      checked={!!event?.enable_skins}
      onChange={(e) => {
        handleEventChange('enable_skins', e.target.checked);
        if (!e.target.checked) handleEventChange('skins_fee', 0);
      }}
      className="w-6 h-6 accent-emerald-600"
    />
    <span className="font-medium">Skins game</span>
  </label>
  <p className="text-sm text-gray-500 mt-2 ml-9">
    Players opt in at check-in. Birdie or better (alone) wins a share of the pot.
  </p>

  {event?.enable_skins && (
    <div className="mt-4 ml-9 max-w-xs">
      <label className="block text-sm text-gray-400 mb-2">
        Cost to play skins (per player)
      </label>
      <input
        type="number"
        step="0.01"
        min="0"
        value={event?.skins_fee ?? 0}
        onChange={(e) =>
          handleEventChange('skins_fee', Number(e.target.value) || 0)
        }
        className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-4"
      />
    </div>
  )}
</div>
            <div className="bg-gray-900 border border-yellow-500/30 rounded-3xl p-8 mt-8">
            <h3 className="text-xl font-medium mb-6">Manage Add-ons</h3>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end mb-8">
              <div className="md:col-span-5">
                <input
                  value={newAddon.name}
                  onChange={(e) =>
                    setNewAddon({ ...newAddon, name: e.target.value })
                  }
                  placeholder="Mulligan Package, Cart, etc."
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
                />
              </div>
              <div className="md:col-span-2">
                <input
                  type="number"
                  value={newAddon.quantity_available}
                  onChange={(e) =>
                    setNewAddon({
                      ...newAddon,
                      quantity_available: parseInt(e.target.value) || 0,
                    })
                  }
                  placeholder="Qty"
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5 text-center"
                />
              </div>
              <div className="md:col-span-2">
                <input
                  type="number"
                  value={newAddon.price_per_unit}
                  onChange={(e) =>
                    setNewAddon({
                      ...newAddon,
                      price_per_unit: parseFloat(e.target.value) || 0,
                    })
                  }
                  placeholder="$"
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5 text-center"
                />
              </div>
              <div className="md:col-span-3">
                <button
                  onClick={handleAddAddon}
                  className="w-full bg-yellow-600 hover:bg-yellow-700 py-5 rounded-3xl font-medium"
                >
                  Add Add-on
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {addons.map((addon: any) => (
                <div
                  key={addon.id}
                  className="bg-gray-800 p-6 rounded-3xl flex justify-between items-center"
                >
                  <div>
                    <div className="font-medium">{addon.name}</div>
                    <div className="text-sm text-gray-400">
                      ${addon.price_per_unit} each • {addon.quantity_available}{' '}
                      available
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteAddon(addon.id)}
                    className="text-red-500 hover:text-red-600 px-4 py-2"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            {addons.length === 0 && (
              <p className="text-gray-400 text-center py-8">No add-ons added yet.</p>
            )}
          </div>

            <div className="bg-gray-900 border border-emerald-500/30 rounded-3xl p-8 mt-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <h3 className="text-xl font-medium">Sponsor Packages</h3>
              <button
                type="button"
                onClick={handleLoadDefaultPackages}
                className="text-sm bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-xl"
              >
                Load default packages
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end mb-4">
              <div className="md:col-span-3">
                <label className="block text-xs text-gray-500 mb-1">Name</label>
                <input
                  value={newPackage.name}
                  onChange={(e) =>
                    setNewPackage({ ...newPackage, name: e.target.value })
                  }
                  placeholder="Hole Sponsor"
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-5 py-4"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Price $</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newPackage.price}
                  onChange={(e) =>
                    setNewPackage({
                      ...newPackage,
                      price: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-5 py-4"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">
                  Max qty (blank = ∞)
                </label>
                <input
                  type="number"
                  min="1"
                  value={newPackage.max_quantity}
                  onChange={(e) =>
                    setNewPackage({
                      ...newPackage,
                      max_quantity: e.target.value,
                    })
                  }
                  placeholder="18"
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-5 py-4"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">
                  Includes players
                </label>
                <input
                  type="number"
                  min="0"
                  value={newPackage.includes_players}
                  onChange={(e) =>
                    setNewPackage({
                      ...newPackage,
                      includes_players: parseInt(e.target.value, 10) || 0,
                    })
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-5 py-4"
                />
              </div>
              <div className="md:col-span-3">
                <button
                  type="button"
                  onClick={handleAddSponsorPackage}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 py-4 rounded-3xl font-medium"
                >
                  Add Package
                </button>
              </div>
            </div>

            <div className="mb-8">
              <label className="block text-xs text-gray-500 mb-1">
                Description / benefits
              </label>
              <input
                value={newPackage.description}
                onChange={(e) =>
                  setNewPackage({ ...newPackage, description: e.target.value })
                }
                placeholder="Tee sign + listing on event page"
                className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-5 py-4"
              />
            </div>

            <div className="space-y-3 mb-10">
              {sponsorPackages.map((pkg) => (
                <div
                  key={pkg.id}
                  className="bg-gray-800 p-5 rounded-3xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium">
                      {pkg.name}{' '}
                      <span className="text-emerald-400">
                        ${Number(pkg.price).toFixed(2)}
                      </span>
                    </div>
                    <div className="text-sm text-gray-400">
                      {pkg.description || '—'}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Sold {pkg.times_sold}
                      {pkg.max_quantity != null ? ` / ${pkg.max_quantity}` : ''}
                      {pkg.includes_players > 0
                        ? ` · includes ${pkg.includes_players} players`
                        : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        handleTogglePackageActive(pkg.id, pkg.active)
                      }
                      className={`text-sm px-4 py-2 rounded-xl ${
                        pkg.active
                          ? 'bg-emerald-900/50 text-emerald-400'
                          : 'bg-gray-700 text-gray-400'
                      }`}
                    >
                      {pkg.active ? 'Active' : 'Inactive'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSponsorPackage(pkg.id)}
                      className="text-red-400 text-sm px-3 py-2"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              {sponsorPackages.length === 0 && (
                <p className="text-gray-500 text-center py-6">
                  No packages yet. Add one or load defaults.
                </p>
              )}
            </div>

            <h4 className="text-lg font-medium mb-4">Paid sponsors</h4>
            <div className="space-y-3">
              {sponsors
                .filter((s) => s.paid)
                .map((s) => (
                  <div
                    key={s.id}
                    className="bg-gray-800 px-5 py-4 rounded-2xl flex justify-between gap-3"
                  >
                    <div>
                      <div className="font-medium">{s.company_name}</div>
                      <div className="text-sm text-gray-400">
                        {s.contact_email || s.contact_name || '—'}
                        {s.amount_paid != null
                          ? ` · $${Number(s.amount_paid).toFixed(2)}`
                          : ''}
                      </div>
                    </div>
                  </div>
                ))}
              {sponsors.filter((s) => s.paid).length === 0 && (
                <p className="text-gray-500 text-center py-4 text-sm">
                  No paid sponsors yet.
                </p>
              )}
            </div>
          </div>

            <div className="rounded-2xl border border-amber-500/40 bg-amber-950/40 p-5">
              <h3 className="font-semibold text-amber-300">Payouts</h3>
              <p className="text-sm text-gray-300 mt-2 leading-relaxed">
                Connect Stripe so registration money for this event can be paid
                out to your bank.
              </p>
              {needsPayoutSetup ? (
                <p className="text-sm text-amber-200 mt-2">
                  Payouts are not set up yet.
                </p>
              ) : (
                <p className="text-sm text-emerald-400 mt-2">
                  Payouts connected.
                </p>
              )}
              <button
                type="button"
                onClick={handleConnectPayouts}
                disabled={stripeConnecting}
                className="mt-4 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-600 text-gray-900 font-semibold px-6 py-3 rounded-2xl"
              >
                {stripeConnecting ? 'Opening Stripe…' : 'Connect with Stripe'}
              </button>
            </div>
          </AccordionSection>

          <AccordionSection
            title="Registration"
            complete={registrationComplete}
            summary={registrationSummary}
            startOpen={!registrationComplete}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Registration opens
                </label>
                <input
                  type="date"
                  value={event.registration_open_date || ''}
                  onChange={(e) =>
                    handleEventChange('registration_open_date', e.target.value)
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Open time
                </label>
                <input
                  type="time"
                  value={event.registration_open_time || ''}
                  onChange={(e) =>
                    handleEventChange('registration_open_time', e.target.value)
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Registration closes
                </label>
                <input
                  type="date"
                  value={event.registration_close_date || ''}
                  onChange={(e) =>
                    handleEventChange(
                      'registration_close_date',
                      e.target.value
                    )
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Close time
                </label>
                <input
                  type="time"
                  value={event.registration_close_time || ''}
                  onChange={(e) =>
                    handleEventChange('registration_close_time', e.target.value)
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
                />
              </div>
            </div>
          </AccordionSection>

          <AccordionSection
            title="People"
            complete={peopleComplete}
            summary={peopleSummary}
            startOpen={!peopleComplete}
          >
            <label className="flex items-start gap-3 cursor-pointer bg-gray-900 border border-gray-700 rounded-2xl p-5">
              <input
                type="checkbox"
                checked={onlyAdmin}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setOnlyAdmin(checked);
                  try {
                    localStorage.setItem(onlyAdminKey, checked ? '1' : '0');
                  } catch {
                    /* ignore */
                  }
                }}
                className="mt-1 w-5 h-5 accent-indigo-600"
              />
              <span className="font-medium">I am the only admin.</span>
            </label>
            <div className="bg-gray-900 border border-indigo-500/30 rounded-3xl p-8 mt-8">
    <h3 className="text-xl font-medium mb-6">Event Admins</h3>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
      <input
        value={newAdminName}
        onChange={(e) => setNewAdminName(e.target.value)}
        placeholder="Admin Name (optional)"
        className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
      />
      <input
        type="email"
        value={newAdminEmail}
        onChange={(e) => setNewAdminEmail(e.target.value)}
        placeholder="admin@example.com"
        className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5"
      />
    </div>

    {/* Permission checkboxes */}
    <div className="mb-6">
      <p className="text-sm text-gray-400 mb-3">Page access</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {(
          [
            ['manage', 'Manage'],
            ['checkin', 'Check-In'],
            ['scoring', 'Scoring'],
            ['leaderboard', 'Leaderboard'],
            ['scorecards', 'Scorecards'],
            ['income', 'Income'],
          ] as const
        ).map(([key, label]) => (
          <label
            key={key}
            className="flex items-center gap-3 bg-gray-800 px-4 py-3 rounded-2xl cursor-pointer"
          >
            <input
              type="checkbox"
              checked={adminPerms[key]}
              onChange={(e) =>
                setAdminPerms((prev) => ({
                  ...prev,
                  [key]: e.target.checked,
                }))
              }
              className="w-5 h-5 accent-indigo-600"
            />
            <span className="text-sm">{label}</span>
          </label>
        ))}
      </div>
    </div>

    <button
      onClick={handleAddAdmin}
      className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 px-8 py-4 rounded-3xl font-medium"
    >
      Add Admin
    </button>

    <div className="space-y-4 mt-8">
      {admins.map((admin: any) => (
        <div
          key={admin.id}
          className="bg-gray-800 p-6 rounded-3xl flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3"
        >
          <div>
            <div className="font-medium">{admin.name || 'No Name'}</div>
            <div className="text-sm text-gray-400">{admin.email}</div>
            {admin.permissions && (
              <div className="text-xs text-gray-500 mt-1">
                Access:{' '}
                {Object.entries(admin.permissions)
                  .filter(([, v]) => v)
                  .map(([k]) => k)
                  .join(', ') || 'none'}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs px-3 py-1 bg-gray-700 rounded-full">
              {admin.user_id ? 'Registered' : 'Invited'}
            </div>
            <button
              onClick={() => handleDeleteAdmin(admin.id, admin.email)}
              className="text-red-500 hover:text-red-600 px-4 py-2 text-sm font-medium"
            >
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>

    {admins.length === 0 && (
      <p className="text-gray-400 text-center py-8">No admins added yet.</p>
    )}
  </div>
          </AccordionSection>

          <AccordionSection
            title="More"
            complete={moreComplete}
            summary={moreSummary || undefined}
            startOpen={!moreComplete}
          >
            <label className="flex items-start gap-3 cursor-pointer bg-gray-900 border border-gray-700 rounded-2xl p-5">
              <input
                type="checkbox"
                checked={!!event?.is_demo}
                onChange={(e) => handleEventChange('is_demo', e.target.checked)}
                className="mt-1 w-5 h-5 accent-amber-500"
              />
              <span>
                <span className="font-medium">Demo / training event</span>
                <span className="block text-sm text-gray-400 mt-1">
                  Test-mode event. No real charges.
                </span>
              </span>
            </label>

            <div>
              <label className="block text-sm text-gray-400 mb-4">
                Event contact
              </label>
              <div className="space-y-4">
                <input
                  placeholder="Contact name"
                  value={event.contact_name || ''}
                  onChange={(e) =>
                    handleEventChange('contact_name', e.target.value)
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5 text-base"
                />
                <input
                  type="email"
                  placeholder="Contact email"
                  value={event.contact_email || ''}
                  onChange={(e) =>
                    handleEventChange('contact_email', e.target.value)
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5 text-base"
                />
                <input
                  type="tel"
                  placeholder="Contact phone"
                  value={event.contact_phone || ''}
                  onChange={(e) =>
                    handleEventChange('contact_phone', e.target.value)
                  }
                  className="w-full bg-gray-700 border border-gray-600 rounded-3xl px-6 py-5 text-base"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => router.push(`/event/${eventId}/emails`)}
              className="w-full bg-gray-700 hover:bg-gray-600 px-5 py-4 rounded-2xl font-medium"
            >
              Email players
            </button>

            <button
              type="button"
              onClick={handleDuplicateEvent}
              disabled={saving || duplicating || deleting}
              className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-gray-600 py-5 rounded-3xl font-semibold text-lg"
            >
              {duplicating ? 'Duplicating…' : 'Duplicate Event'}
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() =>
                  alert('Update the date and save to postpone the event')
                }
                disabled={saving || duplicating || deleting}
                className="bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 py-4 rounded-3xl font-semibold"
              >
                Postpone Event
              </button>
              <button
                type="button"
                onClick={handleDeleteEvent}
                disabled={saving || duplicating || deleting}
                className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 py-4 rounded-3xl font-semibold"
              >
                {deleting ? 'Deleting…' : 'Delete Event'}
              </button>
            </div>
          </AccordionSection>
        </div>

        <div className="mt-10">
          <button
            onClick={handleSaveEvent}
            disabled={saving || duplicating || deleting}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 py-5 rounded-3xl font-semibold text-lg"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
