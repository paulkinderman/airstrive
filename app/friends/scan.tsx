import { useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { codeFrom } from '@/friends/links';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { colors, radius } from '@/theme';

export default function Scan() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [wrong, setWrong] = useState(false);
  const done = useRef(false);

  if (!permission) return <View style={{ flex: 1, backgroundColor: colors.night }} />;

  if (!permission.granted) {
    return (
      <View style={[styles.page, { paddingBottom: insets.bottom + 20 }]}>
        <Text variant="display">Scan a friend's code</Text>
        <Text variant="body" style={{ color: colors.muted }}>AirStrive needs the camera to read the QR code on their Profile.</Text>
        <View style={{ flex: 1 }} />
        <Button label="Allow the camera" onPress={requestPermission} />
        <Button label="Cancel" kind="quiet" onPress={() => goBack(router, '/profile')} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.night }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (done.current) return;
          const code = codeFrom(data);
          if (!code) { setWrong(true); return; }
          done.current = true;
          router.replace({ pathname: '/f/[code]', params: { code } });
        }}
      />
      <View style={[styles.overlay, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]}>
        <Text variant="title" style={{ color: '#fff', textAlign: 'center' }}>Point at their AirStrive QR code</Text>
        <View style={styles.frame} />
        {wrong && <Text variant="body" style={{ color: '#fff', textAlign: 'center' }}>That isn't an AirStrive friend code.</Text>}
        <Button label="Cancel" kind="secondary" onPress={() => goBack(router, '/profile')} style={{ alignSelf: 'stretch' }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: 24, paddingTop: 48, gap: 12 },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 },
  frame: { width: 240, height: 240, borderRadius: radius.xl, borderWidth: 3, borderColor: '#fff' },
});
