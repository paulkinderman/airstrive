import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { useSQLiteContext } from 'expo-sqlite';
import { supabase } from '@/lib/supabase';
import { fileExists, removeFiles } from '@/lib/files';
import { supabaseRemote } from './supabaseRemote';
import { syncOnce, syncStatus, retryFailed } from './engine';
import { emitDataChanged } from './events';

export interface SyncState {
  pending: number;
  failed: number;
  lastSyncedAt: string | null;
  running: boolean;
  lastError: string | null;
}

interface SyncApi extends SyncState {
  /** Ask for a sync soon. Cheap to call after every write. */
  request: () => void;
  syncNow: () => Promise<void>;
  retry: () => Promise<void>;
}

const Ctx = createContext<SyncApi | null>(null);

export const localFiles = { exists: fileExists, remove: removeFiles };

export function SyncProvider({ userId, children }: { userId: string | null; children: ReactNode }) {
  const db = useSQLiteContext();
  const [state, setState] = useState<SyncState>({ pending: 0, failed: 0, lastSyncedAt: null, running: false, lastError: null });
  const running = useRef(false);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remote = useMemo(() => (supabase ? supabaseRemote(supabase) : null), []);

  const refreshStatus = useCallback(async () => {
    const s = await syncStatus(db);
    setState((x) => ({ ...x, ...s }));
  }, [db]);

  const run = useCallback(async () => {
    if (!remote || !userId) { await refreshStatus(); return; }
    if (running.current) { again.current = true; return; }
    const net = await Network.getNetworkStateAsync().catch(() => null);
    if (net && net.isInternetReachable === false) { await refreshStatus(); return; }
    running.current = true;
    setState((x) => ({ ...x, running: true }));
    try {
      const r = await syncOnce(db, remote, localFiles, userId);
      if (r.pulled > 0 || r.downloaded > 0) emitDataChanged();
      setState((x) => ({ ...x, lastError: r.error ?? null }));
    } catch (e) {
      setState((x) => ({ ...x, lastError: e instanceof Error ? e.message : String(e) }));
    } finally {
      running.current = false;
      setState((x) => ({ ...x, running: false }));
      await refreshStatus();
      if (again.current) { again.current = false; void run(); }
    }
  }, [db, remote, userId, refreshStatus]);

  const request = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void run(); }, 1500);
  }, [run]);

  // On sign-in and launch, when the app comes back to the foreground, when the network
  // returns, and every minute while there is work waiting (retries back off per row).
  useEffect(() => {
    if (!userId) return;
    void run();
    const app = AppState.addEventListener('change', (s) => { if (s === 'active') void run(); });
    const net = Network.addNetworkStateListener((s) => { if (s.isInternetReachable) void run(); });
    const tick = setInterval(() => { void syncStatus(db).then((s) => { if (s.pending > 0) void run(); }); }, 60_000);
    return () => { app.remove(); net.remove(); clearInterval(tick); };
  }, [userId, run, db]);

  const api: SyncApi = {
    ...state,
    request,
    syncNow: run,
    retry: async () => { await retryFailed(db); await run(); },
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useSync(): SyncApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSync outside SyncProvider');
  return v;
}
