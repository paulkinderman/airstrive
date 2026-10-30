import { Pressable, Text as RNText, TextInput, View } from 'react-native';
import { colors, fonts, gridColors } from '@/theme';

/**
 * How squares look. A grid picks the icon on its revealed squares ('' is the dot in the
 * grid's color), and a moment picks how its done square fills when it has no photo
 * ('' is the grid's color, '#rrggbb' another color, anything else an emoji).
 */
export const REVEAL_ICONS = ['⭐', '❓', '✨', '👀', '🎁', '🔓', '🌱', '🔥', '📍', '💡'];
export const FILL_EMOJIS = ['✅', '⭐', '❤️', '🎉', '🏆', '😊', '🔥', '🌈', '🙌', '💪'];

export const isColorFill = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

/** The last character typed, keeping emoji built from several code points whole. */
export function lastGrapheme(text: string): string {
  const t = text.trim();
  if (!t) return '';
  const Segmenter = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Segmenter) {
    const parts = [...new Segmenter(undefined, { granularity: 'grapheme' }).segment(t)];
    return parts[parts.length - 1]?.segment ?? '';
  }
  // Without Intl.Segmenter, keep what was typed when it's short enough to be one emoji.
  return t.length <= 16 ? t : [...t].slice(-1)[0];
}

/** An emoji sized to sit in a square. */
export function SquareEmoji({ emoji, size }: { emoji: string; size: number }) {
  return (
    <RNText allowFontScaling={false} style={{ fontSize: size, lineHeight: size * 1.2, textAlign: 'center', includeFontPadding: false }}>
      {emoji}
    </RNText>
  );
}

/** The mark on a revealed square: the grid's icon, or the dot. */
export function RevealMark({ icon, color, size }: { icon: string; color: string; size: number }) {
  if (icon) return <SquareEmoji emoji={icon} size={size * 0.46} />;
  return <View style={{ width: size * 0.27, height: size * 0.27, borderRadius: size * 0.14, backgroundColor: color }} />;
}

/** Background color of a done square with no photo, and the emoji on it if any. */
export function fillLook(fill: string, color: string): { bg: string; emoji: string } {
  if (!fill) return { bg: color, emoji: '' };
  if (isColorFill(fill)) return { bg: fill, emoji: '' };
  return { bg: color, emoji: fill };
}

const CELL = 44;

/**
 * A row of choices for a square's look: the default, then (for fills) the grid colors,
 * then emoji, then a square to type any emoji into.
 */
export function SquareLookPicker({
  kind, value, onChange, color,
}: { kind: 'reveal' | 'fill'; value: string; onChange: (v: string) => void; color: string }) {
  const emojis = kind === 'reveal' ? REVEAL_ICONS : FILL_EMOJIS;
  const swatches = kind === 'fill' ? gridColors.filter((c) => c !== color) : [];
  const custom = value && !isColorFill(value) && !emojis.includes(value) ? value : '';

  const cell = (on: boolean, bg: string, dashed = false) => ({
    width: CELL, height: CELL, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const,
    backgroundColor: bg,
    borderWidth: on ? 3 : dashed ? 1.5 : kind === 'reveal' ? 1.5 : 0,
    borderColor: on ? colors.ink : colors.lineStrong,
    borderStyle: dashed && !on ? ('dashed' as const) : ('solid' as const),
  });

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      <Pressable
        onPress={() => onChange('')}
        accessibilityLabel={kind === 'reveal' ? 'Dot' : 'Grid color'}
        accessibilityState={{ selected: value === '' }}
        style={cell(value === '', kind === 'reveal' ? colors.card : color)}
      >
        {kind === 'reveal' && <RevealMark icon="" color={color} size={CELL} />}
      </Pressable>
      {swatches.map((hex) => (
        <Pressable
          key={hex}
          onPress={() => onChange(hex)}
          accessibilityLabel={`Color ${hex}`}
          accessibilityState={{ selected: value === hex }}
          style={cell(value === hex, hex)}
        />
      ))}
      {emojis.map((e) => (
        <Pressable
          key={e}
          onPress={() => onChange(e)}
          accessibilityLabel={e}
          accessibilityState={{ selected: value === e }}
          style={cell(value === e, kind === 'reveal' ? colors.card : color)}
        >
          <SquareEmoji emoji={e} size={20} />
        </Pressable>
      ))}
      <View style={cell(!!custom, custom ? (kind === 'reveal' ? colors.card : color) : colors.card, true)}>
        <TextInput
          value={custom}
          onChangeText={(t) => onChange(lastGrapheme(t))}
          placeholder="+"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Type any emoji"
          allowFontScaling={false}
          style={{ width: CELL, height: CELL, textAlign: 'center', fontSize: custom ? 20 : 22, fontFamily: custom ? undefined : fonts.bodyBold, color: colors.ink, padding: 0 }}
        />
      </View>
    </View>
  );
}
