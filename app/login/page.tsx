'use client';
export const dynamic = 'force-dynamic';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

function LoginContent() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgotDialog, setShowForgotDialog] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleSubmit = async (formData: FormData) => {
    setLoading(true);
    setError(null);

    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    const redirectUrl = searchParams.get('redirect') || '/dashboard';
    router.push(redirectUrl);
    router.refresh();
  };

  const sendResetLink = async () => {
    if (!forgotEmail) return alert("Please enter your email");

    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      alert(error.message);
    } else {
      setForgotSent(true);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-8">
      <div className="max-w-md w-full bg-gray-800 rounded-3xl p-10">
        <h1 className="text-4xl font-bold text-center mb-8">Log In</h1>

        <form action={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">Email Address</label>
            <input
              name="email"
              type="email"
              required
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-2xl focus:outline-none focus:border-blue-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Password</label>
            <input
              name="password"
              type="password"
              required
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-2xl focus:outline-none focus:border-blue-500"
              placeholder="••••••••"
            />
          </div>

          <div className="text-right">
            <button 
              type="button"
              onClick={() => setShowForgotDialog(true)}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              Forgot Password?
            </button>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-2xl font-semibold text-lg transition-colors"
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-400 mt-8">
          Don't have an account?{' '}
          <a href="/signup" className="text-blue-500 hover:underline">Sign up</a>
        </p>
      </div>

      {/* Forgot Password Dialog */}
      {showForgotDialog && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-3xl p-8 max-w-md w-full">
            <h3 className="text-2xl font-semibold mb-6">Reset Your Password</h3>
            
            {!forgotSent ? (
              <>
                <p className="text-gray-400 mb-6">Enter your email address and we'll send you a link to reset your password.</p>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-2xl mb-6"
                />
                <button
                  onClick={sendResetLink}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-700 rounded-2xl font-medium mb-4"
                >
                  Send Reset Link
                </button>
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-green-400 text-2xl mb-4">✅ Check your email!</p>
                <p className="text-gray-400">We've sent you a password reset link.</p>
              </div>
            )}

            <button 
              onClick={() => {
                setShowForgotDialog(false);
                setForgotSent(false);
                setForgotEmail('');
              }}
              className="w-full mt-4 py-3 text-gray-400 hover:text-white"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-900 flex items-center justify-center">Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}