import { useEffect, useState } from 'react';
import { View, ScrollView, Pressable, TextInput, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cancelRequest, requestFriend, respondRequest, searchUsernames, type Person } from '@/friends/api';
import { BackIcon, Initial } from '@/friends/bits';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { colors, fonts, radius } from '@/theme';

export default function AddFriend() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Person[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) { setResults(null); return; }
    let live = true;
    setSearching(true);
    const t = setTimeout(() => {
      searchUsernames(q)
        .then((r) => { if (live) { setResults(r); setError(null); } })
        .catch(() => { if (live) setError("Couldn't search. Check your connection."); })
        .finally(() => { if (live) setSearching(false); });
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [query]);

  const update = (id: string, relation: Person['relation']) =>
    setResults((rs) => rs?.map((p) => (p.id === id ? { ...p, relation } : p)) ?? null);

  const act = async (p: Person) => {
    setBusy(p.id);
    try {
      if (p.relation === 'none') update(p.id, await requestFriend(p.id));
      else if (p.relation === 'incoming') { await respondRequest(p.id, true); update(p.id, 'friends'); }
      else if (p.relation === 'requested') { await cancelRequest(p.id); update(p.id, 'none'); }
    } catch (e) {
      setError(e instanceof Error && e.message.includes('too many') ? 'You have 20 requests waiting. Cancel some before asking anyone else.' : "Couldn't send that. Try again.");
    }
    setBusy(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => goBack(router, '/profile')} style={styles.iconButton} accessibilityLabel="Back"><BackIcon /></Pressable>
        <Text variant="label">Add a friend</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Their username"
          placeholderTextColor={colors.faint}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          style={styles.search}
          accessibilityLabel="Search by username"
        />
        {query.trim().length > 0 && query.trim().length < 3 && (
          <Text variant="caption" style={{ color: colors.muted }}>Type at least three letters.</Text>
        )}
        {searching && <ActivityIndicator color={colors.muted} />}
        {error && <Text variant="caption" style={{ color: colors.danger }}>{error}</Text>}
        {results && results.length === 0 && !searching && (
          <Text variant="body" style={{ color: colors.muted }}>Nobody by that name. Check the spelling, or ask them for their QR code.</Text>
        )}
        {results && results.length > 0 && (
          <View style={styles.list}>
            {results.map((p) => (
              <Pressable key={p.id} onPress={() => router.push({ pathname: '/people/[userId]', params: { userId: p.id } })} style={styles.row}>
                <Initial name={p.username} />
                <Text variant="bodyBold" style={{ flex: 1 }}>{p.username}</Text>
                {p.relation === 'friends' ? (
                  <Text variant="caption" style={{ color: colors.muted, fontFamily: fonts.bodyBold }}>Friends</Text>
                ) : (
                  <Button
                    label={p.relation === 'none' ? 'Add' : p.relation === 'incoming' ? 'Accept' : 'Requested'}
                    kind={p.relation === 'requested' ? 'secondary' : 'primary'}
                    onPress={() => act(p)}
                    disabled={busy === p.id}
                    style={{ height: 40, paddingHorizontal: 14 }}
                  />
                )}
              </Pressable>
            ))}
          </View>
        )}

        <View style={{ gap: 10, paddingTop: 12 }}>
          <Text variant="label">In person</Text>
          {Platform.OS !== 'web' && <Button label="Scan their QR code" kind="secondary" onPress={() => router.push('/friends/scan')} />}
          <Button label="Show my QR code or share my link" kind="secondary" onPress={() => router.replace('/friends/code')} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingBottom: 6 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  search: { height: 52, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.lineStrong, backgroundColor: colors.card, paddingHorizontal: 16, fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink },
  list: { borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line, marginTop: -1 },
});
