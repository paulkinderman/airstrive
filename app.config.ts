import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json holds the static config. This adds what depends on the environment:
 * Sign in with Apple, and Google sign-in only once its client ids are set
 * (the plugin needs the iOS URL scheme at build time). See .env.example.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  // com.googleusercontent.apps.<id> is the reversed iOS client id.
  const iosUrlScheme = iosClientId ? iosClientId.split('.').reverse().join('.') : null;
  const plugins: ExpoConfig['plugins'] = [...(config.plugins ?? []), 'expo-apple-authentication'];
  if (iosUrlScheme) plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme }]);

  return {
    ...config,
    name: config.name ?? 'AirStrive',
    slug: config.slug ?? 'airstrive',
    ios: { ...config.ios, usesAppleSignIn: true },
    plugins,
  };
};
