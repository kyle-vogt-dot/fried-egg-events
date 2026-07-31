'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export default function PlatformAdminPage() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feeInput, setFeeInput] = useState('3.00');
  const [message, setMessage] = useState('');
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const ALLOWED_EMAILS = [
    'kyle-vogt@hotmail.com',
  ];

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login?redirect=/platform');
        return;
      }

      setUserEmail(user.email || null);

      if (!ALLOWED_EMAILS.includes(user.email || '')) {
        router.push('/');
        return;
      }

      // Load current fee
      const { data } = await supabase
        .from('platform_settings')
        .select('platform_fee')
        .eq('id', 1)
        .single();

      if (data?.platform_fee !== undefined && data?.platform_fee !== null) {
        setFeeInput(Number(data.platform_fee).toFixed(2));
      }

      setLoading(false);
    };

    init();
  }, [supabase, router]);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');

    const fee = Number(feeInput) || 0;

    const { error } = await supabase
      .from('platform_settings')
      .update({
        platform_fee: fee,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    if (error) {
      setMessage('Failed to save: ' + error.message);
    } else {
      setMessage('✅ Fee updated successfully');
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Platform Admin</h1>
        <p className="text-gray-400 mb-10">Logged in as {userEmail}</p>

        <div className="bg-gray-800 rounded-3xl p-8 space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">
              Platform Fee (in dollars)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={feeInput}
              onChange={(e) => setFeeInput(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-2xl px-5 py-4 text-lg"
            />
            <p className="text-sm text-gray-400 mt-2">
              Current fee: ${Number(feeInput || 0).toFixed(2)} per player
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 py-4 rounded-2xl font-semibold text-lg"
          >
            {saving ? 'Saving...' : 'Save Fee'}
          </button>

          {message && (
            <p className="text-center text-emerald-400">{message}</p>
          )}
        </div>
      </div>
    </div>
  );
}