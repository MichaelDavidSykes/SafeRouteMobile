import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

const flowPaths = [
  'maestro/ios-workspace-catalog-recovery-seed.yaml',
  'maestro/ios-workspace-catalog-recovery-cold-failure.yaml',
  'maestro/ios-workspace-catalog-recovery-map-retry.yaml',
  'maestro/ios-workspace-catalog-recovery-saved-retry.yaml',
  'maestro/ios-workspace-catalog-recovery-operations-retry.yaml',
  'maestro/ios-workspace-catalog-recovery-success.yaml',
  'maestro/ios-workspace-catalog-recovery-background.yaml',
  'maestro/ios-workspace-catalog-recovery-foreground-loss.yaml',
];

describe('Maestro workspace catalog recovery runtime', () => {
  it('binds a clean exact source to a compact large-text simulator', () => {
    const runner = read('scripts/run-maestro-workspace-catalog-recovery.mjs');
    const packageJson = read('package.json');
    const reset = read('maestro/ios-guidance-contract-reset.yaml');

    assert.match(runner, /assertGuidanceSourceCheckoutClean\(readCurrentSourceStatus\(\)\)/);
    assert.match(runner, /verifyGuidanceContractMetroIdentity\(/);
    assert.match(runner, /iPhone-SE-3rd-generation/);
    assert.match(runner, /REQUIRED_CONTENT_SIZE = 'accessibility-large'/);
    assert.match(runner, /simctl', 'privacy', udid, 'grant', 'location', EXPO_GO_BUNDLE_ID/);
    assert.match(runner, /--udid=\$\{deviceId\}/);
    assert.match(runner, /MAESTRO_RETRIES: '0'/);
    assert.match(
      packageJson,
      /"test:maestro:ios:workspace-catalog-recovery": "node scripts\/run-maestro-workspace-catalog-recovery\.mjs"/,
    );
    assert.doesNotMatch(
      packageJson,
      /workspace-catalog-recovery[^\n]*(?:npm run build|expo export|eas build|xcodebuild)/i,
    );
    assert.match(
      reset,
      /id: "guest-map-primary-action"\n- waitForAnimationToEnd:[\s\S]*id: "route-list-sign-out"\n- waitForAnimationToEnd:[\s\S]*visible:\n      id: "guest-map-primary-action"/,
    );
  });

  it('runs cold failure, three duplicate-suppressed retries, and one fresh success', () => {
    const runner = read('scripts/run-maestro-workspace-catalog-recovery.mjs');
    const fixture = read('scripts/maestro-guidance-contract-api.mjs');
    const seed = read(flowPaths[0]);

    for (const phase of [
      'catalogSeed',
      'catalogInitialFailure',
      'catalogMapRetryFailure',
      'catalogSavedRetryFailure',
      'catalogOperationsRetryFailure',
      'catalogFreshSuccess',
      'catalogForegroundLoss',
    ]) {
      assert.match(fixture, new RegExp(phase));
    }
    assert.match(
      runner,
      /mapRetryFailure,[\s\S]*savedRetryFailure,[\s\S]*operationsRetryFailure[\s\S]*expectedAttemptCount: 1/,
    );
    assert.match(runner, /expectedUserCountBeforeCatalog: 2[\s\S]*phase: WORKSPACE_CATALOG_RECOVERY_PHASES\.initialFailure/);
    assert.match(runner, /principal-before-catalog ordering/);
    assert.match(runner, /catalog-retry-unavailable/);
    assert.match(runner, /catalog-initial-unavailable/);
    assert.match(runner, /catalog-active/);
    assert.match(runner, /durationMs >= minimumCatalogDurationMs/);
    assert.match(runner, /Saved and Operations did not retain scoped route reads during retry/);
    assert.match(runner, /Operations did not load its active cached workspace during retry/);
    assert.match(runner, /assertSuccessfulProtectedRequests\(entries, scopedRouteRequests, 'catalog-active'\)/);
    assert.match(runner, /assertSuccessfulProtectedRequests\(entries, operationsRequests, 'operations-active'\)/);
    assert.match(runner, /request\.authorizationClass === 'expected-bearer'/);
    assert.match(seed, /inputText: "guidance-contract-password"\n- hideKeyboard\n- tapOn:\n    id: "safe-route-login-primary-action"/);
    assert.match(seed, /visible:\n        id: "workspace-access-refresh"[\s\S]*notVisible:\n            id: "workspace-access-refresh"/);
    assert.match(
      seed,
      /id: "guest-map-workspace-selector"[\s\S]*id: "guest-map-workspace-66a1b2c3d4e5f60718293a40"[\s\S]*id: "guest-map-primary-action"[\s\S]*id: "safe-route-picker"/,
    );
  });

  it('keeps the same accessible busy and repeated-failure control on every surface', () => {
    const map = read(flowPaths[2]);
    const saved = read(flowPaths[3]);
    const operations = read(flowPaths[4]);

    for (const flow of [map, saved, operations]) {
      assert.match(flow, /id: "workspace-access-refresh"[\s\S]*enabled: true/);
      assert.match(flow, /id: "workspace-access-refresh"[\s\S]*enabled: false/);
      assert.match(flow, /Checking current workspace access\. Cached workspace remains available for review only\./);
      assert.match(flow, /Workspace access not verified\. Try checking current access again\./);
      assert.match(flow, /optional: true/);
      assert.match(flow, /takeScreenshot:/);
    }
    assert.match(saved, /id: "safe-route-card-66b1b2c3d4e5f60718293b40"/);
    assert.match(operations, /id: "safe-route-operations"/);
    assert.match(operations, /id: "guest-map-gate-planned-trips"/);
    assert.match(operations, /id: "safe-route-operations-error-state"/);
    assert.match(operations, /id: "safe-route-operations-sync-warning"/);
  });

  it('proves fresh success persists across Operations, Map, and Saved', () => {
    const success = read(flowPaths[5]);

    assert.match(success, /Checking current workspace access\. Cached workspace remains available for review only\./);
    assert.match(success, /notVisible:[\s\S]*id: "workspace-access-refresh"/);
    assert.match(success, /Workspace access verified\./);
    assert.match(success, /id: "safe-route-operations-map-return"/);
    assert.match(success, /Workspace, Guidance Operations/);
    assert.match(success, /id: "guest-map-primary-action"/);
    assert.match(success, /id: "safe-route-card-66b1b2c3d4e5f60718293b40"/);
    assert.equal((success.match(/id: "workspace-access-refresh"/g) || []).length >= 4, true);
  });

  it('revalidates and closes lost workspace data after a real background epoch', () => {
    const runner = read('scripts/run-maestro-workspace-catalog-recovery.mjs');
    const background = read(flowPaths[6]);
    const foregroundLoss = read(flowPaths[7]);

    assert.match(runner, /foregroundBackground,[\s\S]*GUIDANCE_CONTRACT_MODES\.active[\s\S]*foregroundLoss,[\s\S]*GUIDANCE_CONTRACT_MODES\.denied/);
    assert.match(runner, /phase: WORKSPACE_CATALOG_RECOVERY_PHASES\.foregroundLoss[\s\S]*statusCode: 200/);
    assert.match(runner, /minimumCatalogDurationMs: WORKSPACE_CATALOG_FOREGROUND_DELAY_MS - 250/);
    assert.match(runner, /Foreground membership loss did not reload Saved for the surviving workspace/);
    assert.match(runner, /assertNoUnsafePostForegroundCatalogTraffic\(entries\)/);
    assert.match(background, /route-list-map-return[\s\S]*pressKey: HOME/);
    assert.doesNotMatch(background, /GUIDANCE_CONTRACT_MODES|openLink:/);
    assert.match(foregroundLoss, /openLink: exp:\/\/localhost:8081[\s\S]*Checking workspace…/);
    assert.match(foregroundLoss, /guest-map-plot-action[\s\S]*enabled: false/);
    assert.match(foregroundLoss, /Workspace access changed\. Unavailable workspace data was removed\./);
    assert.match(foregroundLoss, /Workspace, Support Operations/);
    assert.match(foregroundLoss, /safe-route-card-66b1b2c3d4e5f60718293b41/);
    assert.match(foregroundLoss, /assertNotVisible:[\s\S]*safe-route-card-66b1b2c3d4e5f60718293b40/);
    assert.match(foregroundLoss, /workspace-access-refresh[\s\S]*enabled: true/);
  });

  it('keeps every focused flow as a valid Expo Go Maestro document', () => {
    for (const path of flowPaths) {
      const flow = read(path);
      assert.match(flow, /^appId: host\.exp\.Exponent\n---\n/);
      assert.doesNotMatch(flow, /SAFEROUTE_ENABLE_PREVIEW_MODE=true/);
    }
  });
});
