'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [showForgotDialog, setShowForgotDialog] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  const safeRedirect = () => {
    const raw = searchParams.get('redirect') || '/';
    // prevent open redirects
    if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
    return '/';
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = e.currentTarget;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value;
    const password = (form.elements.namedItem('password') as HTMLInputElement)
      .value;

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    router.push(safeRedirect());
    router.refresh();
  };

  const sendResetLink = async () => {
    const email = forgotEmail.trim();
    if (!email) {
      setForgotError('Please enter your email');
      return;
    }

    setForgotLoading(true);
    setForgotError(null);

    const origin =
      typeof window !== 'undefined' ? window.location.origin : '';

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: `${origin}/reset-password`,
      }
    );

    setForgotLoading(false);

    if (resetError) {
      setForgotError(resetError.message);
      return;
    }

    setForgotSent(true);
  };

  const closeForgot = () => {
    setShowForgotDialog(false);
    setForgotSent(false);
    setForgotEmail('');
    setForgotError(null);
    setForgotLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-8">
      <div className="max-w-md w-full bg-gray-800 rounded-3xl p-10">
        <h1 className="text-4xl font-bold text-center mb-8">Log In</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">
              Email Address
            </label>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-2xl focus:outline-none focus:border-blue-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Password</label>
            <div className="relative">
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                className="w-full px-4 py-3 pr-16 bg-gray-700 border border-gray-600 rounded-2xl focus:outline-none focus:border-blue-500"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 hover:text-white px-2 py-1"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
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
          Don&apos;t have an account?{' '}
          <a href="/signup" className="text-blue-500 hover:underline">
            Sign up
          </a>
        </p>
      </div>

      {showForgotDialog && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-3xl p-8 max-w-md w-full">
            <h3 className="text-2xl font-semibold mb-6">Reset Your Password</h3>

            {!forgotSent ? (
              <>
                <p className="text-gray-400 mb-6">
                  Enter your email and we&apos;ll send a link to set a new
                  password.
                </p>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-2xl mb-4"
                />
                {forgotError && (
                  <p className="text-red-400 text-sm mb-4">{forgotError}</p>
                )}
                <button
                  type="button"
                  onClick={sendResetLink}
                  disabled={forgotLoading}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-2xl font-medium mb-4"
                >
                  {forgotLoading ? 'Sending…' : 'Send Reset Link'}
                </button>
              </>
            ) : (
              <div className="text-center py-6">
                <p className="text-green-400 text-xl mb-3">Check your email</p>
                <p className="text-gray-400 text-sm">
                  We sent a reset link to{' '}
                  <span className="text-white">{forgotEmail.trim()}</span>.
                  Open it on this device to choose a new password.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={closeForgot}
              className="w-full mt-2 py-3 text-gray-400 hover:text-white"
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
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
          Loading…
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}