export type FirebaseDistributionBlockerCode =
  | 'firebase-cli-missing'
  | 'firebase-auth-missing'
  | 'firebase-project-missing'
  | 'firebase-ios-app-id-missing'
  | 'ios-artifact-missing'
  | 'tester-groups-missing'
  | 'release-notes-missing';

export type FirebaseDistributionBlocker = {
  code: FirebaseDistributionBlockerCode;
  message: string;
};

export type FirebaseIosDistributionInputs = {
  firebaseCliAvailable?: boolean;
  firebaseAuthenticated?: boolean;
  firebaseProjectId?: string | null;
  firebaseIosAppId?: string | null;
  iosArtifactPath?: string | null;
  iosArtifactExists?: boolean;
  releaseNotes?: string | null;
  testerGroups?: Array<string | null | undefined> | null;
};

export type FirebaseIosDistributionReadiness = {
  blockers: FirebaseDistributionBlocker[];
  distributionCommand: string | null;
  normalized: {
    firebaseProjectId: string | null;
    firebaseIosAppId: string | null;
    iosArtifactPath: string | null;
    releaseNotes: string | null;
    testerGroups: string[];
  };
  ready: boolean;
};

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
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
    firebaseProjectId: normalizeText(inputs.firebaseProjectId),
    firebaseIosAppId: normalizeText(inputs.firebaseIosAppId),
    iosArtifactPath: normalizeText(inputs.iosArtifactPath),
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

  const ready = blockers.length === 0;

  return {
    blockers,
    distributionCommand: ready ? createFirebaseDistributionCommand(normalized) : null,
    normalized,
    ready
  };
}
