import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  resolveSafeRouteExtraFromConstants,
  resolveSafeRouteRuntimeConfig
} from '../src/config/envCore';

describe('SafeRoute runtime config', () => {
  it('defaults to a conservative production runtime when Expo extra is missing', () => {
    const config = resolveSafeRouteRuntimeConfig(undefined);

    assert.equal(config.appEnvironment, 'production');
    assert.equal(config.demoDriveEnabled, false);
    assert.equal(config.previewModeEnabled, false);
    assert.equal(config.previewInitialScreen, 'guest-map');
    assert.equal(config.lunarchainApiUrl, 'https://api.lunarchain.net');
    assert.equal(config.lunarchainApiVersion, 'v1');
    assert.equal(config.lunarchainApiBase, 'https://api.lunarchain.net/api/v1');
  });

  it('normalizes API URL and version values from Expo extra', () => {
    const config = resolveSafeRouteRuntimeConfig({
      safeRouteApiUrl: '  https://api.example.test/// ',
      safeRouteApiVersion: ' /v2/ ',
      safeRouteEnvironment: ' STAGING '
    });

    assert.equal(config.appEnvironment, 'staging');
    assert.equal(config.lunarchainApiUrl, 'https://api.example.test');
    assert.equal(config.lunarchainApiVersion, 'v2');
    assert.equal(config.lunarchainApiBase, 'https://api.example.test/api/v2');
  });

  it('keeps production runtime API traffic on HTTPS even if packaged extra is unsafe', () => {
    const productionConfig = resolveSafeRouteRuntimeConfig({
      safeRouteApiUrl: ' http://api.example.test/// ',
      safeRouteEnvironment: 'production'
    });
    const developmentConfig = resolveSafeRouteRuntimeConfig({
      safeRouteApiUrl: ' http://localhost:8000/// ',
      safeRouteEnvironment: 'development'
    });

    assert.equal(productionConfig.appEnvironment, 'production');
    assert.equal(productionConfig.lunarchainApiUrl, 'https://api.lunarchain.net');
    assert.equal(productionConfig.lunarchainApiBase, 'https://api.lunarchain.net/api/v1');
    assert.equal(developmentConfig.lunarchainApiUrl, 'http://localhost:8000');
  });

  it('allows demo drive only for explicit non-production runtime config', () => {
    assert.equal(
      resolveSafeRouteRuntimeConfig({
        safeRouteDemoDriveEnabled: true,
        safeRouteEnvironment: 'development'
      }).demoDriveEnabled,
      true
    );

    assert.equal(
      resolveSafeRouteRuntimeConfig({
        safeRouteDemoDriveEnabled: true,
        safeRouteEnvironment: 'production'
      }).demoDriveEnabled,
      false
    );
  });

  it('allows preview mode only for explicit non-production runtime config', () => {
    assert.equal(
      resolveSafeRouteRuntimeConfig({
        safeRouteEnvironment: 'development',
        safeRoutePreviewModeEnabled: true
      }).previewModeEnabled,
      true
    );

    assert.equal(
      resolveSafeRouteRuntimeConfig({
        safeRouteEnvironment: 'production',
        safeRoutePreviewModeEnabled: true
      }).previewModeEnabled,
      false
    );
  });

  it('normalizes preview initial screens only while preview mode is enabled', () => {
    assert.equal(
      resolveSafeRouteRuntimeConfig({
        safeRouteEnvironment: 'development',
        safeRoutePreviewModeEnabled: true,
        safeRoutePreviewInitialScreen: ' routes '
      }).previewInitialScreen,
      'routes'
    );

    assert.equal(
      resolveSafeRouteRuntimeConfig({
        safeRouteEnvironment: 'development',
        safeRoutePreviewModeEnabled: true,
        safeRoutePreviewInitialScreen: 'operations'
      }).previewInitialScreen,
      'operations'
    );

    assert.equal(
      resolveSafeRouteRuntimeConfig({
        safeRouteEnvironment: 'development',
        safeRoutePreviewModeEnabled: true,
        safeRoutePreviewInitialScreen: ' login '
      }).previewInitialScreen,
      'login'
    );

    assert.equal(
      resolveSafeRouteRuntimeConfig({
        safeRouteEnvironment: 'development',
        safeRoutePreviewModeEnabled: true,
        safeRoutePreviewInitialScreen: ' login-code '
      }).previewInitialScreen,
      'login-code'
    );

    assert.equal(
      resolveSafeRouteRuntimeConfig({
        safeRouteEnvironment: 'development',
        safeRoutePreviewModeEnabled: true,
        safeRoutePreviewInitialScreen: ' route-detail '
      }).previewInitialScreen,
      'guest-map'
    );

    assert.equal(
      resolveSafeRouteRuntimeConfig({
        safeRouteEnvironment: 'development',
        safeRoutePreviewInitialScreen: 'routes'
      }).previewInitialScreen,
      'guest-map'
    );
  });

  it('disables demo drive for unrecognized packaged environments', () => {
    const config = resolveSafeRouteRuntimeConfig({
      safeRouteDemoDriveEnabled: true,
      safeRouteEnvironment: 'qa'
    });

    assert.equal(config.appEnvironment, 'production');
    assert.equal(config.demoDriveEnabled, false);
    assert.equal(config.previewModeEnabled, false);
  });

  it('finds SafeRoute runtime extra across Expo Go and updates manifests', () => {
    assert.deepEqual(
      resolveSafeRouteExtraFromConstants({
        expoConfig: {
          extra: {
            safeRouteEnvironment: 'development',
            safeRoutePreviewInitialScreen: 'routes',
            safeRoutePreviewModeEnabled: true
          }
        }
      }),
      {
        safeRouteEnvironment: 'development',
        safeRoutePreviewInitialScreen: 'routes',
        safeRoutePreviewModeEnabled: true
      }
    );

    assert.deepEqual(
      resolveSafeRouteExtraFromConstants({
        expoConfig: { extra: {} },
        manifest: {
          extra: {
            safeRouteApiUrl: 'https://api.example.test'
          }
        }
      }),
      {
        safeRouteApiUrl: 'https://api.example.test'
      }
    );

    assert.deepEqual(
      resolveSafeRouteExtraFromConstants({
        manifest2: {
          extra: {
            expoClient: {
              extra: {
                safeRouteEnvironment: 'staging'
              }
            }
          }
        }
      }),
      {
        safeRouteEnvironment: 'staging'
      }
    );

    assert.equal(
      resolveSafeRouteExtraFromConstants({
        expoConfig: { extra: {} },
        manifest2: { extra: {} }
      }),
      undefined
    );
  });
});
