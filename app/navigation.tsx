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
        <div className="flex items-center gap-6 sm:gap-8">
          <Link href="/" className="text-2xl font-bold tracking-tight">
            Fried Egg Events
          </Link>

          <Link 
            href="/" 
            className="text-sm font-medium text-gray-300 hover:text-white transition-colors hidden sm:block"
          >
            Home
          </Link>

          {user && (
            <Link 
              href="/dashboard"
              className="text-sm font-medium text-gray-300 hover:text-white transition-colors hidden sm:block"
            >
              Dashboard
            </Link>
          )}
        </div>

        {/* Right Side - Single Button */}
        <div className="flex items-center">
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
                className="ml-6 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Sign Out
              </button>
            </>
          ) : (
            <Link 
              href="/login"
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-2xl transition-colors flex items-center gap-1"
            >
              Log In <span className="text-gray-300">/</span> Sign Up
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}