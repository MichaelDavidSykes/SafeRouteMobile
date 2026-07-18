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

  it("proves checking/offline silence, local End, and one reconnect authorization", () => {
    const runner = read("scripts/run-maestro-connectivity-contract.mjs");
    const fixture = read("scripts/maestro-guidance-contract-api.mjs");
    const checking = read("maestro/ios-connectivity-contract-cold-checking.yaml");
    const seedJourney = read(
      "maestro/ios-connectivity-contract-seed-journey.yaml",
    );
    const seed = read("maestro/ios-workspace-catalog-recovery-seed.yaml");
    const offline = read("maestro/ios-connectivity-contract-offline-end.yaml");
    const offlineObserve = read(
      "maestro/ios-connectivity-contract-offline-observe.yaml",
    );
    const offlineRelaunch = read(
      "maestro/ios-connectivity-contract-offline-relaunch.yaml",
    );
    const reconnect = read(
      "maestro/ios-connectivity-contract-reconnect-checking.yaml",
    );
    const online = read("maestro/ios-connectivity-contract-online.yaml");

    for (const phase of [
      "connectivitySeed",
      "connectivityColdChecking",
      "connectivityOffline",
      "connectivityOfflineRelaunch",
      "connectivityReconnectChecking",
      "connectivityOnline",
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
      seedJourney,
      /setLocation:[\s\S]*safe-route-primary-action"[\s\S]*enabled: true/,
    );
    assert.match(
      seed,
      /visible: "Autofill Password"[\s\S]*tapOn: "Cancel"[\s\S]*visible: "Continue"[\s\S]*tapOn: "Continue"/,
    );
    assert.ok(
      seed.indexOf('visible: "Autofill Password"') <
        seed.indexOf('inputText: "guidance-contract-password"'),
      'the iOS Autofill sheet must be dismissed before entering the fixture password',
    );
    assert.match(
      seed,
      /id: "safe-route-login-password"\n- waitForAnimationToEnd:[\s\S]*visible: "Autofill Password"[\s\S]*tapOn: "Continue"\n- eraseText\n- inputText: "guidance-contract-password"/,
    );
    assert.match(
      seed,
      /inputText: "guidance-contract-password"\n- pressKey: ENTER\n- waitForAnimationToEnd:[\s\S]*visible: "Autofill Password"[\s\S]*tapOn: "Cancel"[\s\S]*visible: "Continue"[\s\S]*tapOn: "Continue"\n- pressKey: ENTER\n- runFlow:\n    when:\n      visible: "Not Now"/,
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
      /Offline saved copy · reconnect before starting guidance/,
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
    assert.match(reconnect, /pressKey: HOME/);
    assert.match(reconnect, /Checking connection\. Map downloads are paused\./);
    assert.match(online, /id: "guest-map-workspace-selector"[\s\S]*enabled: true/);
    assert.match(
      online,
      /assertNotVisible:[\s\S]*safe-route-suspended-navigation/,
    );
  });
});
