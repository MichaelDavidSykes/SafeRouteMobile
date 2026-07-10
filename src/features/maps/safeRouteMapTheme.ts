import type { MapStyleElement } from "react-native-maps";

import { colors } from "../../theme";

export const SAFE_ROUTE_DARK_ROUTE_CASING = "rgba(3, 9, 17, 0.9)";
export const SAFE_ROUTE_DARK_ROUTE_GLOW = "rgba(92, 164, 255, 0.32)";
export const SAFE_ROUTE_ROUTE_CASING_WIDTH = 8;
export const SAFE_ROUTE_ROUTE_GLOW_WIDTH = 6;
export const SAFE_ROUTE_ROUTE_CORE_WIDTH = 4;

/**
 * Google Maps styling used on Android and whenever the Google provider is
 * selected on iOS. Apple Maps receives the matching native dark appearance
 * through MapView's userInterfaceStyle prop.
 */
export const SAFE_ROUTE_DARK_MAP_STYLE: MapStyleElement[] = [
  {
    elementType: "geometry",
    stylers: [{ color: colors.mapFallback }],
  },
  {
    elementType: "labels.text.fill",
    stylers: [{ color: "#9ba2ad" }],
  },
  {
    elementType: "labels.text.stroke",
    stylers: [{ color: colors.mapFallback }],
  },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#343a45" }],
  },
  {
    featureType: "landscape.natural",
    elementType: "geometry",
    stylers: [{ color: "#141920" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#191e25" }],
  },
  {
    featureType: "poi.business",
    elementType: "labels.icon",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#17241e" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#789481" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#282d36" }],
  },
  {
    featureType: "road.arterial",
    elementType: "geometry",
    stylers: [{ color: "#303641" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#3a414d" }],
  },
  {
    featureType: "road.local",
    elementType: "labels.text.fill",
    stylers: [{ color: "#858d99" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#20252d" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0a1a28" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#70899f" }],
  },
];
