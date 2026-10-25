import { Text as RNText, TextProps, StyleSheet } from 'react-native';
import { colors, fonts } from '@/theme';

type Variant = 'display' | 'title' | 'body' | 'bodyBold' | 'label' | 'hand' | 'caption';

const variants = StyleSheet.create({
  display: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, color: colors.ink },
  title: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, color: colors.ink },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.ink },
  bodyBold: { fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 21, color: colors.ink },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  hand: { fontFamily: fonts.hand, fontSize: 25, lineHeight: 34, color: '#3A3F49' },
  caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.faint },
});

export function Text({ variant = 'body', style, ...rest }: TextProps & { variant?: Variant }) {
  return <RNText {...rest} style={[variants[variant], style]} />;
}
