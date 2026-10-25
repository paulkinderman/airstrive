import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
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

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
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
      <Tabs.Screen name="atlas" options={{ title: 'Atlas', tabBarIcon: AtlasIcon }} />
    </Tabs>
  );
}
