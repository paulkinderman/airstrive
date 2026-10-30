import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { savePendingConsent } from '@/auth/pendingConsent';
import { MiniGrid } from '@/ui/MiniGrid';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { colors } from '@/theme';

/**
 * Where Supabase sends someone linking AirStrive to another app, today only the Alexa skill:
 * "Allow Alexa to see your AirStrive?". It runs in the web app, which already knows how to
 * sign in; Allow hands Supabase's answer back to Alexa (supabase/functions/alexa).
 */
export default function OAuthConsent() {
  const params = useLocalSearchParams<{ authorization_id?: string }>();
  const id = params.authorization_id ?? '';
  const { status } = useAuth();

  if (status !== 'ready') {
    if (status === 'loading' || status === 'settingUp') return <View style={{ flex: 1, backgroundColor: colors.paper }} />;
    // Sign in first, then come back here (app/(tabs)/_layout.tsx).
    if (id) savePendingConsent(id);
    return <Redirect href="/" />;
  }
  return <Consent id={id} />;
}

type Details = { client: string; scopes: string[] };

/** Leaves the app for the other app's own page, with Supabase's code or refusal. */
function leave(url: string) {
  if (Platform.OS === 'web') window.location.assign(url);
}

function Consent({ id }: { id: string }) {
  const insets = useSafeAreaInsets();
  const { username } = useAuth();
  const [details, setDetails] = useState<Details | null>(null);
  const [state, setState] = useState<'loading' | 'asking' | 'sending' | 'error'>('loading');

  useEffect(() => {
    if (!supabase || !id) { setState('error'); return; }
    let live = true;
    supabase.auth.oauth.getAuthorizationDetails(id).then(({ data, error }) => {
      if (!live) return;
      if (error || !data) { setState('error'); return; }
      // Already allowed once: straight back to the other app.
      if (!('authorization_id' in data)) { leave(data.redirect_url); return; }
      setDetails({ client: data.client.name || 'Alexa', scopes: data.scope ? data.scope.split(' ') : [] });
      setState('asking');
    });
    return () => { live = false; };
  }, [id]);

  const decide = async (allow: boolean) => {
    if (!supabase) return;
    setState('sending');
    const { data, error } = allow
      ? await supabase.auth.oauth.approveAuthorization(id)
      : await supabase.auth.oauth.denyAuthorization(id);
    if (error || !data) { setState('error'); return; }
    leave(data.redirect_url);
  };

  const page = { flex: 1, backgroundColor: colors.paper, paddingHorizontal: 24, paddingTop: insets.top + 48, paddingBottom: insets.bottom + 20, gap: 12, width: '100%', maxWidth: 480, alignSelf: 'center' } as const;

  if (state === 'loading') return <View style={page}><ActivityIndicator color={colors.muted} /></View>;

  if (state === 'error' || !details) {
    return (
      <View style={page}>
        <Text variant="display">This link has expired</Text>
        <Text variant="body" style={{ color: colors.muted }}>
          Go back to the Alexa app and start linking AirStrive again. If it keeps happening, check your connection.
        </Text>
      </View>
    );
  }

  return (
    <View style={page}>
      <MiniGrid states={['done', 'hidden', 'done', 'hidden', 'done', 'hidden', 'done', 'hidden', 'done']} cols={3} color={colors.accent} cell={16} gap={4} />
      <Text variant="display">Let {details.client} show your AirStrive?</Text>
      <Text variant="body" style={{ color: colors.muted }}>
        {details.client} will be able to show{username ? ` ${username}'s` : ' your'} grids and moments, and the moments your friends share with you, on an Echo Show. It can't change anything or post for you.
      </Text>
      <Text variant="body" style={{ color: colors.muted }}>
        You can stop it any time by disabling the AirStrive skill in the Alexa app.
      </Text>
      <View style={{ flex: 1, minHeight: 24 }} />
      <Button label={state === 'sending' ? 'Linking…' : 'Allow'} onPress={() => decide(true)} disabled={state === 'sending'} />
      <Button label="Don't allow" kind="quiet" onPress={() => decide(false)} disabled={state === 'sending'} />
    </View>
  );
}
