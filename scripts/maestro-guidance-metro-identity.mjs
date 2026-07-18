const DEFAULT_MANIFEST_TIMEOUT_MS = 5000;

export function readGuidanceMetroIdentity(manifest) {
  const expoClient = manifest?.extra?.expoClient || manifest?.expoClient || manifest;
  const runtimeExtra = expoClient?.extra || manifest?.extra || {};
  const expoGo = manifest?.extra?.expoGo || {};

  return {
    apiUrl: String(runtimeExtra.safeRouteApiUrl || '').trim(),
    connectivityContractEnabled:
      runtimeExtra.safeRouteConnectivityContractEnabled === true,
    demoDriveEnabled: runtimeExtra.safeRouteDemoDriveEnabled,
    previewModeEnabled: runtimeExtra.safeRoutePreviewModeEnabled,
    projectRoot: String(expoGo?.developer?.projectRoot || '').trim(),
    slug: String(expoClient?.slug || '').trim(),
    sourceRevision: String(runtimeExtra.safeRouteSourceRevision || '').trim().toLowerCase(),
    storageFaultContractEnabled:
      runtimeExtra.safeRouteStorageFaultContractEnabled === true
  };
}

export function assertGuidanceMetroIdentity(identity, {
  expectedApiUrl,
  expectedConnectivityContractEnabled,
  expectedProjectRoot,
  expectedSlug,
  expectedSourceRevision,
  expectedStorageFaultContractEnabled
}) {
  const expected = {
    apiUrl: String(expectedApiUrl || '').trim(),
    projectRoot: normalizePath(expectedProjectRoot),
    slug: String(expectedSlug || '').trim(),
    sourceRevision: String(expectedSourceRevision || '').trim().toLowerCase()
  };
  const actual = {
    ...identity,
    projectRoot: normalizePath(identity?.projectRoot)
  };

  assertIdentityField(actual.slug === expected.slug, 'app slug', expected.slug, actual.slug);
  assertIdentityField(
    actual.projectRoot === expected.projectRoot,
    'project root',
    expected.projectRoot,
    actual.projectRoot
  );
  assertIdentityField(
    actual.sourceRevision === expected.sourceRevision,
    'source revision',
    expected.sourceRevision,
    actual.sourceRevision
  );
  assertIdentityField(
    actual.apiUrl === expected.apiUrl,
    'API URL',
    expected.apiUrl,
    actual.apiUrl
  );
  assertIdentityField(
    actual.previewModeEnabled === false,
    'preview-mode flag',
    false,
    actual.previewModeEnabled
  );
  assertIdentityField(
    actual.demoDriveEnabled === false,
    'demo-drive flag',
    false,
    actual.demoDriveEnabled
  );
  if (typeof expectedConnectivityContractEnabled === 'boolean') {
    assertIdentityField(
      actual.connectivityContractEnabled === expectedConnectivityContractEnabled,
      'connectivity-contract flag',
      expectedConnectivityContractEnabled,
      actual.connectivityContractEnabled
    );
  }
  if (typeof expectedStorageFaultContractEnabled === 'boolean') {
    assertIdentityField(
      actual.storageFaultContractEnabled === expectedStorageFaultContractEnabled,
      'storage-fault-contract flag',
      expectedStorageFaultContractEnabled,
      actual.storageFaultContractEnabled
    );
  }

  return actual;
}

export function assertGuidanceSourceCheckoutClean(statusOutput) {
  const changes = String(statusOutput || '').trim();
  if (!changes) {
    return;
  }
  throw new Error(
    `Guidance contract evidence requires a clean Git checkout at the advertised source revision.\n${changes}`
  );
}

export async function verifyGuidanceContractMetroIdentity({
  expectedApiUrl,
  expectedConnectivityContractEnabled,
  expectedProjectRoot,
  expectedSlug,
  expectedSourceRevision,
  expectedStorageFaultContractEnabled,
  fetchImpl = fetch,
  manifestUrl,
  timeoutMs = DEFAULT_MANIFEST_TIMEOUT_MS
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(manifestUrl, {
      headers: {
        Accept: 'application/expo+json,application/json',
        'Expo-Platform': 'ios',
        'Expo-Protocol-Version': '1'
      },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Metro manifest request returned HTTP ${response.status}.`);
    }

    let manifest;
    try {
      manifest = await response.json();
    } catch {
      throw new Error('Metro manifest response was not valid JSON.');
    }

    return assertGuidanceMetroIdentity(readGuidanceMetroIdentity(manifest), {
      expectedApiUrl,
      expectedConnectivityContractEnabled,
      expectedProjectRoot,
      expectedSlug,
      expectedSourceRevision,
      expectedStorageFaultContractEnabled
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Metro manifest did not respond within ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizePath(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function assertIdentityField(condition, label, expected, actual) {
  if (condition) {
    return;
  }
  throw new Error(
    `Guidance contract Metro ${label} mismatch: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`
  );
}
