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
    const offline = read("maestro/ios-connectivity-contract-offline-end.yaml");
    const reconnect = read(
      "maestro/ios-connectivity-contract-reconnect-checking.yaml",
    );
    const online = read("maestro/ios-connectivity-contract-online.yaml");

    for (const phase of [
      "connectivitySeed",
      "connectivityColdChecking",
      "connectivityOffline",
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
    assert.match(
      runner,
      /navigation\.cleanup\.settled[\s\S]*tracking\.stop\.settled/,
    );
    assert.match(checking, /Checking connection\. Map downloads are paused\./);
    assert.match(checking, /id: "guest-map-canvas"/);
    assert.match(offline, /Reconnect to verify access before guidance can resume\./);
    assert.match(
      offline,
      /safe-route-suspended-navigation-end"[\s\S]*enabled: true/,
    );
    assert.match(
      offline,
      /Offline saved copy · reconnect before starting guidance/,
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
