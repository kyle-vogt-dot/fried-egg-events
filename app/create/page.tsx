'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

type EventKind = 'tournament' | 'league';
type RosterMode = 'individual' | 'team';

function parseTeamRosterSize(value: string): number | null {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 2) return null;
  return n;
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
  const [defaultCompeting, setDefaultCompeting] = useState<number | null>(null);
  const [rosterMax, setRosterMax] = useState<number | null>(null);
  const [teamRosterSize, setTeamRosterSize] = useState('4');

  const [name, setName] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [courseSearch, setCourseSearch] = useState('');
  const [courseResults, setCourseResults] = useState<any[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [location, setLocation] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [demoPassword, setDemoPassword] = useState('');

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
    setDefaultCompeting(1);
    setRosterMax(1);
    setError(null);
    setStep(3);
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
    setDefaultCompeting(resolved.play);
    setRosterMax(resolved.roster);
    setError(null);
    setStep(3);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!eventKind) {
      setError('Choose Tournament or League');
      setStep(1);
      return;
    }

    const resolved = resolveRoster();
    if ('error' in resolved) {
      setError(resolved.error);
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

    if (isDemo) {
      if (!demoPassword.trim()) {
        setError('Enter the demo passcode');
        return;
      }
      try {
        const res = await fetch('/api/verify-demo-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: demoPassword.trim() }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.error || 'Invalid demo passcode');
          return;
        }
      } catch {
        setError('Could not verify demo passcode');
        return;
      }
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

    const priceValue = price.trim() === '' ? null : parseFloat(price);
    const insertPayload = {
      name: name.trim(),
      date: dateStr,
      location: location.trim() || getCourseLocation(selectedCourse),
      course:
        courseDisplayName(selectedCourse) || courseSearch.trim() || '',
      course_data: selectedCourse,
      description: description.trim() || null,
      created_by: user.id,
      is_active: true,
      is_demo: isDemo,
      event_kind: eventKind,
      roster_max: resolved.roster,
      default_competing: resolved.play,
      max_teammates: resolved.play,
      max_players: 72,
      price:
        priceValue != null && Number.isFinite(priceValue) ? priceValue : null,
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

    setLoading(false);

    if (isDemo) {
      router.push(`/event/${newEvent.id}/manage`);
      return;
    }

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

  const createLabel =
    eventKind === 'league' ? 'Create League' : 'Create Tournament';

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
                One event or weekend. Rounds can be different days, courses, or
                formats.
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
              <div className="text-2xl font-bold mb-3">League</div>
              <p className="text-gray-400 leading-relaxed">
                Same group over multiple weeks. Usually one course and one
                format.
              </p>
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <button
                type="button"
                onClick={selectIndividual}
                className={`text-left p-8 min-h-48 rounded-2xl border-2 transition-colors ${
                  rosterMode === 'individual'
                    ? 'border-emerald-500 bg-emerald-900/30'
                    : 'border-gray-700 bg-gray-800 hover:border-gray-500'
                }`}
              >
                <div className="text-2xl font-bold mb-3">Individual</div>
                <p className="text-gray-400 leading-relaxed">One person.</p>
              </button>
              <button
                type="button"
                onClick={selectTeam}
                className={`text-left p-8 min-h-48 rounded-2xl border-2 transition-colors ${
                  rosterMode === 'team'
                    ? 'border-emerald-500 bg-emerald-900/30'
                    : 'border-gray-700 bg-gray-800 hover:border-gray-500'
                }`}
              >
                <div className="text-2xl font-bold mb-3">Team</div>
              </button>
            </div>

            {rosterMode === 'team' && (
              <div className="space-y-3">
                <label className="block text-sm font-medium">
                  Team roster size
                </label>
                <p className="text-sm text-gray-400 leading-relaxed">
                  Roster is how many names belong to the team (the list you
                  manage). Play is how many of those names are in a group for a
                  given round. Those can differ later (e.g. 5 on the roster, 4
                  play a scramble).
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
              {rosterMode === 'team' && (
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
                {eventKind === 'league' ? 'League Name' : 'Tournament Name'}
              </label>
              <input
                name="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-2xl focus:outline-none focus:border-blue-500"
                placeholder={
                  eventKind === 'league' ? 'Wednesday Night League' : 'Summer Classic'
                }
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2">
                  {eventKind === 'league' ? 'First week' : 'Event date'}
                </label>
                <input
                  name="date"
                  type="date"
                  required
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-2xl"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Price</label>
                <input
                  name="price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-2xl no-spinner"
                  placeholder="0.00"
                />
              </div>
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
              <label className="block text-sm font-medium mb-2">
                Description (optional)
              </label>
              <textarea
                name="description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-2xl"
                placeholder="18-hole stroke play..."
              />
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5 space-y-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDemo}
                  onChange={(e) => {
                    setIsDemo(e.target.checked);
                    if (!e.target.checked) setDemoPassword('');
                  }}
                  className="mt-1 w-5 h-5 accent-amber-500"
                />
                <span>
                  <span className="font-medium text-amber-400">
                    Demo / training event
                  </span>
                  <span className="block text-sm text-gray-400 mt-1">
                    Uses Stripe test mode only. No real charges. Passcode
                    required.
                  </span>
                </span>
              </label>
              {isDemo && (
                <input
                  type="password"
                  value={demoPassword}
                  onChange={(e) => setDemoPassword(e.target.value)}
                  placeholder="Demo passcode"
                  className="w-full px-5 py-4 bg-gray-700 border border-amber-600/50 rounded-2xl"
                  autoComplete="off"
                />
              )}
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
