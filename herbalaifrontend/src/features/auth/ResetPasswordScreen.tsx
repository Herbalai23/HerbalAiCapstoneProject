'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import api from '@/lib/axios';
import { requestError, responseMessage } from '@/lib/request-feedback';
import AuthBrandPanel from '@/features/auth/AuthBrandPanel';
import { ThemeToggle } from '@/components/core/DisplayPreferences';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  // Maintain precise state order for test harness compatibility
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(token ? null : 'Invalid reset link. Token is missing.');
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const tokenRejected = error === 'Invalid or expired password reset token.';

  // Dynamic password strength evaluation matching sign-up style
  const getPasswordStrength = () => {
    if (password.length === 0) return { label: 'Enter at least 8 characters', colorClass: 'bg-[#6a7282]/20', width: 'w-0' };
    if (password.length < 8) return { label: 'Too Short (Weak)', colorClass: 'bg-rose-500', width: 'w-1/3' };
    if (password.length < 12) return { label: 'Safe (Medium)', colorClass: 'bg-[#c9a040]', width: 'w-2/3' };
    return { label: 'Strong', colorClass: 'bg-[#40916c]', width: 'w-full' };
  };

  const strength = getPasswordStrength();

  useEffect(() => {
    if (!success) return;

    const redirectTimeout = window.setTimeout(() => {
      router.replace('/signin');
    }, 3000);

    return () => window.clearTimeout(redirectTimeout);
  }, [router, success]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || success || tokenRejected) return;
    setError(null);
    setSuccess(null);

    if (!token) {
      setError('Invalid reset link. Token is missing.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (new TextEncoder().encode(password).length > 72) {
      setError('Password must be at most 72 UTF-8 bytes.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/auth/reset-password', {
        token,
        password,
      });

      setPassword('');
      setConfirmPassword('');
      setSuccess(responseMessage(response, 'Password has been reset successfully!'));
    } catch (err: unknown) {
      setPassword('');
      setConfirmPassword('');
      setError(requestError(err, 'Failed to reset password. The link may have expired or is invalid.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell grid min-h-svh grid-cols-1 bg-canvas font-sans lg:h-svh lg:grid-cols-[minmax(23rem,0.92fr)_minmax(32rem,1.08fr)] lg:overflow-hidden">
      {/* Left side - Reused Brand Panel from Signin / Signup */}
      <AuthBrandPanel mode="reset-password" />

      {/* Right side - Form pane */}
      <div className="auth-form-pane relative flex min-w-0 items-center justify-center px-5 pb-8 pt-20 lg:h-svh lg:overflow-hidden lg:px-8 lg:pb-5 lg:pt-16">
        <ThemeToggle className="auth-theme-toggle" />
        <div className="auth-form-card glass-card">
          <p className="auth-form-eyebrow">Account security</p>
          <h2 className="text-2xl lg:text-3xl font-extrabold text-[#1b4332] dark:text-ink mb-2">Set your password</h2>
          <p className="text-sm font-semibold text-[#6a7282] dark:text-muted mb-2">
            Use at least 8 characters. Saving your password signs you out on all devices.
          </p>
          <p className="text-xs font-semibold text-[#6a7282] dark:text-muted mb-6 bg-white/40 dark:bg-soft/50 p-3 rounded-xl border border-black/5 dark:border-line">
            This password is only for Herbal-Ai. It does not change your Google password. If Google is linked to your account, you can still sign in with Google.
          </p>

          {error && (
            <div 
              role="alert" 
              className="mb-6 p-4 border border-rose-200 bg-rose-50 text-rose-800 font-bold rounded-xl text-sm"
            >
              ⚠️ {error}
            </div>
          )}

          {success && (
            <div 
              role="alert" 
              className="mb-6 p-4 border border-[#40916c] bg-[#eef5f0] text-[#2d6a4f] font-bold rounded-xl text-sm"
            >
              🎉 {success} Redirecting to sign in page...
            </div>
          )}

          {!success && !tokenRejected && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-extrabold text-[#1b4332] dark:text-ink mb-1" htmlFor="password">
                  New Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    disabled={!token || loading}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-black/10 dark:border-line bg-white/70 dark:bg-soft rounded-2xl px-4 py-2.5 pr-12 text-sm text-[#1b4332] dark:text-ink focus:outline-none focus:ring-2 focus:ring-[#40916c]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-1 flex w-11 items-center justify-center rounded-xl text-[#6a7282] hover:text-[#1b4332] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#40916c] dark:text-muted dark:hover:text-ink"
                  >
                    {showPassword ? <EyeOff aria-hidden="true" className="h-5 w-5" /> : <Eye aria-hidden="true" className="h-5 w-5" />}
                  </button>
                </div>
                {/* Strength indicator matching sign-up */}
                <div className="mt-2 space-y-1">
                  <div className="h-1.5 w-full bg-gray-200 dark:bg-line rounded-full overflow-hidden">
                    <div className={`h-full ${strength.colorClass} ${strength.width} transition-all duration-300`} />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-muted font-bold">{strength.label}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-extrabold text-[#1b4332] dark:text-ink mb-1" htmlFor="confirmPassword">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    disabled={!token || loading}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full border border-black/10 dark:border-line bg-white/70 dark:bg-soft rounded-2xl px-4 py-2.5 pr-12 text-sm text-[#1b4332] dark:text-ink focus:outline-none focus:ring-2 focus:ring-[#40916c]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((visible) => !visible)}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showConfirmPassword}
                    className="absolute inset-y-0 right-1 flex w-11 items-center justify-center rounded-xl text-[#6a7282] hover:text-[#1b4332] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#40916c] dark:text-muted dark:hover:text-ink"
                  >
                    {showConfirmPassword ? <EyeOff aria-hidden="true" className="h-5 w-5" /> : <Eye aria-hidden="true" className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={!token || loading}
                className="btn border-[#2d6a4f] bg-[#2d6a4f] text-white font-semibold text-sm px-8 py-3 rounded-full shadow-sm hover:bg-[#1b4332] transition-colors w-full cursor-pointer mt-2 disabled:opacity-50"
              >
                {loading ? 'Saving password...' : 'Set password'}
              </button>
            </form>
          )}

          {tokenRejected && (
            <Link href="/forgot-password" replace className="btn border-[#2d6a4f] bg-[#2d6a4f] text-white font-semibold text-sm px-8 py-3 rounded-full shadow-sm hover:bg-[#1b4332] transition-colors w-full mt-4 text-center">
              Request a New Reset Link
            </Link>
          )}

          <p className="text-center text-sm font-bold text-[#6a7282] dark:text-muted mt-5">
            <Link href="/signin" replace className="text-[#2d6a4f] dark:text-[#74c69d] hover:underline font-extrabold">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-line border-t-transparent"></div>
          <p className="text-ink font-extrabold animate-pulse font-sans">Loading password form...</p>
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
