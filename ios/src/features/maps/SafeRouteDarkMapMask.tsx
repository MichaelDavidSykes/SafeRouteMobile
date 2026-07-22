import { Polygon, type LatLng } from "react-native-maps";

import { SAFE_ROUTE_DARK_MAP_MASK } from "./safeRouteMapTheme";

const WESTERN_HEMISPHERE: LatLng[] = [
  { latitude: -85, longitude: -179.999 },
  { latitude: 85, longitude: -179.999 },
  { latitude: 85, longitude: 0 },
  { latitude: -85, longitude: 0 },
];

const EASTERN_HEMISPHERE: LatLng[] = [
  { latitude: -85, longitude: 0 },
  { latitude: 85, longitude: 0 },
  { latitude: 85, longitude: 179.999 },
  { latitude: -85, longitude: 179.999 },
];

export function SafeRouteDarkMapMask() {
  return (
    <>
      {[WESTERN_HEMISPHERE, EASTERN_HEMISPHERE].map((coordinates, index) => (
        <Polygon
          key={index === 0 ? "dark-map-west" : "dark-map-east"}
          coordinates={coordinates}
          fillColor={SAFE_ROUTE_DARK_MAP_MASK}
          strokeColor="transparent"
          strokeWidth={0}
          tappable={false}
          zIndex={-100}
        />
      ))}
    </>
  );
}
