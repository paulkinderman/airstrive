import { useState } from 'react';
import { View, Alert, Platform, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '@/auth/AuthProvider';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { MiniGrid } from '@/ui/MiniGrid';
import { colors, radius } from '@/theme';

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const [busy, setBusy] = useState(false);

  const attempt = (fn: () => Promise<void>) => async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert("Couldn't sign in", e instanceof Error ? e.message : 'Something went wrong. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24, paddingHorizontal: 24 }}>
      <View style={{ flex: 1, justifyContent: 'center', gap: 18 }}>
        <MiniGrid states={['hidden', 'done', 'hidden', 'revealed', 'hidden', 'revealed', 'hidden', 'hidden', 'hidden']} cols={3} color={colors.accent} cell={22} gap={6} />
        <Text variant="display" style={{ fontSize: 44, lineHeight: 48 }}>
          Air<Text variant="display" style={{ fontSize: 44, lineHeight: 48, color: colors.accent }}>Strive</Text>
        </Text>
        <Text variant="hand" style={{ fontSize: 30, color: colors.muted }}>Moments over metrics.</Text>
        <Text variant="body" style={{ color: colors.muted, fontSize: 16, lineHeight: 23 }}>
          Fill in grids of small experiences, one square at a time. Each square you finish keeps a photo and a few words, and
          Memory Lane turns them into a scrapbook.
        </Text>
      </View>

      <View style={{ gap: 12 }}>
        {auth.appleAvailable && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={radius.md}
            style={{ height: 50 }}
            onPress={attempt(auth.signInWithApple)}
          />
        )}
        {auth.googleAvailable && (
          <Pressable onPress={attempt(auth.signInWithGoogle)} disabled={busy} style={({ pressed }) => [styles.google, pressed && { opacity: 0.85 }]}>
            <GoogleMark />
            <Text variant="bodyBold" style={{ fontSize: 16 }}>Continue with Google</Text>
          </Pressable>
        )}
        {!auth.configured && (
          <Text variant="caption" style={{ textAlign: 'center' }}>
            Sign-in isn't set up in this build yet. Add the Supabase keys from .env.example and rebuild.
          </Text>
        )}
        {auth.configured && !auth.googleAvailable && !auth.appleAvailable && (
          <Text variant="caption" style={{ textAlign: 'center' }}>
            Sign-in needs a development build{Platform.OS === 'android' ? ' with the Google client ids set' : ''}. Expo Go can't show these buttons.
          </Text>
        )}
        {__DEV__ && !auth.configured && <Button label="Continue on this phone only (dev)" kind="secondary" onPress={auth.continueOffline} />}
        <Text variant="caption" style={{ textAlign: 'center', paddingTop: 4 }}>
          Your moments stay private unless you choose to share them.
        </Text>
      </View>
    </View>
  );
}

function GoogleMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48" accessibilityElementsHidden>
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  google: {
    height: 50, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.lineStrong,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
});
