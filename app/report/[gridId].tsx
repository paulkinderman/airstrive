import { useState } from 'react';
import { View, Pressable, TextInput, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { reportGrid, type ReportReason } from '@/atlas/catalog';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { colors, fonts, radius } from '@/theme';

const REASONS: { id: ReportReason; label: string }[] = [
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'hateful', label: 'Hateful' },
  { id: 'spam', label: 'Spam or ads' },
  { id: 'other', label: 'Something else' },
];

export default function Report() {
  const { gridId, title } = useLocalSearchParams<{ gridId: string; title?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [state, setState] = useState<'editing' | 'sending' | 'sent' | 'already' | 'error'>('editing');

  const send = async () => {
    if (!reason) return;
    setState('sending');
    setState(await reportGrid(gridId, reason, note).then((r) => (r === 'ok' ? 'sent' : r)));
  };

  if (state === 'sent' || state === 'already') {
    return (
      <View style={[styles.page, { paddingTop: 48, paddingBottom: insets.bottom + 20 }]}>
        <Text variant="display">Thanks for telling us</Text>
        <Text variant="body" style={{ color: colors.muted }}>
          {state === 'sent' ? 'Someone will look at it soon. If it breaks the rules it comes out of the Atlas.' : "You've already reported this grid. We'll look at it soon."}
        </Text>
        <View style={{ flex: 1 }} />
        <Button label="Done" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={[styles.page, { paddingBottom: insets.bottom + 20 }]}>
        <Text variant="label">Report</Text>
        <Text variant="display" style={{ fontSize: 28, lineHeight: 32 }}>{title ? `What's wrong with “${title}”?` : "What's wrong with this grid?"}</Text>
        <View style={{ gap: 8, paddingTop: 6 }}>
          {REASONS.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => setReason(r.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: reason === r.id }}
              style={[styles.reason, reason === r.id && { borderColor: colors.ink, borderWidth: 2 }]}
            >
              <Text variant="bodyBold">{r.label}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Anything else we should know (optional)"
          placeholderTextColor={colors.faint}
          multiline
          maxLength={500}
          style={styles.note}
        />
        {state === 'error' && <Text variant="caption" style={{ color: colors.danger }}>Couldn't send that. Check your connection and try again.</Text>}
        <View style={{ flex: 1 }} />
        <Button label={state === 'sending' ? 'Sending…' : 'Send report'} onPress={send} disabled={!reason || state === 'sending'} />
        <Button label="Cancel" kind="quiet" onPress={() => router.back()} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: 24, paddingTop: 28, gap: 12 },
  reason: { minHeight: 50, justifyContent: 'center', paddingHorizontal: 16, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.lineStrong, backgroundColor: colors.card },
  note: { minHeight: 90, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.lineStrong, backgroundColor: colors.card, padding: 14, fontFamily: fonts.body, fontSize: 15, color: colors.ink, textAlignVertical: 'top' },
});
