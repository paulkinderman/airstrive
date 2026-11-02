import { useState } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { readClipboard } from '@/lib/clipboard';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { colors, fonts, radius } from '@/theme';
import { inviteHeadline, useInvitePreview } from './InviteGate';
import { parseInvite, type Invite } from './links';
import { clearPendingInvite, peekPendingInvite, savePendingInvite } from './pendingInvite';

/** Who invited you, on the sign-in screen, when you came from someone's link. */
export function InviteBanner() {
  const [invite] = useState(peekPendingInvite);
  const preview = useInvitePreview(invite);
  if (!preview || preview === 'error') return null;
  return (
    <View style={styles.card}>
      <Text variant="bodyBold">{inviteHeadline(preview)}</Text>
      <Text variant="caption" style={{ color: colors.muted }}>Sign in or make an account, and it opens right after.</Text>
    </View>
  );
}

/**
 * At the top of onboarding: the invite that brought you here, with a way to go straight to
 * it. Someone who installed the app from the App Store arrives without the link (it
 * doesn't survive the install), so they can paste it here; the website copies it for them
 * before sending them to the store.
 */
export function OnboardingInvite({ onGo }: { onGo: (invite: Invite) => void }) {
  const [invite, setInvite] = useState(peekPendingInvite);
  const preview = useInvitePreview(invite);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [wrong, setWrong] = useState(false);

  const use = (value: string) => {
    const i = parseInvite(value);
    if (!i) { setWrong(true); return; }
    setWrong(false);
    savePendingInvite(i);
    setInvite(i);
  };

  const paste = async () => {
    const value = await readClipboard();
    if (value) { setText(value); use(value); }
    else setWrong(true);
  };

  const forget = () => {
    clearPendingInvite();
    setInvite(null);
    setText('');
    setOpen(true);
  };

  if (invite && preview && preview !== 'error') {
    return (
      <View style={styles.card}>
        <Text variant="bodyBold">{inviteHeadline(preview)}</Text>
        <Text variant="caption" style={{ color: colors.muted }}>
          {preview.kind === 'a' ? 'Start with this grid, and pick more from the Atlas any time.' : 'Skip ahead to it, and find grids in the Atlas any time.'}
        </Text>
        <Button label={preview.kind === 'a' ? 'Start with this grid' : 'Go straight there'} onPress={() => onGo(invite)} />
        <Button label="Not now" kind="quiet" onPress={forget} />
      </View>
    );
  }

  if (invite && preview === undefined) return null;

  if (!open) {
    return (
      <Button
        label={invite && preview === null ? "That invite link doesn't work any more. Try another?" : 'Got an invite link from a friend?'}
        kind="quiet"
        onPress={() => { if (invite) forget(); else setOpen(true); }}
        style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
      />
    );
  }

  return (
    <View style={styles.card}>
      <Text variant="bodyBold">Paste the link your friend sent</Text>
      <TextInput
        value={text}
        onChangeText={(t) => { setText(t); setWrong(false); }}
        onSubmitEditing={() => use(text)}
        placeholder="airstrive.vercel.app/…"
        placeholderTextColor={colors.faint}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      {wrong && <Text variant="caption" style={{ color: colors.danger }}>That isn't an AirStrive invite link.</Text>}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button label="Paste" kind="secondary" onPress={paste} style={{ flex: 1 }} />
        <Button label="Use it" onPress={() => use(text)} disabled={!text.trim()} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, padding: 14, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  input: {
    minHeight: 46, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.lineStrong,
    backgroundColor: colors.paper, color: colors.ink, fontFamily: fonts.body, fontSize: 15,
  },
});
