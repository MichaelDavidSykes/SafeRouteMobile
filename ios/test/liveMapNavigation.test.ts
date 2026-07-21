import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RouteProgressSnapshot } from "../src/features/live-map/routeProgress";
import {
  resolveDriveAlongCamera,
  resolveActiveNavigationState,
  resolveNavigationVehicleCoordinate,
  resolveOverviewCameraReset,
  resolveVehicleHeading,
  shouldAnimateDriveAlongCamera,
  shouldSuspendDriveAlongCamera,
  shouldUseDriveAlongCamera,
} from "../src/features/live-map/liveMapNavigation";

const routeCoordinates = [
  { latitude: 40, longitude: -74 },
  { latitude: 40.01, longitude: -74 },
  { latitude: 40.01, longitude: -73.99 },
];

function progressSnapshot(
  overrides: Partial<RouteProgressSnapshot> = {},
): RouteProgressSnapshot {
  return {
    completedCoordinates: [],
    etaSeconds: null,
    isArrived: false,
    isOffRoute: false,
    nearestSegmentIndex: 0,
    offRouteDistanceMeters: 0,
    progressRatio: 0,
    remainingDistanceMeters: 0,
    segmentProgress: 0,
    snappedCoordinate: routeCoordinates[0],
    totalDistanceMeters: 0,
    travelledDistanceMeters: 0,
    ...overrides,
  };
}

describe("live map navigation helpers", () => {
  it("derives the active navigation state from progress only while guidance is active", () => {
    assert.equal(
      resolveActiveNavigationState("loaded", progressSnapshot({ isArrived: true })),
      "loaded",
    );
    assert.equal(
      resolveActiveNavigationState("navigating", progressSnapshot({ isArrived: true })),
      "arrived",
    );
    assert.equal(
      resolveActiveNavigationState("navigating", progressSnapshot({ isOffRoute: true })),
      "off-route",
    );
    assert.equal(
      resolveActiveNavigationState("off-route", progressSnapshot({ isOffRoute: false })),
      "navigating",
    );
    assert.equal(resolveActiveNavigationState("paused", null), "paused");
  });

  it("prefers valid live GPS heading outside demo drive", () => {
    assert.equal(
      resolveVehicleHeading(routeCoordinates, progressSnapshot(), 274, false, 0),
      274,
    );
    assert.notEqual(
      resolveVehicleHeading(routeCoordinates, progressSnapshot(), 274, true, 0),
      274,
    );
    assert.equal(
      resolveVehicleHeading(routeCoordinates, progressSnapshot(), 725, false, 0),
      5,
    );
  });

  it("falls back to route segment bearings for invalid headings and demo drive", () => {
    const segmentHeading = resolveVehicleHeading(
      routeCoordinates,
      progressSnapshot({ nearestSegmentIndex: 1 }),
      Number.NaN,
      false,
      0,
    );
    assert.ok(segmentHeading > 89 && segmentHeading < 91);

    const stepHeading = resolveVehicleHeading(routeCoordinates, null, -1, false, 0);
    assert.ok(stepHeading >= 0 && stepHeading < 1);
  });

  it("uses a safe north heading when route geometry cannot provide direction", () => {
    assert.equal(resolveVehicleHeading([], null, undefined, false, 0), 0);
    assert.equal(resolveVehicleHeading([routeCoordinates[0]], null, null, true, 0), 0);
  });

  it("enables drive-along camera only during active followed guidance", () => {
    assert.equal(shouldUseDriveAlongCamera("navigating", true, routeCoordinates[0]), true);
    assert.equal(shouldUseDriveAlongCamera("off-route", true, routeCoordinates[0]), true);
    assert.equal(shouldUseDriveAlongCamera("paused", true, routeCoordinates[0]), false);
    assert.equal(shouldUseDriveAlongCamera("navigating", false, routeCoordinates[0]), false);
    assert.equal(shouldUseDriveAlongCamera("navigating", true, null), false);
  });

  it("keeps the vehicle puck on the live coordinate while off route", () => {
    const rawVehicleCoordinate = {
      latitude: routeCoordinates[0].latitude + 0.01,
      longitude: routeCoordinates[0].longitude + 0.01,
    };
    const snappedCoordinate = routeCoordinates[1];

    assert.deepEqual(
      resolveNavigationVehicleCoordinate({
        fallbackCoordinate: routeCoordinates[0],
        progress: progressSnapshot({
          isOffRoute: true,
          snappedCoordinate,
        }),
        rawVehicleCoordinate,
      }),
      rawVehicleCoordinate,
    );
    assert.deepEqual(
      resolveNavigationVehicleCoordinate({
        fallbackCoordinate: routeCoordinates[0],
        progress: progressSnapshot({
          isOffRoute: false,
          snappedCoordinate,
        }),
        rawVehicleCoordinate,
      }),
      snappedCoordinate,
    );
    assert.deepEqual(
      resolveNavigationVehicleCoordinate({
        fallbackCoordinate: routeCoordinates[0],
        progress: null,
        rawVehicleCoordinate: null,
      }),
      routeCoordinates[0],
    );
    assert.equal(
      resolveNavigationVehicleCoordinate({
        fallbackCoordinate: routeCoordinates[0],
        navigationActive: true,
        progress: null,
        rawVehicleCoordinate: null,
      }),
      null,
    );
  });

  it("suspends drive-along follow mode only for active map review gestures", () => {
    assert.equal(shouldSuspendDriveAlongCamera("navigating", true), true);
    assert.equal(shouldSuspendDriveAlongCamera("off-route", true), true);
    assert.equal(shouldSuspendDriveAlongCamera("paused", true), false);
    assert.equal(shouldSuspendDriveAlongCamera("loaded", true), false);
    assert.equal(shouldSuspendDriveAlongCamera("navigating", false), false);
  });

  it("creates a pitched route-facing camera with route lookahead", () => {
    const driveAlongCamera = resolveDriveAlongCamera(routeCoordinates[0], 90);
    const center = driveAlongCamera.camera.center;

    assert.ok(center);
    assert.equal(driveAlongCamera.camera.heading, 90);
    assert.equal(driveAlongCamera.camera.pitch, 58);
    assert.equal(driveAlongCamera.camera.zoom, 17.2);
    assert.equal(driveAlongCamera.durationMs, 650);
    assert.ok(center.longitude > routeCoordinates[0].longitude);
    assert.ok(Math.abs(center.latitude - routeCoordinates[0].latitude) < 0.0001);
  });

  it("skips tiny drive-along camera updates to avoid heading jitter", () => {
    const previousPose = {
      compact: false,
      coordinate: routeCoordinates[0],
      heading: 359,
      state: "navigating" as const,
    };

    assert.equal(
      shouldAnimateDriveAlongCamera(previousPose, {
        ...previousPose,
        coordinate: {
          latitude: routeCoordinates[0].latitude,
          longitude: routeCoordinates[0].longitude + 0.00001,
        },
        heading: 1,
      }),
      false,
    );
    assert.equal(
      shouldAnimateDriveAlongCamera(previousPose, {
        ...previousPose,
        heading: 8,
      }),
      true,
    );
    assert.equal(
      shouldAnimateDriveAlongCamera(previousPose, {
        ...previousPose,
        coordinate: routeCoordinates[1],
      }),
      true,
    );
  });

  it("uses a slightly wider drive-along camera on compact iPhones", () => {
    const regularCamera = resolveDriveAlongCamera(routeCoordinates[0], 0, false);
    const compactCamera = resolveDriveAlongCamera(routeCoordinates[0], 0, true);

    assert.ok(Number(compactCamera.camera.pitch) < Number(regularCamera.camera.pitch));
    assert.ok(Number(compactCamera.camera.zoom) < Number(regularCamera.camera.zoom));
    assert.ok(Number(compactCamera.camera.altitude) > Number(regularCamera.camera.altitude));
  });

  it("resets tilted navigation camera back to a north-up overview", () => {
    const overviewCamera = resolveOverviewCameraReset();

    assert.equal(overviewCamera.camera.heading, 0);
    assert.equal(overviewCamera.camera.pitch, 0);
    assert.ok(overviewCamera.durationMs > 0);
    assert.ok(overviewCamera.durationMs < 500);
  });
});
