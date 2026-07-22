import type { CameraZoomRange, MapStyleElement } from "react-native-maps";

export const SAFE_ROUTE_DARK_ROUTE_CASING = "#ffffff";
export const SAFE_ROUTE_DARK_ROUTE_GLOW = "#ffffff";
export const SAFE_ROUTE_ROUTE_CASING_WIDTH = 9;
export const SAFE_ROUTE_ROUTE_GLOW_WIDTH = 7;
export const SAFE_ROUTE_ROUTE_CORE_WIDTH = 5;
export const SAFE_ROUTE_CAMERA_ZOOM_RANGE: CameraZoomRange = {
  maxCenterCoordinateDistance: 40_000_000,
};

/**
 * Google Maps styling used on Android and whenever the Google provider is
 * selected on iOS. Apple Maps receives the matching native dark appearance
 * through MapView's userInterfaceStyle prop.
 */
export const SAFE_ROUTE_DARK_MAP_STYLE: MapStyleElement[] = [
  {
    elementType: "geometry",
    stylers: [{ color: "#07090c" }],
  },
  {
    elementType: "labels.text.fill",
    stylers: [{ color: "#767d87" }],
  },
  {
    elementType: "labels.text.stroke",
    stylers: [{ color: "#07090c" }],
  },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#242930" }],
  },
  {
    featureType: "landscape.man_made",
    elementType: "geometry",
    stylers: [{ color: "#0b0e12" }],
  },
  {
    featureType: "landscape.natural",
    elementType: "geometry",
    stylers: [{ color: "#090c10" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#0d1015" }],
  },
  {
    featureType: "poi.business",
    elementType: "labels.icon",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#0a110f" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#5f7468" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#20242a" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#090b0e" }],
  },
  {
    featureType: "road.arterial",
    elementType: "geometry",
    stylers: [{ color: "#252a31" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#2d333b" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#11151a" }],
  },
  {
    featureType: "road.local",
    elementType: "labels.text.fill",
    stylers: [{ color: "#707782" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#14181e" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#04080c" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#536271" }],
  },
];
