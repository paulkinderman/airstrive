import { Alert } from 'react-native';
import { peekLinkCode, shareLink, stopPeekLink } from './invites';
import { peekLink } from './links';
import type { Audience } from './audience';

/**
 * "Send a link to see it" and "Turn off links to see it" in a grid's menu. Only a Friends
 * or Public grid can have a link; making the grid Private turns its link off too.
 */
export function peekMenuItems(
  board: { title: string; audience: Audience },
  userGridId: string,
  syncNow: () => Promise<void>,
  chooseAudience: () => void,
) {
  const send = async () => {
    if (board.audience === 'private') {
      Alert.alert(
        'This grid is Private',
        'Only a grid shared with Friends or Public can have a link. The link shows its squares and the titles of moments your friends can see, never words or photos.',
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Choose who can see it', onPress: chooseAudience }],
      );
      return;
    }
    try {
      const code = await peekLinkCode(userGridId, syncNow);
      await shareLink(`See my ${board.title} grid on AirStrive:`, peekLink(code));
    } catch {
      Alert.alert("Couldn't make the link", 'Making a link needs a connection. Try again when you are back online.');
    }
  };

  const stop = () => {
    Alert.alert('Turn off the link?', "Anyone you've sent it to can't open it any more. Sending it again makes a new link.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Turn it off', style: 'destructive',
        onPress: () => stopPeekLink(userGridId).catch(() => Alert.alert("Couldn't reach AirStrive", 'Check your connection and try again.')),
      },
    ]);
  };

  return [
    { label: 'Send a link to see it', onPress: () => void send() },
    ...(board.audience !== 'private' ? [{ label: 'Turn off links to see it', onPress: stop }] : []),
  ];
}
