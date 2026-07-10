import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { shouldRenderRouteCheckpointMarker } from "../src/features/maps/mapMarkerPresentation";
import type { RouteCheckpoint } from "../src/features/live-map/liveMapTypes";

const origin: RouteCheckpoint = {
  caption: "Current location",
  coordinate: { latitude: 51.5074, longitude: -0.1278 },
  id: "origin",
  kind: "origin",
  label: "Start",
};

describe("route checkpoint marker presentation", () => {
  it("hides an origin marker that would stack over the native location puck", () => {
    assert.equal(
      shouldRenderRouteCheckpointMarker({
        checkpoint: origin,
        liveCoordinate: { latitude: 51.50742, longitude: -0.12781 },
        nativeUserLocationVisible: true,
      }),
      false,
    );
  });

  it("keeps route starts that are separate from the current device location", () => {
    assert.equal(
      shouldRenderRouteCheckpointMarker({
        checkpoint: origin,
        liveCoordinate: { latitude: 51.512, longitude: -0.14 },
        nativeUserLocationVisible: true,
      }),
      true,
    );
  });

  it("always keeps waypoints and destinations", () => {
    for (const kind of ["waypoint", "destination"] as const) {
      assert.equal(
        shouldRenderRouteCheckpointMarker({
          checkpoint: { ...origin, id: kind, kind },
          liveCoordinate: origin.coordinate,
          nativeUserLocationVisible: true,
        }),
        true,
      );
    }
  });

  it("applies overlap protection on guest planning and live guidance maps", () => {
    for (const path of [
      "src/features/guest-map/GuestMapScreen.tsx",
      "src/features/live-map/LiveMapCanvas.tsx",
    ]) {
      const mapSource = readFileSync(join(process.cwd(), path), "utf8");

      assert.match(mapSource, /shouldRenderRouteCheckpointMarker/);
      assert.match(mapSource, /nativeUserLocationVisible:/);
    }
  });
});
