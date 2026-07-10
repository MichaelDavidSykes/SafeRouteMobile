const DEFAULT_API_URL = 'https://api.lunarchain.net';
const DEFAULT_API_VERSION = 'v1';
const PRODUCTION_ENVIRONMENT = 'production';
const SUPPORTED_ENVIRONMENTS = ['development', 'staging', PRODUCTION_ENVIRONMENT] as const;

export type SafeRouteAppEnvironment = (typeof SUPPORTED_ENVIRONMENTS)[number];
export type SafeRoutePreviewInitialScreen = 'guest-map' | 'routes';

export type SafeRouteExtra = {
  safeRouteApiUrl?: string;
  safeRouteApiVersion?: string;
  safeRouteEnvironment?: string;
  safeRouteDemoDriveEnabled?: boolean;
  safeRoutePreviewInitialScreen?: string;
  safeRoutePreviewModeEnabled?: boolean;
};

export type SafeRouteRuntimeConfig = {
  appEnvironment: SafeRouteAppEnvironment;
  demoDriveEnabled: boolean;
  lunarchainApiUrl: string;
  lunarchainApiVersion: string;
  lunarchainApiBase: string;
  previewInitialScreen: SafeRoutePreviewInitialScreen;
  previewModeEnabled: boolean;
};

export type SafeRouteConstantsLike = {
  expoConfig?: {
    extra?: SafeRouteExtra | null;
  } | null;
  manifest?: {
    extra?: SafeRouteExtra | null;
  } | null;
  manifest2?: {
    extra?:
      | (SafeRouteExtra & {
          expoClient?: {
            extra?: SafeRouteExtra | null;
          } | null;
        })
      | null;
  } | null;
};

const SAFE_ROUTE_EXTRA_KEYS: (keyof SafeRouteExtra)[] = [
  'safeRouteApiUrl',
  'safeRouteApiVersion',
  'safeRouteEnvironment',
  'safeRouteDemoDriveEnabled',
  'safeRoutePreviewInitialScreen',
  'safeRoutePreviewModeEnabled'
];

function normalizeEnvironment(value: string | undefined): SafeRouteAppEnvironment {
  const normalizedValue = value?.trim().toLowerCase();

  if (SUPPORTED_ENVIRONMENTS.includes(normalizedValue as SafeRouteAppEnvironment)) {
    return normalizedValue as SafeRouteAppEnvironment;
  }

  return PRODUCTION_ENVIRONMENT;
}

function normalizeApiUrl(
  value: string | undefined,
  appEnvironment: SafeRouteAppEnvironment
): string {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return DEFAULT_API_URL;
  }

  const normalizedValue = trimmedValue.replace(/\/+$/, '');

  if (
    appEnvironment === PRODUCTION_ENVIRONMENT &&
    !normalizedValue.toLowerCase().startsWith('https://')
  ) {
    return DEFAULT_API_URL;
  }

  return normalizedValue;
}

function normalizeApiVersion(value: string | undefined): string {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return DEFAULT_API_VERSION;
  }

  return trimmedValue.replace(/^\/+|\/+$/g, '');
}

function normalizePreviewInitialScreen(
  value: string | undefined,
  previewModeEnabled: boolean
): SafeRoutePreviewInitialScreen {
  if (!previewModeEnabled) {
    return 'guest-map';
  }

  return value?.trim().toLowerCase() === 'routes' ? 'routes' : 'guest-map';
}

export function resolveSafeRouteRuntimeConfig(extra: SafeRouteExtra | undefined): SafeRouteRuntimeConfig {
  const appEnvironment = normalizeEnvironment(extra?.safeRouteEnvironment);
  const demoDriveEnabled = extra?.safeRouteDemoDriveEnabled === true && appEnvironment !== PRODUCTION_ENVIRONMENT;
  const previewModeEnabled =
    extra?.safeRoutePreviewModeEnabled === true && appEnvironment !== PRODUCTION_ENVIRONMENT;
  const lunarchainApiUrl = normalizeApiUrl(extra?.safeRouteApiUrl, appEnvironment);
  const lunarchainApiVersion = normalizeApiVersion(extra?.safeRouteApiVersion);
  const previewInitialScreen = normalizePreviewInitialScreen(
    extra?.safeRoutePreviewInitialScreen,
    previewModeEnabled
  );

  return {
    appEnvironment,
    demoDriveEnabled,
    lunarchainApiBase: `${lunarchainApiUrl}/api/${lunarchainApiVersion}`,
    lunarchainApiUrl,
    lunarchainApiVersion,
    previewInitialScreen,
    previewModeEnabled
  };
}

export function resolveSafeRouteExtraFromConstants(
  constants: SafeRouteConstantsLike
): SafeRouteExtra | undefined {
  return [
    constants.expoConfig?.extra,
    constants.manifest?.extra,
    constants.manifest2?.extra?.expoClient?.extra,
    constants.manifest2?.extra
  ].find(hasSafeRouteExtra);
}

function hasSafeRouteExtra(extra: SafeRouteExtra | null | undefined): extra is SafeRouteExtra {
  return Boolean(
    extra &&
      SAFE_ROUTE_EXTRA_KEYS.some((key) =>
        Object.prototype.hasOwnProperty.call(extra, key)
      )
  );
}
