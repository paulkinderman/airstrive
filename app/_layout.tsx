import { useEffect } from 'react';
import { View, ActivityIndicator, LogBox } from 'react-native';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts, Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import { Nunito_600SemiBold, Nunito_700Bold } from '@expo-google-fonts/nunito';
import { Caveat_500Medium } from '@expo-google-fonts/caveat';
import { migrate } from '@/db/schema';
import { loadPhotos } from '@/lib/files';
import '@/lib/webSetup';
import { AuthProvider, useAuth, type AuthStatus } from '@/auth/AuthProvider';
import { SyncProvider } from '@/sync/SyncProvider';
import { Text } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { MiniGrid } from '@/ui/MiniGrid';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

// The UI tests run a dev build; keep the warning banner from covering the bottom buttons.
if (process.env.EXPO_PUBLIC_E2E === '1') LogBox.ignoreAllLogs();

export default function RootLayout() {
  const [loaded] = useFonts({
    Fredoka_600SemiBold,
    Fredoka_700Bold,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Caveat_500Medium,
  });

  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SQLiteProvider databaseName="airstrive.db" onInit={async (db) => { await loadPhotos(); await migrate(db); }}>
        <StatusBar style="dark" />
        <AuthProvider>
          <Routes />
        </AuthProvider>
      </SQLiteProvider>
    </GestureHandlerRootView>
  );
}

function Routes() {
  const { status, userId } = useAuth();

  useEffect(() => {
    if (status !== 'loading') SplashScreen.hideAsync().catch(() => {});
  }, [status]);

  if (status === 'loading') return null;
  if (status === 'settingUp' || status === 'setupFailed') return <SettingUp failed={status === 'setupFailed'} />;

  return (
    <SyncProvider userId={status === 'ready' ? userId : null}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
        <Stack.Protected guard={status === 'signedOut'} redirectTo={landing(status)}>
          <Stack.Screen name="welcome" />
        </Stack.Protected>
        <Stack.Protected guard={status === 'needsUsername'} redirectTo={landing(status)}>
          <Stack.Screen name="username" />
        </Stack.Protected>
        <Stack.Protected guard={status === 'onboarding'} redirectTo={landing(status)}>
          <Stack.Screen name="onboarding/index" />
          <Stack.Screen name="onboarding/picks" />
        </Stack.Protected>
        <Stack.Protected guard={status === 'ready'} redirectTo={landing(status)}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="grid/[id]" />
          <Stack.Screen name="moment/[squareId]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="lane/[momentId]" />
          <Stack.Screen name="lane/chapter/[userGridId]" options={{ contentStyle: { backgroundColor: colors.night } }} />
          <Stack.Screen name="settings" />
          <Stack.Screen name="atlas/[gridId]" />
          <Stack.Screen name="make" options={{ presentation: 'modal' }} />
          <Stack.Screen name="report/[gridId]" options={{ presentation: 'modal' }} />
        </Stack.Protected>
      </Stack>
    </SyncProvider>
  );
}

/** Where each sign-in state belongs. */
function landing(status: AuthStatus) {
  if (status === 'ready') return '/';
  if (status === 'onboarding') return '/onboarding';
  if (status === 'needsUsername') return '/username';
  return '/welcome';
}

/** Shown while a first sign-in pulls the account's grids and fills the shelf. */
function SettingUp({ failed }: { failed: boolean }) {
  const { retrySetup, signOut } = useAuth();
  return (
    <View style={{ flex: 1, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
      <MiniGrid states={['hidden', 'revealed', 'hidden', 'revealed', 'done', 'revealed', 'hidden', 'revealed', 'hidden']} cols={3} color={colors.accent} cell={18} gap={5} />
      {failed ? (
        <>
          <Text variant="title" style={{ textAlign: 'center' }}>Couldn't reach AirStrive</Text>
          <Text variant="body" style={{ color: colors.muted, textAlign: 'center' }}>
            The first sign-in on a phone needs a connection to bring your grids over. Check your signal and try again.
          </Text>
          <Button label="Try again" onPress={retrySetup} style={{ alignSelf: 'stretch' }} />
          <Button label="Sign out" kind="quiet" onPress={signOut} />
        </>
      ) : (
        <>
          <Text variant="title" style={{ textAlign: 'center' }}>Setting up your shelf</Text>
          <ActivityIndicator color={colors.muted} />
        </>
      )}
    </View>
  );
}
