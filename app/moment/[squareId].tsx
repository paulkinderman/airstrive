import { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, TextInput, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Svg, { Path, Circle } from 'react-native-svg';
import { getMomentForSquare, getSquarePrompt, saveMoment, deleteMoment } from '@/db/repo';
import { pickFromLibrary, takePhoto, type StoredPhoto } from '@/lib/photos';
import { removeFiles } from '@/lib/files';
import { useSync } from '@/sync/SyncProvider';
import { todayLocal, shortDate } from '@/lib/ids';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { AudiencePicker } from '@/friends/AudiencePicker';
import { narrower, type Audience } from '@/friends/audience';
import { colors, fonts, radius } from '@/theme';

const MAX_PHOTOS = 6;

/** A photo on the sheet: one already saved with the moment (has an id) or one just added. */
type SheetPhoto = StoredPhoto & { id?: string };

export default function MomentSheet() {
  const { squareId } = useLocalSearchParams<{ squareId: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [meta, setMeta] = useState<{ prompt: string; idx: number; title: string; color: string; audience: Audience } | null>(null);
  const [momentId, setMomentId] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [happenedOn, setHappenedOn] = useState(todayLocal());
  const [place, setPlace] = useState('');
  const [weather, setWeather] = useState('');
  const [withPeople, setWithPeople] = useState('');
  const [photos, setPhotos] = useState<SheetPhoto[]>([]);
  const [cover, setCover] = useState(0);
  // null until loaded: a new moment starts with its grid's audience.
  const [audience, setAudience] = useState<Audience | null>(null);
  const [saving, setSaving] = useState(false);
  const sync = useSync();
  // Files added on this sheet that aren't saved yet; removed if the sheet closes without saving.
  const fresh = useRef(new Set<string>());
  const saved = useRef(false);

  useEffect(() => () => {
    if (!saved.current) removeFiles([...fresh.current]);
  }, []);

  const addFresh = (ps: StoredPhoto[]) => {
    for (const p of ps) fresh.current.add(p.path);
    setPhotos((x) => [...x, ...ps]);
  };

  useEffect(() => {
    (async () => {
      const m = await getSquarePrompt(db, squareId);
      if (m) setMeta({ prompt: m.prompt, idx: m.idx, title: m.title, color: m.color, audience: m.audience });
      const existing = await getMomentForSquare(db, squareId);
      setAudience(existing ? existing.audience : m?.audience ?? 'private');
      if (existing) {
        setMomentId(existing.id);
        setBody(existing.body);
        setHappenedOn(existing.happenedOn);
        setPlace(existing.place);
        setWeather(existing.weather);
        setWithPeople(existing.withPeople);
        setPhotos(existing.photos.map((p) => ({ id: p.id, path: p.path, uri: p.uri, width: p.width, height: p.height, bytes: 0 })));
        const c = existing.photos.findIndex((p) => p.isCover);
        setCover(c < 0 ? 0 : c);
      }
    })();
  }, [db, squareId]);

  const addPhotos = async () => {
    const room = MAX_PHOTOS - photos.length;
    if (room < 1) return;
    Alert.alert('Add a photo', undefined, [
      { text: 'Take a photo', onPress: async () => { const p = await takePhoto(); if (p) addFresh([p]); } },
      { text: 'Choose from library', onPress: async () => { const ps = await pickFromLibrary(room); if (ps.length) addFresh(ps); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const removePhoto = (i: number) => {
    const p = photos[i];
    if (p && !p.id && fresh.current.delete(p.path)) removeFiles([p.path]);
    setPhotos((x) => x.filter((_, j) => j !== i));
    setCover((c) => (c === i ? 0 : c > i ? c - 1 : c));
  };

  const save = async () => {
    if (!meta || saving) return;
    setSaving(true);
    const r = await saveMoment(db, squareId, {
      title: meta.prompt, body: body.trim(), happenedOn, place: place.trim(), weather: weather.trim(),
      withPeople: withPeople.trim(), photos, coverIndex: Math.min(cover, Math.max(0, photos.length - 1)),
      audience: narrower(audience ?? meta.audience, meta.audience),
    });
    saved.current = true;
    removeFiles(r.removedFiles);
    sync.request();
    if (r.completedGrid) router.replace({ pathname: '/lane/chapter/[userGridId]', params: { userGridId: r.completedGrid } });
    else router.back();
  };

  const remove = () => {
    if (!momentId) return;
    Alert.alert('Remove this moment?', 'The square goes back to revealed. Squares it revealed stay revealed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const r = await deleteMoment(db, momentId);
          removeFiles([...r.removedFiles, ...fresh.current]);
          saved.current = true;
          sync.request();
          router.back();
        },
      },
    ]);
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
        <Text variant="label">{momentId ? 'Edit moment' : 'New moment'}</Text>
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

        <View style={{ gap: 10 }}>
          <Text variant="label">Photos</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {photos.map((p, i) => (
              <Pressable key={p.path} onLongPress={() => setCover(i)} style={styles.photo}>
                <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                {i === cover && <View style={styles.coverBadge}><Text variant="caption" style={{ color: '#fff', fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1 }}>COVER</Text></View>}
                <Pressable onPress={() => removePhoto(i)} style={styles.removeBadge} accessibilityLabel="Remove photo">
                  <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round"><Path d="M6 6l12 12M18 6L6 18" /></Svg>
                </Pressable>
              </Pressable>
            ))}
            {photos.length < MAX_PHOTOS && (
              <Pressable onPress={addPhotos} style={[styles.photo, styles.addPhoto]} accessibilityLabel="Add photo">
                <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.muted} strokeWidth={2.4} strokeLinecap="round"><Path d="M12 5v14M5 12h14" /></Svg>
                <Text variant="caption" style={{ color: colors.muted, fontFamily: fonts.bodyBold }}>Add</Text>
              </Pressable>
            )}
          </View>
          <Text variant="caption">The cover photo becomes this square on your grid. Press and hold a photo to make it the cover.</Text>
        </View>

        <View style={{ gap: 10 }}>
          <Text variant="label">What happened</Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            multiline
            placeholder="A sentence or a whole page. Future you will read this."
            placeholderTextColor={colors.faint}
            style={styles.journal}
            textAlignVertical="top"
          />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip icon="pin" value={place} onChange={setPlace} placeholder="Where" />
          <Chip icon="sun" value={weather} onChange={setWeather} placeholder="Weather" />
          <Chip icon="people" value={withPeople} onChange={setWithPeople} placeholder="With someone" />
        </View>

        {audience && (
          <View style={{ gap: 8 }}>
            <Text variant="label">Who can see this</Text>
            <AudiencePicker value={narrower(audience, meta.audience)} onChange={setAudience} max={meta.audience} color={meta.color} />
            <Text variant="caption">
              {meta.audience === 'private'
                ? 'This grid is private. Choose who can see it from the grid\'s menu.'
                : 'A moment can be shared as widely as its grid, or kept narrower. Place, weather and who you were with stay private.'}
            </Text>
          </View>
        )}

        {momentId && (
          <Pressable onPress={remove} style={{ paddingVertical: 10 }}>
            <Text variant="bodyBold" style={{ fontSize: 14, color: colors.danger }}>Remove this moment and uncheck the square</Text>
          </Pressable>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button label={momentId ? 'Save changes' : 'Save to grid'} color={meta.color} onPress={save} disabled={saving} />
      </View>
    </KeyboardAvoidingView>
  );
}

function Chip({ icon, value, onChange, placeholder }: { icon: 'pin' | 'sun' | 'people'; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <View style={styles.chip}>
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        {icon === 'pin' && <><Path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z" /><Circle cx={12} cy={10} r={2.5} /></>}
        {icon === 'sun' && <><Circle cx={12} cy={12} r={4} /><Path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" /></>}
        {icon === 'people' && <><Circle cx={9} cy={8} r={3.5} /><Path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4.5-6.2" /></>}
      </Svg>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.muted} style={styles.chipInput} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 4 },
  headerButton: { height: 44, paddingHorizontal: 8, justifyContent: 'center' },
  promptCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  dateRow: { flexDirection: 'row', alignItems: 'center', height: 48, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  dateButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  photo: { width: 100, height: 100, borderRadius: 16, overflow: 'visible', backgroundColor: colors.line },
  addPhoto: { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.lineStrong, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', gap: 4 },
  coverBadge: { position: 'absolute', left: 8, bottom: 8, backgroundColor: 'rgba(31,41,55,0.55)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  removeBadge: { position: 'absolute', top: -6, right: -6, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.ink, borderWidth: 2, borderColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  journal: { minHeight: 150, padding: 16, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.ink },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 12, borderRadius: 19, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.lineStrong },
  chipInput: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.ink, minWidth: 70, padding: 0 },
  footer: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line },
});
