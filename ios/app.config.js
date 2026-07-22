const supportedEnvironments = ['development', 'staging', 'production'];
const iosLocationPurposeCopy = 'Shows your position on the map and guides active SafeRoute trips.';
const backgroundLocationPurposeCopy =
  'Keeps active SafeRoute guidance and safety monitoring running when the screen is locked.';

function trimmedEnv(name) {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : undefined;
}

function firstConfiguredValue(...values) {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0);
}

function normalizeApiVersion(value) {
  const normalized = (value || 'v1').trim().replace(/^\/+|\/+$/g, '');
  return normalized || 'v1';
}

function normalizeApiUrl(value) {
  return value.trim().replace(/\/+$/, '');
}

function isLocalOrLoopbackHost(hostname) {
  const normalized = hostname.toLowerCase();
  if (
    normalized === 'localhost' ||
    normalized === '0.0.0.0' ||
    normalized === '::1' ||
    normalized === '[::1]'
  ) {
    return true;
  }
  const octets = normalized.split('.');
  return octets.length === 4 &&
    octets[0] === '127' &&
    octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255);
}

function assertProductionApiUrl(value) {
  let parsedUrl;

  try {
    parsedUrl = new URL(value);
  } catch (_error) {
    throw new Error('Production SafeRoute API URL must be a valid HTTPS URL.');
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new Error('Production SafeRoute API URL must use HTTPS.');
  }

  if (isLocalOrLoopbackHost(parsedUrl.hostname)) {
    throw new Error('Production SafeRoute API URL must not point to localhost or loopback hosts.');
  }
}

function normalizeIosBuildNumber(value) {
  const normalized = (value || '1').trim();

  if (!/^\d+(?:\.\d+){0,2}$/.test(normalized)) {
    throw new Error(
      'SAFEROUTE_IOS_BUILD_NUMBER must be one to three dot-separated numeric components.'
    );
  }

  return normalized;
}

function normalizePreviewInitialScreen(value, previewModeEnabled) {
  const normalized = value?.trim().toLowerCase();

  if (!previewModeEnabled) {
    return 'guest-map';
  }

  if (
    normalized === 'login' ||
    normalized === 'guidance-suspended' ||
    normalized === 'login-code' ||
    normalized === 'reset-password' ||
    normalized === 'reset-password-code' ||
    normalized === 'operations' ||
    normalized === 'routes-empty' ||
    normalized === 'session-expired' ||
    normalized === 'workspace-choice'
  ) {
    return normalized;
  }

  return normalized === 'routes' ? 'routes' : 'guest-map';
}

const appEnvironment = trimmedEnv('SAFEROUTE_APP_ENV') || 'development';

if (!supportedEnvironments.includes(appEnvironment)) {
  throw new Error(
    `Unsupported SAFEROUTE_APP_ENV "${appEnvironment}". Expected one of: ${supportedEnvironments.join(', ')}.`
  );
}

const enableDemoDriveOverride = trimmedEnv('SAFEROUTE_ENABLE_DEMO_DRIVE');
const enableGuidanceContractEvidenceOverride = trimmedEnv(
  'SAFEROUTE_ENABLE_GUIDANCE_CONTRACT_EVIDENCE'
);
const enableConnectivityContractOverride = trimmedEnv(
  'SAFEROUTE_ENABLE_CONNECTIVITY_CONTRACT'
);
const enableStorageFaultContractOverride = trimmedEnv(
  'SAFEROUTE_ENABLE_STORAGE_FAULT_CONTRACT'
);
const enablePreviewModeOverride = trimmedEnv('SAFEROUTE_ENABLE_PREVIEW_MODE');
const previewInitialScreenOverride = trimmedEnv('SAFEROUTE_PREVIEW_INITIAL_SCREEN');
const sourceRevisionOverride = trimmedEnv('SAFEROUTE_SOURCE_REVISION');
const safeRouteDemoDriveEnabled =
  appEnvironment !== 'production' &&
  (enableDemoDriveOverride ? enableDemoDriveOverride.toLowerCase() === 'true' : true);
const safeRoutePreviewModeEnabled =
  appEnvironment !== 'production' &&
  (enablePreviewModeOverride ? enablePreviewModeOverride.toLowerCase() === 'true' : false);
const safeRoutePreviewInitialScreen = normalizePreviewInitialScreen(
  previewInitialScreenOverride,
  safeRoutePreviewModeEnabled
);
if (sourceRevisionOverride && !/^[0-9a-f]{40}$/i.test(sourceRevisionOverride)) {
  throw new Error('SAFEROUTE_SOURCE_REVISION must be a full 40-character Git commit SHA.');
}
const productionApiUrlOverride = trimmedEnv('SAFEROUTE_PROD_API_URL');
const apiUrls = {
  development: firstConfiguredValue(trimmedEnv('SAFEROUTE_DEV_API_URL'), trimmedEnv('SAFEROUTE_API_URL'), 'https://api.lunarchain.net'),
  staging: firstConfiguredValue(trimmedEnv('SAFEROUTE_STAGING_API_URL'), trimmedEnv('SAFEROUTE_API_URL'), 'https://api.lunarchain.net'),
  production: firstConfiguredValue(productionApiUrlOverride, trimmedEnv('SAFEROUTE_API_URL'), 'https://api.lunarchain.net')
};
const safeRouteApiUrl = normalizeApiUrl(firstConfiguredValue(apiUrls[appEnvironment], apiUrls.development));
const safeRouteApiVersion = normalizeApiVersion(trimmedEnv('SAFEROUTE_API_VERSION'));
const iosBuildNumberOverride = trimmedEnv('SAFEROUTE_IOS_BUILD_NUMBER');
const iosBuildNumber = normalizeIosBuildNumber(iosBuildNumberOverride);
const googleMapsAndroidApiKey = trimmedEnv('GOOGLE_MAPS_ANDROID_API_KEY');
const googleMapsIosApiKey = trimmedEnv('GOOGLE_MAPS_IOS_API_KEY');
const safeRouteGuidanceContractEvidenceEnabled =
  appEnvironment === 'development' &&
  enableGuidanceContractEvidenceOverride?.toLowerCase() === 'true' &&
  Boolean(sourceRevisionOverride) &&
  isLoopbackUrl(safeRouteApiUrl);
const safeRouteConnectivityContractEnabled =
  appEnvironment === 'development' &&
  enableConnectivityContractOverride?.toLowerCase() === 'true' &&
  Boolean(sourceRevisionOverride) &&
  isLoopbackUrl(safeRouteApiUrl);
const safeRouteStorageFaultContractEnabled =
  safeRouteConnectivityContractEnabled &&
  enableStorageFaultContractOverride?.toLowerCase() === 'true';

if (appEnvironment === 'production') {
  if (!productionApiUrlOverride) {
    throw new Error('SAFEROUTE_PROD_API_URL is required for production builds.');
  }

  assertProductionApiUrl(safeRouteApiUrl);

  if (!googleMapsIosApiKey) {
    throw new Error('GOOGLE_MAPS_IOS_API_KEY is required for production iOS builds.');
  }

  if (!iosBuildNumberOverride) {
    throw new Error('SAFEROUTE_IOS_BUILD_NUMBER is required for production iOS builds.');
  }
}

module.exports = {
  expo: {
    name: 'SafeRoute',
    slug: 'saferoute-mobile',
    version: '0.1.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    scheme: 'saferoute',
    jsEngine: 'hermes',
    icon: './assets/icon.png',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#f2f2f7'
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.lunarchain.saferoute',
      buildNumber: iosBuildNumber,
      config: {
        usesNonExemptEncryption: false,
        ...(googleMapsIosApiKey
          ? {
              googleMapsApiKey: googleMapsIosApiKey
            }
          : {})
      },
      infoPlist: {
        NSLocationAlwaysAndWhenInUseUsageDescription: backgroundLocationPurposeCopy,
        NSLocationWhenInUseUsageDescription: iosLocationPurposeCopy,
        UIBackgroundModes: ['location']
      }
    },
    android: {
      package: 'com.lunarchain.saferoute',
      permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
      ...(googleMapsAndroidApiKey
        ? {
            config: {
              googleMaps: {
                apiKey: googleMapsAndroidApiKey
              }
            }
          }
        : {}),
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#000000'
      }
    },
    plugins: [
      [
        'expo-location',
        {
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true,
          isIosBackgroundLocationEnabled: true,
          locationAlwaysAndWhenInUsePermission: backgroundLocationPurposeCopy,
          locationWhenInUsePermission: iosLocationPurposeCopy
        }
      ],
      'expo-secure-store'
    ],
    extra: {
      safeRouteEnvironment: appEnvironment,
      safeRouteApiUrl,
      safeRouteApiVersion,
      safeRouteConnectivityContractEnabled,
      safeRouteStorageFaultContractEnabled,
      safeRouteDemoDriveEnabled,
      safeRouteGuidanceContractEvidenceEnabled,
      safeRoutePreviewInitialScreen,
      safeRoutePreviewModeEnabled,
      ...(sourceRevisionOverride
        ? { safeRouteSourceRevision: sourceRevisionOverride.toLowerCase() }
        : {})
    }
  }
};

function isLoopbackUrl(value) {
  try {
    return isLocalOrLoopbackHost(new URL(value).hostname);
  } catch {
    return false;
  }
}
