import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import qrcode from 'qrcode-generator';
import { colors } from '@/theme';

/** A QR code drawn as one SVG path, with the four-module quiet zone scanners expect. */
export function QrCode({ value, size }: { value: string; size: number }) {
  const { d, n } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let path = '';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) path += `M${c + 4} ${r + 4}h1v1h-1z`;
      }
    }
    return { d: path, n: count + 8 };
  }, [value]);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} accessibilityLabel="Your friend QR code">
      <Rect x={0} y={0} width={n} height={n} fill="#fff" />
      <Path d={d} fill={colors.ink} />
    </Svg>
  );
}
