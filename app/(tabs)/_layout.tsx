import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { useWindowDimensions, type ColorValue } from 'react-native';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { takePendingCode } from '@/friends/pendingCode';
import { takePendingConsent } from '@/auth/pendingConsent';
import { useWideLayout } from '@/ui/wide';
import { Sidebar, SIDEBAR } from '@/wide/Sidebar';
import { colors, fonts } from '@/theme';

function GridsIcon({ color }: { color: ColorValue }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={String(color)} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={3} width={7} height={7} rx={2} />
      <Rect x={14} y={3} width={7} height={7} rx={2} />
      <Rect x={3} y={14} width={7} height={7} rx={2} />
      <Rect x={14} y={14} width={7} height={7} rx={2} />
    </Svg>
  );
}

function LaneIcon({ color }: { color: ColorValue }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={String(color)} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z" />
      <Path d="M20 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z" />
    </Svg>
  );
}

function AtlasIcon({ color }: { color: ColorValue }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={String(color)} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={9} />
      <Path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
    </Svg>
  );
}

function ProfileIcon({ color }: { color: ColorValue }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={String(color)} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4 21a8 8 0 0 1 16 0" />
    </Svg>
  );
}

const ICONS = { index: GridsIcon, lane: LaneIcon, atlas: AtlasIcon };

/** On a computer screen the tabs become a sidebar; tabs without a wide layout keep this width beside it. */
const COLUMN = 640;

export default function TabsLayout() {
  const router = useRouter();
  const wide = useWideLayout();
  const { width } = useWindowDimensions();
  // The scene still covers the whole area beside the sidebar, so the tab behind it never shows through.
  const column = wide ? { backgroundColor: colors.scrap, paddingHorizontal: Math.max(0, (width - SIDEBAR - COLUMN) / 2) } : undefined;

  // A friend link opened before signing in picks up here once the shelf is ready.
  useEffect(() => {
    const code = takePendingCode();
    if (code) router.push({ pathname: '/f/[code]', params: { code } });
    // And so does linking AirStrive to Alexa.
    const consent = takePendingConsent();
    if (consent) router.push({ pathname: '/oauth/consent', params: { authorization_id: consent } });
  }, [router]);

  return (
    <Tabs
      tabBar={wide ? (props) => <Sidebar {...props} icons={ICONS} /> : undefined}
      screenOptions={{
        tabBarPosition: wide ? 'left' : 'bottom',
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.bodyBold, fontSize: 11 },
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.line },
        sceneStyle: { backgroundColor: colors.paper },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Grids', tabBarIcon: GridsIcon }} />
      <Tabs.Screen name="lane" options={{ title: 'Memory Lane', tabBarIcon: LaneIcon }} />
      <Tabs.Screen name="atlas" options={{ title: 'Atlas', tabBarIcon: AtlasIcon, ...(column && { sceneStyle: column }) }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ProfileIcon, ...(column && { sceneStyle: column }) }} />
    </Tabs>
  );
}
