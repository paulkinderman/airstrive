import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Modal, ActivityIndicator, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { loadAtlas } from '@/atlas/catalog';
import { byTheme, picksFor, type AtlasGrid } from '@/atlas/picks';
import { GridPreview } from '@/atlas/GridPreview';
import { THEME_BLURB, type Theme } from '@/atlas/themes';
import { useAuth } from '@/auth/AuthProvider';
import { GridCard } from '@/ui/GridCard';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { colors } from '@/theme';

/**
 * Step two: the Atlas categories that match the person's interests, then the rest of the
 * Atlas. They can add as many grids as they like before reaching the shelf.
 */
export default function Picks() {
  const { interests: raw } = useLocalSearchParams<{ interests?: string }>();
  const interests = useMemo(() => (raw ? raw.split(',').filter(Boolean) : []), [raw]);
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { finishOnboarding } = useAuth();
  const [grids, setGrids] = useState<AtlasGrid[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [preview, setPreview] = useState<AtlasGrid | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAtlas(db).then((r) => { setGrids(r.grids); setOffline(r.offline); });
  }, [db]);

  const picks = useMemo(() => (grids ? picksFor(interests, grids) : []), [grids, interests]);
  const rest = useMemo(() => {
    if (!grids) return [];
    const shown = new Set(picks.map((p) => p.theme));
    return byTheme(grids).filter((s) => !shown.has(s.theme));
  }, [grids, picks]);

  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await finishOnboarding(interests, chosen);
    } finally {
      setSaving(false);
    }
  };

  const row = (title: string, sub: string, list: AtlasGrid[], key: string) => (
    <View key={key} style={{ gap: 10 }}>
      <View style={{ paddingHorizontal: 20, gap: 2 }}>
        <Text variant="label">{title}</Text>
        <Text variant="caption" style={{ color: colors.muted }}>{sub}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
        {list.map((g) => (
          <GridCard key={g.id} grid={g} selected={chosen.includes(g.id)} onToggle={() => toggle(g.id)} onPress={() => setPreview(g)} />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 24, gap: 22 }}>
        <View style={{ paddingHorizontal: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Back">
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 5l-7 7 7 7" /></Svg>
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: 20, gap: 6, marginTop: -10 }}>
          <Text variant="display">{picks.length ? 'Picked for you' : 'Start with a grid'}</Text>
          <Text variant="body" style={{ color: colors.muted }}>
            Add as many as you like. Tap a card to see how it starts.
          </Text>
          {offline && (
            <Text variant="caption" style={{ color: colors.muted }}>You're offline, so this is the part of the Atlas that's already on your phone.</Text>
          )}
        </View>

        {!grids && <ActivityIndicator color={colors.muted} style={{ paddingTop: 40 }} />}

        {picks.map((p) => row(p.theme, `Because you like ${listOf(p.because)}`, p.grids, `pick:${p.theme}`))}

        {rest.length > 0 && (
          <>
            {picks.length > 0 && <Text variant="title" style={{ paddingHorizontal: 20, paddingTop: 4 }}>More in the Atlas</Text>}
            {rest.map((s) => row(s.theme, THEME_BLURB[s.theme as Theme], s.grids, `rest:${s.theme}`))}
          </>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: insets.bottom + 14, gap: 2, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line }}>
        <Button
          label={saving ? 'Setting up your shelf…' : chosen.length ? `Add ${chosen.length} grid${chosen.length === 1 ? '' : 's'} to my shelf` : 'Pick a grid or two'}
          onPress={finish}
          disabled={saving || chosen.length === 0}
        />
        <Button label="Start with an empty shelf" kind="quiet" onPress={finish} disabled={saving} />
      </View>

      <Modal visible={!!preview} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setPreview(null)}>
        {preview && (
          <GridPreview
            grid={preview}
            onBack={() => setPreview(null)}
            footer={
              <Button
                label={chosen.includes(preview.id) ? 'Added · tap to remove' : 'Add to my shelf'}
                kind={chosen.includes(preview.id) ? 'secondary' : 'primary'}
                onPress={() => { toggle(preview.id); setPreview(null); }}
                style={{ flex: 1 }}
              />
            }
          />
        )}
      </Modal>
    </View>
  );
}

function listOf(items: string[]) {
  const lower = items.map((s) => s.toLowerCase());
  if (lower.length <= 1) return lower[0] ?? '';
  return `${lower.slice(0, -1).join(', ')} and ${lower[lower.length - 1]}`;
}
