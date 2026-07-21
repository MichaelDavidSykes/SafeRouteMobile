import type { LatLng } from "react-native-maps";

import type { RouteCheckpoint } from "../live-map/liveMapTypes";
import { haversineDistanceMeters } from "../live-map/routeGeometry";

const USER_LOCATION_OVERLAP_METERS = 35;

export function shouldRenderRouteCheckpointMarker({
  checkpoint,
  liveCoordinate,
  nativeUserLocationVisible,
}: {
  checkpoint: RouteCheckpoint;
  liveCoordinate?: LatLng | null;
  nativeUserLocationVisible: boolean;
}): boolean {
  if (
    checkpoint.kind !== "origin" ||
    !nativeUserLocationVisible ||
    !liveCoordinate
  ) {
    return true;
  }

  return haversineDistanceMeters(checkpoint.coordinate, liveCoordinate) >
    USER_LOCATION_OVERLAP_METERS;
}
