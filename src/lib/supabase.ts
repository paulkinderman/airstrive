import 'expo-sqlite/localStorage/install';
import { AppState, Platform } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/db/database.types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** Null until EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are set (see .env.example). */
export const supabase: SupabaseClient<Database> | null =
  url && anonKey
    ? createClient<Database>(url, anonKey, {
        // The web build signs in by redirecting to Google and back, so it reads the session from the URL.
        auth: {
          storage: localStorage, autoRefreshToken: true, persistSession: true,
          detectSessionInUrl: Platform.OS === 'web', flowType: Platform.OS === 'web' ? 'pkce' : 'implicit',
        },
      })
    : null;

if (supabase) {
  // Only refresh tokens while the app is on screen.
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
