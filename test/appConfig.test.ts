import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const APP_CONFIG_PATH = '../app.config.js';
const ENV_KEYS = [
  'SAFEROUTE_APP_ENV',
  'SAFEROUTE_API_URL',
  'SAFEROUTE_API_VERSION',
  'SAFEROUTE_ENABLE_DEMO_DRIVE',
  'SAFEROUTE_ENABLE_PREVIEW_MODE',
  'SAFEROUTE_PREVIEW_INITIAL_SCREEN',
  'SAFEROUTE_IOS_BUILD_NUMBER',
  'SAFEROUTE_DEV_API_URL',
  'SAFEROUTE_STAGING_API_URL',
  'SAFEROUTE_PROD_API_URL',
  'GOOGLE_MAPS_ANDROID_API_KEY',
  'GOOGLE_MAPS_IOS_API_KEY'
] as const;

type SafeRouteEnvKey = (typeof ENV_KEYS)[number];

type ExpoConfig = {
  icon: string;
  name: string;
  orientation: string;
  scheme: string;
  slug: string;
  splash: {
    backgroundColor: string;
    image: string;
    resizeMode: string;
  };
  userInterfaceStyle: string;
  extra: {
    safeRouteEnvironment: string;
    safeRouteApiUrl: string;
    safeRouteApiVersion: string;
    safeRouteDemoDriveEnabled: boolean;
    safeRoutePreviewInitialScreen: string;
    safeRoutePreviewModeEnabled: boolean;
  };
  ios: {
    buildNumber: string;
    bundleIdentifier: string;
    supportsTablet: boolean;
    infoPlist?: {
      NSLocationAlwaysAndWhenInUseUsageDescription?: string;
      NSLocationWhenInUseUsageDescription?: string;
      UIBackgroundModes?: string[];
    };
    config?: {
      googleMapsApiKey?: string;
      usesNonExemptEncryption?: boolean;
    };
  };
  android: {
    config?: {
      googleMaps?: {
        apiKey?: string;
      };
    };
  };
  plugins: Array<string | [string, Record<string, unknown>]>;
};

function loadExpoConfig(overrides: Partial<Record<SafeRouteEnvKey, string>> = {}): ExpoConfig {
  const originalEnv = new Map<SafeRouteEnvKey, string | undefined>();

  for (const key of ENV_KEYS) {
    originalEnv.set(key, process.env[key]);
    delete process.env[key];
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }

  const resolvedPath = require.resolve(APP_CONFIG_PATH);
  delete require.cache[resolvedPath];

  try {
    return require(APP_CONFIG_PATH).expo as ExpoConfig;
  } finally {
    delete require.cache[resolvedPath];

    for (const key of ENV_KEYS) {
      const originalValue = originalEnv.get(key);
      if (originalValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValue;
      }
    }
  }
}

describe('Expo production configuration', () => {
  it('defaults to a development config with demo drive available for local testing', () => {
    const expo = loadExpoConfig();

    assert.equal(expo.extra.safeRouteEnvironment, 'development');
    assert.equal(expo.extra.safeRouteApiUrl, 'https://api.lunarchain.net');
    assert.equal(expo.extra.safeRouteDemoDriveEnabled, true);
    assert.equal(expo.extra.safeRoutePreviewInitialScreen, 'guest-map');
    assert.equal(expo.extra.safeRoutePreviewModeEnabled, false);
    assert.equal(expo.name, 'SafeRoute');
    assert.equal(expo.slug, 'saferoute-mobile');
    assert.equal(expo.scheme, 'saferoute');
    assert.equal(expo.orientation, 'portrait');
    assert.equal(expo.userInterfaceStyle, 'light');
    assert.equal(expo.ios.bundleIdentifier, 'com.lunarchain.saferoute');
    assert.equal(expo.ios.supportsTablet, false);
    assert.equal(expo.ios.buildNumber, '1');
    assert.equal(expo.ios.config?.usesNonExemptEncryption, false);
    assert.equal(expo.icon, './assets/icon.png');
    assert.deepEqual(expo.splash, {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#f2f2f7'
    });
  });

  it('keeps iOS release identity and URL scheme stable in production config', () => {
    const expo = loadExpoConfig({
      SAFEROUTE_APP_ENV: 'production',
      SAFEROUTE_PROD_API_URL: 'https://api.lunarchain.net',
      SAFEROUTE_IOS_BUILD_NUMBER: '57',
      GOOGLE_MAPS_IOS_API_KEY: 'ios-key'
    });

    assert.equal(expo.name, 'SafeRoute');
    assert.equal(expo.slug, 'saferoute-mobile');
    assert.equal(expo.scheme, 'saferoute');
    assert.equal(expo.orientation, 'portrait');
    assert.equal(expo.userInterfaceStyle, 'light');
    assert.equal(expo.ios.bundleIdentifier, 'com.lunarchain.saferoute');
    assert.equal(expo.ios.supportsTablet, false);
  });

  it('keeps iOS foreground location permission copy concise and map-first', () => {
    const expo = loadExpoConfig();
    const expectedCopy = 'Shows your position on the map and guides active SafeRoute trips.';
    const locationPlugin = expo.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-location'
    );

    assert.equal(
      expo.ios.infoPlist?.NSLocationWhenInUseUsageDescription,
      expectedCopy
    );
    assert.deepEqual(locationPlugin, [
      'expo-location',
      {
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
        isIosBackgroundLocationEnabled: true,
        locationAlwaysAndWhenInUsePermission:
          'Keeps active SafeRoute guidance and safety monitoring running when the screen is locked.',
        locationWhenInUsePermission: expectedCopy
      }
    ]);
  });

  it('configures explicit background guidance permissions for installed apps', () => {
    const expo = loadExpoConfig();

    assert.equal(
      expo.ios.infoPlist?.NSLocationAlwaysAndWhenInUseUsageDescription,
      'Keeps active SafeRoute guidance and safety monitoring running when the screen is locked.'
    );
    assert.deepEqual(expo.ios.infoPlist?.UIBackgroundModes, ['location']);
  });

  it('requires a supported SafeRoute app environment', () => {
    assert.throws(
      () => loadExpoConfig({ SAFEROUTE_APP_ENV: 'qa' }),
      /Unsupported SAFEROUTE_APP_ENV/
    );
  });

  it('requires an explicit production API URL for production configuration', () => {
    assert.throws(
      () =>
        loadExpoConfig({
          SAFEROUTE_APP_ENV: 'production',
          SAFEROUTE_API_URL: 'https://generic-api.lunarchain.net',
          SAFEROUTE_IOS_BUILD_NUMBER: '42',
          GOOGLE_MAPS_IOS_API_KEY: 'ios-key'
        }),
      /SAFEROUTE_PROD_API_URL is required/
    );
  });

  it('requires an iOS Google Maps key for production configuration', () => {
    assert.throws(
      () =>
        loadExpoConfig({
          SAFEROUTE_APP_ENV: 'production',
          SAFEROUTE_PROD_API_URL: 'https://api.lunarchain.net',
          SAFEROUTE_IOS_BUILD_NUMBER: '42'
        }),
      /GOOGLE_MAPS_IOS_API_KEY is required/
    );
  });

  it('requires HTTPS for the production API URL', () => {
    assert.throws(
      () =>
        loadExpoConfig({
          SAFEROUTE_APP_ENV: 'production',
          SAFEROUTE_PROD_API_URL: 'http://api.example.test',
          SAFEROUTE_IOS_BUILD_NUMBER: '42',
          GOOGLE_MAPS_IOS_API_KEY: 'ios-key'
        }),
      /Production SafeRoute API URL must use HTTPS/
    );
  });

  it('rejects local loopback hosts for the production API URL', () => {
    assert.throws(
      () =>
        loadExpoConfig({
          SAFEROUTE_APP_ENV: 'production',
          SAFEROUTE_PROD_API_URL: 'https://127.0.0.1:8000',
          SAFEROUTE_IOS_BUILD_NUMBER: '42',
          GOOGLE_MAPS_IOS_API_KEY: 'ios-key'
        }),
      /Production SafeRoute API URL must not point to localhost or loopback hosts/
    );
  });

  it('requires an explicit iOS build number for production configuration', () => {
    assert.throws(
      () =>
        loadExpoConfig({
          SAFEROUTE_APP_ENV: 'production',
          SAFEROUTE_PROD_API_URL: 'https://api.lunarchain.net',
          GOOGLE_MAPS_IOS_API_KEY: 'ios-key'
        }),
      /SAFEROUTE_IOS_BUILD_NUMBER is required/
    );
  });

  it('requires a valid Expo iOS build number format', () => {
    assert.throws(
      () =>
        loadExpoConfig({
          SAFEROUTE_IOS_BUILD_NUMBER: '2026.07.08.1'
        }),
      /SAFEROUTE_IOS_BUILD_NUMBER must be one to three dot-separated numeric components/
    );
  });

  it('ignores demo-drive overrides in production', () => {
    const expo = loadExpoConfig({
      SAFEROUTE_APP_ENV: 'production',
      SAFEROUTE_ENABLE_DEMO_DRIVE: 'true',
      SAFEROUTE_IOS_BUILD_NUMBER: '42',
      SAFEROUTE_PROD_API_URL: 'https://api.lunarchain.net',
      GOOGLE_MAPS_IOS_API_KEY: 'ios-key'
    });

    assert.equal(expo.extra.safeRouteEnvironment, 'production');
    assert.equal(expo.extra.safeRouteDemoDriveEnabled, false);
    assert.equal(expo.ios.buildNumber, '42');
  });

  it('allows preview mode only when explicitly enabled outside production', () => {
    const developmentExpo = loadExpoConfig({
      SAFEROUTE_APP_ENV: 'development',
      SAFEROUTE_ENABLE_PREVIEW_MODE: 'true'
    });
    const productionExpo = loadExpoConfig({
      SAFEROUTE_APP_ENV: 'production',
      SAFEROUTE_ENABLE_PREVIEW_MODE: 'true',
      SAFEROUTE_IOS_BUILD_NUMBER: '43',
      SAFEROUTE_PROD_API_URL: 'https://api.lunarchain.net',
      GOOGLE_MAPS_IOS_API_KEY: 'ios-key'
    });

    assert.equal(developmentExpo.extra.safeRoutePreviewModeEnabled, true);
    assert.equal(productionExpo.extra.safeRoutePreviewModeEnabled, false);
  });

  it('allows preview Maestro runs to start directly on supporting screens outside production', () => {
    const routePickerExpo = loadExpoConfig({
      SAFEROUTE_APP_ENV: 'development',
      SAFEROUTE_ENABLE_PREVIEW_MODE: 'true',
      SAFEROUTE_PREVIEW_INITIAL_SCREEN: ' routes '
    });
    const emptyRoutePickerExpo = loadExpoConfig({
      SAFEROUTE_APP_ENV: 'development',
      SAFEROUTE_ENABLE_PREVIEW_MODE: 'true',
      SAFEROUTE_PREVIEW_INITIAL_SCREEN: ' routes-empty '
    });
    const operationsExpo = loadExpoConfig({
      SAFEROUTE_APP_ENV: 'development',
      SAFEROUTE_ENABLE_PREVIEW_MODE: 'true',
      SAFEROUTE_PREVIEW_INITIAL_SCREEN: ' operations '
    });
    const loginExpo = loadExpoConfig({
      SAFEROUTE_APP_ENV: 'development',
      SAFEROUTE_ENABLE_PREVIEW_MODE: 'true',
      SAFEROUTE_PREVIEW_INITIAL_SCREEN: ' login '
    });
    const loginCodeExpo = loadExpoConfig({
      SAFEROUTE_APP_ENV: 'development',
      SAFEROUTE_ENABLE_PREVIEW_MODE: 'true',
      SAFEROUTE_PREVIEW_INITIAL_SCREEN: ' login-code '
    });
    const expiredSessionExpo = loadExpoConfig({
      SAFEROUTE_APP_ENV: 'development',
      SAFEROUTE_ENABLE_PREVIEW_MODE: 'true',
      SAFEROUTE_PREVIEW_INITIAL_SCREEN: ' session-expired '
    });
    const workspaceChoiceExpo = loadExpoConfig({
      SAFEROUTE_APP_ENV: 'development',
      SAFEROUTE_ENABLE_PREVIEW_MODE: 'true',
      SAFEROUTE_PREVIEW_INITIAL_SCREEN: ' workspace-choice '
    });
    const disabledPreviewExpo = loadExpoConfig({
      SAFEROUTE_APP_ENV: 'development',
      SAFEROUTE_PREVIEW_INITIAL_SCREEN: 'routes'
    });
    const productionExpo = loadExpoConfig({
      SAFEROUTE_APP_ENV: 'production',
      SAFEROUTE_ENABLE_PREVIEW_MODE: 'true',
      SAFEROUTE_PREVIEW_INITIAL_SCREEN: 'routes',
      SAFEROUTE_IOS_BUILD_NUMBER: '43',
      SAFEROUTE_PROD_API_URL: 'https://api.lunarchain.net',
      GOOGLE_MAPS_IOS_API_KEY: 'ios-key'
    });

    assert.equal(routePickerExpo.extra.safeRoutePreviewModeEnabled, true);
    assert.equal(routePickerExpo.extra.safeRoutePreviewInitialScreen, 'routes');
    assert.equal(emptyRoutePickerExpo.extra.safeRoutePreviewModeEnabled, true);
    assert.equal(emptyRoutePickerExpo.extra.safeRoutePreviewInitialScreen, 'routes-empty');
    assert.equal(operationsExpo.extra.safeRoutePreviewModeEnabled, true);
    assert.equal(operationsExpo.extra.safeRoutePreviewInitialScreen, 'operations');
    assert.equal(loginExpo.extra.safeRoutePreviewModeEnabled, true);
    assert.equal(loginExpo.extra.safeRoutePreviewInitialScreen, 'login');
    assert.equal(loginCodeExpo.extra.safeRoutePreviewModeEnabled, true);
    assert.equal(loginCodeExpo.extra.safeRoutePreviewInitialScreen, 'login-code');
    assert.equal(expiredSessionExpo.extra.safeRoutePreviewModeEnabled, true);
    assert.equal(expiredSessionExpo.extra.safeRoutePreviewInitialScreen, 'session-expired');
    assert.equal(workspaceChoiceExpo.extra.safeRoutePreviewInitialScreen, 'workspace-choice');
    assert.equal(disabledPreviewExpo.extra.safeRoutePreviewModeEnabled, false);
    assert.equal(disabledPreviewExpo.extra.safeRoutePreviewInitialScreen, 'guest-map');
    assert.equal(productionExpo.extra.safeRoutePreviewModeEnabled, false);
    assert.equal(productionExpo.extra.safeRoutePreviewInitialScreen, 'guest-map');
  });

  it('passes trimmed production map credentials through SDK 54 platform config', () => {
    const expo = loadExpoConfig({
      SAFEROUTE_APP_ENV: 'production',
      SAFEROUTE_PROD_API_URL: 'https://api.lunarchain.net',
      SAFEROUTE_IOS_BUILD_NUMBER: '  44  ',
      GOOGLE_MAPS_IOS_API_KEY: '  ios-key  ',
      GOOGLE_MAPS_ANDROID_API_KEY: '  android-key  '
    });

    assert.equal(expo.extra.safeRouteEnvironment, 'production');
    assert.equal(expo.extra.safeRouteDemoDriveEnabled, false);
    assert.equal(expo.ios.buildNumber, '44');
    assert.equal(expo.ios.config?.usesNonExemptEncryption, false);
    assert.equal(expo.ios.config?.googleMapsApiKey, 'ios-key');
    assert.equal(expo.android.config?.googleMaps?.apiKey, 'android-key');
    assert.ok(!expo.plugins.some((plugin) =>
      (Array.isArray(plugin) ? plugin[0] : plugin) === 'react-native-maps'
    ));
  });

  it('normalizes release environment values before exposing runtime config', () => {
    const expo = loadExpoConfig({
      SAFEROUTE_APP_ENV: ' production ',
      SAFEROUTE_PROD_API_URL: '  https://prod-api.lunarchain.net/  ',
      SAFEROUTE_API_VERSION: ' /v2/ ',
      SAFEROUTE_ENABLE_DEMO_DRIVE: ' TRUE ',
      SAFEROUTE_IOS_BUILD_NUMBER: '45.1',
      GOOGLE_MAPS_IOS_API_KEY: ' ios-key '
    });

    assert.equal(expo.extra.safeRouteEnvironment, 'production');
    assert.equal(expo.extra.safeRouteApiUrl, 'https://prod-api.lunarchain.net');
    assert.equal(expo.extra.safeRouteApiVersion, 'v2');
    assert.equal(expo.extra.safeRouteDemoDriveEnabled, false);
    assert.equal(expo.ios.buildNumber, '45.1');
  });

  it('prefers environment-specific API URLs over the generic fallback', () => {
    const expo = loadExpoConfig({
      SAFEROUTE_APP_ENV: 'staging',
      SAFEROUTE_API_URL: 'https://generic-api.lunarchain.net',
      SAFEROUTE_STAGING_API_URL: 'https://staging-api.lunarchain.net'
    });

    assert.equal(expo.extra.safeRouteApiUrl, 'https://staging-api.lunarchain.net');
  });
});
