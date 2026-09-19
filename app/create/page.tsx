'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import {
  FORMAT_PRESETS,
  type FormatPreset,
  type FormatPresetFields,
} from '@/app/libs/format-presets';

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
  const [step, setStep] = useState<1 | 2>(1);
  const [preset, setPreset] = useState<FormatPreset | null>(null);
  const [numberOfHoles, setNumberOfHoles] = useState<9 | 18>(18);
  const [whoPlays, setWhoPlays] = useState<1 | 2 | 4>(4);
  const [altShot, setAltShot] = useState(false);

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');

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

  const selectPreset = (next: FormatPreset) => {
    setPreset(next);
    setError(null);
    if (next === 'charity_scramble' || next === 'best_ball') {
      setNumberOfHoles(18);
      setWhoPlays(4);
      setAltShot(false);
      return;
    }
    if (next === 'stroke_play') {
      setNumberOfHoles(18);
      setWhoPlays(1);
      return;
    }
    if (next === 'company_league') {
      setNumberOfHoles(9);
      setWhoPlays(2);
      setStep(2);
    }
  };

  const presetFields = (): FormatPresetFields | null => {
    if (!preset) return null;
    const base = { ...FORMAT_PRESETS[preset] };
    if (preset === 'company_league') return base;
    base.number_of_holes = numberOfHoles;
    if (preset === 'charity_scramble' || preset === 'best_ball') {
      const n = whoPlays === 2 || whoPlays === 4 ? whoPlays : 4;
      base.players_per_match = n;
      base.roster_max = n;
      base.default_competing = n;
      base.max_teammates = n;
    }
    if (preset === 'charity_scramble' && altShot) {
      base.play_format = 'alternate_shot';
      base.format = 'alternate_shot';
    }
    return base;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const fields = presetFields();
    if (!fields) {
      setError('Choose a format.');
      setStep(1);
      return;
    }

    if (fields.event_kind === 'one_day') {
      const priceValue = price.trim() === '' ? NaN : parseFloat(price);
      if (!Number.isFinite(priceValue) || priceValue < 0) {
        setError('Enter a price (0 for free).');
        return;
      }
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

    const priceValue = price.trim() === '' ? null : parseFloat(price);
    const insertPayload = {
      name: name.trim(),
      date: todayDateStr(),
      location: location.trim() || getCourseLocation(selectedCourse),
      course:
        courseDisplayName(selectedCourse) || courseSearch.trim() || '',
      course_data: selectedCourse,
      created_by: user.id,
      is_active: true,
      event_kind: fields.event_kind,
      format: fields.format,
      play_format: fields.play_format,
      scoring_type: fields.scoring_type,
      roster_max: fields.roster_max,
      players_per_match: fields.players_per_match,
      default_competing: fields.default_competing,
      max_teammates: fields.max_teammates,
      max_players: 72,
      number_of_holes: fields.number_of_holes,
      points_per_hole: fields.points_per_hole,
      halved_points: fields.halved_points,
      match_win_bonus: fields.match_win_bonus,
      auto_checkin_lineup: fields.auto_checkin_lineup !== false && fields.event_kind === 'league',
      price:
        fields.event_kind === 'one_day' &&
        priceValue != null &&
        Number.isFinite(priceValue) &&
        priceValue >= 0
          ? priceValue
          : null,
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
      name: fields.event_kind === 'league' ? 'Week 1' : 'Round 1',
      format: fields.play_format,
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

  const fields = presetFields();
  const isLeagueOrTour = fields?.event_kind === 'league';
  const isTeamPay = (fields?.players_per_match || 1) > 1;
  const createLabel = isLeagueOrTour
    ? 'Create League'
    : 'Create Event';
  const nameLabel = isLeagueOrTour ? 'League Name' : 'Event Name';
  const steps = [
    { n: 1 as const, label: 'Format' },
    { n: 2 as const, label: 'Details' },
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-5xl font-bold mb-4 text-center">Create Event</h1>
        <div className="flex items-center justify-center gap-2 mb-10 text-sm text-gray-400">
          {steps.map((s, i) => (
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
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(
                [
                  {
                    id: 'charity_scramble' as const,
                    title: 'Charity scramble',
                    blurb: 'One team score per hole · 4 play · team pays once',
                  },
                  {
                    id: 'best_ball' as const,
                    title: 'Best ball',
                    blurb: 'Each player scores · team uses the low ball',
                  },
                  {
                    id: 'company_league' as const,
                    title: 'Company league',
                    blurb: '9 holes · roster 6 · 2 play · match play',
                  },
                  {
                    id: 'stroke_play' as const,
                    title: 'Stroke play',
                    blurb: 'Individual stroke play',
                  },
                ] as const
              ).map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => selectPreset(card.id)}
                  className={`text-left p-8 min-h-40 rounded-2xl border-2 transition-colors ${
                    preset === card.id
                      ? 'border-emerald-500 bg-emerald-900/30'
                      : 'border-gray-700 bg-gray-800 hover:border-gray-500'
                  }`}
                >
                  <div className="text-2xl font-bold mb-3">{card.title}</div>
                  <p className="text-gray-400 leading-relaxed">{card.blurb}</p>
                </button>
              ))}
            </div>

            {preset && preset !== 'company_league' && (
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-3">Holes</label>
                  <div className="flex gap-3">
                    {([9, 18] as const).map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setNumberOfHoles(h)}
                        className={`flex-1 py-4 rounded-2xl border-2 font-medium ${
                          numberOfHoles === h
                            ? 'border-emerald-500 bg-emerald-900/30'
                            : 'border-gray-700 bg-gray-800'
                        }`}
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                </div>
                {(preset === 'charity_scramble' || preset === 'best_ball') && (
                  <div>
                    <label className="block text-sm font-medium mb-3">
                      Who plays
                    </label>
                    <div className="flex gap-3">
                      {([2, 4] as const).map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setWhoPlays(n)}
                          className={`flex-1 py-4 rounded-2xl border-2 font-medium ${
                            whoPlays === n
                              ? 'border-emerald-500 bg-emerald-900/30'
                              : 'border-gray-700 bg-gray-800'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {preset === 'charity_scramble' && (
                  <div>
                    <label className="block text-sm font-medium mb-3">
                      Optional
                    </label>
                    <button
                      type="button"
                      onClick={() => setAltShot((v) => !v)}
                      className={`px-5 py-4 rounded-2xl border-2 font-medium ${
                        altShot
                          ? 'border-emerald-500 bg-emerald-900/30'
                          : 'border-gray-700 bg-gray-800'
                      }`}
                    >
                      Alternate shot
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setStep(2);
                  }}
                  className="w-full py-4 bg-green-600 hover:bg-green-700 rounded-2xl font-semibold text-lg"
                >
                  Continue
                </button>
              </div>
            )}

            {error && <p className="text-red-500 text-center">{error}</p>}
          </div>
        )}

        {step === 2 && (
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

            {fields?.event_kind === 'one_day' && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  {isTeamPay ? 'Price per team' : 'Price per player'}
                </label>
                <input
                  name="price"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-2xl no-spinner"
                  placeholder="0.00"
                />
              </div>
            )}

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
                  setStep(1);
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
