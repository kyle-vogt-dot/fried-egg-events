'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

type EventKind = 'tournament' | 'league';
type RosterMode = 'individual' | 'team';
type PlayFormat =
  | 'stroke'
  | 'match_play'
  | 'stableford'
  | 'nassau'
  | 'other_individual'
  | 'scramble'
  | 'shamble'
  | 'best_ball'
  | 'alt_shot';

const INDIVIDUAL_FORMATS: { value: PlayFormat; label: string }[] = [
  { value: 'stroke', label: 'Stroke play' },
  { value: 'match_play', label: 'Match play' },
  { value: 'stableford', label: 'Stableford' },
  { value: 'nassau', label: 'Nassau' },
  { value: 'other_individual', label: 'Other individual' },
];

const TEAM_FORMATS: { value: PlayFormat; label: string }[] = [
  { value: 'scramble', label: 'Scramble' },
  { value: 'shamble', label: 'Shamble' },
  { value: 'best_ball', label: 'Best ball' },
  { value: 'alt_shot', label: 'Alternate shot' },
  { value: 'stroke', label: 'Stroke (team total)' },
];

const TEAM_ONLY_FORMATS = new Set<PlayFormat>([
  'scramble',
  'shamble',
  'best_ball',
  'alt_shot',
]);

function parseTeamRosterSize(value: string): number | null {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 2) return null;
  return n;
}

function todayDateStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

export default function CreateTournament() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [eventKind, setEventKind] = useState<EventKind | null>(null);
  const [rosterMode, setRosterMode] = useState<RosterMode | null>(null);
  const [teamRosterSize, setTeamRosterSize] = useState('4');
  const [playFormat, setPlayFormat] = useState<PlayFormat | null>(null);
  const [numberOfHoles, setNumberOfHoles] = useState<9 | 18>(18);

  const [name, setName] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [courseSearch, setCourseSearch] = useState('');
  const [courseResults, setCourseResults] = useState<any[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [location, setLocation] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const getCourseLocation = (course: any): string => {
    if (!course) return '';
    if (course.location && typeof course.location === 'string') {
      return course.location;
    }
    const loc =
      course.location && typeof course.location === 'object'
        ? course.location
        : null;
    const city = course.city || course.City || loc?.city || '';
    const state =
      course.state || course.State || course.state_code || loc?.state || '';
    const country = course.country || course.Country || loc?.country || '';
    if (city && state) return `${city}, ${state}`;
    if (city) return city;
    if (state) return state;
    if (course.club_name) return course.club_name;
    if (course.address || loc?.address) return course.address || loc.address;
    if (course.course && course.course !== course) {
      const nested = getCourseLocation(course.course);
      if (nested) return nested;
    }
    return country || '';
  };

  const debouncedSearch = (query: string) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      searchCourses(query);
    }, 500);
  };

  const searchCourses = async (query: string) => {
    if (query.length < 3) {
      setCourseResults([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/golf-search?q=${encodeURIComponent(query)}`
      );
      if (!res.ok) {
        setCourseResults([]);
        return;
      }
      const data = await res.json();
      setCourseResults(data.results || data.courses || data || []);
    } catch (err) {
      console.error('Course search failed:', err);
      setCourseResults([]);
    }
  };

  const selectCourse = async (basicCourse: any) => {
    const courseName =
      basicCourse.name ||
      basicCourse.course_name ||
      basicCourse.club_name ||
      '';
    setCourseSearch(courseName);
    setCourseResults([]);
    const loc = getCourseLocation(basicCourse);
    if (loc) setLocation(loc);

    try {
      const res = await fetch(
        `/api/golf-course-details?id=${encodeURIComponent(
          basicCourse.id || ''
        )}&name=${encodeURIComponent(courseName)}`
      );
      if (!res.ok) throw new Error('Details API failed');
      const fullData = await res.json();
      setSelectedCourse(fullData);
      const fullLoc = getCourseLocation(fullData);
      if (fullLoc) setLocation(fullLoc);
    } catch (err) {
      console.error('Details fetch failed, using search result:', err);
      setSelectedCourse(basicCourse);
    }
  };

  const selectKind = (kind: EventKind) => {
    setEventKind(kind);
    setError(null);
    setStep(2);
  };

  const selectIndividual = () => {
    setRosterMode('individual');
    if (playFormat && TEAM_ONLY_FORMATS.has(playFormat)) {
      setPlayFormat(null);
    }
    setError(null);
  };

  const selectTeam = () => {
    setRosterMode('team');
    setError(null);
  };

  const resolveRoster = ():
    | { play: number; roster: number }
    | { error: string } => {
    if (rosterMode === 'individual') {
      return { play: 1, roster: 1 };
    }
    if (rosterMode === 'team') {
      const size = parseTeamRosterSize(teamRosterSize);
      if (size == null) {
        return { error: 'Team roster size must be at least 2.' };
      }
      return { play: size, roster: size };
    }
    return { error: 'Choose Individual or Team.' };
  };

  const goToDetails = () => {
    const resolved = resolveRoster();
    if ('error' in resolved) {
      setError(resolved.error);
      return;
    }
    if (!playFormat) {
      setError('Choose a format.');
      return;
    }
    setError(null);
    setStep(3);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!eventKind) {
      setError('Choose Tournament or League / Tour');
      setStep(1);
      return;
    }

    const resolved = resolveRoster();
    if ('error' in resolved) {
      setError(resolved.error);
      setStep(2);
      return;
    }

    if (!playFormat) {
      setError('Choose a format.');
      setStep(2);
      return;
    }

    if (!agreedToTerms) {
      alert(
        'Please agree to the Terms of Service and Fee Policy before creating the event.'
      );
      return;
    }

    if (!selectedCourse) {
      setError('Please select a golf course');
      return;
    }

    setLoading(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError('You must be logged in');
      setLoading(false);
      return;
    }

    const insertPayload = {
      name: name.trim(),
      date: todayDateStr(),
      location: location.trim() || getCourseLocation(selectedCourse),
      course:
        courseDisplayName(selectedCourse) || courseSearch.trim() || '',
      course_data: selectedCourse,
      created_by: user.id,
      is_active: true,
      event_kind: eventKind,
      format: playFormat,
      roster_max: resolved.roster,
      default_competing: resolved.play,
      max_teammates: resolved.play,
      max_players: 72,
      number_of_holes: numberOfHoles,
    };

    const { data: newEvent, error: insertError } = await supabase
      .from('tournaments')
      .insert(insertPayload)
      .select()
      .single();

    if (insertError) {
      console.error(insertError);
      setError(insertError.message);
      setLoading(false);
      return;
    }

    const { error: roundError } = await supabase.from('event_rounds').insert({
      event_id: newEvent.id,
      sort_order: 0,
      name: 'Round 1',
      format: playFormat,
      course: insertPayload.course || null,
      course_data: selectedCourse,
    });
    if (roundError) {
      console.error('First round format save failed:', roundError);
    }

    setLoading(false);

    let needsPayoutSetup = true;
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select(
          'stripe_account_id, stripe_payouts_enabled, stripe_charges_enabled'
        )
        .eq('id', user.id)
        .maybeSingle();

      needsPayoutSetup =
        !profile?.stripe_account_id || !profile?.stripe_payouts_enabled;
    } catch (err) {
      console.error('Profile / Stripe status check failed:', err);
      needsPayoutSetup = true;
    }

    if (needsPayoutSetup) {
      router.push(`/event/${newEvent.id}/manage?setup_payouts=1`);
      return;
    }

    router.push(`/event/${newEvent.id}/manage`);
  };

  const isLeagueOrTour = eventKind === 'league';
  const createLabel = isLeagueOrTour
    ? 'Create League / Tour'
    : 'Create Tournament';
  const nameLabel = isLeagueOrTour ? 'League / Tour Name' : 'Tournament Name';

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-5xl font-bold mb-4 text-center">Create Event</h1>
        <div className="flex items-center justify-center gap-2 mb-10 text-sm text-gray-400">
          {[
            { n: 1 as const, label: 'Type' },
            { n: 2 as const, label: 'Roster' },
            { n: 3 as const, label: 'Details' },
          ].map((s, i) => (
            <span key={s.n} className="flex items-center gap-2">
              {i > 0 && <span className="text-gray-600">/</span>}
              <button
                type="button"
                onClick={() => {
                  if (s.n < step) {
                    setError(null);
                    setStep(s.n);
                  }
                }}
                className={
                  step === s.n
                    ? 'text-white font-medium'
                    : s.n < step
                      ? 'text-emerald-400 hover:text-emerald-300'
                      : 'text-gray-500'
                }
              >
                {s.n}. {s.label}
              </button>
            </span>
          ))}
        </div>

        {step === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <button
              type="button"
              onClick={() => selectKind('tournament')}
              className={`text-left p-8 min-h-48 rounded-2xl border-2 transition-colors ${
                eventKind === 'tournament'
                  ? 'border-emerald-500 bg-emerald-900/30'
                  : 'border-gray-700 bg-gray-800 hover:border-gray-500'
              }`}
            >
              <div className="text-2xl font-bold mb-3">Tournament</div>
              <p className="text-gray-400 leading-relaxed">
                One-round event (one day, one format).
              </p>
            </button>
            <button
              type="button"
              onClick={() => selectKind('league')}
              className={`text-left p-8 min-h-48 rounded-2xl border-2 transition-colors ${
                eventKind === 'league'
                  ? 'border-emerald-500 bg-emerald-900/30'
                  : 'border-gray-700 bg-gray-800 hover:border-gray-500'
              }`}
            >
              <div className="text-2xl font-bold mb-3">League / Tour</div>
              <p className="text-gray-400 leading-relaxed">
                Repeating weeks, multiple rounds.
              </p>
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 items-stretch">
              <button
                type="button"
                onClick={selectIndividual}
                className={`p-4 rounded-2xl border-2 h-full flex items-center justify-center text-center transition-colors ${
                  rosterMode === 'individual'
                    ? 'border-emerald-500 bg-emerald-900/30'
                    : 'border-gray-700 bg-gray-800 hover:border-gray-500'
                }`}
              >
                <div className="text-lg sm:text-xl font-bold">Individual</div>
              </button>
              <button
                type="button"
                onClick={selectTeam}
                className={`p-4 rounded-2xl border-2 h-full flex items-center justify-center text-center transition-colors ${
                  rosterMode === 'team'
                    ? 'border-emerald-500 bg-emerald-900/30'
                    : 'border-gray-700 bg-gray-800 hover:border-gray-500'
                }`}
              >
                <div className="text-lg sm:text-xl font-bold">Team</div>
              </button>
            </div>

            {rosterMode === 'team' && (
              <div className="space-y-3">
                <label className="block text-sm font-medium">
                  Team roster size
                </label>
                <p className="text-sm text-gray-400 leading-relaxed">
                  How many names on the team. Can differ from how many play a
                  round later.
                </p>
                <input
                  type="number"
                  min="2"
                  inputMode="numeric"
                  value={teamRosterSize}
                  onChange={(e) => setTeamRosterSize(e.target.value)}
                  className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-2xl no-spinner"
                />
              </div>
            )}

            {rosterMode && (
              <div className="space-y-3">
                <label className="block text-sm font-medium">Format</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {(rosterMode === 'team'
                    ? TEAM_FORMATS
                    : INDIVIDUAL_FORMATS
                  ).map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => {
                        setPlayFormat(f.value);
                        setError(null);
                      }}
                      className={`px-4 py-4 rounded-2xl border-2 text-left font-medium transition-colors ${
                        playFormat === f.value
                          ? 'border-emerald-500 bg-emerald-900/30'
                          : 'border-gray-700 bg-gray-800 hover:border-gray-500'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="text-red-500 text-center">{error}</p>}

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep(1);
                }}
                className="flex-1 py-4 bg-gray-700 hover:bg-gray-600 rounded-2xl font-semibold text-lg transition-colors"
              >
                Back
              </button>
              {rosterMode && (
                <button
                  type="button"
                  onClick={goToDetails}
                  className="flex-1 py-4 bg-green-600 hover:bg-green-700 rounded-2xl font-semibold text-lg transition-colors"
                >
                  Continue
                </button>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                {nameLabel}
              </label>
              <input
                name="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-2xl focus:outline-none focus:border-blue-500"
                placeholder={
                  isLeagueOrTour ? 'Wednesday Night League' : 'Summer Classic'
                }
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Golf Course
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={courseSearch}
                  onChange={(e) => {
                    setCourseSearch(e.target.value);
                    debouncedSearch(e.target.value);
                  }}
                  placeholder="Start typing course name..."
                  className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-2xl focus:outline-none focus:border-blue-500"
                />

                {courseResults.length > 0 && (
                  <div className="absolute z-50 w-full mt-2 bg-gray-800 border border-gray-700 rounded-2xl max-h-80 overflow-auto shadow-xl">
                    {courseResults.map((course, idx) => {
                      const courseName =
                        course.name || course.course_name || 'Unknown course';
                      const loc = getCourseLocation(course);
                      return (
                        <div
                          key={course.id ?? `${course.name}-${idx}`}
                          onClick={() => selectCourse(course)}
                          className="px-6 py-4 hover:bg-gray-700 cursor-pointer border-b border-gray-700 last:border-none"
                        >
                          <div className="font-medium text-white">
                            {courseName}
                          </div>
                          {loc ? (
                            <div className="text-sm text-gray-400 mt-0.5">
                              {loc}
                            </div>
                          ) : (
                            <div className="text-sm text-gray-500 mt-0.5">
                              Location not listed
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-6">
                <label className="block text-sm font-medium mb-2">
                  Location
                </label>
                <input
                  name="location"
                  type="text"
                  required
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-2xl"
                  placeholder="Atlanta, GA"
                />
              </div>

              {selectedCourse && (
                <div className="mt-3 px-5 py-3 bg-green-900/30 border border-green-700 rounded-2xl text-emerald-400 text-sm">
                  ✓ Selected:{' '}
                  {courseDisplayName(selectedCourse) || courseSearch}
                  {getCourseLocation(selectedCourse) && (
                    <span className="text-gray-400">
                      {' '}
                      · {getCourseLocation(selectedCourse)}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-3">
                Number of holes
              </label>
              <div className="flex gap-3 bg-gray-700 border border-gray-600 rounded-2xl p-1">
                <button
                  type="button"
                  onClick={() => setNumberOfHoles(9)}
                  className={`flex-1 py-4 rounded-2xl font-medium ${
                    numberOfHoles === 9
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-gray-600 text-gray-300'
                  }`}
                >
                  9 Holes
                </button>
                <button
                  type="button"
                  onClick={() => setNumberOfHoles(18)}
                  className={`flex-1 py-4 rounded-2xl font-medium ${
                    numberOfHoles === 18
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-gray-600 text-gray-300'
                  }`}
                >
                  18 Holes
                </button>
              </div>
            </div>

            {error && <p className="text-red-500 text-center">{error}</p>}

            <div className="flex items-start gap-3 bg-gray-900 p-5 rounded-2xl mt-6">
              <input
                type="checkbox"
                id="event-terms"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-1 w-5 h-5 accent-blue-600"
              />
              <label
                htmlFor="event-terms"
                className="text-sm text-gray-300 cursor-pointer"
              >
                I agree to the Fried Egg Events{' '}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:text-emerald-300 underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Terms of Service
                </a>{' '}
                and{' '}
                <a
                  href="/fees"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:text-emerald-300 underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Fee Policy
                </a>
                , and I will ensure all participants receive any required Waiver
                &amp; Release of Liability.
              </label>
            </div>

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep(2);
                }}
                className="flex-1 py-4 bg-gray-700 hover:bg-gray-600 rounded-2xl font-semibold text-lg transition-colors"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading || !selectedCourse || !agreedToTerms}
                className="flex-1 py-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-2xl font-semibold text-lg transition-colors"
              >
                {loading ? 'Creating...' : createLabel}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
