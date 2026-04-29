'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import Image from 'next/image';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'created' | 'registered'>('created');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const [createdEvents, setCreatedEvents] = useState<any[]>([]);
  const [registeredEvents, setRegisteredEvents] = useState<any[]>([]);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      setUser(user);
      setName(user.user_metadata?.full_name || user.email?.split('@')[0] || '');
      setEmail(user.email || '');
      setAvatarUrl(user.user_metadata?.avatar_url || '');

      // Fetch created events
      const { data: created } = await supabase
        .from('tournaments')
        .select('*')
        .eq('created_by', user.id)
        .order('date', { ascending: true });

      setCreatedEvents(created || []);

      // Fetch registered events
      const { data: registered } = await supabase
        .from('event_registrations')
        .select(`
          *,
          tournament:tournaments(*)
        `)
        .eq('user_id', user.id);

      setRegisteredEvents(registered || []);

      setLoading(false);
    };

    fetchProfile();
  }, [router]);

  const handleSaveProfile = async () => {
    setSaving(true);
    // Update user metadata (basic)
    const { error } = await supabase.auth.updateUser({
      data: { full_name: name }
    });

    if (error) alert("Failed to update profile: " + error.message);
    else alert("Profile updated successfully!");

    setSaving(false);
  };

  if (loading) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Loading profile...</div>;

  // Split events into upcoming and past
  const now = new Date();

  const createdUpcoming = createdEvents.filter(e => new Date(e.date) >= now);
  const createdPast = createdEvents.filter(e => new Date(e.date) < now);

  const registeredUpcoming = registeredEvents.filter(r => new Date(r.tournament.date) >= now);
  const registeredPast = registeredEvents.filter(r => new Date(r.tournament.date) < now);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        

        

        {/* Tabs */}
        <div className="flex border-b border-gray-700 mb-8">
          <button
            onClick={() => setActiveTab('created')}
            className={`px-10 py-4 font-medium ${activeTab === 'created' ? 'border-b-2 border-blue-500' : 'text-gray-400'}`}
          >
            Created Events
          </button>
          <button
            onClick={() => setActiveTab('registered')}
            className={`px-10 py-4 font-medium ${activeTab === 'registered' ? 'border-b-2 border-blue-500' : 'text-gray-400'}`}
          >
            Upcoming Tournaments
          </button>
        </div>

        {/* Created Events Tab */}
        {activeTab === 'created' && (
          <div>
            <h3 className="text-2xl font-semibold mb-6">Created Events</h3>

            {createdUpcoming.length > 0 && (
              <div className="mb-12">
                <h4 className="text-lg text-gray-400 mb-4">Upcoming</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {createdUpcoming.map((e) => (
                    <a
                      key={e.id}
                      href={`/event/${e.id}/admin`}
                      className="bg-gray-800 p-8 rounded-3xl hover:bg-gray-700 transition-colors"
                    >
                      <h4 className="text-xl font-semibold">{e.name}</h4>
                      <p className="text-gray-400 mt-2">{new Date(e.date).toLocaleDateString()}</p>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {createdPast.length > 0 && (
              <div>
                <h4 className="text-lg text-gray-400 mb-4">Past Events</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {createdPast.map((e) => (
                    <a
                      key={e.id}
                      href={`/event/${e.id}/admin`}
                      className="bg-gray-800 p-8 rounded-3xl hover:bg-gray-700 transition-colors opacity-75"
                    >
                      <h4 className="text-xl font-semibold">{e.name}</h4>
                      <p className="text-gray-400 mt-2">{new Date(e.date).toLocaleDateString()}</p>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Registered Events Tab */}
        {activeTab === 'registered' && (
          <div>
            <h3 className="text-2xl font-semibold mb-6">My Tournaments</h3>

            {registeredUpcoming.length > 0 && (
              <div className="mb-12">
                <h4 className="text-lg text-gray-400 mb-4">Upcoming</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {registeredUpcoming.map((r) => (
                    <a
                      key={r.id}
                      href={`/event/${r.tournament.id}`}
                      className="bg-gray-800 p-8 rounded-3xl hover:bg-gray-700 transition-colors"
                    >
                      <h4 className="text-xl font-semibold">{r.tournament.name}</h4>
                      <p className="text-gray-400 mt-2">{new Date(r.tournament.date).toLocaleDateString()}</p>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {registeredPast.length > 0 && (
              <div>
                <h4 className="text-lg text-gray-400 mb-4">Past Events</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {registeredPast.map((r) => (
                    <a
                      key={r.id}
                      href={`/event/${r.tournament.id}`}
                      className="bg-gray-800 p-8 rounded-3xl hover:bg-gray-700 transition-colors opacity-75"
                    >
                      <h4 className="text-xl font-semibold">{r.tournament.name}</h4>
                      <p className="text-gray-400 mt-2">{new Date(r.tournament.date).toLocaleDateString()} • See Results</p>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}