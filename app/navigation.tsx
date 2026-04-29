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

  // Listen to auth changes (this is the key fix)
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };

    getUser();

    // Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');           
    // No need for router.refresh() anymore because of the listener above
  };

  return (
    <nav className="bg-gray-900 border-b border-gray-800 py-5">
      <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
        {/* Left Side - Logo + Home */}
        <div className="flex items-center gap-8">
          <Link href="/" className="text-2xl font-bold tracking-tight">
            Fried Egg Events
          </Link>

          <Link 
            href="/" 
            className="text-sm font-medium text-gray-300 hover:text-white transition-colors"
          >
            Home
          </Link>

          {user && (
            <Link 
              href="/dashboard"
              className="text-sm font-medium text-gray-300 hover:text-white transition-colors"
            >
              Dashboard
            </Link>
          )}
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-6">
          {user ? (
            <>
              <Link 
                href="/profile"
                className="flex items-center gap-3 hover:opacity-80 transition-opacity"
              >
                <div className="w-9 h-9 bg-gray-700 rounded-full flex items-center justify-center text-xl">
                  👤
                </div>
                <span className="hidden md:block text-sm font-medium">
                  {user.email?.split('@')[0]}
                </span>
              </Link>

              <button
                onClick={handleSignOut}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Sign Out
              </button>
            </>
          ) : (
            <Link 
              href="/login"
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-sm font-medium transition-colors"
            >
              Log In / Sign Up
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}