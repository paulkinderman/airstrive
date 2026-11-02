import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { colors } from '@/theme';
import { previewInvite, type InvitePreview } from './invites';
import { savePendingInvite } from './pendingInvite';
import type { Invite } from './links';

/**
 * Where every share link lands. Signed in with a shelf, it shows the link's screen;
 * otherwise the link waits (pendingInvite.ts) and the person goes to sign in, sign up or
 * finish onboarding, and comes back to it after.
 */
export function InviteGate({ invite, children }: { invite: Invite | null; children: ReactNode }) {
  const { status } = useAuth();
  if (status !== 'ready') {
    if (status === 'loading' || status === 'settingUp') return <View style={{ flex: 1, backgroundColor: colors.paper }} />;
    if (invite) savePendingInvite(invite);
    return <Redirect href="/" />;
  }
  return <>{children}</>;
}

/** A link's preview: undefined while loading, null when the link doesn't work, 'error' offline. */
export function useInvitePreview(invite: Invite | null, version = 0) {
  const [preview, setPreview] = useState<InvitePreview | null | undefined | 'error'>(undefined);
  const key = invite ? `${invite.kind}/${invite.code}/${invite.kind === 'a' ? invite.from ?? '' : ''}` : '';
  useEffect(() => {
    let live = true;
    if (!invite) { setPreview(null); return; }
    previewInvite(invite).then((p) => { if (live) setPreview(p); }).catch(() => { if (live) setPreview('error'); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);
  return preview;
}

/** One line for who invited you to what, for sign-up and onboarding. */
export function inviteHeadline(p: InvitePreview): string {
  switch (p.kind) {
    case 'f': return `${p.username} wants to be friends on AirStrive`;
    case 'g': return `${p.from} invited you to do ${p.grid.title} together`;
    case 'a': return p.from ? `${p.from} sent you ${p.grid.title}` : `Someone sent you ${p.grid.title}`;
    case 'p': return `${p.owner} shared ${p.grid.title} with you`;
  }
}
