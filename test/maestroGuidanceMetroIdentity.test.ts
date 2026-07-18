import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';

type MetroIdentity = {
  apiUrl: string;
  connectivityContractEnabled: boolean;
  demoDriveEnabled: boolean;
  previewModeEnabled: boolean;
  projectRoot: string;
  slug: string;
  sourceRevision: string;
};

type MetroIdentityModule = {
  assertGuidanceMetroIdentity: (
    identity: MetroIdentity,
    expected: Record<string, string | boolean>,
  ) => MetroIdentity;
  assertGuidanceSourceCheckoutClean: (statusOutput: string) => void;
  readGuidanceMetroIdentity: (manifest: unknown) => MetroIdentity;
  verifyGuidanceContractMetroIdentity: (options: Record<string, unknown>) => Promise<MetroIdentity>;
};

const REVISION = 'abcdef0123456789abcdef0123456789abcdef01';
const EXPECTED = {
  expectedApiUrl: 'http://127.0.0.1:18080',
  expectedProjectRoot: '/workspace/SafeRouteMobile',
  expectedSlug: 'saferoute-mobile',
  expectedSourceRevision: REVISION,
};

const manifest = () => ({
  extra: {
    expoClient: {
      extra: {
        safeRouteApiUrl: EXPECTED.expectedApiUrl,
        safeRouteConnectivityContractEnabled: false,
        safeRouteDemoDriveEnabled: false,
        safeRoutePreviewModeEnabled: false,
        safeRouteSourceRevision: REVISION.toUpperCase(),
      },
      slug: EXPECTED.expectedSlug,
    },
    expoGo: {
      developer: { projectRoot: `${EXPECTED.expectedProjectRoot}/` },
    },
  },
});

async function loadModule(): Promise<MetroIdentityModule> {
  return import(
    pathToFileURL(join(process.cwd(), 'scripts/maestro-guidance-metro-identity.mjs')).href
  ) as Promise<MetroIdentityModule>;
}

describe('guidance-contract Metro identity', () => {
  it('reads and accepts the exact SafeRoute project, revision, and contract runtime', async () => {
    const { assertGuidanceMetroIdentity, readGuidanceMetroIdentity } = await loadModule();
    const identity = readGuidanceMetroIdentity(manifest());

    assert.deepEqual(assertGuidanceMetroIdentity(identity, EXPECTED), {
      apiUrl: EXPECTED.expectedApiUrl,
      connectivityContractEnabled: false,
      demoDriveEnabled: false,
      previewModeEnabled: false,
      projectRoot: EXPECTED.expectedProjectRoot,
      slug: EXPECTED.expectedSlug,
      sourceRevision: REVISION,
    });
  });

  it('fails closed for stale projects, revisions, APIs, or fixture flags', async () => {
    const { assertGuidanceMetroIdentity, readGuidanceMetroIdentity } = await loadModule();
    const valid = readGuidanceMetroIdentity(manifest());
    const mismatches = [
      [{ ...valid, slug: 'another-app' }, /app slug mismatch/],
      [{ ...valid, projectRoot: '/workspace/old-checkout' }, /project root mismatch/],
      [{ ...valid, sourceRevision: '0'.repeat(40) }, /source revision mismatch/],
      [{ ...valid, apiUrl: 'https://api.lunarchain.net' }, /API URL mismatch/],
      [{ ...valid, previewModeEnabled: true }, /preview-mode flag mismatch/],
      [{ ...valid, demoDriveEnabled: true }, /demo-drive flag mismatch/],
    ] as const;

    for (const [identity, pattern] of mismatches) {
      assert.throws(() => assertGuidanceMetroIdentity(identity, EXPECTED), pattern);
    }
    assert.throws(
      () =>
        assertGuidanceMetroIdentity(valid, {
          ...EXPECTED,
          expectedConnectivityContractEnabled: true,
        }),
      /connectivity-contract flag mismatch/,
    );
  });

  it('refuses to advertise a Git revision for a dirty source checkout', async () => {
    const { assertGuidanceSourceCheckoutClean } = await loadModule();

    assert.doesNotThrow(() => assertGuidanceSourceCheckoutClean(''));
    assert.throws(
      () => assertGuidanceSourceCheckoutClean(' M App.tsx\n?? unexpected.ts\n'),
      /requires a clean Git checkout[\s\S]*App\.tsx[\s\S]*unexpected\.ts/
    );
  });

  it('requests the iOS Expo manifest and validates it before returning', async () => {
    const { verifyGuidanceContractMetroIdentity } = await loadModule();
    const requests: Array<{ headers: Record<string, string>; url: string }> = [];
    const identity = await verifyGuidanceContractMetroIdentity({
      ...EXPECTED,
      fetchImpl: async (url: string, options: { headers: Record<string, string> }) => {
        requests.push({ headers: options.headers, url });
        return {
          json: async () => manifest(),
          ok: true,
          status: 200,
        };
      },
      manifestUrl: 'http://127.0.0.1:8081',
      timeoutMs: 100,
    });

    assert.equal(identity.sourceRevision, REVISION);
    assert.deepEqual(requests, [{
      headers: {
        Accept: 'application/expo+json,application/json',
        'Expo-Platform': 'ios',
        'Expo-Protocol-Version': '1',
      },
      url: 'http://127.0.0.1:8081',
    }]);

    await assert.rejects(
      () =>
        verifyGuidanceContractMetroIdentity({
          ...EXPECTED,
          expectedConnectivityContractEnabled: true,
          fetchImpl: async () => ({
            json: async () => manifest(),
            ok: true,
            status: 200,
          }),
          manifestUrl: 'http://127.0.0.1:8081',
          timeoutMs: 100,
        }),
      /connectivity-contract flag mismatch/,
    );
  });

  it('wires the current full Git revision into Metro and checks identity before the API starts', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    const startScript = packageJson.scripts['start:maestro:ios:guidance-contract'];
    const runner = readFileSync('scripts/run-maestro-guidance-contract.mjs', 'utf8');
    const identityCheckIndex = runner.indexOf('await verifyGuidanceContractMetroIdentity');
    const apiStartIndex = runner.indexOf("await startApi('reset')");

    assert.match(startScript, /SAFEROUTE_SOURCE_REVISION=\$\(git rev-parse HEAD\)/);
    assert.match(startScript, /SAFEROUTE_ENABLE_PREVIEW_MODE=false/);
    assert.match(startScript, /SAFEROUTE_ENABLE_DEMO_DRIVE=false/);
    assert.match(startScript, /SAFEROUTE_DEV_API_URL=http:\/\/127\.0\.0\.1:18080/);
    assert.ok(identityCheckIndex >= 0);
    assert.ok(apiStartIndex > identityCheckIndex);
    assert.match(runner, /assertGuidanceSourceCheckoutClean\(readCurrentSourceStatus\(\)\)/);
    assert.match(runner, /'--porcelain=v1', '--untracked-files=all'/);
    assert.match(runner, /execFileSync\('git', \['rev-parse', 'HEAD'\]/);
  });
});
