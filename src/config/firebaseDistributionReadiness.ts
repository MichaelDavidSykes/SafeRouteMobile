export type FirebaseDistributionBlockerCode =
  | 'firebase-cli-missing'
  | 'firebase-auth-missing'
  | 'firebase-project-missing'
  | 'firebase-ios-app-id-missing'
  | 'ios-artifact-missing'
  | 'tester-groups-missing'
  | 'release-notes-missing'
  | 'production-env-missing'
  | 'production-api-url-missing'
  | 'production-api-url-invalid'
  | 'production-api-url-insecure'
  | 'production-api-url-local'
  | 'google-maps-ios-key-missing'
  | 'ios-build-number-missing'
  | 'ios-build-number-invalid';

export type FirebaseDistributionBlocker = {
  code: FirebaseDistributionBlockerCode;
  message: string;
};

export type FirebaseIosDistributionInputs = {
  appEnvironment?: string | null;
  firebaseCliAvailable?: boolean;
  firebaseAuthenticated?: boolean;
  firebaseProjectId?: string | null;
  firebaseIosAppId?: string | null;
  googleMapsIosApiKey?: string | null;
  iosArtifactPath?: string | null;
  iosArtifactExists?: boolean;
  iosBuildNumber?: string | null;
  productionApiUrl?: string | null;
  releaseNotes?: string | null;
  testerGroups?: Array<string | null | undefined> | null;
};

export type FirebaseIosDistributionReadiness = {
  blockers: FirebaseDistributionBlocker[];
  distributionCommand: string | null;
  normalized: {
    appEnvironment: string | null;
    firebaseProjectId: string | null;
    firebaseIosAppId: string | null;
    googleMapsIosApiKeyConfigured: boolean;
    iosArtifactPath: string | null;
    iosBuildNumber: string | null;
    productionApiUrl: string | null;
    releaseNotes: string | null;
    testerGroups: string[];
  };
  ready: boolean;
};

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeEnvironment(value: string | null | undefined): string | null {
  const normalized = normalizeText(value);
  return normalized ? normalized.toLowerCase() : null;
}

function normalizeApiUrl(value: string | null | undefined): string | null {
  return normalizeText(value)?.replace(/\/+$/, '') || null;
}

function isValidIosBuildNumber(value: string): boolean {
  return /^\d+(?:\.\d+){0,2}$/.test(value);
}

function parseApiUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isLoopbackApiHost(hostname: string): boolean {
  const normalizedHost = hostname.toLowerCase().replace(/^\[(.*)]$/, '$1');

  return (
    normalizedHost === 'localhost' ||
    normalizedHost === '0.0.0.0' ||
    normalizedHost === '::1' ||
    normalizedHost === '127.0.0.1' ||
    normalizedHost.startsWith('127.')
  );
}

function normalizeTesterGroups(groups: Array<string | null | undefined> | null | undefined): string[] {
  const seen = new Set<string>();
  const normalizedGroups: string[] = [];

  for (const group of groups || []) {
    const normalized = normalizeText(group);

    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      normalizedGroups.push(normalized);
    }
  }

  return normalizedGroups;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function createFirebaseDistributionCommand({
  firebaseIosAppId,
  firebaseProjectId,
  iosArtifactPath,
  releaseNotes,
  testerGroups
}: FirebaseIosDistributionReadiness['normalized']): string | null {
  if (!firebaseIosAppId || !firebaseProjectId || !iosArtifactPath || !releaseNotes || !testerGroups.length) {
    return null;
  }

  return [
    'firebase appdistribution:distribute',
    shellQuote(iosArtifactPath),
    '--app',
    shellQuote(firebaseIosAppId),
    '--project',
    shellQuote(firebaseProjectId),
    '--groups',
    shellQuote(testerGroups.join(',')),
    '--release-notes',
    shellQuote(releaseNotes)
  ].join(' ');
}

export function resolveFirebaseIosDistributionReadiness(
  inputs: FirebaseIosDistributionInputs
): FirebaseIosDistributionReadiness {
  const normalized = {
    appEnvironment: normalizeEnvironment(inputs.appEnvironment),
    firebaseProjectId: normalizeText(inputs.firebaseProjectId),
    firebaseIosAppId: normalizeText(inputs.firebaseIosAppId),
    googleMapsIosApiKeyConfigured: Boolean(normalizeText(inputs.googleMapsIosApiKey)),
    iosArtifactPath: normalizeText(inputs.iosArtifactPath),
    iosBuildNumber: normalizeText(inputs.iosBuildNumber),
    productionApiUrl: normalizeApiUrl(inputs.productionApiUrl),
    releaseNotes: normalizeText(inputs.releaseNotes),
    testerGroups: normalizeTesterGroups(inputs.testerGroups)
  };
  const blockers: FirebaseDistributionBlocker[] = [];

  if (!inputs.firebaseCliAvailable) {
    blockers.push({
      code: 'firebase-cli-missing',
      message: 'Install the Firebase CLI before attempting App Distribution.'
    });
  }

  if (!inputs.firebaseAuthenticated) {
    blockers.push({
      code: 'firebase-auth-missing',
      message: 'Authenticate the Firebase CLI with an account that can release the SafeRoute iOS app.'
    });
  }

  if (!normalized.firebaseProjectId) {
    blockers.push({
      code: 'firebase-project-missing',
      message: 'Set the Firebase project id for the SafeRoute release target.'
    });
  }

  if (!normalized.firebaseIosAppId) {
    blockers.push({
      code: 'firebase-ios-app-id-missing',
      message: 'Set the Firebase iOS app id for bundle com.lunarchain.saferoute.'
    });
  }

  if (!normalized.iosArtifactPath || !inputs.iosArtifactExists) {
    blockers.push({
      code: 'ios-artifact-missing',
      message: 'Provide an already-produced signed .ipa artifact before distribution.'
    });
  }

  if (!normalized.testerGroups.length) {
    blockers.push({
      code: 'tester-groups-missing',
      message: 'Choose at least one Firebase tester group for the iOS release.'
    });
  }

  if (!normalized.releaseNotes) {
    blockers.push({
      code: 'release-notes-missing',
      message: 'Prepare concise release notes for Firebase testers.'
    });
  }

  if (normalized.appEnvironment !== 'production') {
    blockers.push({
      code: 'production-env-missing',
      message: 'Set SAFEROUTE_APP_ENV=production for the iOS artifact before distribution.'
    });
  }

  if (!normalized.productionApiUrl) {
    blockers.push({
      code: 'production-api-url-missing',
      message: 'Set the HTTPS SafeRoute production API URL used by the signed iOS artifact.'
    });
  } else {
    const productionApiUrl = parseApiUrl(normalized.productionApiUrl);

    if (!productionApiUrl) {
      blockers.push({
        code: 'production-api-url-invalid',
        message: 'Use a valid HTTPS SafeRoute production API URL for iOS distribution.'
      });
    } else {
      if (productionApiUrl.protocol !== 'https:') {
        blockers.push({
          code: 'production-api-url-insecure',
          message: 'Use an HTTPS SafeRoute production API URL for iOS distribution.'
        });
      }

      if (isLoopbackApiHost(productionApiUrl.hostname)) {
        blockers.push({
          code: 'production-api-url-local',
          message: 'Use the hosted SafeRoute API URL, not localhost or a loopback host, for iOS distribution.'
        });
      }
    }
  }

  if (!normalized.googleMapsIosApiKeyConfigured) {
    blockers.push({
      code: 'google-maps-ios-key-missing',
      message: 'Set GOOGLE_MAPS_IOS_API_KEY in the release environment before producing the iOS artifact.'
    });
  }

  if (!normalized.iosBuildNumber) {
    blockers.push({
      code: 'ios-build-number-missing',
      message: 'Set SAFEROUTE_IOS_BUILD_NUMBER for the signed iOS artifact.'
    });
  } else if (!isValidIosBuildNumber(normalized.iosBuildNumber)) {
    blockers.push({
      code: 'ios-build-number-invalid',
      message: 'Use one to three dot-separated numeric components for SAFEROUTE_IOS_BUILD_NUMBER.'
    });
  }

  const ready = blockers.length === 0;

  return {
    blockers,
    distributionCommand: ready ? createFirebaseDistributionCommand(normalized) : null,
    normalized,
    ready
  };
}
