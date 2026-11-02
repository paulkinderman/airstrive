import { useCallback, useState } from 'react';
import { View, Pressable, StyleSheet, ActivityIndicator, Share, Platform, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { myFriendCode } from '@/friends/api';
import { resetFriendCode } from '@/friends/invites';
import { friendLink } from '@/friends/links';
import { BackIcon } from '@/friends/bits';
import { QrCode } from '@/friends/QrCode';
import { useAuth } from '@/auth/AuthProvider';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { colors, radius } from '@/theme';

export default function MyCode() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { username } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  // Fetched each time the screen opens, in case it was reset on another device.
  useFocusEffect(useCallback(() => {
    myFriendCode().then((c) => { setCode(c); setError(false); }).catch(() => setError(true));
  }, []));

  const link = code ? friendLink(code) : '';

  const share = async () => {
    if (!code) return;
    if (Platform.OS === 'web') {
      try {
        await navigator.clipboard.writeText(link);
        setCopied(true);
      } catch { /* the link is on screen to copy by hand */ }
      return;
    }
    await Share.share({ message: `Be my friend on AirStrive: ${link}` });
  };

  const reset = () => {
    Alert.alert(
      'Get a new link?',
      "Your current link and QR code stop working, so anyone you've sent them to can't use them any more. Your friends stay friends.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Get a new link',
          style: 'destructive',
          onPress: async () => {
            try {
              setCode(await resetFriendCode());
              setCopied(false);
            } catch {
              Alert.alert("Couldn't reach AirStrive", 'Check your connection and try again.');
            }
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => goBack(router, '/profile')} style={styles.iconButton} accessibilityLabel="Back"><BackIcon /></Pressable>
        <Text variant="label">My QR code</Text>
        <View style={styles.iconButton} />
      </View>
      <View style={{ padding: 24, gap: 16, alignItems: 'center' }}>
        <Text variant="display" style={{ textAlign: 'center' }}>{username}</Text>
        <View style={styles.qr}>
          {code ? <QrCode value={link} size={240} /> : error ? (
            <Text variant="body" style={{ color: colors.muted, textAlign: 'center' }}>Couldn't reach AirStrive. Check your connection.</Text>
          ) : <ActivityIndicator color={colors.muted} />}
        </View>
        <Text variant="body" style={{ color: colors.muted, textAlign: 'center' }}>
          Whoever scans this or opens your link becomes your friend, even if they still have to sign up. It keeps working until you get a new one.
        </Text>
        {code && Platform.OS === 'web' && <Text variant="caption" style={{ color: colors.muted }} selectable>{link}</Text>}
        <Button label={Platform.OS === 'web' ? (copied ? 'Link copied' : 'Copy my link') : 'Share my link'} kind="secondary" onPress={share} disabled={!code} style={{ alignSelf: 'stretch' }} />
        <Button label="Get a new link" kind="quiet" onPress={reset} disabled={!code} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingBottom: 6 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  qr: { width: 272, height: 272, borderRadius: radius.xl, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
});
