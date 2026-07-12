'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';

export default function Navigation() {
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  return (
    <nav className="bg-gray-900 border-b border-gray-800 py-5">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between">
        {/* Left Side - Logo + Links */}
        <div className="flex items-center gap-8">
          

          <div className="flex items-center gap-6">
            <Link href="/" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">
              Home
            </Link>
            {user && (
              <Link href="/dashboard" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">
                Dashboard
              </Link>
            )}
          </div>
        </div>

        {/* Right Side - Auth */}
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <Link 
                href="/profile"
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center">👤</div>
              </Link>
              <button onClick={handleSignOut} className="text-sm text-gray-400 hover:text-white">
                Sign Out
              </button>
            </>
          ) : (
            <Link href="/login" className="px-5 py-2 bg-blue-600 hover:bg-blue-700 rounded-2xl text-sm font-medium">
              Log In
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}