import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";

const read = (path: string) => readFileSync(path, "utf8");

describe("Maestro connectivity contract runtime", () => {
  it("bounds a hung phase, stops it, and reports child start errors", async () => {
    const { waitForBoundedMaestroPhase } = (await import(
      pathToFileURL(
        `${process.cwd()}/scripts/maestro-phase-lifecycle.mjs`,
      ).href
    )) as {
      waitForBoundedMaestroPhase: (options: {
        label: string;
        settled: Promise<Record<string, unknown>>;
        stop: () => Promise<void>;
        timeoutMs: number;
      }) => Promise<unknown>;
    };
    let stops = 0;

    await assert.rejects(
      () =>
        waitForBoundedMaestroPhase({
          label: "held checking",
          settled: new Promise(() => undefined),
          stop: async () => {
            stops += 1;
          },
          timeoutMs: 5,
        }),
      /exceeded 5ms and was stopped/,
    );
    assert.equal(stops, 1);
    await assert.rejects(
      () =>
        waitForBoundedMaestroPhase({
          label: "spawn failure",
          settled: Promise.resolve({ error: new Error("missing executable") }),
          stop: async () => undefined,
          timeoutMs: 100,
        }),
      /could not start[\s\S]*missing executable/,
    );
  });

  it("binds exact local source before driving real NetInfo reachability", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    const start = packageJson.scripts[
      "start:maestro:ios:connectivity-contract"
    ];
    const runner = read("scripts/run-maestro-connectivity-contract.mjs");

    assert.match(start, /SAFEROUTE_SOURCE_REVISION=\$\(git rev-parse HEAD\)/);
    assert.match(start, /SAFEROUTE_ENABLE_CONNECTIVITY_CONTRACT=true/);
    assert.match(start, /SAFEROUTE_ENABLE_GUIDANCE_CONTRACT_EVIDENCE=true/);
    assert.match(start, /SAFEROUTE_ENABLE_PREVIEW_MODE=false/);
    assert.match(start, /SAFEROUTE_ENABLE_DEMO_DRIVE=false/);
    assert.match(start, /SAFEROUTE_DEV_API_URL=http:\/\/127\.0\.0\.1:18080/);
    assert.doesNotMatch(
      `${start}\n${packageJson.scripts["test:maestro:ios:connectivity-contract"]}`,
      /npm run build|expo export|eas build|xcodebuild/i,
    );
    assert.match(
      runner,
      /assertGuidanceSourceCheckoutClean\(readCurrentSourceStatus\(\)\)/,
    );
    assert.match(
      runner,
      /expectedConnectivityContractEnabled: true/,
    );
    assert.match(
      runner,
      /expectedSourceRevision: sourceRevision/,
    );
    assert.match(runner, /MAESTRO_RETRIES: '0'/);
  });

  it("proves offline continuity, reconnect authorization, and inactive-session revocation", () => {
    const runner = read("scripts/run-maestro-connectivity-contract.mjs");
    const fixture = read("scripts/maestro-guidance-contract-api.mjs");
    const checking = read("maestro/ios-connectivity-contract-cold-checking.yaml");
    const seedJourney = read(
      "maestro/ios-connectivity-contract-seed-journey.yaml",
    );
    const seed = read("maestro/ios-connectivity-contract-seed.yaml");
    const offline = read("maestro/ios-connectivity-contract-offline-end.yaml");
    const offlineObserve = read(
      "maestro/ios-connectivity-contract-offline-observe.yaml",
    );
    const offlineRelaunch = read(
      "maestro/ios-connectivity-contract-offline-relaunch.yaml",
    );
    const operationsRemoveCalendar = read(
      "maestro/ios-connectivity-contract-operations-remove-calendar.yaml",
    );
    const operationsRemovalRelaunch = read(
      "maestro/ios-connectivity-contract-operations-removal-relaunch.yaml",
    );
    const operationsStopSaving = read(
      "maestro/ios-connectivity-contract-operations-stop-saving.yaml",
    );
    const operationsSavingOffRelaunch = read(
      "maestro/ios-connectivity-contract-operations-saving-off-relaunch.yaml",
    );
    const operationsAllowSaving = read(
      "maestro/ios-connectivity-contract-operations-allow-saving.yaml",
    );
    const operationsDisabledOnline = read(
      "maestro/ios-connectivity-contract-operations-disabled-online.yaml",
    );
    const operationsResavedRelaunch = read(
      "maestro/ios-connectivity-contract-operations-resaved-relaunch.yaml",
    );
    const reconnect = read(
      "maestro/ios-connectivity-contract-reconnect-checking.yaml",
    );
    const online = read("maestro/ios-connectivity-contract-online.yaml");
    const inactiveSession = read(
      "maestro/ios-connectivity-contract-inactive-session.yaml",
    );
    const inactiveRelaunch = read(
      "maestro/ios-connectivity-contract-inactive-relaunch.yaml",
    );

    for (const phase of [
      "connectivitySeed",
      "connectivityColdChecking",
      "connectivityOffline",
      "connectivityOfflineRelaunch",
      "connectivityReconnectChecking",
      "connectivityOnline",
      "connectivityDisabledSyncOffline",
      "connectivityAllowReconnectChecking",
      "connectivityAllowOnline",
      "connectivityResaveOffline",
      "connectivityRemovalRelaunch",
      "connectivityResaveReconnectChecking",
      "connectivityResaveOnline",
      "connectivityInactiveSeed",
      "connectivityInactiveSession",
      "connectivityInactiveRelaunch",
    ]) {
      assert.match(fixture, new RegExp(phase));
    }
    assert.match(
      fixture,
      /request\.method === 'HEAD'[\s\S]*CONNECTIVITY_CONTRACT_REACHABILITY_PATH[\s\S]*waitForConnectivityRelease/,
    );
    assert.match(
      runner,
      /assertNoProductTrafficBeforeOnline[\s\S]*entry\.path\.startsWith\('\/api\/'\)/,
    );
    assert.match(
      runner,
      /assertConnectivityContractReconnectAuthorization\(requests,[\s\S]*settlementSequence/,
    );
    assert.match(
      runner,
      /assertOperationsCalendarSeed\(requests\)[\s\S]*operations\/client\/66a1b2c3d4e5f60718293a40[\s\S]*operations-active/,
    );
    assert.match(
      runner,
      /CONNECTIVITY_CONTRACT_PHASES\.inactiveSeed[\s\S]*navigation\.persisted[\s\S]*CONNECTIVITY_CONTRACT_PHASES\.inactiveSession[\s\S]*navigation\.cleanup\.settled[\s\S]*tracking\.stop\.settled[\s\S]*CONNECTIVITY_CONTRACT_PHASES\.inactiveRelaunch[\s\S]*navigation\.absence\.readback/,
    );
    assert.match(
      runner,
      /assertConnectivityContractInactiveSessionRevocation\(requests\)/,
    );
    assert.match(
      runner,
      /assertConnectivityContractInactiveGuidanceRevocation\(evidence,[\s\S]*expectedSourceRevision: sourceRevision[\s\S]*minimumOccurredAtMs: startedAtMs/,
    );
    assert.match(runner, /waitForAllRequestsTerminal\(\)/);
    assert.match(runner, /waitForBoundedMaestroPhase/);
    assert.match(runner, /resolveMaestroBinary\(\)/);
    assert.match(runner, /createMaestroProcessEnv\(process\.env\)/);
    assert.match(runner, /--no-reinstall-driver/);
    assert.match(runner, /assertAccessibilityHierarchyElements/);
    assert.match(
      runner,
      /navigation\.cleanup\.settled[\s\S]*tracking\.stop\.settled/,
    );
    assert.match(
      runner,
      /terminateExpoGo\(deviceId\)[\s\S]*CONNECTIVITY_CONTRACT_PHASES\.offlineRelaunch[\s\S]*navigation\.absence\.readback[\s\S]*route\.cache\.readback/,
    );
    assert.match(
      runner,
      /captureAccessibilityHierarchy\('offline-suspended'[\s\S]*safe-route-suspended-navigation-status[\s\S]*safe-route-suspended-navigation-retry[\s\S]*safe-route-suspended-navigation-end/,
    );
    assert.match(
      runner,
      /captureAccessibilityHierarchy\('offline-saved-review'[\s\S]*safe-route-offline-notice[\s\S]*safe-route-card-66b1b2c3d4e5f60718293b40/,
    );
    assert.match(
      runner,
      /captureAccessibilityHierarchy\('offline-operations-calendar'[\s\S]*safe-route-operations-offline-notice[\s\S]*safe-route-operations-route-movement-1-1[\s\S]*safe-route-operations-remove-calendar[\s\S]*safe-route-operations-calendar-saving-control/,
    );
    assert.match(
      runner,
      /captureAccessibilityHierarchy\('offline-operations-calendar'[\s\S]*flows\.operationsStopCalendarSaving[\s\S]*offline-operations-calendar-saving-off[\s\S]*terminateExpoGo\(deviceId\)[\s\S]*flows\.operationsSavingOffRelaunch[\s\S]*offline-operations-calendar-saving-off-relaunch[\s\S]*flows\.operationsReturnMap[\s\S]*CONNECTIVITY_CONTRACT_PHASES\.reconnectChecking/,
    );
    assert.match(
      operationsRemoveCalendar,
      /safe-route-operations-remove-calendar[\s\S]*Cancel[\s\S]*safe-route-operations-route-movement-1-1[\s\S]*\^Remove\$[\s\S]*safe-route-operations-calendar-removal-status[\s\S]*Calendar unavailable offline/,
    );
    assert.match(
      operationsRemovalRelaunch,
      /safe-route-card-66b1b2c3d4e5f60718293b40[\s\S]*guest-map-gate-calendar[\s\S]*Calendar unavailable offline[\s\S]*Offline options[\s\S]*assertNotVisible:[\s\S]*safe-route-operations-route-movement-1-1/,
    );
    assert.match(
      operationsStopSaving,
      /safe-route-operations-calendar-saving-control[\s\S]*Stop offline Calendar saves[\s\S]*Cancel[\s\S]*safe-route-operations-route-movement-1-1[\s\S]*\^Stop saving\$[\s\S]*Offline Calendar saving is off[\s\S]*No offline Calendar saved/,
    );
    assert.match(
      operationsSavingOffRelaunch,
      /safe-route-card-66b1b2c3d4e5f60718293b40[\s\S]*guest-map-gate-calendar[\s\S]*No offline Calendar saved[\s\S]*Offline Calendar saving is off[\s\S]*safe-route-operations-calendar-saving-control[\s\S]*assertNotVisible:[\s\S]*safe-route-operations-route-movement-1-1/,
    );
    assert.match(
      operationsAllowSaving,
      /guest-map-gate-calendar[\s\S]*Offline Calendar saving is off[\s\S]*safe-route-operations-route-66e1b2c3d4e5f60718293e40-66b1b2c3d4e5f60718293b40-0[\s\S]*safe-route-operations-calendar-saving-control[\s\S]*Offline options[\s\S]*safe-route-tab-map[\s\S]*guest-map-collapsed-sheet[\s\S]*guest-map-workspace-selector/,
    );
    assert.match(
      runner,
      /waitForReconnectAuthorization\(onlineSettlement\.sequence\)[\s\S]*flows\.operationsDisabledOnline[\s\S]*CONNECTIVITY_CONTRACT_PHASES\.disabledSyncOffline[\s\S]*flows\.operationsSavingOffRelaunch[\s\S]*CONNECTIVITY_CONTRACT_PHASES\.allowReconnectChecking[\s\S]*CONNECTIVITY_CONTRACT_PHASES\.allowOnline[\s\S]*flows\.operationsAllowCalendarSaving[\s\S]*online-operations-calendar-saving-allowed[\s\S]*CONNECTIVITY_CONTRACT_PHASES\.resaveOffline[\s\S]*flows\.operationsResavedCalendarRelaunch[\s\S]*offline-operations-calendar-resaved[\s\S]*flows\.operationsRemoveCalendar[\s\S]*offline-operations-calendar-removed[\s\S]*CONNECTIVITY_CONTRACT_PHASES\.removalRelaunch[\s\S]*flows\.operationsRemovalRelaunch[\s\S]*offline-operations-calendar-removal-relaunch[\s\S]*CONNECTIVITY_CONTRACT_PHASES\.resaveReconnectChecking[\s\S]*CONNECTIVITY_CONTRACT_PHASES\.resaveOnline[\s\S]*CONNECTIVITY_CONTRACT_PHASES\.inactiveSeed/,
    );
    assert.match(
      operationsDisabledOnline,
      /Offline Calendar saving is off[\s\S]*safe-route-operations-route-66e1b2c3d4e5f60718293e40-66b1b2c3d4e5f60718293b40-0[\s\S]*assertNotVisible:[\s\S]*safe-route-operations-offline-notice[\s\S]*safe-route-tab-map[\s\S]*guest-map-collapsed-sheet[\s\S]*guest-map-workspace-selector/,
    );
    assert.match(
      operationsResavedRelaunch,
      /Offline map\. Saved route information remains available\.[\s\S]*guest-map-gate-calendar[\s\S]*safe-route-operations-route-movement-1-1[\s\S]*Offline options[\s\S]*safe-route-operations-calendar-saving-control[\s\S]*assertNotVisible:[\s\S]*safe-route-operations-empty-state/,
    );
    assert.match(
      runner,
      /label: 'Offline saved routes\. This copy was cached less than one hour ago and is review only\. Reconnect and verify workspace access before starting guidance\.'/,
    );
    assert.match(
      seedJourney,
      /setLocation:[\s\S]*safe-route-primary-action"[\s\S]*enabled: true/,
    );
    assert.doesNotMatch(seedJourney, /ios-open-expo-project/);
    assert.doesNotMatch(seed, /stopApp/);
    assert.match(
      seedJourney,
      /guest-map-gate-calendar[\s\S]*safe-route-operations-route-66e1b2c3d4e5f60718293e40-66b1b2c3d4e5f60718293b40-0[\s\S]*safe-route-tab-map[\s\S]*safe-route-card-66b1b2c3d4e5f60718293b40-map/,
    );
    assert.doesNotMatch(
      [
        seedJourney,
        offlineRelaunch,
        operationsRemovalRelaunch,
        operationsSavingOffRelaunch,
        operationsAllowSaving,
        operationsDisabledOnline,
        online,
      ].join("\n"),
      /route-list-map-return|safe-route-operations-map-return/,
    );
    assert.match(
      seed,
      /safe-route-login"[\s\S]*scrollUntilVisible:[\s\S]*id: "safe-route-login-primary-action"[\s\S]*tapOn:[\s\S]*id: "safe-route-login-primary-action"/,
    );
    assert.doesNotMatch(
      seed,
      /Autofill Password|hideKeyboard|pressKey: ENTER|safe-route-login-password|guidance-contract-password/,
    );
    assert.match(checking, /Checking connection\. Map downloads are paused\./);
    assert.match(checking, /id: "guest-map-canvas"/);
    assert.match(
      offlineObserve,
      /Guidance paused\. Cold restart verification v1\. Reconnect to verify access before guidance can resume\./,
    );
    assert.match(
      offlineObserve,
      /safe-route-suspended-navigation-end"[\s\S]*enabled: true/,
    );
    assert.match(
      offlineObserve,
      /safe-route-suspended-navigation-retry"[\s\S]*enabled: false/,
    );
    assert.match(
      offline,
      /Offline saved routes\. This copy was cached less than one hour ago and is review only\. Reconnect and verify workspace access before starting guidance\./,
    );
    assert.match(
      offline,
      /Workspace, Guidance Operations[\s\S]*Workspace, Choose workspace/,
    );
    assert.doesNotMatch(offline, /safe-route-workspace-66a1b2c3d4e5f60718293a40/);
    assert.match(offlineRelaunch, /subflows\/ios-open-expo-project\.yaml/);
    assert.match(
      offlineRelaunch,
      /Workspace, Guidance Operations[\s\S]*Workspace, Choose workspace[\s\S]*safe-route-offline-notice/,
    );
    assert.match(
      offlineRelaunch,
      /safe-route-operations-offline-notice[\s\S]*calendar was saved less than one hour ago[\s\S]*safe-route-operations-route-movement-1-1/,
    );
    assert.match(
      offlineRelaunch,
      /safe-route-operations-tab-convoy-management[\s\S]*Convoys unavailable offline[\s\S]*assertNotVisible/,
    );
    assert.match(
      fixture,
      /createGuidanceContractOperations/,
    );
    assert.match(fixture, /Guidance airport movement/);
    assert.match(fixture, /Support continuity movement/);
    assert.match(reconnect, /pressKey: HOME/);
    assert.match(reconnect, /Checking connection\. Map downloads are paused\./);
    assert.match(online, /id: "guest-map-workspace-selector"[\s\S]*enabled: true/);
    assert.match(
      online,
      /assertNotVisible:[\s\S]*safe-route-suspended-navigation/,
    );
    assert.match(
      inactiveSession,
      /safe-route-login[\s\S]*This LunarChain account is inactive[\s\S]*safe-route-suspended-navigation[\s\S]*safe-route-picker[\s\S]*safe-route-navigation-cleanup/,
    );
    assert.match(
      inactiveRelaunch,
      /guest-map-primary-action[\s\S]*guest-map-workspace-selector[\s\S]*safe-route-login/,
    );
  });

  it("wires the one-shot Calendar auth cleanup slice without a frontend build", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    const start =
      packageJson.scripts[
        "start:maestro:ios:connectivity-contract:calendar-auth-cleanup"
      ];
    const run =
      packageJson.scripts[
        "test:maestro:ios:connectivity-contract:calendar-auth-cleanup"
      ];
    const prestart =
      packageJson.scripts[
        "prestart:maestro:ios:connectivity-contract:calendar-auth-cleanup"
      ];
    const runner = read("scripts/run-maestro-connectivity-contract.mjs");
    const fixture = read("scripts/maestro-guidance-contract-api.mjs");
    const inactiveFailure = read(
      "maestro/ios-connectivity-contract-calendar-auth-inactive-failure.yaml",
    );
    const preferenceSeed = read(
      "maestro/ios-connectivity-contract-calendar-auth-preference-seed.yaml",
    );
    const finalRelaunch = read(
      "maestro/ios-connectivity-contract-calendar-auth-final-relaunch.yaml",
    );
    const relaunchFailure = read(
      "maestro/ios-connectivity-contract-calendar-auth-relaunch-failure.yaml",
    );
    const retry = read(
      "maestro/ios-connectivity-contract-calendar-auth-retry.yaml",
    );

    assert.match(start, /SAFEROUTE_SOURCE_REVISION=\$\(git rev-parse HEAD\)/);
    assert.match(start, /SAFEROUTE_ENABLE_CONNECTIVITY_CONTRACT=true/);
    assert.match(start, /SAFEROUTE_ENABLE_STORAGE_FAULT_CONTRACT=true/);
    assert.match(start, /SAFEROUTE_ENABLE_GUIDANCE_CONTRACT_EVIDENCE=true/);
    assert.match(start, /SAFEROUTE_DEV_API_URL=http:\/\/127\.0\.0\.1:18080/);
    assert.match(run, /SAFEROUTE_CONNECTIVITY_CONTRACT_SLICE=calendar-auth-cleanup/);
    assert.equal(prestart, "node scripts/maestro-ios-preflight.mjs");
    assert.doesNotMatch(
      `${start}\n${run}`,
      /npm run build|expo export|eas build|xcodebuild/i,
    );
    assert.match(
      runner,
      /expectedStorageFaultContractEnabled:[\s\S]*CALENDAR_AUTH_CLEANUP_SLICE/,
    );
    assert.match(
      runner,
      /inactive-auth-clear[\s\S]*terminateExpoGo\(deviceId\)[\s\S]*relaunch-auth-clear[\s\S]*flows\.calendarAuthRetry[\s\S]*OFFLINE_CALENDAR_AUTH_CONTRACT_PHASES\.finalRelaunch/,
    );
    assert.match(
      runner,
      /offline\.calendar\.cleanup[\s\S]*assertOfflineCalendarAuthStorageFaultRequests[\s\S]*assertOfflineCalendarAuthCleanupEvidence/,
    );
    assert.match(
      runner,
      /flows\.seed[\s\S]*flows\.calendarAuthPreferenceSeed[\s\S]*flows\.seedJourney[\s\S]*runCalendarAuthCleanupSlice/,
    );
    assert.match(runner, /assertOfflineCalendarAuthBoundaryTraffic\(requests\)/);
    assert.match(
      fixture,
      /CONNECTIVITY_CONTRACT_STORAGE_FAULT_PATH[\s\S]*auth-session-tombstone-set[\s\S]*storage-fault-injected[\s\S]*storage-fault-not-armed/,
    );
    assert.match(
      inactiveFailure,
      /safe-route-login[\s\S]*safe-route-calendar-cleanup-alert[\s\S]*safe-route-calendar-cleanup-retry[\s\S]*enabled: true/,
    );
    assert.match(
      preferenceSeed,
      /safe-route-operations-workspace-66a1b2c3d4e5f60718293a41[\s\S]*Workspace, Support Operations[\s\S]*Stop saving[\s\S]*Offline Calendar saving is off[\s\S]*safe-route-operations-workspace-66a1b2c3d4e5f60718293a40[\s\S]*Workspace, Guidance Operations[\s\S]*Offline options/,
    );
    assert.match(
      relaunchFailure,
      /guest-map-primary-action[\s\S]*guest-map-workspace-selector[\s\S]*safe-route-calendar-cleanup-alert[\s\S]*safe-route-calendar-cleanup-retry/,
    );
    assert.match(
      retry,
      /safe-route-calendar-cleanup-retry[\s\S]*safe-route-calendar-cleanup-alert[\s\S]*safe-route-calendar-cleanup"[\s\S]*Offline data storage restored\. Sign in again[\s\S]*guest-map-primary-action/,
    );
    assert.match(
      finalRelaunch,
      /guest-map-primary-action[\s\S]*guest-map-workspace-selector[\s\S]*safe-route-calendar-cleanup"[\s\S]*safe-route-calendar-cleanup-alert[\s\S]*safe-route-calendar-cleanup-retry[\s\S]*safe-route-login/,
    );
  });

  it("wires direct workspace-denial Calendar revocation and cold absence", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    const start =
      packageJson.scripts["start:maestro:ios:connectivity-contract"];
    const run =
      packageJson.scripts[
        "test:maestro:ios:connectivity-contract:calendar-workspace-denial"
      ];
    const runner = read("scripts/run-maestro-connectivity-contract.mjs");
    const fixture = read("scripts/maestro-guidance-contract-api.mjs");
    const seed = read(
      "maestro/ios-connectivity-contract-calendar-auth-preference-seed.yaml",
    );
    const prepare = read(
      "maestro/ios-connectivity-contract-calendar-workspace-denial-prepare.yaml",
    );
    const denial = read(
      "maestro/ios-connectivity-contract-calendar-workspace-denial.yaml",
    );
    const relaunch = read(
      "maestro/ios-connectivity-contract-calendar-workspace-denial-relaunch.yaml",
    );

    assert.match(start, /SAFEROUTE_ENABLE_CONNECTIVITY_CONTRACT=true/);
    assert.match(start, /SAFEROUTE_ENABLE_GUIDANCE_CONTRACT_EVIDENCE=true/);
    assert.doesNotMatch(start, /SAFEROUTE_ENABLE_STORAGE_FAULT_CONTRACT=true/);
    assert.match(
      run,
      /SAFEROUTE_CONNECTIVITY_CONTRACT_SLICE=calendar-workspace-denial/,
    );
    assert.doesNotMatch(
      `${start}\n${run}`,
      /npm run build|expo export|eas build|xcodebuild/i,
    );
    assert.match(
      runner,
      /flows\.calendarAuthPreferenceSeed[\s\S]*offline\.calendar\.workspace-lifecycle[\s\S]*runCalendarWorkspaceDenialSlice/,
    );
    assert.match(
      runner,
      /calendarWorkspaceDenialPrepare[\s\S]*GUIDANCE_CONTRACT_MODES\.denied[\s\S]*calendarWorkspaceDenial[\s\S]*workspace\.recovery\.settled[\s\S]*calendarWorkspaceDenialRelaunch/,
    );
    assert.match(
      runner,
      /assertOfflineCalendarWorkspaceDenialTraffic\(requests\)[\s\S]*assertOfflineCalendarWorkspaceRevocationEvidence/,
    );
    assert.match(
      fixture,
      /calendarWorkspaceDenial[\s\S]*calendarWorkspaceDenialRelaunch[\s\S]*offline\.calendar\.workspace-lifecycle/,
    );
    assert.match(
      seed,
      /Workspace, Support Operations[\s\S]*Stop saving[\s\S]*Offline Calendar saving is off[\s\S]*Workspace, Guidance Operations/,
    );
    assert.match(
      prepare,
      /subflows\/ios-open-expo-project\.yaml[\s\S]*Workspace, Guidance Operations/,
    );
    assert.doesNotMatch(prepare, /stopApp/);
    assert.match(
      denial,
      /guest-map-gate-calendar[\s\S]*Workspace, Support Operations[\s\S]*Guidance Operations is no longer available\. Switched to Support Operations\.[\s\S]*safe-route-operations-route-66e1b2c3d4e5f60718293e41-66b1b2c3d4e5f60718293b41-0[\s\S]*Offline Calendar saving is off[\s\S]*safe-route-card-66b1b2c3d4e5f60718293b41/,
    );
    assert.doesNotMatch(denial, /stopApp/);
    assert.match(
      relaunch,
      /Offline map\. Saved route information remains available\.[\s\S]*Workspace, Support Operations[\s\S]*safe-route-card-66b1b2c3d4e5f60718293b41[\s\S]*Offline Calendar saving is off[\s\S]*No offline Calendar is saved/,
    );
    assert.doesNotMatch(relaunch, /stopApp/);
    assert.match(
      runner,
      /calendar-workspace-denial-relaunch[\s\S]*Support Operations\. Offline Calendar saving is off\.[\s\S]*No offline Calendar is saved/,
    );
  });

  it("wires retry-B and keep-A workspace handoff decisions without rearming live faults", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    const start =
      packageJson.scripts[
        "start:maestro:ios:connectivity-contract:workspace-handoff"
      ];
    const prestart =
      packageJson.scripts[
        "prestart:maestro:ios:connectivity-contract:workspace-handoff"
      ];
    const retryRun =
      packageJson.scripts[
        "test:maestro:ios:connectivity-contract:workspace-handoff-retry"
      ];
    const keepRun =
      packageJson.scripts[
        "test:maestro:ios:connectivity-contract:workspace-handoff-keep"
      ];
    const runner = read("scripts/run-maestro-connectivity-contract.mjs");
    const fixture = read("scripts/maestro-guidance-contract-api.mjs");
    const prepare = read(
      "maestro/ios-connectivity-contract-workspace-handoff-prepare.yaml",
    );
    const cleanupFailure = read(
      "maestro/ios-connectivity-contract-workspace-handoff-cleanup-failure.yaml",
    );
    const selectionFailure = read(
      "maestro/ios-connectivity-contract-workspace-handoff-selection-failure.yaml",
    );
    const retrySuccess = read(
      "maestro/ios-connectivity-contract-workspace-handoff-retry-success.yaml",
    );
    const keepCurrent = read(
      "maestro/ios-connectivity-contract-workspace-handoff-keep-current.yaml",
    );
    const keepRelaunch = read(
      "maestro/ios-connectivity-contract-workspace-handoff-keep-relaunch.yaml",
    );
    const handoffRunner = runner.slice(
      runner.indexOf("async function runWorkspaceHandoffSlice"),
      runner.indexOf("async function runCalendarPrincipalChangeSlice"),
    );

    assert.equal(prestart, "node scripts/maestro-ios-preflight.mjs");
    assert.match(start, /SAFEROUTE_SOURCE_REVISION=\$\(git rev-parse HEAD\)/);
    assert.match(start, /SAFEROUTE_ENABLE_CONNECTIVITY_CONTRACT=true/);
    assert.match(start, /SAFEROUTE_ENABLE_STORAGE_FAULT_CONTRACT=true/);
    assert.match(start, /SAFEROUTE_ENABLE_GUIDANCE_CONTRACT_EVIDENCE=true/);
    assert.match(start, /SAFEROUTE_ENABLE_PREVIEW_MODE=false/);
    assert.match(start, /SAFEROUTE_ENABLE_DEMO_DRIVE=false/);
    assert.match(start, /SAFEROUTE_DEV_API_URL=http:\/\/127\.0\.0\.1:18080/);
    assert.match(
      retryRun,
      /SAFEROUTE_CONNECTIVITY_CONTRACT_SLICE=workspace-handoff-retry/,
    );
    assert.match(
      keepRun,
      /SAFEROUTE_CONNECTIVITY_CONTRACT_SLICE=workspace-handoff-keep/,
    );
    assert.doesNotMatch(
      `${start}\n${retryRun}\n${keepRun}`,
      /npm run build|expo export|eas build|xcodebuild/i,
    );
    assert.match(
      runner,
      /expectedStorageFaultContractEnabled:[\s\S]*WORKSPACE_HANDOFF_KEEP_SLICE[\s\S]*WORKSPACE_HANDOFF_RETRY_SLICE/,
    );
    assert.match(
      handoffRunner,
      /WORKSPACE_HANDOFF_CONTRACT_PHASES\.prepare[\s\S]*flows\.workspaceHandoffPrepare[\s\S]*restore\.suspended[\s\S]*restore\.ready[\s\S]*navigation\.persisted[\s\S]*waitForProductRequestJournalQuiet/,
    );
    assert.match(
      handoffRunner,
      /WORKSPACE_HANDOFF_CONTRACT_PHASES\.failure[\s\S]*handoff-cleanup[\s\S]*workspace-handoff-navigation-cleanup-set[\s\S]*handoff-target[\s\S]*workspace-handoff-target-selection-set[\s\S]*flows\.workspaceHandoffCleanupFailure[\s\S]*'failed'[\s\S]*flows\.workspaceHandoffSelectionFailure[\s\S]*'cleared'[\s\S]*'off'[\s\S]*waitForAllRequestsTerminal\(\)[\s\S]*flows\.workspaceHandoffRetrySuccess[\s\S]*flows\.workspaceHandoffKeepCurrent/,
    );
    const failurePhaseStart = handoffRunner.indexOf(
      "WORKSPACE_HANDOFF_CONTRACT_PHASES.failure",
    );
    const faultArmStart = handoffRunner.lastIndexOf(
      "setControl(",
      failurePhaseStart,
    );
    const keepDecisionEnd = handoffRunner.indexOf(
      "terminateExpoGo(deviceId)",
      handoffRunner.indexOf("flows.workspaceHandoffKeepCurrent"),
    );
    assert.equal(
      (
        handoffRunner
          .slice(faultArmStart, keepDecisionEnd)
          .match(/setControl\(/g) || []
      ).length,
      1,
    );
    assert.doesNotMatch(
      handoffRunner.slice(faultArmStart, keepDecisionEnd),
      /WORKSPACE_HANDOFF_CONTRACT_PHASES\.outcome/,
    );
    assert.match(
      handoffRunner,
      /flows\.workspaceHandoffRetrySuccess[\s\S]*flows\.workspaceHandoffKeepCurrent[\s\S]*terminateExpoGo\(deviceId\)[\s\S]*WORKSPACE_HANDOFF_CONTRACT_PHASES\.keepRelaunch[\s\S]*flows\.workspaceHandoffKeepRelaunch[\s\S]*navigation\.absence\.readback[\s\S]*route\.cache\.readback[\s\S]*assertWorkspaceHandoffStorageFaultRequests[\s\S]*assertWorkspaceHandoffTraffic[\s\S]*assertWorkspaceHandoffEvidence/,
    );
    assert.match(
      handoffRunner,
      /workspace-handoff-cleanup-failure[\s\S]*safe-route-workspace-selector[\s\S]*Workspace, Guidance Operations[\s\S]*enabled: false[\s\S]*safe-route-navigation-cleanup/,
    );
    assert.match(
      handoffRunner,
      /workspace-handoff-selection-failure[\s\S]*safe-route-workspace-selector[\s\S]*Workspace, Guidance Operations[\s\S]*enabled: true[\s\S]*safe-route-workspace-handoff-retry-action/,
    );
    assert.match(
      fixture,
      /WORKSPACE_HANDOFF_CONTRACT_PHASES\.failure[\s\S]*navigation\.cleanup\.settled[\s\S]*tracking\.stop\.settled/,
    );
    assert.match(
      fixture,
      /cleanupRequests\.length === 2[\s\S]*503[\s\S]*storage-fault-injected[\s\S]*204[\s\S]*storage-fault-not-armed[\s\S]*targetRequests\.length === \(normalizedOutcome === 'retry' \? 2 : 1\)[\s\S]*targetRequests\[1\]\.connectivitySequence ===[\s\S]*targetRequests\[0\]\.connectivitySequence/,
    );
    assert.match(
      fixture,
      /normalizedOutcome === 'keep'[\s\S]*targetRequests\.length === 1[\s\S]*keepTraffic\.length === 0[\s\S]*handoffSupportScopedTraffic\.length === 0[\s\S]*targetSuccessCompletion[\s\S]*supportRouteReads\.length === handoffTraffic\.length/,
    );
    assert.match(
      fixture,
      /suspendedIndex[\s\S]*readyIndex[\s\S]*failedCleanupIndex[\s\S]*unknownTrackingIndex[\s\S]*clearedCleanupIndex[\s\S]*stoppedTrackingIndex[\s\S]*keepAbsenceIndex[\s\S]*keepRouteReadbackIndex/,
    );

    assert.match(
      prepare,
      /subflows\/ios-open-expo-project\.yaml[\s\S]*safe-route-live-map[\s\S]*Resume route guidance[\s\S]*safe-route-return[\s\S]*safe-route-picker[\s\S]*safe-route-workspace-66a1b2c3d4e5f60718293a41[\s\S]*End route and change workspace\?/,
    );
    assert.match(
      cleanupFailure,
      /End route and change workspace[\s\S]*safe-route-navigation-cleanup-retry[\s\S]*enabled: true[\s\S]*SafeRoute could not remove saved guidance\.[\s\S]*safe-route-workspace-handoff-retry[\s\S]*safe-route-live-map/,
    );
    assert.match(
      selectionFailure,
      /safe-route-navigation-cleanup-retry[\s\S]*safe-route-workspace-handoff-retry-action[\s\S]*Workspace change needed[\s\S]*Route ended\. Still using Guidance Operations because Support Operations could not be saved\.[\s\S]*safe-route-workspace-handoff-keep-current/,
    );
    assert.match(
      retrySuccess,
      /safe-route-workspace-handoff-retry-action[\s\S]*safe-route-card-66b1b2c3d4e5f60718293b41[\s\S]*Workspace, Support Operations[\s\S]*Route ended\. Workspace changed to Support Operations\./,
    );
    assert.match(
      keepCurrent,
      /safe-route-workspace-handoff-keep-current[\s\S]*Workspace, Guidance Operations[\s\S]*Workspace remains Guidance Operations\.[\s\S]*safe-route-card-66b1b2c3d4e5f60718293b40/,
    );
    assert.match(
      keepRelaunch,
      /subflows\/ios-open-expo-project\.yaml[\s\S]*Offline map\. Saved route information remains available\.[\s\S]*safe-route-workspace-selector[\s\S]*Workspace, Guidance Operations[\s\S]*safe-route-offline-notice[\s\S]*safe-route-card-66b1b2c3d4e5f60718293b40/,
    );
    for (const liveFlow of [
      cleanupFailure,
      selectionFailure,
      retrySuccess,
      keepCurrent,
    ]) {
      assert.doesNotMatch(liveFlow, /stopApp|ios-open-expo-project|openLink/);
    }
  });

  it("wires saved-principal change to a signed-out Calendar revocation boundary", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    const start =
      packageJson.scripts["start:maestro:ios:connectivity-contract"];
    const run =
      packageJson.scripts[
        "test:maestro:ios:connectivity-contract:calendar-principal-change"
      ];
    const runner = read("scripts/run-maestro-connectivity-contract.mjs");
    const fixture = read("scripts/maestro-guidance-contract-api.mjs");
    const change = read(
      "maestro/ios-connectivity-contract-calendar-principal-change.yaml",
    );
    const validationUnavailable = read(
      "maestro/ios-connectivity-contract-calendar-principal-validation-unavailable.yaml",
    );
    const validationOfflineRelaunch = read(
      "maestro/ios-connectivity-contract-calendar-principal-validation-offline-relaunch.yaml",
    );
    const relaunch = read(
      "maestro/ios-connectivity-contract-calendar-principal-change-relaunch.yaml",
    );

    assert.match(start, /SAFEROUTE_ENABLE_CONNECTIVITY_CONTRACT=true/);
    assert.match(start, /SAFEROUTE_ENABLE_GUIDANCE_CONTRACT_EVIDENCE=true/);
    assert.doesNotMatch(start, /SAFEROUTE_ENABLE_STORAGE_FAULT_CONTRACT=true/);
    assert.match(
      run,
      /SAFEROUTE_CONNECTIVITY_CONTRACT_SLICE=calendar-principal-change/,
    );
    assert.doesNotMatch(
      `${start}\n${run}`,
      /npm run build|expo export|eas build|xcodebuild/i,
    );
    assert.match(
      runner,
      /flows\.calendarAuthPreferenceSeed[\s\S]*offline\.calendar\.principal-lifecycle[\s\S]*runCalendarPrincipalChangeSlice/,
    );
    assert.match(
      runner,
      /calendarPrincipalValidationUnavailable[\s\S]*GUIDANCE_CONTRACT_MODES\.principalValidationUnavailable[\s\S]*SafeRoute could not verify this saved session\. Retry or sign in again\.[\s\S]*calendarPrincipalValidationOfflineRelaunch[\s\S]*assertProductTrafficQuiet[\s\S]*GUIDANCE_CONTRACT_MODES\.wrongPrincipal[\s\S]*calendarPrincipalChange[\s\S]*This saved session belongs to another account\. Sign in again\.[\s\S]*calendarPrincipalChangeRelaunch/,
    );
    assert.match(
      runner,
      /principal-change-validation-unavailable[\s\S]*principal-change-validation-offline-relaunch[\s\S]*assertOfflineCalendarPrincipalChangeEvidence/,
    );
    assert.match(
      runner,
      /assertOfflineCalendarPrincipalChangeTraffic\(requests, evidence\)[\s\S]*assertOfflineCalendarPrincipalChangeEvidence/,
    );
    assert.match(
      fixture,
      /principalValidationUnavailable[\s\S]*calendarPrincipalChange[\s\S]*calendarPrincipalChangeRelaunch[\s\S]*calendarPrincipalValidationOfflineRelaunch[\s\S]*calendarPrincipalValidationUnavailable[\s\S]*offline\.calendar\.principal-lifecycle/,
    );
    assert.match(
      validationUnavailable,
      /subflows\/ios-open-expo-project\.yaml[\s\S]*safe-route-login-saved-session-retry[\s\S]*SafeRoute could not verify this saved session\. Retry or sign in again\.[\s\S]*safe-route-login-email[\s\S]*safe-route-live-map/,
    );
    assert.doesNotMatch(validationUnavailable, /stopApp/);
    assert.match(
      validationOfflineRelaunch,
      /subflows\/ios-open-expo-project\.yaml[\s\S]*safe-route-login-saved-session-retry[\s\S]*SafeRoute could not verify this saved session\. Retry or sign in again\.[\s\S]*safe-route-login-email[\s\S]*safe-route-live-map/,
    );
    assert.doesNotMatch(validationOfflineRelaunch, /stopApp/);
    assert.match(
      change,
      /subflows\/ios-open-expo-project\.yaml[\s\S]*safe-route-login[\s\S]*This saved session belongs to another account\. Sign in again\.[\s\S]*safe-route-login-saved-session-retry[\s\S]*safe-route-login-email[\s\S]*safe-route-live-map/,
    );
    assert.doesNotMatch(change, /stopApp/);
    assert.match(
      relaunch,
      /guest-map-primary-action[\s\S]*Sign in[\s\S]*safe-route-login[\s\S]*guest-map-workspace-selector[\s\S]*safe-route-suspended-navigation/,
    );
    assert.doesNotMatch(relaunch, /stopApp/);
  });
});
