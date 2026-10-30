import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json holds the static config. This adds what depends on the environment:
 * Sign in with Apple, and Google sign-in only once its client ids are set
 * (the plugin needs the iOS URL scheme at build time). See .env.example.
 *
 * APP_VARIANT=preview (the `preview` profile in eas.json) makes "AirStrive Preview": its own
 * bundle id, App Group and URL scheme, so it installs beside the TestFlight app and its local
 * data, which syncs to the dev Supabase project, never mixes with the real app's.
 */
const PREVIEW = process.env.APP_VARIANT === 'preview';
const BUNDLE_ID = PREVIEW ? 'app.airstrive.mobile.preview' : 'app.airstrive.mobile';

export default ({ config }: ConfigContext): ExpoConfig => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  // com.googleusercontent.apps.<id> is the reversed iOS client id.
  const iosUrlScheme = iosClientId ? iosClientId.split('.').reverse().join('.') : null;
  const plugins: ExpoConfig['plugins'] = [...(config.plugins ?? []), 'expo-apple-authentication'];
  if (iosUrlScheme) plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme }]);

  return {
    ...config,
    name: PREVIEW ? 'AirStrive Preview' : (config.name ?? 'AirStrive'),
    slug: config.slug ?? 'airstrive',
    ...(PREVIEW ? { scheme: 'airstrive-preview' } : {}),
    ios: {
      ...config.ios,
      bundleIdentifier: BUNDLE_ID,
      usesAppleSignIn: true,
      // The widget target copies these, and src/widgets/publish.ios.ts reads the group from here.
      entitlements: { ...config.ios?.entitlements, 'com.apple.security.application-groups': [`group.${BUNDLE_ID}`] },
    },
    android: { ...config.android, package: PREVIEW ? 'app.airstrive.mobile.preview' : config.android?.package },
    plugins,
    // The website serves the web build under /app (see scripts/build-site.sh).
    experiments: { ...config.experiments, ...(process.env.WEB_BASE_URL ? { baseUrl: process.env.WEB_BASE_URL } : {}) },
  };
};
