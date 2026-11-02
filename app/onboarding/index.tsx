import { useState } from 'react';
import { ScrollView, View, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { INTERESTS } from '@/atlas/themes';
import { useAuth } from '@/auth/AuthProvider';
import { OnboardingInvite } from '@/friends/InviteCard';
import type { Invite } from '@/friends/links';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { colors } from '@/theme';

/** Step one of a new profile after the username: a few things the person is into. */
export default function Interests() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { username, finishOnboarding } = useAuth();
  const [picked, setPicked] = useState<string[]>([]);
  const [going, setGoing] = useState(false);

  // Straight to the invite that brought them here: the shelf opens it (app/(tabs)/_layout.tsx).
  // A "Try this grid" link's grid goes on the shelf first.
  const goToInvite = async (invite: Invite) => {
    if (going) return;
    setGoing(true);
    try {
      await finishOnboarding([], invite.kind === 'a' ? [invite.code] : []);
    } finally {
      setGoing(false);
    }
  };

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const next = (ids: string[]) => router.push({ pathname: '/onboarding/picks', params: { interests: ids.join(',') } });

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 48, paddingHorizontal: 24, paddingBottom: 24, gap: 14 }}>
        <OnboardingInvite onGo={(i) => void goToInvite(i)} />
        <Text variant="label">Welcome{username ? `, ${username}` : ''}</Text>
        <Text variant="display">What are you into?</Text>
        <Text variant="body" style={{ color: colors.muted }}>
          Pick a few. We'll suggest grids to start with, and you can always find more in the Atlas.
        </Text>
        <View style={styles.chips}>
          {INTERESTS.map((i) => {
            const on = picked.includes(i.id);
            return (
              <Pressable
                key={i.id}
                onPress={() => toggle(i.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && { opacity: 0.85 }]}
              >
                <Text variant="bodyBold" style={{ fontSize: 14, color: on ? '#fff' : colors.ink }}>{i.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 16, paddingTop: 8, gap: 4, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.card }}>
        <Button label={picked.length ? 'Show me grids' : 'Pick at least one'} onPress={() => next(picked)} disabled={!picked.length} />
        <Button label="Skip, show me everything" kind="quiet" onPress={() => next([])} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 10 },
  chip: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 22, borderWidth: 1.5, borderColor: colors.lineStrong, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
});
