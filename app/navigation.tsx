'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';

export default function Navigation() {
  const [user, setUser] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
    <>
      <nav className="bg-gray-900 border-b border-gray-800 py-5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          
          {/* Left Side - Logo + Home Link */}
          <div className="flex items-center gap-8">
            

            <Link 
              href="/" 
              className="text-sm font-medium text-gray-300 hover:text-white transition-colors hidden md:block"
            >
              Home
            </Link>
          </div>

          {/* Right Side - Menu + Auth */}
          <div className="flex items-center gap-6">
            {/* Menu Button */}
            <button 
  onClick={() => setSidebarOpen(true)}
  className="text-3xl p-2 hover:bg-gray-800 rounded-2xl transition-colors text-white"
>
  ☰
</button>

            {/* Auth */}
            {user ? (
              <>
                
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

      {/* Sidebar - Slide from Right */}
{sidebarOpen && (
  <div className="fixed inset-0 bg-black/80 z-[200] flex justify-end" onClick={() => setSidebarOpen(false)}>
    <div className="bg-gray-900 w-72 h-full p-6 overflow-y-auto" onClick={e => e.stopPropagation()}>
      <button 
        onClick={() => setSidebarOpen(false)} 
        className="text-4xl mb-8 text-gray-400 hover:text-white"
      >
        ✕
      </button>
      
      <div className="space-y-1">
  <Link 
    href="/profile" 
    onClick={() => setSidebarOpen(false)} 
    className="block px-6 py-4 rounded-2xl hover:bg-gray-800 text-lg text-white"
  >
    👤 Profile
  </Link>

  <Link 
    href="/dashboard/play" 
    onClick={() => setSidebarOpen(false)} 
    className="block px-6 py-4 rounded-2xl hover:bg-gray-800 text-lg font-medium text-white"
  >
    🏌️‍♂️ Play Events
  </Link>

  <Link 
  href="/events" 
  onClick={() => setSidebarOpen(false)} 
  className="block px-6 py-4 rounded-2xl hover:bg-gray-800 text-lg font-medium text-white"
>
  📅 Created Events
</Link>

  <Link 
    href="/" 
    onClick={() => setSidebarOpen(false)} 
    className="block px-6 py-4 rounded-2xl hover:bg-gray-800 text-lg text-white"
  >
    🏠 Home
  </Link>
</div>
    </div>
  </div>
)}
    </>
  );
}