'use client';

import { useState, type FormEvent } from 'react';
import { db, errorText } from '@/lib/supabase';

export function SignIn() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setState('sending');
    const { error } = await db().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
    });
    if (error) {
      setError(errorText(error));
      setState('idle');
    } else {
      setState('sent');
    }
  }

  return (
    <div className="card narrow">
      <h2>Sign in</h2>
      {state === 'sent' ? (
        <p>
          Check <strong>{email.trim()}</strong> for a sign-in link. Open it in this browser.
        </p>
      ) : (
        <form onSubmit={submit} className="stack">
          <label className="muted small" htmlFor="email">
            Admin email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <button className="btn primary" disabled={state === 'sending'}>
            {state === 'sending' ? 'Sending…' : 'Email me a link'}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      )}
    </div>
  );
}
