/**
 * The home screen widgets (Next up, Lately, Your grids, Scrapbook). They are SwiftUI, built by
 * @bacons/apple-targets on `expo prebuild`, and read what the app writes to the shared App Group
 * folder (src/widgets). The fonts in assets/ are the app's own, under the SIL Open Font License.
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => ({
  type: 'widget',
  name: 'AirStriveWidget',
  displayName: 'AirStrive',
  deploymentTarget: '17.0',
  bundleIdentifier: '.widget',
  colors: {
    $accent: '#F5B61C',
    $widgetBackground: '#FFFFFF',
  },
  frameworks: ['SwiftUI', 'WidgetKit'],
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
