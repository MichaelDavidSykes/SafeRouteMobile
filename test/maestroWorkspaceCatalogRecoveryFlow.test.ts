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
  'maestro/ios-workspace-catalog-recovery-journey-prepare.yaml',
  'maestro/ios-workspace-catalog-recovery-background.yaml',
  'maestro/ios-workspace-catalog-recovery-start-gate-checking.yaml',
  'maestro/ios-workspace-catalog-recovery-start-gate-ready.yaml',
  'maestro/ios-workspace-catalog-recovery-journey-start.yaml',
  'maestro/ios-workspace-catalog-recovery-journey-foreground-checking.yaml',
  'maestro/ios-workspace-catalog-recovery-journey-off-route.yaml',
  'maestro/ios-workspace-catalog-recovery-foreground-loss.yaml',
  'maestro/ios-workspace-catalog-recovery-journey-restore-failure.yaml',
  'maestro/ios-workspace-catalog-recovery-journey-restore-end-checking.yaml',
  'maestro/ios-workspace-catalog-recovery-journey-restore-end-outcome.yaml',
  'maestro/ios-workspace-catalog-recovery-journey-restore-reload.yaml',
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
    assert.match(
      packageJson,
      /"start:maestro:ios:workspace-catalog-recovery": "[^"]*SAFEROUTE_ENABLE_GUIDANCE_CONTRACT_EVIDENCE=true/,
    );
    assert.doesNotMatch(
      packageJson,
      /workspace-catalog-recovery[^\n]*(?:npm run build|expo export|eas build|xcodebuild)/i,
    );
    assert.match(
      reset,
      /id: "guest-map-primary-action"\n    retryTapIfNoChange: true\n    waitToSettleTimeoutMs: 1000\n- waitForAnimationToEnd:[\s\S]*id: "route-list-sign-out"\n- waitForAnimationToEnd:[\s\S]*visible:\n      id: "guest-map-primary-action"/,
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
      'catalogJourneyRoutePrepare',
      'catalogJourneyRouteBackground',
      'catalogJourneyStartGate',
      'catalogJourneyStart',
      'catalogJourneyRestoreFailure',
      'catalogJourneyRestoreEnd',
      'catalogJourneyRestoreReload',
      'catalogJourneyRestart',
      'catalogJourneyBackground',
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
    assert.match(
      seed,
      /safe-route-login-password"[\s\S]*inputText: "guidance-contract-password"\n- pressKey: ENTER/,
    );
    assert.match(
      seed,
      /visible: "Not Now"[\s\S]*text: "Not Now"[\s\S]*retryTapIfNoChange: true[\s\S]*waitForAnimationToEnd:[\s\S]*timeout: 3000[\s\S]*visible: "Not Now"[\s\S]*text: "Not Now"/,
    );
    assert.match(seed, /visible:\n        id: "workspace-access-refresh"[\s\S]*notVisible:\n            id: "workspace-access-refresh"/);
    assert.match(
      seed,
      /id: "guest-map-workspace-selector"[\s\S]*extendedWaitUntil:[\s\S]*id: "guest-map-workspace-66a1b2c3d4e5f60718293a40"[\s\S]*timeout: 10000[\s\S]*id: "guest-map-workspace-66a1b2c3d4e5f60718293a40"[\s\S]*id: "guest-map-primary-action"[\s\S]*id: "safe-route-picker"/,
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
      assert.doesNotMatch(flow, /optional: true/);
      assert.match(flow, /takeScreenshot:/);
    }
    assert.match(saved, /id: "safe-route-card-66b1b2c3d4e5f60718293b40"/);
    assert.match(saved, /id: "guest-map-primary-action"[\s\S]*retryTapIfNoChange: true/);
    assert.match(operations, /id: "safe-route-operations"/);
    assert.match(operations, /id: "guest-map-gate-planned-trips"/);
    assert.match(operations, /id: "safe-route-operations-error-state"/);
    assert.match(operations, /id: "safe-route-operations-sync-warning"/);
  });

  it('proves fresh success persists across Operations, Map, and Saved', () => {
    const success = read(flowPaths[5]);

    assert.match(success, /Checking current workspace access\. Cached workspace remains available for review only\./);
    assert.match(success, /id: "workspace-access-refresh"[\s\S]*retryTapIfNoChange: true/);
    assert.match(success, /notVisible:[\s\S]*id: "workspace-access-refresh"/);
    assert.match(success, /Workspace access verified\./);
    assert.match(success, /id: "safe-route-operations-map-return"/);
    assert.match(success, /Workspace, Guidance Operations/);
    assert.match(success, /id: "guest-map-primary-action"/);
    assert.match(success, /id: "safe-route-card-66b1b2c3d4e5f60718293b40"/);
    assert.equal((success.match(/id: "workspace-access-refresh"/g) || []).length >= 4, true);
  });

  it('gates new Start and preserves the exact journey across held foreground authorization', () => {
    const runner = read('scripts/run-maestro-workspace-catalog-recovery.mjs');
    const journeyPrepare = read('maestro/ios-workspace-catalog-recovery-journey-prepare.yaml');
    const background = read('maestro/ios-workspace-catalog-recovery-background.yaml');
    const startGateChecking = read('maestro/ios-workspace-catalog-recovery-start-gate-checking.yaml');
    const startGateReady = read('maestro/ios-workspace-catalog-recovery-start-gate-ready.yaml');
    const journeyStart = read('maestro/ios-workspace-catalog-recovery-journey-start.yaml');
    const journeyChecking = read('maestro/ios-workspace-catalog-recovery-journey-foreground-checking.yaml');
    const journeyOffRoute = read('maestro/ios-workspace-catalog-recovery-journey-off-route.yaml');
    const foregroundLoss = read('maestro/ios-workspace-catalog-recovery-foreground-loss.yaml');

    assert.match(runner, /journeyRoutePrepare[\s\S]*journeyRouteBackground[\s\S]*journeyStartGate[\s\S]*journeyStart[\s\S]*journeyBackground[\s\S]*foregroundLoss/);
    assert.match(runner, /catalogReleased: false[\s\S]*waitForHeldCatalogPending[\s\S]*assertHeldCatalogPending[\s\S]*catalogReleased: true[\s\S]*waitForCatalogCompletion/);
    assert.match(runner, /windowRequests\.length === 2[\s\S]*\/api\/v1\/users\/me[\s\S]*catalog\.requestId/);
    assert.match(runner, /assertNoProtectedBackgroundTraffic\(entries, WORKSPACE_CATALOG_RECOVERY_PHASES\.journeyRouteBackground\)/);
    assert.match(runner, /assertNoProtectedBackgroundTraffic\(entries, WORKSPACE_CATALOG_RECOVERY_PHASES\.journeyBackground\)/);
    assert.match(runner, /phase: WORKSPACE_CATALOG_RECOVERY_PHASES\.foregroundLoss[\s\S]*statusCode: 200/);
    assert.match(runner, /Foreground membership loss did not reload Saved for the surviving workspace/);
    assert.match(runner, /assertNoUnsafeForegroundCatalogTraffic\(entries\)/);
    assert.match(journeyPrepare, /safe-route-card-66b1b2c3d4e5f60718293b40[\s\S]*safe-route-live-map[\s\S]*safe-route-primary-action[\s\S]*enabled: true/);
    assert.match(background, /safe-route-live-map[\s\S]*pressKey: HOME/);
    assert.match(startGateChecking, /openLink: exp:\/\/localhost:8081[\s\S]*Start route\. Checking workspace access before starting guidance…[\s\S]*safe-route-primary-action[\s\S]*enabled: false/);
    assert.match(startGateReady, /notVisible: "Checking access"[\s\S]*safe-route-primary-action[\s\S]*enabled: true/);
    assert.match(journeyStart, /safe-route-primary-action[\s\S]*safe-route-stop-action[\s\S]*Resume route guidance[\s\S]*safe-route-remaining-metrics[\s\S]*safe-route-journey-66b1b2c3d4e5f60718293b40/);
    assert.match(journeyChecking, /Checking current workspace access\. Guidance remains available while workspace risk and rerouting updates wait\./);
    assert.match(journeyChecking, /Resume route guidance[\s\S]*safe-route-stop-action[\s\S]*safe-route-journey-66b1b2c3d4e5f60718293b40[\s\S]*Pause route guidance/);
    assert.match(journeyOffRoute, /setLocation:[\s\S]*latitude: 51\.5300[\s\S]*longitude: -0\.0900[\s\S]*latitude: 51\.5303[\s\S]*longitude: -0\.0903[\s\S]*extendedWaitUntil:[\s\S]*safe-route-guidance-off-route/);
    assert.equal(
      (journeyOffRoute.match(/runScript: scripts\/wait-for-live-location-evidence\.js/g) || []).length,
      3,
    );
    const locationEvidenceWait = read('maestro/scripts/wait-for-live-location-evidence.js');
    assert.match(locationEvidenceWait, /requiredWaitMs = 2100/);
    assert.match(locationEvidenceWait, /Date\.now\(\) - waitStartedAtMs < requiredWaitMs/);
    assert.match(journeyOffRoute, /safe-route-live-map[\s\S]*Pause route guidance[\s\S]*safe-route-guidance-off-route[\s\S]*Off route\. Current instruction\.\*[\s\S]*safe-route-stop-action[\s\S]*safe-route-journey-66b1b2c3d4e5f60718293b40/);
    assert.match(foregroundLoss, /Active guidance ended because this workspace is no longer available\./);
    for (const id of ['safe-route-live-map', 'safe-route-resume-action', 'safe-route-suspended-navigation', 'safe-route-stop-action', 'safe-route-remaining-metrics']) {
      assert.match(foregroundLoss, new RegExp(`assertNotVisible:[\\s\\S]{0,60}${id}`));
    }
    assert.match(runner, /protectedRequestsDuringCatalog[\s\S]*entry\.sequence > catalogRequest\.sequence[\s\S]*entry\.sequence < catalogCompletion\.sequence[\s\S]*length === 0/);
    assert.doesNotMatch(
      runner.match(/const protectedRequestsDuringCatalog[\s\S]*?\n  \);/)?.[0] || '',
      /mobile\/safe-route\/routes/,
    );
    assert.doesNotMatch(background, /GUIDANCE_CONTRACT_MODES|openLink:/);
    assert.match(foregroundLoss, /Workspace, Support Operations/);
    assert.match(foregroundLoss, /guest-map-primary-action"[\s\S]*retryTapIfNoChange: true/);
    assert.match(
      foregroundLoss,
      /when:\n      visible:\n        id: "guest-map-primary-action"[\s\S]*commands:\n      - tapOn:\n          id: "guest-map-primary-action"/,
    );
    assert.match(foregroundLoss, /safe-route-card-66b1b2c3d4e5f60718293b41/);
    assert.match(foregroundLoss, /assertNotVisible:[\s\S]*safe-route-card-66b1b2c3d4e5f60718293b40/);
  });

  it('keeps an explicitly ended suspended journey closed after held retry authorization', () => {
    const runner = read('scripts/run-maestro-workspace-catalog-recovery.mjs');
    const fixture = read('scripts/maestro-guidance-contract-api.mjs');
    const restoreFailure = read('maestro/ios-workspace-catalog-recovery-journey-restore-failure.yaml');
    const restoreEndChecking = read('maestro/ios-workspace-catalog-recovery-journey-restore-end-checking.yaml');
    const restoreEndOutcome = read('maestro/ios-workspace-catalog-recovery-journey-restore-end-outcome.yaml');
    const restoreReload = read('maestro/ios-workspace-catalog-recovery-journey-restore-reload.yaml');

    assert.match(
      runner,
      /journeyStart,[\s\S]*journeyRestoreFailure,[\s\S]*runRestoreEndHeldCatalogPhase[\s\S]*journeyRestoreReload,[\s\S]*journeyRestart,[\s\S]*journeyBackground/,
    );
    assert.match(
      runner,
      /catalogOutcome: 'catalog-restore-unavailable'[\s\S]*phase: WORKSPACE_CATALOG_RECOVERY_PHASES\.journeyRestoreFailure[\s\S]*statusCode: 503/,
    );
    assert.match(
      runner,
      /phase: WORKSPACE_CATALOG_RECOVERY_PHASES\.journeyRestoreEnd[\s\S]*statusCode: 200/,
    );
    assert.match(
      runner,
      /assertHeldAuthorizationWindow\(entries, WORKSPACE_CATALOG_RECOVERY_PHASES\.journeyRestoreEnd\)/,
    );
    assert.match(
      runner,
      /runRestoreEndHeldCatalogPhase\(\)[\s\S]*catalogReleased: false[\s\S]*journeyRestoreEndChecking[\s\S]*waitForHeldCatalogPending\(phase\)[\s\S]*waitForRestoreEndCleanupEvidence\(phase\)[\s\S]*assertHeldCatalogPending[\s\S]*catalogReleased: true[\s\S]*waitForCatalogCompletion\(phase\)[\s\S]*assertRestoreEndEvidenceWindow/,
    );
    assert.match(
      runner,
      /cleanupEntries\.length === 1[\s\S]*receivedAtMs >= catalog\.timestampMs[\s\S]*receivedAtMs <= catalogCompletion\.timestampMs/,
    );
    assert.match(
      fixture,
      /'navigation\.cleanup\.settled': new Set\(\[[\s\S]*'catalogJourneyRestoreEnd'/,
    );
    assert.match(runner, /assertRestoreEndSettledWithoutTraffic\(entries\)/);
    assert.match(runner, /assertEndedJourneyReloadTraffic\(entries\)/);
    assert.match(
      runner,
      /expectedOutcome = request\.path === '\/api\/v1\/mobile\/safe-route\/routes'[\s\S]*'catalog-active'[\s\S]*'route-detail-active'[\s\S]*completion\.semanticOutcome === expectedOutcome/,
    );
    assert.match(
      runner,
      /viewportRiskRequests = requests\.filter[\s\S]*\/api\/v1\/intel\/map\/area-risk[\s\S]*GUIDANCE_CONTRACT_WORKSPACES\.denied\.id[\s\S]*requests\.length === reloadRequests\.length \+ viewportRiskRequests\.length[\s\S]*completion\.semanticOutcome === 'api-success'/,
    );
    assert.match(
      restoreFailure,
      /stopApp[\s\S]*safe-route-suspended-navigation[\s\S]*Guidance paused\. Cold restart verification v1\.[\s\S]*safe-route-suspended-navigation-retry[\s\S]*enabled: true[\s\S]*safe-route-suspended-navigation-end/,
    );
    assert.match(
      restoreEndChecking,
      /safe-route-suspended-navigation-retry[\s\S]*Restoring route[\s\S]*safe-route-suspended-navigation-end[\s\S]*workspace-catalog-journey-end-requested-during-held-retry/,
    );
    assert.doesNotMatch(restoreEndChecking, /safe-route-suspended-navigation-end"\n    enabled: true/);
    assert.doesNotMatch(restoreEndChecking, /Suspended route ended\./);
    for (const id of [
      'safe-route-suspended-navigation',
      'safe-route-live-map',
      'safe-route-resume-action',
      'safe-route-stop-action',
      'safe-route-remaining-metrics',
    ]) {
      assert.match(
        restoreEndOutcome,
        new RegExp(`assertNotVisible:[\\s\\S]{0,60}${id}`),
      );
    }
    assert.match(
      restoreEndOutcome,
      /workspace-access-refresh[\s\S]*guest-map-workspace-selector[\s\S]*enabled: true[\s\S]*Suspended route ended\./,
    );
    assert.doesNotMatch(restoreEndOutcome, /safe-route-card-66b1b2c3d4e5f60718293b40/);
    assert.match(
      restoreReload,
      /Workspace, Guidance Operations[\s\S]*safe-route-card-66b1b2c3d4e5f60718293b40[\s\S]*safe-route-live-map[\s\S]*safe-route-primary-action[\s\S]*enabled: true/,
    );
  });

  it('keeps every focused flow as a valid Expo Go Maestro document', () => {
    for (const path of flowPaths) {
      const flow = read(path);
      assert.match(flow, /^appId: host\.exp\.Exponent\n---\n/);
      assert.doesNotMatch(flow, /SAFEROUTE_ENABLE_PREVIEW_MODE=true/);
    }
  });
});
