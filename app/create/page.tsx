'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export default function CreateTournament() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [courseSearch, setCourseSearch] = useState('');
  const [courseResults, setCourseResults] = useState<any[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Debounced search
  const debouncedSearch = (query: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchCourses(query);
    }, 500);
  };

  // Search for courses using RapidAPI
  const searchCourses = async (query: string) => {
    if (query.length < 3) {
      setCourseResults([]);
      return;
    }

    try {
      const res = await fetch(
        `https://golf-course-api.p.rapidapi.com/search?name=${encodeURIComponent(query)}`,
        {
          headers: {
            'X-RapidAPI-Key': 'f619f2f719msh75809eca0940d3dp19df7fjsn8ab27dcb27f2',
            'X-RapidAPI-Host': 'golf-course-api.p.rapidapi.com'
          }
        }
      );

      if (!res.ok) {
        console.error("API error:", res.status);
        setCourseResults([]);
        return;
      }

      const data = await res.json();
      setCourseResults(data.courses || data || []);
    } catch (err) {
      console.error('Course search failed:', err);
      setCourseResults([]);
    }
  };

  // Select course
  const selectCourse = (course: any) => {
    setSelectedCourse(course);
    setCourseSearch(course.name || course.course_name || '');
    setCourseResults([]);
  };

  const handleSubmit = async (formData: FormData) => {
    if (!agreedToTerms) {
      alert("Please agree to the Terms of Service and Waiver before creating the event.");
      return;
    }

    setLoading(true);
    setError(null);

    const name = formData.get('name') as string;
    const date = formData.get('date') as string;
    const location = formData.get('location') as string;
    const description = formData.get('description') as string || null;
    const maxPlayers = parseInt(formData.get('maxPlayers') as string || '0');

    if (!selectedCourse) {
      setError("Please select a golf course");
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("You must be logged in");
      setLoading(false);
      return;
    }

    const { data: newEvent, error: insertError } = await supabase
      .from('tournaments')
      .insert({
        name,
        date,
        location,
        course: selectedCourse.course_name || selectedCourse.name || '',
        course_data: selectedCourse,
        description,
        max_players: maxPlayers,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    alert('Tournament created successfully!');

    router.push(`/event/${newEvent.id}/admin`);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-5xl font-bold mb-10 text-center">Create New Tournament</h1>

        <form action={handleSubmit} className="bg-gray-800 rounded-3xl p-10 space-y-8">
          <div>
            <label className="block text-sm font-medium mb-2">Tournament Name</label>
            <input name="name" type="text" required className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-2xl focus:outline-none focus:border-blue-500" placeholder="Summer Classic" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium mb-2">Date</label>
              <input name="date" type="date" required className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-2xl" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Max Players</label>
              <input name="maxPlayers" type="number" required min="1" className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-2xl" placeholder="24" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Location</label>
            <input name="location" type="text" required className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-2xl" placeholder="Atlanta, GA" />
          </div>

          {/* Course Search */}
          <div>
            <label className="block text-sm font-medium mb-2">Golf Course</label>
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
                  {courseResults.map((course, idx) => (
                    <div
                      key={idx}
                      onClick={() => selectCourse(course)}
                      className="px-6 py-4 hover:bg-gray-700 cursor-pointer border-b border-gray-700 last:border-none"
                    >
                      {course.name || course.course_name} — {course.location || course.club_name || ''}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedCourse && (
              <div className="mt-3 px-5 py-3 bg-green-900/30 border border-green-700 rounded-2xl text-emerald-400 text-sm">
                ✓ Selected: {selectedCourse.name || selectedCourse.course_name}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Description (optional)</label>
            <textarea name="description" rows={4} className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-2xl" placeholder="18-hole stroke play..." />
          </div>

          {error && <p className="text-red-500 text-center">{error}</p>}

          {/* Waiver / Terms Checkbox for Event Creation */}
          <div className="flex items-start gap-3 bg-gray-900 p-5 rounded-2xl mt-6">
            <input
              type="checkbox"
              id="event-terms"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mt-1 w-5 h-5 accent-blue-600"
            />
            <label htmlFor="event-terms" className="text-sm text-gray-300 cursor-pointer">
              I agree to Fried Egg Events Terms of Service and will ensure all participants sign the Waiver & Release of Liability.
            </label>
          </div>

          <button
            type="submit"
            disabled={loading || !selectedCourse || !agreedToTerms}
            className="w-full py-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-2xl font-semibold text-lg transition-colors"
          >
            {loading ? 'Creating Tournament...' : 'Create Tournament'}
          </button>
        </form>
      </div>
    </div>
  );
}