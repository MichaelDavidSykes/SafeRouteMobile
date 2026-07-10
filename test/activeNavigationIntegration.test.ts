import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("production navigation reliability integration", () => {
  it("registers the background task before the React app mounts", () => {
    const indexSource = source("index.ts");
    const taskSource = source(
      "src/features/live-map/backgroundNavigationTask.ts",
    );

    assert.match(indexSource, /backgroundNavigationTask/);
    assert.match(taskSource, /TaskManager\.defineTask/);
    assert.match(taskSource, /saveBackgroundNavigationLocation/);
    assert.match(taskSource, /location\.mocked !== true/);
  });

  it("uses battery-bounded automotive background tracking without persisting credentials", () => {
    const backgroundSource = source(
      "src/features/live-map/backgroundNavigation.ts",
    );
    const sessionCoreSource = source(
      "src/features/live-map/activeNavigationSessionCore.ts",
    );

    assert.match(backgroundSource, /AutomotiveNavigation/);
    assert.match(backgroundSource, /deferredUpdatesDistance:\s*20/);
    assert.match(backgroundSource, /deferredUpdatesInterval:\s*10_000/);
    assert.match(backgroundSource, /distanceInterval:\s*5/);
    assert.match(backgroundSource, /foregroundService:/);
    assert.doesNotMatch(sessionCoreSource, /accessToken|password|loginCode/);
  });

  it("persists, restores, resumes, and clears active navigation sessions", () => {
    const appSource = source("App.tsx");
    const liveMapSource = source("src/features/live-map/LiveMapScreen.tsx");

    assert.match(appSource, /loadActiveNavigationSession/);
    assert.match(appSource, /openActiveNavigationSession/);
    assert.match(appSource, /ResumeNavigationButton/);
    assert.match(appSource, /clearActiveNavigationSession/);
    assert.match(liveMapSource, /createActiveNavigationSession/);
    assert.match(liveMapSource, /saveActiveNavigationSession/);
    assert.match(liveMapSource, /initialNavigationSession/);
    assert.match(liveMapSource, /setInterval\(persistCurrentSession, 5_000\)/);
  });

  it("filters foreground samples and recovers the newest background fix", () => {
    const locationHookSource = source(
      "src/features/live-map/useLiveLocation.ts",
    );

    assert.match(locationHookSource, /applyReliableLocationSample/);
    assert.match(locationHookSource, /loadBackgroundNavigationLocation/);
    assert.match(locationHookSource, /AppState\.addEventListener/);
    assert.match(locationHookSource, /location\.mocked === true/);
    assert.match(locationHookSource, /Low accuracy/);
  });

  it("keeps background permission UI compact and text-led", () => {
    const summarySource = source(
      "src/features/live-map/LiveMapRouteSummarySheet.tsx",
    );
    const summaryStyles = source(
      "src/features/live-map/LiveMapRouteSummarySheet.styles.ts",
    );

    assert.match(summarySource, /liveMapBackgroundNavigationAction/);
    assert.match(summarySource, /backgroundNavigationPresentation\.actionLabel/);
    assert.doesNotMatch(summarySource, /Ionicons/);
    assert.match(summaryStyles, /continuityAction:[\s\S]*borderRadius:\s*radius\.pill/);
  });
});
