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
  'maestro/ios-workspace-catalog-recovery-journey-foreground-failure-checking.yaml',
  'maestro/ios-workspace-catalog-recovery-journey-foreground-failure-outcome.yaml',
  'maestro/ios-workspace-catalog-recovery-journey-foreground-failure-end-ready.yaml',
  'maestro/ios-workspace-catalog-recovery-journey-foreground-failure-end.yaml',
  'maestro/ios-workspace-catalog-recovery-journey-ended-relaunch.yaml',
  'maestro/ios-workspace-catalog-recovery-journey-ended-retry-success.yaml',
  'maestro/ios-workspace-catalog-recovery-journey-ended-route-reload.yaml',
  'maestro/ios-workspace-catalog-recovery-journey-ended-restart-checking.yaml',
  'maestro/ios-workspace-catalog-recovery-journey-ended-restart-outcome.yaml',
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
      /"test:maestro:ios:workspace-catalog-recovery:restore-end": "SAFEROUTE_WORKSPACE_RECOVERY_SLICE=restore-end node scripts\/run-maestro-workspace-catalog-recovery\.mjs"/,
    );
    assert.match(
      packageJson,
      /"test:maestro:ios:workspace-catalog-recovery:active-503-end": "SAFEROUTE_WORKSPACE_RECOVERY_SLICE=active-503-end node scripts\/run-maestro-workspace-catalog-recovery\.mjs"/,
    );
    assert.match(
      packageJson,
      /"test:maestro:ios:workspace-catalog-recovery:active-503-restart": "SAFEROUTE_WORKSPACE_RECOVERY_SLICE=active-503-restart node scripts\/run-maestro-workspace-catalog-recovery\.mjs"/,
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
      'catalogJourneyForegroundFailure',
      'catalogJourneyForegroundFailureEnd',
      'catalogJourneyEndedRelaunch',
      'catalogJourneyEndedRetrySuccess',
      'catalogJourneyEndedRouteReload',
      'catalogJourneyEndedRestart',
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
      /safe-route-login"[\s\S]*safe-route-login-primary-action/,
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
      assert.match(flow, /id: "workspace-access-refresh"[\s\S]*retryTapIfNoChange: true/);
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
    assert.match(
      runner,
      /catalogReleased: false[\s\S]*startMaestroFlow[\s\S]*waitForHeldCatalogPending[\s\S]*waitForMaestroScreenshot[\s\S]*assertHeldCatalogPending[\s\S]*catalogReleased: true[\s\S]*Promise\.all\(\[[\s\S]*waitForCatalogCompletion[\s\S]*finishMaestroFlow/,
    );
    assert.match(
      runner,
      /checkingScreenshot: 'workspace-catalog-foreground-start-gated'[\s\S]*checkingScreenshot: 'workspace-catalog-journey-foreground-off-route'/,
    );
    const asyncMaestroRunner = runner.match(
      /function startMaestroFlow[\s\S]*?\n}\n\nasync function finishMaestroFlow/,
    )?.[0] || '';
    assert.match(asyncMaestroRunner, /const child = spawn\([\s\S]*detached: true/);
    assert.match(runner, /stopMaestroFlow[\s\S]*process\.kill\(-run\.child\.pid, signal\)/);
    assert.match(
      runner,
      /waitForHeldCatalogPending\(phase, run\)[\s\S]*if \(run\?\.settled\)[\s\S]*finishMaestroFlow\(run\)/,
    );
    assert.match(
      runner,
      /catalogCompletions\.length > 0[\s\S]*catalog settled before release:[\s\S]*semanticOutcome/,
    );
    assert.match(
      runner,
      /signalMaestroFlow\(run, 'SIGTERM'\)[\s\S]*waitForProcessExit\(run\.child, 3000\)[\s\S]*signalMaestroFlow\(run, 'SIGKILL'\)[\s\S]*waitForProcessExit\(run\.child, 2000\)[\s\S]*did not exit after SIGKILL/,
    );
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
    assert.match(
      journeyChecking,
      /takeScreenshot: "workspace-catalog-journey-foreground-checking"\n- runFlow: ios-workspace-catalog-recovery-journey-off-route\.yaml/,
    );
    assert.doesNotMatch(runner, /whileHeldFlow|flows\.journeyOffRoute/);
    assert.match(
      runner,
      /injectOffRouteLocationEvidence[\s\S]*51\.5300, -0\.0900[\s\S]*51\.5303, -0\.0903[\s\S]*'simctl', 'location', deviceId, 'set'[\s\S]*setTimeout\(resolve, 2100\)/,
    );
    assert.match(
      runner,
      /waitForHeldCatalogPending\(phase, checkingRun\)[\s\S]*Promise\.all\(\[[\s\S]*waitForMaestroScreenshot[\s\S]*whileHeld \? whileHeld\(\)[\s\S]*assertHeldCatalogPending[\s\S]*catalogReleased: true/,
    );
    assert.doesNotMatch(journeyOffRoute, /setLocation:|runScript:/);
    assert.match(journeyOffRoute, /extendedWaitUntil:[\s\S]*safe-route-guidance-off-route/);
    assert.match(journeyOffRoute, /safe-route-live-map[\s\S]*Pause route guidance[\s\S]*safe-route-guidance-off-route[\s\S]*Off route\. Current instruction\.\*[\s\S]*safe-route-stop-action[\s\S]*safe-route-journey-66b1b2c3d4e5f60718293b40/);
    assert.match(foregroundLoss, /Workspace access changed\. Check for restored access\./);
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
    assert.doesNotMatch(
      foregroundLoss,
      /when:\n      visible:\n        id: "guest-map-primary-action"[\s\S]*commands:\n      - tapOn:\n          id: "guest-map-primary-action"/,
    );
    assert.match(foregroundLoss, /safe-route-card-66b1b2c3d4e5f60718293b41/);
    assert.match(foregroundLoss, /assertNotVisible:[\s\S]*safe-route-card-66b1b2c3d4e5f60718293b40/);
    assert.match(
      runner,
      /assertFullRecoveryEvidence[\s\S]*assertGuidanceContractRequestJournal[\s\S]*assertRecoveryJournal[\s\S]*assertGuidanceContractEvidenceJournal[\s\S]*assertForegroundLossLifecycleEvidence/,
    );
    assert.match(
      runner,
      /journeyRestart[\s\S]*navigation\.persisted[\s\S]*foregroundLoss[\s\S]*navigation\.cleanup\.settled[\s\S]*tracking\.stop\.settled[\s\S]*workspace\.recovery\.settled/,
    );
    assert.match(
      runner,
      /fresh-authorized[\s\S]*activeNavigation === 'present'[\s\S]*not-checked[\s\S]*activeNavigation === 'revoked'[\s\S]*persistedPermit === 'revoked'[\s\S]*nativeTracking[\s\S]*runtimePermit === 'none'[\s\S]*fresh-denied[\s\S]*routeCache === 'purged'[\s\S]*workspaceContext === 'persisted'[\s\S]*Foreground omission did not durably correlate/,
    );
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
      /runRestoreEndHeldCatalogPhase\(\)[\s\S]*catalogReleased: false[\s\S]*startMaestroFlow[\s\S]*journeyRestoreEndChecking[\s\S]*waitForHeldCatalogPending\(phase, checkingRun\)[\s\S]*Promise\.all\(\[[\s\S]*waitForMaestroScreenshot[\s\S]*waitForNavigationCleanupEvidence\(phase\)[\s\S]*assertHeldCatalogPending[\s\S]*catalogReleased: true[\s\S]*Promise\.all\(\[[\s\S]*waitForCatalogCompletion\(phase\)[\s\S]*finishMaestroFlow[\s\S]*assertRestoreEndEvidenceWindow/,
    );
    assert.match(
      runner,
      /restoreEndSliceOnly = requestedSlice === 'restore-end'[\s\S]*if \(!restoreEndSliceOnly\) \{[\s\S]*journeyRouteBackground[\s\S]*journeyStartGate[\s\S]*runRestoreEndHeldCatalogPhase\(\)[\s\S]*if \(restoreEndSliceOnly\) \{[\s\S]*assertRestoreEndSliceJournal/,
    );
    assert.match(
      runner,
      /assertRestoreEndSliceJournal[\s\S]*journeyStart[\s\S]*catalog-restore-unavailable[\s\S]*journeyRestoreFailure[\s\S]*journeyRestoreEnd[\s\S]*assertHeldAuthorizationWindow[\s\S]*assertRestoreEndSettledWithoutTraffic/,
    );
    assert.match(
      runner,
      /cleanupEntries\.length === 1[\s\S]*receivedAtMs >= catalog\.timestampMs[\s\S]*receivedAtMs <= catalogCompletion\.timestampMs/,
    );
    assert.match(
      fixture,
      /'navigation\.cleanup\.settled': new Set\(\[[\s\S]*'catalogJourneyRestoreEnd'/,
    );
    assert.match(
      fixture,
      /'navigation\.persisted': new Set\(\[[\s\S]*'catalogJourneyStart'/,
    );
    assert.match(
      fixture,
      /'restore\.suspended': new Set\(\[[\s\S]*'catalogJourneyRestoreFailure'/,
    );
    assert.match(
      fixture,
      /'navigation\.persisted': new Set\(\[[\s\S]*'catalogJourneyRestart'/,
    );
    for (const type of [
      'workspace\\.recovery\\.settled',
      'navigation\\.cleanup\\.settled',
      'tracking\\.stop\\.settled',
    ]) {
      assert.match(fixture, new RegExp(`'${type}': new Set\\(\\[[\\s\\S]*'catalogForegroundLoss'`));
    }
    assert.match(
      runner,
      /waitForNavigationCleanupEvidence[\s\S]*navigation\.cleanup\.settled[\s\S]*tracking\.stop\.settled[\s\S]*cleanup\?\.navigationInstanceId[\s\S]*cleanup\?\.appLaunchId/,
    );
    assert.match(
      runner,
      /entry\.routeId === GUIDANCE_CONTRACT_ROUTE_VARIANT_IDS\.deniedV1/,
    );
    assert.match(
      runner,
      /persisted\.receivedAtMs < suspended\.receivedAtMs[\s\S]*suspended\.receivedAtMs < cleanup\.receivedAtMs[\s\S]*cleanup\.receivedAtMs <= tracking\.receivedAtMs/,
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
      /Workspace, Guidance Operations[\s\S]*safe-route-card-66b1b2c3d4e5f60718293b40[\s\S]*setLocation:[\s\S]*latitude: 51\.5075[\s\S]*longitude: -0\.1277[\s\S]*safe-route-live-map[\s\S]*safe-route-primary-action[\s\S]*enabled: true[\s\S]*timeout: 15000/,
    );
  });

  it('keeps exact active guidance local when foreground authorization returns 503', () => {
    const runner = read('scripts/run-maestro-workspace-catalog-recovery.mjs');
    const fixture = read('scripts/maestro-guidance-contract-api.mjs');
    const checking = read(
      'maestro/ios-workspace-catalog-recovery-journey-foreground-failure-checking.yaml',
    );
    const outcome = read(
      'maestro/ios-workspace-catalog-recovery-journey-foreground-failure-outcome.yaml',
    );

    assert.match(
      runner,
      /journeyRestart[\s\S]*journeyBackground[\s\S]*journeyForegroundFailure[\s\S]*foregroundLoss/,
    );
    assert.match(
      runner,
      /expectedCatalogOutcome: 'catalog-foreground-unavailable'[\s\S]*expectedCatalogStatusCode: 503[\s\S]*phase: WORKSPACE_CATALOG_RECOVERY_PHASES\.journeyForegroundFailure/,
    );
    assert.match(
      runner,
      /waitForCatalogCompletion\(phase, \{[\s\S]*semanticOutcome: expectedCatalogOutcome[\s\S]*statusCode: expectedCatalogStatusCode/,
    );
    assert.match(
      runner,
      /catalogOutcome: 'catalog-foreground-unavailable'[\s\S]*phase: WORKSPACE_CATALOG_RECOVERY_PHASES\.journeyForegroundFailure[\s\S]*statusCode: 503/,
    );
    assert.match(
      runner,
      /assertActiveGuidanceFailureTraffic[\s\S]*requests\.length === 2[\s\S]*catalogCompletion\.statusCode === 503[\s\S]*catalog-foreground-unavailable/,
    );
    assert.match(
      runner,
      /assertActiveGuidanceFailureEvidence[\s\S]*journeyRestart[\s\S]*navigation\.persisted[\s\S]*fresh-authorized[\s\S]*navigation\.cleanup\.settled[\s\S]*restore\.suspended[\s\S]*tracking\.stop\.settled[\s\S]*workspace\.recovery\.settled[\s\S]*entry\.authorization\?\.catalog === 'fresh-authorized'[\s\S]*Transient active-guidance catalog failure emitted destructive or falsely fresh evidence/,
    );
    assert.match(
      fixture,
      /journeyForegroundFailure: 'catalogJourneyForegroundFailure'[\s\S]*foregroundFailure[\s\S]*waitForWorkspaceCatalogRelease[\s\S]*catalog-foreground-unavailable/,
    );
    assert.match(
      checking,
      /Checking access[\s\S]*Guidance remains available while workspace risk and rerouting updates wait\.[\s\S]*Resume route guidance[\s\S]*safe-route-stop-action[\s\S]*enabled: true[\s\S]*safe-route-remaining-metrics[\s\S]*safe-route-journey-66b1b2c3d4e5f60718293b40/,
    );
    assert.match(
      outcome,
      /Updates paused[\s\S]*Workspace access could not be verified\. Guidance remains available, but workspace risk and rerouting updates are paused\.[\s\S]*Resume route guidance[\s\S]*safe-route-stop-action[\s\S]*enabled: true[\s\S]*safe-route-remaining-metrics[\s\S]*Pause route guidance[\s\S]*Resume route guidance[\s\S]*pressKey: HOME/,
    );
    assert.equal((outcome.match(/Updates paused/g) || []).length, 2);
    assert.equal(
      (
        outcome.match(
          /Access status\. Workspace access could not be verified\. Guidance remains available, but workspace risk and rerouting updates are paused\./g,
        ) || []
      ).length,
      2,
    );
  });

  it('ends post-503 active guidance durably and cold-reads it as absent', () => {
    const runner = read('scripts/run-maestro-workspace-catalog-recovery.mjs');
    const fixture = read('scripts/maestro-guidance-contract-api.mjs');
    const ready = read(
      'maestro/ios-workspace-catalog-recovery-journey-foreground-failure-end-ready.yaml',
    );
    const end = read(
      'maestro/ios-workspace-catalog-recovery-journey-foreground-failure-end.yaml',
    );
    const relaunch = read(
      'maestro/ios-workspace-catalog-recovery-journey-ended-relaunch.yaml',
    );

    assert.match(
      runner,
      /active503EndSliceOnly = requestedSlice === 'active-503-end'[\s\S]*journeyForegroundFailureEndReady[\s\S]*journeyForegroundFailureEnd[\s\S]*waitForNavigationCleanupEvidence[\s\S]*journeyEndedRelaunch[\s\S]*waitForNavigationAbsenceEvidence[\s\S]*assertActive503EndSliceJournal/,
    );
    assert.match(
      runner,
      /assertNoProtectedBackgroundTraffic\([\s\S]*journeyForegroundFailureEnd[\s\S]*catalog-ended-relaunch-unavailable[\s\S]*expectedUserCountBeforeCatalog: 2[\s\S]*journeyEndedRelaunch[\s\S]*statusCode: 503/,
    );
    assert.match(
      runner,
      /persisted\.length === 1[\s\S]*cleanup\.length === 1[\s\S]*tracking\.length === 1[\s\S]*absence\.length === 1[\s\S]*absence\[0\]\.appLaunchId !== cleanup\[0\]\.appLaunchId/,
    );
    assert.match(
      runner,
      /forbiddenTypes[\s\S]*navigation\.persisted[\s\S]*restore\.ready[\s\S]*restore\.suspended[\s\S]*workspace\.recovery\.settled[\s\S]*activeNavigation === 'present'[\s\S]*nativeTracking === 'active'/,
    );
    assert.match(
      fixture,
      /journeyForegroundFailureEnd: 'catalogJourneyForegroundFailureEnd'[\s\S]*journeyEndedRelaunch: 'catalogJourneyEndedRelaunch'/,
    );
    assert.match(
      fixture,
      /endedJourneyRelaunchFailure[\s\S]*catalog-ended-relaunch-unavailable/,
    );
    assert.match(
      fixture,
      /'navigation\.absence\.readback'[\s\S]*catalogJourneyEndedRelaunch[\s\S]*activeNavigation === 'absent'[\s\S]*runtimePermit === 'none'/,
    );
    assert.match(
      ready,
      /Updates paused[\s\S]*Resume route guidance[\s\S]*safe-route-stop-action[\s\S]*enabled: true[\s\S]*safe-route-remaining-metrics[\s\S]*safe-route-journey-66b1b2c3d4e5f60718293b40[\s\S]*Pause route guidance[\s\S]*Resume route guidance/,
    );
    assert.doesNotMatch(ready, /pressKey: HOME|safe-route-stop-action"\n    waitToSettle/);
    assert.match(
      end,
      /safe-route-stop-action[\s\S]*waitToSettleTimeoutMs: 100[\s\S]*workspace-access-refresh[\s\S]*safe-route-navigation-cleanup[\s\S]*Workspace access not verified\. Try checking current access again\./,
    );
    for (const id of [
      'safe-route-live-map',
      'safe-route-resume-action',
      'safe-route-suspended-navigation',
      'safe-route-stop-action',
      'safe-route-remaining-metrics',
      'safe-route-journey-66b1b2c3d4e5f60718293b40',
    ]) {
      assert.match(end, new RegExp(`assertNotVisible:[\\s\\S]{0,60}${id}`));
      assert.match(relaunch, new RegExp(`assertNotVisible:[\\s\\S]{0,60}${id}`));
    }
    assert.match(
      relaunch,
      /stopApp[\s\S]*subflows\/ios-open-expo-project\.yaml[\s\S]*workspace-access-refresh[\s\S]*Workspace, Guidance Operations[\s\S]*Workspace access not verified\. Try checking current access again\./,
    );
  });

  it('recovers explicitly after End and starts the same route with a new journey identity', () => {
    const runner = read('scripts/run-maestro-workspace-catalog-recovery.mjs');
    const fixture = read('scripts/maestro-guidance-contract-api.mjs');
    const retry = read(
      'maestro/ios-workspace-catalog-recovery-journey-ended-retry-success.yaml',
    );
    const reload = read(
      'maestro/ios-workspace-catalog-recovery-journey-ended-route-reload.yaml',
    );
    const checking = read(
      'maestro/ios-workspace-catalog-recovery-journey-ended-restart-checking.yaml',
    );
    const outcome = read(
      'maestro/ios-workspace-catalog-recovery-journey-ended-restart-outcome.yaml',
    );

    assert.match(
      runner,
      /active503RestartSliceOnly = requestedSlice === 'active-503-restart'[\s\S]*active503TerminalSliceOnly[\s\S]*journeyEndedRetrySuccess[\s\S]*journeyEndedRouteReload[\s\S]*journeyEndedRestartChecking[\s\S]*journeyEndedRestartOutcome/,
    );
    assert.match(
      runner,
      /journeyEndedRetrySuccess[\s\S]*journeyEndedRouteReload[\s\S]*runHeldCatalogPhase\([\s\S]*journeyEndedRestart[\s\S]*waitForNavigationPersistedEvidence[\s\S]*assertActive503RestartSliceJournal/,
    );
    assert.match(
      runner,
      /waitForNavigationPrestartEvidence[\s\S]*waitForGuidanceStartTrafficQuiet[\s\S]*runHeldCatalogPhase\([\s\S]*assertGuidanceStartTrafficRemainsQuiet/,
    );
    assert.match(
      runner,
      /resolveHeldMaestroPhaseTimeoutMs[\s\S]*HELD_CATALOG_PENDING_TIMEOUT_MS = resolveHeldMaestroPhaseTimeoutMs\([\s\S]*process\.env\.MAESTRO_DRIVER_STARTUP_TIMEOUT[\s\S]*waitForHeldCatalogPending[\s\S]*Date\.now\(\) \+ HELD_CATALOG_PENDING_TIMEOUT_MS/,
    );
    assert.match(
      runner,
      /journeyEndedRetrySuccess[\s\S]*WORKSPACE_CATALOG_SUCCESS_DELAY_MS - 250[\s\S]*assertPostEndRetryTraffic[\s\S]*journeyEndedRouteReload[\s\S]*journeyEndedRestart/,
    );
    assert.match(
      runner,
      /replacement\[0\]\.navigationInstanceId !== oldPersisted\[0\]\.navigationInstanceId[\s\S]*replacement\[0\]\.appLaunchId === absence\[0\]\.appLaunchId[\s\S]*restartCompletion\.timestampMs <= replacement\[0\]\.receivedAtMs/,
    );
    assert.match(
      runner,
      /navigation\.prestart\.readback[\s\S]*preStartReadback\[0\]\.appLaunchId === absence\[0\]\.appLaunchId[\s\S]*routeReloadDetailCompletion\.timestampMs <= preStartReadback\[0\]\.receivedAtMs[\s\S]*preStartReadback\[0\]\.receivedAtMs < restartCatalog\.timestampMs/,
    );
    assert.match(
      runner,
      /forbiddenPreStartTypes[\s\S]*navigation\.persisted[\s\S]*restore\.ready[\s\S]*restore\.suspended[\s\S]*navigation\.cleanup\.settled[\s\S]*tracking\.stop\.settled/,
    );
    assert.match(
      runner,
      /successorPhases[\s\S]*journeyEndedRestart[\s\S]*\['restore\.ready', 'restore\.suspended'\]/,
    );
    assert.match(
      runner,
      /entry\.receivedAtMs > oldTracking\[0\]\.receivedAtMs[\s\S]*entry\.navigationInstanceId === oldPersisted\[0\]\.navigationInstanceId/,
    );
    assert.match(
      fixture,
      /journeyEndedRetrySuccess: 'catalogJourneyEndedRetrySuccess'[\s\S]*journeyEndedRouteReload: 'catalogJourneyEndedRouteReload'[\s\S]*journeyEndedRestart: 'catalogJourneyEndedRestart'/,
    );
    assert.match(
      fixture,
      /'catalogJourneyEndedRestart'[\s\S]*navigation\.persisted/,
    );
    assert.match(
      fixture,
      /'navigation\.prestart\.readback': new Set\(\['catalogJourneyEndedRouteReload'\]\)/,
    );
    assert.match(
      fixture,
      /journeyEndedRetrySuccess[\s\S]*WORKSPACE_CATALOG_SUCCESS_DELAY_MS[\s\S]*journeyEndedRestart[\s\S]*waitForWorkspaceCatalogRelease/,
    );

    assert.match(
      retry,
      /workspace-access-refresh"[\s\S]*enabled: true[\s\S]*enabled: false[\s\S]*Checking current workspace access\.[\s\S]*Workspace access verified\.[\s\S]*Workspace, Guidance Operations/,
    );
    const retryBusy = retry.slice(
      0,
      retry.indexOf('takeScreenshot: "workspace-catalog-ended-journey-retry-busy"'),
    );
    for (const id of [
      'safe-route-live-map',
      'safe-route-resume-action',
      'safe-route-suspended-navigation',
      'safe-route-stop-action',
      'safe-route-remaining-metrics',
      'safe-route-navigation-cleanup',
    ]) {
      assert.match(retryBusy, new RegExp(`assertNotVisible:[\\s\\S]{0,60}${id}`));
    }
    const retrySuccess = retry.slice(
      retry.indexOf('Workspace access verified.'),
    );
    assert.match(
      retrySuccess,
      /assertNotVisible:[\s\S]{0,60}safe-route-navigation-cleanup/,
    );
    assert.match(
      reload,
      /guest-map-primary-action[\s\S]*safe-route-picker[\s\S]*safe-route-card-66b1b2c3d4e5f60718293b40[\s\S]*setLocation:[\s\S]*safe-route-live-map[\s\S]*safe-route-primary-action[\s\S]*enabled: true[\s\S]*safe-route-stop-action[\s\S]*safe-route-remaining-metrics/,
    );
    assert.doesNotMatch(
      reload,
      /assertNotVisible:[\s\S]{0,80}safe-route-journey-66b1b2c3d4e5f60718293b40/,
    );
    assert.match(
      checking,
      /safe-route-primary-action[\s\S]*Checking workspace access before starting guidance…[\s\S]*enabled: false[\s\S]*safe-route-stop-action[\s\S]*safe-route-remaining-metrics/,
    );
    assert.doesNotMatch(
      checking,
      /assertNotVisible:[\s\S]{0,80}safe-route-journey-66b1b2c3d4e5f60718293b40/,
    );
    assert.match(
      outcome,
      /safe-route-stop-action[\s\S]*safe-route-remaining-metrics[\s\S]*safe-route-journey-66b1b2c3d4e5f60718293b40[\s\S]*Pause route guidance[\s\S]*Resume route guidance/,
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
