'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { errorText, supabase } from '@/lib/supabase';
import { SignIn } from '@/components/SignIn';
import { Reports } from '@/components/Reports';
import { Grids } from '@/components/Grids';
import { People } from '@/components/People';

type Tab = 'reports' | 'grids' | 'people';
const TABS: { id: Tab; label: string }[] = [
  { id: 'reports', label: 'Open reports' },
  { id: 'grids', label: 'Grids' },
  { id: 'people', label: 'People' },
];

export default function Page() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('reports');

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!supabase || !userId) {
      setAdmin(null);
      return;
    }
    let live = true;
    setAdmin(null);
    setAdminError(null);
    supabase.rpc('is_admin').then(({ data, error }) => {
      if (!live) return;
      if (error) setAdminError(errorText(error));
      else setAdmin(data === true);
    });
    return () => {
      live = false;
    };
  }, [userId]);

  const signOut = () => supabase?.auth.signOut();

  if (!supabase) {
    return (
      <Shell>
        <div className="card narrow">
          <h2>Not configured</h2>
          <p className="muted">
            Copy <code>.env.example</code> to <code>.env.local</code>, fill in NEXT_PUBLIC_SUPABASE_URL and
            NEXT_PUBLIC_SUPABASE_ANON_KEY, then restart <code>npm run dev</code>.
          </p>
        </div>
      </Shell>
    );
  }

  if (!ready) return <Shell><p className="muted">Loading…</p></Shell>;
  if (!session) return <Shell><SignIn /></Shell>;

  const who = <span className="muted small">{session.user.email}</span>;

  if (adminError) {
    return (
      <Shell right={who} onSignOut={signOut}>
        <div className="card narrow">
          <h2>Couldn’t check admin access</h2>
          <p className="error">{adminError}</p>
        </div>
      </Shell>
    );
  }
  if (admin === null) return <Shell right={who} onSignOut={signOut}><p className="muted">Checking access…</p></Shell>;
  if (!admin) {
    return (
      <Shell right={who} onSignOut={signOut}>
        <div className="card narrow">
          <h2>This account isn’t an admin</h2>
          <p className="muted">Ask someone with database access to set is_admin on your user, then sign in again.</p>
          <button className="btn" onClick={signOut}>Sign out</button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell right={who} onSignOut={signOut}>
      <p className="rule">
        Hiding a grid removes it from the Atlas and closes its open reports. Two hides on the same person within
        30 days suspends their sharing automatically; restore it on the People tab.
      </p>
      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'tab active' : 'tab'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'reports' && <Reports />}
      {tab === 'grids' && <Grids />}
      {tab === 'people' && <People />}
    </Shell>
  );
}

function Shell({
  children,
  right,
  onSignOut,
}: {
  children: ReactNode;
  right?: ReactNode;
  onSignOut?: () => void;
}) {
  return (
    <div className="page">
      <header className="top">
        <h1>
          AirStrive <span className="tag">Admin</span>
        </h1>
        <div className="top-right">
          {right}
          {onSignOut && (
            <button className="btn ghost small" onClick={onSignOut}>
              Sign out
            </button>
          )}
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
