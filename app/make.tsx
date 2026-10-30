import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Pressable, TextInput, Switch, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { SIZES, spiralOrder, type GridSize } from '@/data/types';
import { THEMES, type Theme } from '@/atlas/themes';
import { ensureTemplate } from '@/atlas/catalog';
import { suggestRest, layOut, OWN_CLUSTER, type Suggested } from '@/suggest/suggest';
import { createGrid, getTemplate } from '@/db/repo';
import { useAuth } from '@/auth/AuthProvider';
import { useSync } from '@/sync/SyncProvider';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { SquareLookPicker } from '@/ui/SquareLook';
import { colors, fonts, gridColors, radius } from '@/theme';

const COLOR_NAMES = ['Yellow', 'Coral', 'Blue', 'Green', 'Violet', 'Rust', 'Indigo', 'Clay'];
const SIZE_ORDER: GridSize[] = ['tiny', 'small', 'medium', 'full'];
const SIZE_HINT: Record<GridSize, string> = {
  tiny: 'A trip, a weekend, a small project',
  small: 'A season or a hobby you are starting',
  medium: 'Something you will keep coming back to',
  full: 'A whole city, a whole year',
};

/** Make your own grid: name, color, size and theme, the squares you care about, and suggestions for the rest. */
export default function Make() {
  const params = useLocalSearchParams<{ title?: string; from?: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const sync = useSync();

  const [title, setTitle] = useState(params.title ?? '');
  const [color, setColor] = useState<string>(gridColors[4]);
  const [revealIcon, setRevealIcon] = useState('');
  const [size, setSize] = useState<GridSize>('small');
  const [theme, setTheme] = useState<Theme>('Making');
  const [description, setDescription] = useState('');
  const [own, setOwn] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [suggested, setSuggested] = useState<Suggested[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [seed, setSeed] = useState(() => Date.now() % 100000);
  const [shared, setShared] = useState(false);
  const [saving, setSaving] = useState(false);

  // Copy and edit: start from someone else's grid, every square editable.
  useEffect(() => {
    if (!params.from) return;
    (async () => {
      if (!(await ensureTemplate(db, params.from!))) return;
      const t = await getTemplate(db, params.from!);
      if (!t) return;
      setTitle(`${t.grid.title}, my way`);
      setColor(t.grid.color);
      setRevealIcon(t.grid.reveal_icon ?? '');
      setSize(t.grid.size);
      if ((THEMES as readonly string[]).includes(t.grid.theme)) setTheme(t.grid.theme as Theme);
      setDescription(t.grid.description);
      const byIdx = new Map(t.squares.map((s) => [s.idx, s.prompt]));
      setOwn(spiralOrder(t.grid.size).map((i) => byIdx.get(i) ?? '').filter(Boolean));
    })();
  }, [db, params.from]);

  const total = SIZES[size].cols * SIZES[size].rows;
  const ownClean = own.map((s) => s.trim()).filter(Boolean);
  const filled = ownClean.length + suggested.length;
  const missing = total - filled;

  const pickSize = (s: GridSize) => {
    setSize(s);
    setSuggested([]);
    const n = SIZES[s].cols * SIZES[s].rows;
    if (own.length > n) setOwn(own.slice(0, n));
  };

  const addDraft = () => {
    const t = draft.trim();
    if (!t || ownClean.length >= total) return;
    setOwn([...own, t]);
    setDraft('');
    // Your own squares take the place of suggestions.
    if (ownClean.length + 1 + suggested.length > total) setSuggested(suggested.slice(0, total - ownClean.length - 1));
  };

  const suggest = () => {
    const next = seed + 1;
    setSeed(next);
    const fresh = suggestRest({ name: title, theme, taken: ownClean, rejected, count: total - ownClean.length, seed: next });
    setSuggested(fresh);
  };

  const reject = (i: number) => {
    const gone = suggested[i];
    const rest = suggested.filter((_, j) => j !== i);
    const nextRejected = [...rejected, gone.prompt];
    setRejected(nextRejected);
    const [replacement] = suggestRest({
      name: title, theme, taken: [...ownClean, ...rest.map((s) => s.prompt)], rejected: nextRejected, count: 1, seed: seed + i + 7,
    });
    // Keep the replacement where the old one was, so clusters stay together.
    if (replacement) rest.splice(i, 0, replacement);
    setSuggested(rest);
  };

  const keep = (i: number) => {
    setOwn([...own, suggested[i].prompt]);
    setSuggested(suggested.filter((_, j) => j !== i));
  };

  const board = useMemo(() => {
    const order = spiralOrder(size);
    const cells = Array<'own' | 'suggested' | 'empty'>(total).fill('empty');
    order.forEach((idx, i) => { cells[idx] = i < ownClean.length ? 'own' : i < filled ? 'suggested' : 'empty'; });
    return cells;
  }, [size, total, ownClean.length, filled]);

  const create = async () => {
    if (saving || !userId) return;
    if (!title.trim()) { Alert.alert('Name it first', 'Give the grid a name so you can find it on your shelf.'); return; }
    if (missing > 0) { Alert.alert(`${missing} square${missing === 1 ? '' : 's'} to go`, 'Write a few more or tap Suggest the rest.'); return; }
    setSaving(true);
    try {
      const ug = await createGrid(db, userId, {
        title: title.trim().slice(0, 60), color, revealIcon, theme, size, description: description.trim().slice(0, 280), isPublic: shared,
        squares: layOut(size, ownClean, suggested),
      });
      sync.request();
      router.dismissAll();
      router.push({ pathname: '/grid/[id]', params: { id: ug } });
    } finally {
      setSaving(false);
    }
  };

  const cell = size === 'full' ? 14 : size === 'medium' ? 16 : 20;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={styles.top}>
        <Pressable onPress={() => goBack(router)} style={{ height: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
          <Text variant="bodyBold" style={{ color: colors.muted }}>Cancel</Text>
        </Pressable>
        <Text variant="label">Create grid</Text>
        <View style={{ width: 64 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 22 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 8 }}>
          <Text variant="label">Name</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Learning the piano"
            placeholderTextColor={colors.faint}
            maxLength={60}
            style={[styles.input, { fontFamily: fonts.display, fontSize: 22 }]}
          />
        </View>

        <View style={{ gap: 10 }}>
          <Text variant="label">Color</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {gridColors.map((hex, i) => (
              <Pressable
                key={hex}
                onPress={() => setColor(hex)}
                accessibilityLabel={COLOR_NAMES[i]}
                accessibilityState={{ selected: color === hex }}
                style={[styles.swatch, { backgroundColor: hex }, color === hex && styles.swatchOn]}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <Text variant="label">Revealed squares show</Text>
          <SquareLookPicker kind="reveal" value={revealIcon} onChange={setRevealIcon} color={color} />
          <Text variant="caption">The mark on a square once it's revealed and waiting for you. Tap + to use any emoji.</Text>
        </View>

        <View style={{ gap: 10 }}>
          <Text variant="label">Size</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {SIZE_ORDER.map((s) => {
              const on = s === size;
              return (
                <Pressable key={s} onPress={() => pickSize(s)} style={[styles.size, on && { backgroundColor: colors.ink, borderColor: colors.ink }]} accessibilityState={{ selected: on }}>
                  <Text variant="bodyBold" style={{ fontSize: 14, color: on ? '#fff' : colors.ink }}>{SIZES[s].label}</Text>
                  <Text variant="bodyBold" style={{ fontSize: 11, color: on ? colors.faint : colors.muted }}>{SIZES[s].cols * SIZES[s].rows}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text variant="caption">{SIZE_HINT[size]}</Text>
        </View>

        <View style={{ gap: 10 }}>
          <Text variant="label">Lives in</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {THEMES.map((t) => {
              const on = t === theme;
              return (
                <Pressable key={t} onPress={() => setTheme(t)} style={[styles.chip, on && { backgroundColor: colors.ink, borderColor: colors.ink }]} accessibilityState={{ selected: on }}>
                  <Text variant="bodyBold" style={{ fontSize: 13, color: on ? '#fff' : colors.ink }}>{t}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text variant="label">About it (optional)</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Who it's for, what it's about"
            placeholderTextColor={colors.faint}
            maxLength={280}
            multiline
            style={[styles.input, { height: 76, paddingTop: 14, textAlignVertical: 'top' }]}
          />
        </View>

        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text variant="label">Squares</Text>
            <Text variant="bodyBold" style={{ fontSize: 12, color: colors.faint }}>{filled} of {total}</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, width: SIZES[size].cols * (cell + 4) - 4 }}>
            {board.map((c, i) => (
              <View
                key={i}
                style={{
                  width: cell, height: cell, borderRadius: cell * 0.27,
                  backgroundColor: c === 'own' ? color : c === 'suggested' ? colors.card : colors.tileHidden,
                  borderWidth: c === 'suggested' ? 1.5 : 0, borderColor: color, borderStyle: 'dashed',
                }}
              />
            ))}
          </View>
          <Text variant="caption">
            Your own squares go in the middle, so they're the first ones you'll see. Suggestions fill the gaps and keep similar squares next to each other.
          </Text>

          {own.map((s, i) => (
            <View key={`own:${i}`} style={styles.square}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
              <TextInput
                value={s}
                onChangeText={(t) => setOwn(own.map((x, j) => (j === i ? t : x)))}
                maxLength={120}
                style={styles.squareInput}
                accessibilityLabel={`Square ${i + 1}`}
              />
              <Pressable onPress={() => setOwn(own.filter((_, j) => j !== i))} hitSlop={8} accessibilityLabel="Remove square" style={styles.x}>
                <Cross />
              </Pressable>
            </View>
          ))}

          {ownClean.length < total && (
            <View style={[styles.square, { borderStyle: 'dashed' }]}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={own.length ? 'Another square…' : 'Write a square, like “Play a song for someone”'}
                placeholderTextColor={colors.faint}
                maxLength={120}
                returnKeyType="done"
                blurOnSubmit={false}
                onSubmitEditing={addDraft}
                style={styles.squareInput}
              />
              <Pressable onPress={addDraft} disabled={!draft.trim()} hitSlop={8} accessibilityLabel="Add square" style={styles.x}>
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={draft.trim() ? colors.ink : colors.faint} strokeWidth={2.6} strokeLinecap="round"><Path d="M12 5v14M5 12h14" /></Svg>
              </Pressable>
            </View>
          )}

          {ownClean.length < total && (
            <Button
              label={suggested.length ? 'Suggest a different set' : 'Suggest the rest'}
              kind="secondary"
              onPress={suggest}
              style={{ backgroundColor: '#FFF4D6', borderColor: '#FFF4D6' }}
            />
          )}

          {suggested.length > 0 && (
            <View style={{ gap: 8 }}>
              <Text variant="caption">Tap a suggestion to keep it as your own, or × to swap it for another.</Text>
              {suggested.map((s, i) => (
                <View key={`sug:${s.prompt}`} style={[styles.square, { borderStyle: 'dashed', borderColor: color }]}>
                  <Pressable onPress={() => keep(i)} style={{ flex: 1, gap: 1 }} accessibilityLabel={`Keep ${s.prompt}`}>
                    <Text variant="bodyBold" style={{ fontSize: 14 }}>{s.prompt}</Text>
                    <Text variant="caption">{s.cluster === OWN_CLUSTER ? '' : s.cluster}</Text>
                  </Pressable>
                  <Pressable onPress={() => reject(i)} hitSlop={8} accessibilityLabel={`Swap ${s.prompt}`} style={styles.x}>
                    <Cross />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.share}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyBold">Share to the Atlas</Text>
            <Text variant="caption" style={{ color: colors.muted }}>Others can add your grid. Your moments stay private. You can change this later.</Text>
          </View>
          <Switch value={shared} onValueChange={setShared} trackColor={{ true: colors.accent, false: colors.lineStrong }} thumbColor="#fff" />
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 12, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line }}>
        <Button
          label={saving ? 'Making it…' : missing > 0 ? `${missing} square${missing === 1 ? '' : 's'} to go` : 'Create grid'}
          onPress={create}
          disabled={saving}
          color={missing > 0 ? colors.lineStrong : colors.accent}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function Cross() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.muted} strokeWidth={2.6} strokeLinecap="round"><Path d="M6 6l12 12M18 6L6 18" /></Svg>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 },
  input: { height: 56, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 16, fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink },
  swatch: { width: 44, height: 44, borderRadius: 14 },
  swatchOn: { borderWidth: 3, borderColor: colors.ink },
  size: { flex: 1, height: 64, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.lineStrong, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', gap: 2 },
  chip: { height: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1.5, borderColor: colors.lineStrong, backgroundColor: colors.card, justifyContent: 'center' },
  square: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  squareInput: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink, paddingVertical: 6 },
  x: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  share: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
});
