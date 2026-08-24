import type { Camera, LatLng } from "react-native-maps";

import type { NavigationLifecycle } from "./liveMapUiState";
import {
  bearingBetween,
  haversineDistanceMeters,
  type RouteProgressSnapshot,
} from "./routeProgress";

const EARTH_RADIUS_METERS = 6371000;
const DRIVE_ALONG_CAMERA_DURATION_MS = 650;
const DRIVE_ALONG_CAMERA_LOOK_AHEAD_METERS = 58;
const DRIVE_ALONG_CAMERA_PITCH = 58;
const DRIVE_ALONG_CAMERA_ZOOM = 17.2;
const DRIVE_ALONG_CAMERA_ALTITUDE = 520;
const OVERVIEW_CAMERA_RESET_DURATION_MS = 320;
const CAMERA_MIN_ANIMATION_DISTANCE_METERS = 4;
const CAMERA_MIN_ANIMATION_HEADING_DEGREES = 4;

export interface DriveAlongCamera {
  camera: Partial<Camera>;
  durationMs: number;
}

export interface OverviewCameraReset {
  camera: Partial<Camera>;
  durationMs: number;
}

export interface DriveAlongCameraPose {
  compact: boolean;
  coordinate: LatLng;
  heading: number;
  state: NavigationLifecycle;
}

export interface NavigationVehicleCoordinateOptions {
  fallbackCoordinate?: LatLng | null;
  navigationActive?: boolean;
  progress: RouteProgressSnapshot | null;
  rawVehicleCoordinate?: LatLng | null;
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

export function resolveNavigationVehicleCoordinate({
  fallbackCoordinate,
  navigationActive = false,
  progress,
  rawVehicleCoordinate,
}: NavigationVehicleCoordinateOptions): LatLng | null {
  if (progress?.isOffRoute && rawVehicleCoordinate) {
    return rawVehicleCoordinate;
  }

  // A route endpoint is useful while reviewing a route, but it is not a valid
  // vehicle location. Waiting for a real/recovered location sample prevents a
  // resumed guidance session from briefly flying to the start of the route.
  if (navigationActive && !progress && !rawVehicleCoordinate) {
    return null;
  }

  return (
    progress?.snappedCoordinate ||
    rawVehicleCoordinate ||
    fallbackCoordinate ||
    null
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

export function resolveDriveAlongHandoffCamera(
  vehicleCoordinate: LatLng,
  heading: number | null | undefined,
  compact = false,
): Camera {
  const targetCamera = resolveDriveAlongCamera(
    vehicleCoordinate,
    heading,
    compact,
  ).camera;

  return {
    altitude: Number(targetCamera.altitude) * 1.42,
    center: targetCamera.center || vehicleCoordinate,
    heading: Number(targetCamera.heading),
    pitch: Math.max(34, Number(targetCamera.pitch) - 16),
    zoom: Number(targetCamera.zoom) - 0.85,
  };
}

export function shouldAnimateDriveAlongCamera(
  previousPose: DriveAlongCameraPose | null | undefined,
  nextPose: DriveAlongCameraPose,
): boolean {
  if (!previousPose) {
    return true;
  }

  if (
    previousPose.compact !== nextPose.compact ||
    previousPose.state !== nextPose.state
  ) {
    return true;
  }

  const distanceMeters = haversineDistanceMeters(
    previousPose.coordinate,
    nextPose.coordinate,
  );
  const headingDelta = headingDeltaDegrees(
    previousPose.heading,
    nextPose.heading,
  );

  return (
    distanceMeters >= CAMERA_MIN_ANIMATION_DISTANCE_METERS ||
    headingDelta >= CAMERA_MIN_ANIMATION_HEADING_DEGREES
  );
}

export function resolveOverviewCameraReset(): OverviewCameraReset {
  return {
    camera: {
      heading: 0,
      pitch: 0,
    },
    durationMs: OVERVIEW_CAMERA_RESET_DURATION_MS,
  };
}

function headingDeltaDegrees(first: number, second: number): number {
  const delta = Math.abs(normalizeHeading(first) - normalizeHeading(second));
  return Math.min(delta, 360 - delta);
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
