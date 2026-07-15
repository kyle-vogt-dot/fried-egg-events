'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [ghin, setGhin] = useState('');

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
      setPhone(user.user_metadata?.phone || '');
      setGhin(user.user_metadata?.ghin || '');

      setLoading(false);
    };

    fetchProfile();
  }, [router, supabase]);

  const handleSaveProfile = async () => {
    setSaving(true);

    const { error } = await supabase.auth.updateUser({
      data: { 
        full_name: name,
        phone: phone,
        ghin: ghin
      }
    });

    if (error) {
      alert("Failed to update profile: " + error.message);
    } else {
      alert("✅ Profile updated successfully!");
    }

    setSaving(false);
  };

  if (loading) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Loading profile...</div>;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold mb-10">My Profile</h1>

        <div className="bg-gray-800 rounded-3xl p-10">
          <div className="space-y-8">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4 text-lg"
                placeholder="Your name"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Email Address</label>
              <input
                type="email"
                value={email}
                disabled
                className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4 text-lg opacity-75"
              />
              <p className="text-xs text-gray-500 mt-1">Email cannot be changed here</p>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4 text-lg"
                placeholder="(555) 123-4567"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">GHIN Number</label>
              <input
                type="text"
                value={ghin}
                onChange={(e) => setGhin(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4 text-lg"
                placeholder="Your GHIN #"
              />
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 py-5 rounded-2xl font-semibold text-lg mt-6"
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}