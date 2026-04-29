'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export default function CreateTournament() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [courseSearch, setCourseSearch] = useState('');
  const [courseResults, setCourseResults] = useState<any[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);

  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Search for courses
  const searchCourses = async (query: string) => {
    if (query.length < 3) {
      setCourseResults([]);
      return;
    }

    try {
      const res = await fetch(
        `https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(query)}`,
        {
          headers: {
            'Authorization': `Key ${process.env.NEXT_PUBLIC_GOLF_COURSE_API_KEY}`
          }
        }
      );
      const data = await res.json();
      setCourseResults(data.courses || data || []);
    } catch (err) {
      console.error('Course search failed:', err);
      setCourseResults([]);
    }
  };

  // Select course and fetch full details
  const selectCourse = async (basicCourse: any) => {
    const courseId = basicCourse.id;
    if (!courseId) return;

    try {
      const res = await fetch(`https://api.golfcourseapi.com/v1/courses/${courseId}`, {
        headers: {
          'Authorization': `Key ${process.env.NEXT_PUBLIC_GOLF_COURSE_API_KEY}`
        }
      });
      const fullCourse = await res.json();

      setSelectedCourse(fullCourse);
      setCourseSearch(fullCourse.course_name || fullCourse.name || basicCourse.course_name || basicCourse.name || '');
      setCourseResults([]);
    } catch (err) {
      console.error('Failed to load full course details:', err);
    }
  };

  const handleSubmit = async (formData: FormData) => {
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
        course_data: selectedCourse,           // Full course data saved
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

    // Redirect to the Manage tab of the new event
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
                  searchCourses(e.target.value);
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
                      {course.course_name || course.name} — {course.club_name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedCourse && (
              <div className="mt-3 px-5 py-3 bg-green-900/30 border border-green-700 rounded-2xl text-emerald-400 text-sm">
                ✓ Selected: {selectedCourse.course_name || selectedCourse.name}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Description (optional)</label>
            <textarea name="description" rows={4} className="w-full px-5 py-4 bg-gray-700 border border-gray-600 rounded-2xl" placeholder="18-hole stroke play..." />
          </div>

          {error && <p className="text-red-500 text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || !selectedCourse}
            className="w-full py-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-2xl font-semibold text-lg transition-colors"
          >
            {loading ? 'Creating Tournament...' : 'Create Tournament'}
          </button>
        </form>
      </div>
    </div>
  );
}