'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import api from '@/lib/axios';
import { requestError, responseMessage } from '@/lib/request-feedback';
import AuthBrandPanel from '@/features/auth/AuthBrandPanel';
import { ThemeToggle } from '@/components/core/DisplayPreferences';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const response = await api.post('/auth/forgot-password', { email });
      setSuccess(responseMessage(response, 'If an account with that email exists, a password link has been requested. Check your inbox and Spam folder; if you requested one recently, wait an hour before trying again.'));
    } catch (err: unknown) {
      setError(requestError(err, 'Failed to request password reset. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell grid min-h-svh grid-cols-1 bg-canvas font-sans lg:h-svh lg:grid-cols-[minmax(23rem,0.92fr)_minmax(32rem,1.08fr)] lg:overflow-hidden">
      {/* Left side - Reused Brand Panel from Signin / Signup */}
      <AuthBrandPanel mode="forgot-password" />

      {/* Right side - Form pane */}
      <div className="auth-form-pane relative flex min-w-0 items-center justify-center px-5 pb-8 pt-20 lg:h-svh lg:overflow-hidden lg:px-8 lg:pb-5 lg:pt-16">
        <ThemeToggle className="auth-theme-toggle" />
        <div className="auth-form-card glass-card">
          <p className="auth-form-eyebrow">Account recovery</p>
          <h2 className="text-2xl lg:text-3xl font-extrabold text-[#1b4332] dark:text-ink mb-2">Forgot Your Herbal-Ai Password?</h2>
          <p className="text-sm font-semibold text-[#6a7282] dark:text-muted mb-4">
            Enter your account email to request a link to create or reset your Herbal-Ai password.
          </p>
          <p className="text-xs font-semibold text-[#6a7282] dark:text-muted mb-6 bg-white/40 dark:bg-soft/50 p-3 rounded-xl border border-black/5 dark:border-line">
            Signed in with Google? You can keep using Google sign-in, or create a separate Herbal-Ai password with this link. Your Google password will not change.
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
              🎉 {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-extrabold text-[#1b4332] dark:text-ink mb-2" htmlFor="email">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-black/10 dark:border-line bg-white/70 dark:bg-soft rounded-2xl px-4 py-3 text-sm text-[#1b4332] dark:text-ink focus:outline-none focus:ring-2 focus:ring-[#40916c]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn border-[#2d6a4f] bg-[#2d6a4f] text-white font-semibold text-base px-8 py-3.5 rounded-full shadow-sm hover:bg-[#1b4332] transition-colors w-full cursor-pointer mt-2 disabled:opacity-50"
            >
              {loading ? 'Requesting Link...' : 'Email a Password Link'}
            </button>
          </form>

          <p className="text-center text-sm font-bold text-[#6a7282] dark:text-muted mt-6">
            Remember your password?{' '}
            <Link href="/signin" className="text-[#2d6a4f] dark:text-[#74c69d] hover:underline font-extrabold">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
