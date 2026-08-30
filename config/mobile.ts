import type { MobileConfig } from '@stacksjs/types'
import { env } from '@stacksjs/env'

/**
 * The courier app.
 *
 * Smakelo's native build exists for one screen: the courier console. Everything
 * else about this site is fine in a browser, but a courier is outdoors, on a
 * phone that is also their navigation, and the one thing a web page cannot do
 * is keep a position stream alive while the screen is off.
 *
 * So the app is a shell around `/courier` rather than a second implementation
 * of it. The web version is the product; the native wrapper adds the four
 * capabilities a browser will not give it:
 *
 * - `geolocation` for the foreground stream that drives the customer's map
 * - `backgroundLocation` so a delivery keeps reporting while the phone is
 *   pocketed, which is most of a delivery
 * - `keepAwake` so the screen stays up while somebody rides to an address
 * - `pushNotifications` for an offer that has to arrive before it expires
 *
 * `url` points at the deployed courier screen, with `fallbackWebAssets` for the
 * case that matters most: a courier in an underground car park should get an
 * app that opens and says it has no signal, not a blank web view.
 */
export default {
  ios: {
    appName: 'Smakelo Courier',
    bundleId: 'com.smakelo.courier',
    version: '0.1.0',
    buildNumber: '1',
    deploymentTarget: '16.0',

    url: `${env.APP_URL ?? 'https://smakelo.stacksjs.com'}/courier`,
    fallbackWebAssets: 'public/offline',

    darkMode: true,
    backgroundColor: '#faf9f7',
    orientations: ['portrait'],

    capabilities: {
      geolocation: true,
      backgroundLocation: true,
      keepAwake: true,
      pushNotifications: true,
      // The courier's identity, which on the web is a browser token in
      // localStorage. On a device it belongs in the keychain.
      secureStorage: true,
      haptics: true,
    },
  },

  android: {
    appName: 'Smakelo Courier',
    packageName: 'com.smakelo.courier',

    url: `${env.APP_URL ?? 'https://smakelo.stacksjs.com'}/courier`,
    fallbackWebAssets: 'public/offline',

    capabilities: {
      geolocation: true,
      backgroundLocation: true,
      keepAwake: true,
      pushNotifications: true,
      secureStorage: true,
      haptics: true,
    },
  },
} satisfies MobileConfig
