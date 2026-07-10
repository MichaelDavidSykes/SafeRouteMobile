import type { LatLng } from 'react-native-maps';

import { haversineDistanceMeters } from '../live-map/routeGeometry';

export type GuestMapCenteredLocation = {
  coordinate: LatLng;
  timestampMs: number;
};

export function shouldRecenterGuestMap({
  candidate,
  previous,
  routePlotted,
  userMovedMap,
  minimumMovementMeters = 75
}: {
  candidate: GuestMapCenteredLocation | null;
  previous: GuestMapCenteredLocation | null;
  routePlotted: boolean;
  userMovedMap: boolean;
  minimumMovementMeters?: number;
}): boolean {
  if (!candidate || routePlotted || userMovedMap || !isValidCoordinate(candidate.coordinate)) {
    return false;
  }
  if (!previous) {
    return true;
  }
  if (candidate.timestampMs <= previous.timestampMs) {
    return false;
  }
  return haversineDistanceMeters(previous.coordinate, candidate.coordinate) >= minimumMovementMeters;
}

function isValidCoordinate(coordinate: LatLng): boolean {
  return Number.isFinite(coordinate.latitude) &&
    Number.isFinite(coordinate.longitude) &&
    coordinate.latitude >= -90 &&
    coordinate.latitude <= 90 &&
    coordinate.longitude >= -180 &&
    coordinate.longitude <= 180;
}
