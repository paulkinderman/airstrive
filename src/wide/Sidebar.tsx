import { useState, type ReactNode } from 'react';
import { View, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Image } from 'expo-image';
import { useAuth } from '@/auth/AuthProvider';
import { useAvatar } from '@/friends/avatars';
import { useSync } from '@/sync/SyncProvider';
import { Text } from '@/ui/Text';
import { MiniGrid } from '@/ui/MiniGrid';
import { colors, radius } from '@/theme';

export const SIDEBAR = 236;

/**
 * The tab bar on a computer screen: the tabs down the left, Create grid under them, and
 * you at the bottom with your picture (or your initial) leading to Profile.
 */
export function Sidebar({ state, descriptors, navigateToTab, icons }: BottomTabBarProps & { icons: Record<string, (p: { color: string }) => ReactNode> }) {
  const router = useRouter();
  const { username, userId } = useAuth();
  const picture = useAvatar(userId);
  const sync = useSync();
  const current = state.routes[state.index]?.name;
  const profile = state.routes.find((r) => r.name === 'profile');

  return (
    <View style={styles.side}>
      <View style={styles.logo}>
        <MiniGrid states={['hidden', 'done', 'hidden', 'revealed', 'hidden', 'revealed', 'hidden', 'hidden', 'hidden']} cols={3} color={colors.accent} cell={7} />
        <Text variant="title" style={{ fontSize: 24 }}>
          Air<Text variant="title" style={{ fontSize: 24, color: colors.accent }}>Strive</Text>
        </Text>
      </View>

      {state.routes.filter((r) => r.name !== 'profile').map((r) => {
        const on = r.name === current;
        const Icon = icons[r.name];
        return (
          <NavItem key={r.key} on={on} style={styles.nav} onPress={() => navigateToTab(r.key)}>
            {Icon?.({ color: on ? colors.ink : colors.muted })}
            <Text variant="bodyBold" style={{ color: on ? colors.ink : colors.muted }}>{String(descriptors[r.key]?.options.title ?? r.name)}</Text>
          </NavItem>
        );
      })}

      <Pressable onPress={() => router.push('/make')} style={({ pressed }) => [styles.create, pressed && { opacity: 0.85 }]}>
        <Text variant="bodyBold" style={{ fontSize: 14 }}>+ Create grid</Text>
      </Pressable>

      {profile && (
        <NavItem on={current === 'profile'} style={styles.me} onPress={() => navigateToTab(profile.key)} label="Profile and settings">
          <View style={styles.avatar}>
            {picture
              ? <Image source={picture} cachePolicy="disk" transition={150} style={styles.picture} />
              : <Text variant="title" style={{ fontSize: 17, color: '#fff' }}>{(username ?? '?').slice(0, 1).toUpperCase()}</Text>}
            {sync.failed > 0 && <View style={styles.badge} />}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyBold" numberOfLines={1}>{username ?? 'You'}</Text>
            <Text variant="body" style={{ fontSize: 13, color: colors.muted }}>Profile and settings</Text>
          </View>
        </NavItem>
      )}
    </View>
  );
}

function NavItem({ on, style, onPress, label, children }: { on: boolean; style: ViewStyle; onPress: () => void; label?: string; children: ReactNode }) {
  const [hover, setHover] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      style={[style, on ? styles.navOn : hover && styles.navHover]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  side: { width: SIDEBAR, height: '100%', backgroundColor: colors.card, borderRightWidth: 1, borderRightColor: colors.line, paddingVertical: 28, paddingHorizontal: 18, gap: 6 },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingBottom: 22 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12 },
  navOn: { backgroundColor: colors.scrap },
  navHover: { backgroundColor: colors.paper },
  create: { marginTop: 18, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, borderBottomWidth: 2, borderBottomColor: colors.accentDeep },
  me: { marginTop: 'auto', flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.md },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  picture: { width: 40, height: 40, borderRadius: 20 },
  badge: { position: 'absolute', top: -1, right: -1, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.danger, borderWidth: 2, borderColor: colors.card },
});
