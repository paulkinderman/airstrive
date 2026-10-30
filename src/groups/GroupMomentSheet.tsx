import { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, TextInput, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Svg, { Path, Rect } from 'react-native-svg';
import { getSquarePrompt } from '@/db/repo';
import { pickFromLibrary, takePhoto, type StoredPhoto } from '@/lib/photos';
import { removeFiles } from '@/lib/files';
import { useSync } from '@/sync/SyncProvider';
import { useAuth } from '@/auth/AuthProvider';
import { todayLocal, shortDate } from '@/lib/ids';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { colors, fonts, radius } from '@/theme';
import { getGroupMoment, removeMyPart, saveGroupMoment, type EntryAudience, type GroupEntry, type GroupPhoto } from './repo';
import { DetailChip as Chip } from '@/ui/DetailChip';
import { SquareLookPicker } from '@/ui/SquareLook';

const MAX_PHOTOS = 6;

/** One of this person's photos on the sheet: saved already (has an id) or just added. */
type MyPhoto = StoredPhoto & { id?: string; audience: EntryAudience };

/**
 * A square in a group grid. Everyone shares its title, date and details; below them each
 * person has their own words and photos, which they share with the group or keep Private.
 */
export function GroupMomentSheet({ squareId }: { squareId: string }) {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const sync = useSync();
  const { userId } = useAuth();

  const [meta, setMeta] = useState<{ prompt: string; idx: number; title: string; color: string } | null>(null);
  const [momentId, setMomentId] = useState<string | null>(null);
  const [hasMine, setHasMine] = useState(false);
  const [happenedOn, setHappenedOn] = useState(todayLocal());
  const [place, setPlace] = useState('');
  const [weather, setWeather] = useState('');
  const [withPeople, setWithPeople] = useState('');
  const [fill, setFill] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<EntryAudience>('group');
  const [mine, setMine] = useState<MyPhoto[]>([]);
  const [theirs, setTheirs] = useState<{ entries: GroupEntry[]; photos: GroupPhoto[] }>({ entries: [], photos: [] });
  const [saving, setSaving] = useState(false);
  const fresh = useRef(new Set<string>());
  const saved = useRef(false);

  useEffect(() => () => {
    if (!saved.current) removeFiles([...fresh.current]);
  }, []);

  useEffect(() => {
    (async () => {
      const m = await getSquarePrompt(db, squareId);
      if (m) setMeta({ prompt: m.prompt, idx: m.idx, title: m.title, color: m.color });
      const existing = await getGroupMoment(db, squareId, userId);
      if (!existing) return;
      setMomentId(existing.id);
      setHappenedOn(existing.happenedOn);
      setPlace(existing.place);
      setWeather(existing.weather);
      setWithPeople(existing.withPeople);
      setFill(existing.fill);
      const myEntry = existing.entries.find((e) => e.mine);
      if (myEntry) { setBody(myEntry.body); setAudience(myEntry.audience); }
      const myPhotos = existing.photos.filter((p) => p.mine);
      setMine(myPhotos.map((p) => ({ id: p.id, path: p.path, uri: p.uri, width: p.width, height: p.height, bytes: 0, audience: p.audience })));
      setHasMine(!!myEntry || myPhotos.length > 0);
      setTheirs({ entries: existing.entries.filter((e) => !e.mine), photos: existing.photos.filter((p) => !p.mine) });
    })();
  }, [db, squareId, userId]);

  const addFresh = (ps: StoredPhoto[]) => {
    for (const p of ps) fresh.current.add(p.path);
    setMine((x) => [...x, ...ps.map((p) => ({ ...p, audience }))]);
  };

  const addPhotos = () => {
    const room = MAX_PHOTOS - mine.length;
    if (room < 1) return;
    Alert.alert('Add a photo', undefined, [
      { text: 'Take a photo', onPress: async () => { const p = await takePhoto(); if (p) addFresh([p]); } },
      { text: 'Choose from library', onPress: async () => { const ps = await pickFromLibrary(room); if (ps.length) addFresh(ps); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const removePhoto = (i: number) => {
    const p = mine[i];
    if (p && !p.id && fresh.current.delete(p.path)) removeFiles([p.path]);
    setMine((x) => x.filter((_, j) => j !== i));
  };

  const togglePhoto = (i: number) =>
    setMine((x) => x.map((p, j) => (j === i ? { ...p, audience: p.audience === 'group' ? 'private' : 'group' } : p)));

  const save = async () => {
    if (!meta || saving || !userId) return;
    setSaving(true);
    const r = await saveGroupMoment(db, squareId, userId, {
      title: meta.prompt, happenedOn, place: place.trim(), weather: weather.trim(), withPeople: withPeople.trim(), fill,
      body, audience, photos: mine,
    });
    saved.current = true;
    removeFiles(r.removedFiles);
    sync.request();
    if (r.completedGrid) router.replace({ pathname: '/lane/chapter/[userGridId]', params: { userGridId: r.completedGrid } });
    else router.back();
  };

  const remove = () => {
    if (!momentId || !userId) return;
    const others = theirs.entries.length + theirs.photos.length > 0;
    Alert.alert(
      'Remove your part?',
      others ? 'Your words and photos come off this square. What the others added stays, and the square stays done.'
        : 'Nobody else has added anything here, so the square goes back to revealed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const r = await removeMyPart(db, momentId, userId);
            removeFiles([...r.removedFiles, ...fresh.current]);
            saved.current = true;
            sync.request();
            router.back();
          },
        },
      ],
    );
  };

  const shiftDay = (delta: number) => {
    const [y, m, d] = happenedOn.split('-').map(Number);
    const dt = new Date(y, m - 1, d + delta);
    const next = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    if (next <= todayLocal()) setHappenedOn(next);
  };

  if (!meta) return <View style={{ flex: 1, backgroundColor: colors.paper }} />;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'ios' ? 16 : insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.headerButton}><Text variant="bodyBold" style={{ color: colors.muted }}>Cancel</Text></Pressable>
        <Text variant="label">{momentId ? 'Shared moment' : 'New moment'}</Text>
        <Pressable onPress={save} style={styles.headerButton}><Text variant="bodyBold" style={{ color: colors.accentDeep }}>Save</Text></Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={styles.promptCard}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: meta.color, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' }} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="label" style={{ fontSize: 11, letterSpacing: 1 }}>{meta.title} · Square {meta.idx + 1}</Text>
            <Text variant="title" style={{ fontSize: 19 }}>{meta.prompt}</Text>
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text variant="label">When</Text>
          <View style={styles.dateRow}>
            <Pressable onPress={() => shiftDay(-1)} style={styles.dateButton}><Text variant="bodyBold">‹</Text></Pressable>
            <Text variant="bodyBold" style={{ flex: 1, textAlign: 'center' }}>{happenedOn === todayLocal() ? 'Today' : shortDate(happenedOn)}</Text>
            <Pressable onPress={() => shiftDay(1)} style={styles.dateButton} disabled={happenedOn >= todayLocal()}>
              <Text variant="bodyBold" style={{ opacity: happenedOn >= todayLocal() ? 0.3 : 1 }}>›</Text>
            </Pressable>
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip icon="pin" value={place} onChange={setPlace} placeholder="Where" />
          <Chip icon="sun" value={weather} onChange={setWeather} placeholder="Weather" />
          <Chip icon="people" value={withPeople} onChange={setWithPeople} placeholder="With someone" />
        </View>
        <Text variant="caption" style={{ marginTop: -8 }}>Everyone in this grid sees the date and these details, and can change them.</Text>

        <View style={{ gap: 10 }}>
          <Text variant="label">Square fill</Text>
          <SquareLookPicker kind="fill" value={fill} onChange={setFill} color={meta.color} />
          <Text variant="caption">How this square fills in on the grid when it has no photo. It's shared with the group.</Text>
        </View>

        {(theirs.entries.length > 0 || theirs.photos.length > 0) && (
          <View style={{ gap: 10 }}>
            <Text variant="label">From the others</Text>
            {theirs.photos.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {theirs.photos.map((p) => (
                  <View key={p.id} style={{ gap: 4 }}>
                    <View style={styles.photo}><Image source={{ uri: p.uri }} style={[StyleSheet.absoluteFill, { borderRadius: 16 }]} contentFit="cover" /></View>
                    <Text variant="caption" style={{ color: colors.muted }}>{p.name}</Text>
                  </View>
                ))}
              </View>
            )}
            {theirs.entries.map((e) => (
              <View key={e.id} style={styles.theirEntry}>
                <Text variant="label" style={{ fontSize: 11 }}>{e.name}</Text>
                <Text variant="body">{e.body}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ gap: 10 }}>
          <Text variant="label">Your words</Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            multiline
            placeholder="What it was like for you."
            placeholderTextColor={colors.faint}
            style={styles.journal}
            textAlignVertical="top"
          />
          <EntryAudiencePicker value={audience} onChange={setAudience} color={meta.color} />
        </View>

        <View style={{ gap: 10 }}>
          <Text variant="label">Your photos</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {mine.map((p, i) => (
              <View key={p.path} style={styles.photo}>
                <Image source={{ uri: p.uri }} style={[StyleSheet.absoluteFill, { borderRadius: 16 }]} contentFit="cover" />
                <Pressable
                  onPress={() => togglePhoto(i)}
                  style={styles.photoAudience}
                  accessibilityRole="button"
                  accessibilityLabel={p.audience === 'private' ? 'Private photo. Share it with the group' : 'Shared with the group. Make it Private'}
                >
                  {p.audience === 'private' && (
                    <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round">
                      <Rect x={5} y={11} width={14} height={10} rx={2} /><Path d="M8 11V8a4 4 0 0 1 8 0v3" />
                    </Svg>
                  )}
                  <Text variant="caption" style={{ color: '#fff', fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1 }}>
                    {p.audience === 'private' ? 'ONLY YOU' : 'GROUP'}
                  </Text>
                </Pressable>
                <Pressable onPress={() => removePhoto(i)} style={styles.removeBadge} accessibilityLabel="Remove photo">
                  <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round"><Path d="M6 6l12 12M18 6L6 18" /></Svg>
                </Pressable>
              </View>
            ))}
            {mine.length < MAX_PHOTOS && (
              <Pressable onPress={addPhotos} style={[styles.photo, styles.addPhoto]} accessibilityLabel="Add photo">
                <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.muted} strokeWidth={2.4} strokeLinecap="round"><Path d="M12 5v14M5 12h14" /></Svg>
                <Text variant="caption" style={{ color: colors.muted, fontFamily: fonts.bodyBold }}>Add</Text>
              </Pressable>
            )}
          </View>
          <Text variant="caption">Tap the label on a photo to switch it between the group and only you.</Text>
        </View>

        {hasMine && (
          <Pressable onPress={remove} style={{ paddingVertical: 10 }}>
            <Text variant="bodyBold" style={{ fontSize: 14, color: colors.danger }}>Remove your part of this square</Text>
          </Pressable>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button label={momentId ? 'Save' : 'Save to grid'} color={meta.color} onPress={save} disabled={saving} />
      </View>
    </KeyboardAvoidingView>
  );
}

/** Group or Private, for this person's words. */
function EntryAudiencePicker({ value, onChange, color }: { value: EntryAudience; onChange: (a: EntryAudience) => void; color: string }) {
  const options: { a: EntryAudience; label: string; note: string }[] = [
    { a: 'group', label: 'Group', note: 'Everyone in this grid' },
    { a: 'private', label: 'Private', note: 'Just you' },
  ];
  return (
    <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup">
      {options.map((o) => (
        <Pressable
          key={o.a}
          onPress={() => onChange(o.a)}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === o.a }}
          accessibilityLabel={`${o.label}, ${o.note}`}
          style={[styles.option, value === o.a && { borderColor: color, borderWidth: 2 }]}
        >
          <Text variant="bodyBold" style={{ fontSize: 14 }}>{o.label}</Text>
          <Text variant="caption" style={{ color: colors.muted, textAlign: 'center' }}>{o.note}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 4 },
  headerButton: { height: 44, paddingHorizontal: 8, justifyContent: 'center' },
  promptCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  dateRow: { flexDirection: 'row', alignItems: 'center', height: 48, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  dateButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  photo: { width: 100, height: 100, borderRadius: 16, backgroundColor: colors.line },
  addPhoto: { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.lineStrong, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', gap: 4 },
  photoAudience: {
    position: 'absolute', left: 6, bottom: 6, flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 24,
    backgroundColor: 'rgba(31,41,55,0.6)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7,
  },
  removeBadge: { position: 'absolute', top: -6, right: -6, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.ink, borderWidth: 2, borderColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  journal: { minHeight: 130, padding: 16, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.ink },
  theirEntry: { padding: 14, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, gap: 4 },
  option: {
    flex: 1, minHeight: 60, paddingHorizontal: 6, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1.5,
    borderColor: colors.lineStrong, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  footer: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line },
});
