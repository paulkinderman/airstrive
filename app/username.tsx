import { useState } from 'react';
import { View, TextInput, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthProvider';
import { checkUsername, usernameMessage } from '@/lib/username';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { colors, fonts, radius } from '@/theme';

export default function UsernameScreen() {
  const insets = useSafeAreaInsets();
  const { claimUsername, suggestedName, signOut } = useAuth();
  const [name, setName] = useState(suggestedName ?? '');
  const [serverProblem, setServerProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const problem = name.length ? checkUsername(name) : null;
  const message = serverProblem ?? (problem ? usernameMessage[problem] : null);

  const save = async () => {
    if (saving || checkUsername(name)) return;
    setSaving(true);
    const r = await claimUsername(name);
    setSaving(false);
    if (r === 'taken') setServerProblem(usernameMessage.taken);
    else if (r === 'error') setServerProblem("Couldn't save that just now. Check your connection and try again.");
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={{ flex: 1, paddingTop: insets.top + 56, paddingHorizontal: 24, paddingBottom: insets.bottom + 24, gap: 14 }}>
        <Text variant="label">One last thing</Text>
        <Text variant="display">What should we call you?</Text>
        <Text variant="body" style={{ color: colors.muted }}>
          This is the name on any grid you share later. You can use letters, numbers, spaces and emoji, and change it whenever you like.
        </Text>
        <TextInput
          value={name}
          onChangeText={(t) => { setName(t); setServerProblem(null); }}
          placeholder="paulk"
          placeholderTextColor={colors.faint}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          maxLength={80}
          returnKeyType="done"
          onSubmitEditing={save}
          style={[styles.input, message ? { borderColor: colors.danger } : null]}
        />
        <Text variant="caption" style={{ color: message ? colors.danger : colors.faint, minHeight: 17 }}>{message ?? ' '}</Text>
        <View style={{ flex: 1 }} />
        <Button label={saving ? 'Saving…' : "That's me"} onPress={save} disabled={saving || !name.length || !!problem} />
        <Button label="Use a different account" kind="quiet" onPress={signOut} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 56, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.lineStrong, backgroundColor: colors.card,
    paddingHorizontal: 16, fontFamily: fonts.bodyBold, fontSize: 18, color: colors.ink,
  },
});
