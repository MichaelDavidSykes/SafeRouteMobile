import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("SafeRoute dark map theme", () => {
  it("uses the dark map treatment on guest planning and live navigation", () => {
    const guestMap = source("src/features/guest-map/GuestMapScreen.tsx");
    const liveMap = source("src/features/live-map/LiveMapCanvas.tsx");

    for (const mapSource of [guestMap, liveMap]) {
      assert.match(mapSource, /customMapStyle=\{SAFE_ROUTE_DARK_MAP_STYLE\}/);
      assert.match(mapSource, /userInterfaceStyle="dark"/);
      assert.match(mapSource, /showsBuildings/);
      assert.match(mapSource, /cameraZoomRange=\{SAFE_ROUTE_CAMERA_ZOOM_RANGE\}/);
      assert.match(mapSource, /zoomEnabled/);
      assert.match(mapSource, /pitchEnabled/);
      assert.doesNotMatch(mapSource, /userInterfaceStyle="light"/);
      assert.match(mapSource, /SAFE_ROUTE_DARK_ROUTE_CASING/);
      assert.match(mapSource, /SAFE_ROUTE_DARK_ROUTE_GLOW/);
      assert.match(mapSource, /SAFE_ROUTE_ROUTE_CASING_WIDTH/);
      assert.match(mapSource, /SAFE_ROUTE_ROUTE_GLOW_WIDTH/);
    }
  });

  it("keeps the Google map palette dark, restrained, and route-readable", () => {
    const mapTheme = source("src/features/maps/safeRouteMapTheme.ts");
    const theme = source("src/theme.ts");

    assert.match(theme, /mapFallback:\s*["']#101318["']/);
    assert.match(mapTheme, /featureType:\s*"water"/);
    assert.match(mapTheme, /featureType:\s*"road\.highway"/);
    assert.match(mapTheme, /featureType:\s*"landscape\.man_made"/);
    assert.match(mapTheme, /featureType:\s*"poi\.park"/);
    assert.match(
      mapTheme,
      /featureType:\s*"poi\.business"[\s\S]*?visibility:\s*"off"/,
    );
    assert.match(mapTheme, /SAFE_ROUTE_DARK_ROUTE_CASING/);
    assert.match(mapTheme, /SAFE_ROUTE_DARK_ROUTE_GLOW/);
    assert.match(
      mapTheme,
      /SAFE_ROUTE_CAMERA_ZOOM_RANGE[\s\S]*maxCenterCoordinateDistance:\s*40_000_000/,
    );
    assert.match(mapTheme, /SAFE_ROUTE_DARK_ROUTE_CASING\s*=\s*"#ffffff"/);
    assert.match(mapTheme, /SAFE_ROUTE_ROUTE_CASING_WIDTH\s*=\s*9/);
    assert.match(mapTheme, /SAFE_ROUTE_ROUTE_GLOW_WIDTH\s*=\s*7/);
    assert.match(mapTheme, /SAFE_ROUTE_ROUTE_CORE_WIDTH\s*=\s*5/);
  });

  it("uses muted native iOS tiles with a flat home camera and optional pitch", () => {
    const guestMap = source("src/features/guest-map/GuestMapScreen.tsx");
    const liveMap = source("src/features/live-map/LiveMapCanvas.tsx");
    const mapTransport = source("src/features/api/mapTransportState.ts");

    for (const mapSource of [guestMap, liveMap]) {
      assert.match(mapSource, /resolveSafeRouteMapType/);
      assert.match(mapSource, /platform: Platform\.OS/);
      assert.match(mapSource, /showsBuildings/);
      assert.match(mapSource, /pitchEnabled/);
    }
    assert.match(
      mapTransport,
      /platform === "ios" \? "mutedStandard" : "standard"/,
    );
    assert.match(guestMap, /animateCamera\(\{ heading: 0, pitch: 0 \}/);
    assert.doesNotMatch(guestMap, /pitch: 38/);
    assert.match(guestMap, /rotateEnabled/);
  });

  it("keeps every production map free of forced light map styling", () => {
    const productionSources = [
      source("src/features/guest-map/GuestMapScreen.tsx"),
      source("src/features/live-map/LiveMapCanvas.tsx"),
    ];

    assert.ok(productionSources.every((mapSource) => !mapSource.includes('userInterfaceStyle="light"')));
  });

  it("uses light status-bar content only while a dark map is visible", () => {
    const app = source("App.tsx");

    assert.match(
      app,
      /screen === 'guest-map' \|\| screen === 'route-preview'[\s\S]*\? 'light'[\s\S]*: 'dark'/,
    );
    assert.match(app, /<StatusBar style=\{statusBarStyle\} \/>/);
  });
});
