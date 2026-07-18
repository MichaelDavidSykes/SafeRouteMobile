const DEFAULT_API_URL = 'https://api.lunarchain.net';
const DEFAULT_API_VERSION = 'v1';
const PRODUCTION_ENVIRONMENT = 'production';
const SUPPORTED_ENVIRONMENTS = ['development', 'staging', PRODUCTION_ENVIRONMENT] as const;

export type SafeRouteAppEnvironment = (typeof SUPPORTED_ENVIRONMENTS)[number];
export type SafeRoutePreviewInitialScreen =
  | 'guest-map'
  | 'guidance-suspended'
  | 'login'
  | 'login-code'
  | 'operations'
  | 'routes'
  | 'routes-empty'
  | 'session-expired'
  | 'workspace-choice';

export type SafeRouteExtra = {
  safeRouteApiUrl?: string;
  safeRouteApiVersion?: string;
  safeRouteConnectivityContractEnabled?: boolean;
  safeRouteStorageFaultContractEnabled?: boolean;
  safeRouteEnvironment?: string;
  safeRouteDemoDriveEnabled?: boolean;
  safeRouteGuidanceContractEvidenceEnabled?: boolean;
  safeRoutePreviewInitialScreen?: string;
  safeRoutePreviewModeEnabled?: boolean;
  safeRouteSourceRevision?: string;
};

export type SafeRouteRuntimeConfig = {
  appEnvironment: SafeRouteAppEnvironment;
  connectivityContractEnabled: boolean;
  demoDriveEnabled: boolean;
  guidanceContractEvidenceEnabled: boolean;
  lunarchainApiUrl: string;
  lunarchainApiVersion: string;
  lunarchainApiBase: string;
  previewInitialScreen: SafeRoutePreviewInitialScreen;
  previewModeEnabled: boolean;
  sourceRevision: string;
  storageFaultContractEnabled: boolean;
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
  'safeRouteConnectivityContractEnabled',
  'safeRouteStorageFaultContractEnabled',
  'safeRouteEnvironment',
  'safeRouteDemoDriveEnabled',
  'safeRouteGuidanceContractEvidenceEnabled',
  'safeRoutePreviewInitialScreen',
  'safeRoutePreviewModeEnabled',
  'safeRouteSourceRevision'
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

  const normalized = value?.trim().toLowerCase();

  if (
    normalized === 'login' ||
    normalized === 'guidance-suspended' ||
    normalized === 'login-code' ||
    normalized === 'operations' ||
    normalized === 'routes-empty' ||
    normalized === 'session-expired' ||
    normalized === 'workspace-choice'
  ) {
    return normalized;
  }

  return normalized === 'routes' ? 'routes' : 'guest-map';
}

export function resolveSafeRouteRuntimeConfig(extra: SafeRouteExtra | undefined): SafeRouteRuntimeConfig {
  const appEnvironment = normalizeEnvironment(extra?.safeRouteEnvironment);
  const demoDriveEnabled = extra?.safeRouteDemoDriveEnabled === true && appEnvironment !== PRODUCTION_ENVIRONMENT;
  const previewModeEnabled =
    extra?.safeRoutePreviewModeEnabled === true && appEnvironment !== PRODUCTION_ENVIRONMENT;
  const lunarchainApiUrl = normalizeApiUrl(extra?.safeRouteApiUrl, appEnvironment);
  const lunarchainApiVersion = normalizeApiVersion(extra?.safeRouteApiVersion);
  const sourceRevision = /^[0-9a-f]{40}$/i.test(extra?.safeRouteSourceRevision?.trim() || '')
    ? extra?.safeRouteSourceRevision?.trim().toLowerCase() || ''
    : '';
  const guidanceContractEvidenceEnabled =
    extra?.safeRouteGuidanceContractEvidenceEnabled === true &&
    appEnvironment === 'development' &&
    sourceRevision.length === 40 &&
    isLoopbackApiUrl(lunarchainApiUrl);
  const connectivityContractEnabled =
    extra?.safeRouteConnectivityContractEnabled === true &&
    appEnvironment === 'development' &&
    sourceRevision.length === 40 &&
    isLoopbackApiUrl(lunarchainApiUrl);
  const storageFaultContractEnabled =
    extra?.safeRouteStorageFaultContractEnabled === true &&
    connectivityContractEnabled;
  const previewInitialScreen = normalizePreviewInitialScreen(
    extra?.safeRoutePreviewInitialScreen,
    previewModeEnabled
  );

  return {
    appEnvironment,
    connectivityContractEnabled,
    demoDriveEnabled,
    guidanceContractEvidenceEnabled,
    lunarchainApiBase: `${lunarchainApiUrl}/api/${lunarchainApiVersion}`,
    lunarchainApiUrl,
    lunarchainApiVersion,
    previewInitialScreen,
    previewModeEnabled,
    sourceRevision,
    storageFaultContractEnabled
  };
}

function isLoopbackApiUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname === '[::1]'
    ) {
      return true;
    }
    const octets = hostname.split('.');
    return octets.length === 4 &&
      octets[0] === '127' &&
      octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255);
  } catch {
    return false;
  }
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
