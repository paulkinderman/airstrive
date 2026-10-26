import { View, TextInput, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { colors, fonts } from '@/theme';

/** A moment's place, weather or who-with, as a small editable pill. */
export function DetailChip({ icon, value, onChange, placeholder }: { icon: 'pin' | 'sun' | 'people'; value: string; onChange: (v: string) => void; placeholder: string }) {
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
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 12, borderRadius: 19, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.lineStrong },
  chipInput: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.ink, minWidth: 70, padding: 0 },
});
