import type { Camera, LatLng } from "react-native-maps";

import type { NavigationLifecycle } from "./liveMapUiState";
import { bearingBetween, type RouteProgressSnapshot } from "./routeProgress";

const EARTH_RADIUS_METERS = 6371000;
const DRIVE_ALONG_CAMERA_DURATION_MS = 650;
const DRIVE_ALONG_CAMERA_LOOK_AHEAD_METERS = 58;
const DRIVE_ALONG_CAMERA_PITCH = 58;
const DRIVE_ALONG_CAMERA_ZOOM = 17.2;
const DRIVE_ALONG_CAMERA_ALTITUDE = 520;

export interface DriveAlongCamera {
  camera: Partial<Camera>;
  durationMs: number;
}

export function resolveActiveNavigationState(
  state: NavigationLifecycle,
  progress: RouteProgressSnapshot | null,
): NavigationLifecycle {
  if (state === "navigating" || state === "off-route") {
    if (progress?.isArrived) {
      return "arrived";
    }
    if (progress?.isOffRoute) {
      return "off-route";
    }
    return "navigating";
  }

  return state;
}

export function resolveVehicleHeading(
  coordinates: LatLng[],
  progress: RouteProgressSnapshot | null,
  gpsHeading: number | null | undefined,
  demoDriveEnabled: boolean,
  routeStep: number,
): number {
  if (
    !demoDriveEnabled &&
    typeof gpsHeading === "number" &&
    Number.isFinite(gpsHeading) &&
    gpsHeading >= 0
  ) {
    return normalizeHeading(gpsHeading);
  }

  if (progress && coordinates[progress.nearestSegmentIndex + 1]) {
    return normalizeHeading(bearingBetween(
      coordinates[progress.nearestSegmentIndex],
      coordinates[progress.nearestSegmentIndex + 1],
    ));
  }

  if (coordinates[routeStep + 1]) {
    return normalizeHeading(bearingBetween(coordinates[routeStep], coordinates[routeStep + 1]));
  }

  return 0;
}

export function shouldUseDriveAlongCamera(
  state: NavigationLifecycle,
  followModeEnabled: boolean,
  vehicleCoordinate: LatLng | null | undefined,
): boolean {
  return Boolean(
    followModeEnabled &&
      vehicleCoordinate &&
      (state === "navigating" || state === "off-route"),
  );
}

export function shouldSuspendDriveAlongCamera(
  state: NavigationLifecycle,
  followModeEnabled: boolean,
): boolean {
  return Boolean(
    followModeEnabled &&
      (state === "navigating" || state === "off-route"),
  );
}

export function resolveDriveAlongCamera(
  vehicleCoordinate: LatLng,
  heading: number | null | undefined,
  compact = false,
): DriveAlongCamera {
  const normalizedHeading = normalizeHeading(heading);
  const lookAheadMeters = compact
    ? DRIVE_ALONG_CAMERA_LOOK_AHEAD_METERS * 0.72
    : DRIVE_ALONG_CAMERA_LOOK_AHEAD_METERS;

  return {
    camera: {
      altitude: compact
        ? DRIVE_ALONG_CAMERA_ALTITUDE * 1.16
        : DRIVE_ALONG_CAMERA_ALTITUDE,
      center: coordinateAtBearingDistance(
        vehicleCoordinate,
        normalizedHeading,
        lookAheadMeters,
      ),
      heading: normalizedHeading,
      pitch: compact ? 53 : DRIVE_ALONG_CAMERA_PITCH,
      zoom: compact ? 16.85 : DRIVE_ALONG_CAMERA_ZOOM,
    },
    durationMs: DRIVE_ALONG_CAMERA_DURATION_MS,
  };
}

function coordinateAtBearingDistance(
  origin: LatLng,
  heading: number,
  distanceMeters: number,
): LatLng {
  const angularDistance = distanceMeters / EARTH_RADIUS_METERS;
  const bearing = toRadians(heading);
  const latitude = toRadians(origin.latitude);
  const longitude = toRadians(origin.longitude);
  const destinationLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(angularDistance) +
      Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const destinationLongitude =
    longitude +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
      Math.cos(angularDistance) -
        Math.sin(latitude) * Math.sin(destinationLatitude),
    );

  return {
    latitude: toDegrees(destinationLatitude),
    longitude: normalizeLongitude(toDegrees(destinationLongitude)),
  };
}

function normalizeHeading(heading: number | null | undefined): number {
  if (!Number.isFinite(Number(heading))) {
    return 0;
  }

  return ((Number(heading) % 360) + 360) % 360;
}

function normalizeLongitude(longitude: number): number {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}
