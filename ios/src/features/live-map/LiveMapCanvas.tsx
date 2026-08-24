import { useRef, type RefObject } from "react";
import { Platform, StyleSheet } from "react-native";
import MapView, {
  Polyline,
  type Camera,
  type LatLng,
} from "react-native-maps";

import type { PermissionStatus } from "./liveLocationState";
import type {
  RiskZone,
  SavedSafeRoutePlan,
  SupportFacility,
} from "./liveMapTypes";
import type { NavigationLifecycle } from "./liveMapUiState";
import {
  CheckpointMarker,
  RiskOverlay,
  SupportFacilityMarker,
  VehicleMarker,
} from "./LiveMapMarkers";
import { resolveRouteLinePresentation } from "./routeLinePresentation";
import { uiTestIds } from "../../testing/uiTestIds";
import {
  SAFE_ROUTE_CAMERA_ZOOM_RANGE,
  SAFE_ROUTE_DARK_MAP_STYLE,
  SAFE_ROUTE_DARK_ROUTE_CASING,
  SAFE_ROUTE_DARK_ROUTE_GLOW,
  SAFE_ROUTE_ROUTE_CASING_WIDTH,
  SAFE_ROUTE_ROUTE_GLOW_WIDTH,
} from "../maps/safeRouteMapTheme";
import { shouldRenderRouteCheckpointMarker } from "../maps/mapMarkerPresentation";
import { SafeRouteDarkMapMask } from "../maps/SafeRouteDarkMapMask";
import { resolveSafeRouteMapType } from "../api/mapTransportState";

interface LiveMapCanvasProps {
  activeNavigationState: NavigationLifecycle;
  activeRiskZoneId?: string | null;
  demoDriveActive: boolean;
  initialCamera?: Camera | null;
  mapRef: RefObject<MapView | null>;
  onMapReady: () => void;
  onMapPress: () => void;
  onPanDrag: () => void;
  onRegionChangeComplete?: () => void;
  onRiskZonePress: (zone: RiskZone) => void;
  offline: boolean;
  permissionStatus: PermissionStatus;
  progressCoordinates: LatLng[];
  routePlan: SavedSafeRoutePlan;
  selectedRiskZoneId?: string | null;
  vehicleCoordinate: LatLng | null;
  visibleRiskZones: RiskZone[];
  visibleSupportFacilities: SupportFacility[];
}

export function LiveMapCanvas({
  activeNavigationState,
  activeRiskZoneId,
  demoDriveActive,
  initialCamera,
  mapRef,
  onMapReady,
  onMapPress,
  onPanDrag,
  onRegionChangeComplete,
  onRiskZonePress,
  offline,
  permissionStatus,
  progressCoordinates,
  routePlan,
  selectedRiskZoneId,
  vehicleCoordinate,
  visibleRiskZones,
  visibleSupportFacilities,
}: LiveMapCanvasProps) {
  const initialViewport = useRef(
    initialCamera
      ? { initialCamera }
      : { initialRegion: routePlan.region },
  ).current;
  const routeCoordinates = routePlan.route.coordinates;
  const routeLinePresentation = resolveRouteLinePresentation({
    progressCoordinateCount: progressCoordinates.length,
    routeCoordinateCount: routeCoordinates.length,
  });
  const showRouteCheckpoints =
    activeNavigationState !== "navigating" &&
    activeNavigationState !== "off-route";
  return (
    <>
      <MapView
      ref={mapRef}
      testID={uiTestIds.liveMapCanvas}
      style={StyleSheet.absoluteFill}
      {...initialViewport}
      cameraZoomRange={SAFE_ROUTE_CAMERA_ZOOM_RANGE}
      showsUserLocation={!demoDriveActive && permissionStatus === "granted"}
      {...(Platform.OS === "ios" && !demoDriveActive && permissionStatus === "granted"
        ? { showsUserHeadingIndicator: true }
        : {})}
      tintColor="#0A84FF"
      userLocationAnnotationTitle="Current location"
      showsMyLocationButton={false}
      showsCompass={false}
      showsBuildings
      showsIndoors={false}
      showsIndoorLevelPicker={false}
      showsScale={false}
      showsTraffic={!offline && routePlan.travelMode === "drive"}
      zoomEnabled
      pitchEnabled
      rotateEnabled
      toolbarEnabled={false}
      customMapStyle={SAFE_ROUTE_DARK_MAP_STYLE}
      mapType={resolveSafeRouteMapType({
        online: !offline,
        platform: Platform.OS,
      })}
      userInterfaceStyle="dark"
      onPress={(event) => {
        if (event.nativeEvent.action !== "marker-press") {
          onMapPress();
        }
      }}
      onMarkerPress={(event) => {
        const zone = visibleRiskZones.find(
          (candidate) => candidate.id === event.nativeEvent.id,
        );
        if (zone) {
          onRiskZonePress(zone);
        }
      }}
      onPanDrag={onPanDrag}
      onMapReady={() => {
        onMapReady();
      }}
      onRegionChangeComplete={() => {
        onRegionChangeComplete?.();
      }}
    >
      {Platform.OS === "ios" ? <SafeRouteDarkMapMask /> : null}
      {routeCoordinates.length > 1 ? (
        <>
          <Polyline
            coordinates={routeCoordinates}
            strokeColor={SAFE_ROUTE_DARK_ROUTE_CASING}
            strokeWidth={SAFE_ROUTE_ROUTE_CASING_WIDTH}
            lineCap="round"
            lineJoin="round"
            zIndex={20}
          />
          <Polyline
            coordinates={routeCoordinates}
            strokeColor={SAFE_ROUTE_DARK_ROUTE_GLOW}
            strokeWidth={SAFE_ROUTE_ROUTE_GLOW_WIDTH}
            lineCap="round"
            lineJoin="round"
            zIndex={21}
          />
          <Polyline
            coordinates={routeCoordinates}
            strokeColor={routeLinePresentation.remainingStrokeColor}
            strokeWidth={routeLinePresentation.remainingStrokeWidth}
            lineCap="round"
            lineJoin="round"
            zIndex={22}
          />
        </>
      ) : null}

      {routeLinePresentation.showCompletedSegment ? (
        <Polyline
          coordinates={progressCoordinates}
          strokeColor={routeLinePresentation.completedStrokeColor}
          strokeWidth={routeLinePresentation.completedStrokeWidth}
          lineCap="round"
          lineJoin="round"
          zIndex={23}
        />
      ) : null}

      {visibleRiskZones.map((zone) => (
        <RiskOverlay
          key={zone.id}
          active={zone.id === activeRiskZoneId}
          routeCoordinates={routeCoordinates}
          selected={zone.id === selectedRiskZoneId}
          zone={zone}
          onPress={onRiskZonePress}
        />
      ))}

      {visibleSupportFacilities.map((facility) => (
        <SupportFacilityMarker facility={facility} key={facility.id} />
      ))}

      {showRouteCheckpoints
        ? routePlan.checkpoints.filter((checkpoint) =>
            shouldRenderRouteCheckpointMarker({
              checkpoint,
              liveCoordinate: vehicleCoordinate,
              nativeUserLocationVisible:
                !demoDriveActive && permissionStatus === "granted",
            })
          ).map((checkpoint) => (
            <CheckpointMarker key={checkpoint.id} checkpoint={checkpoint} />
          ))
        : null}

      {vehicleCoordinate && demoDriveActive ? (
        <VehicleMarker
          coordinate={vehicleCoordinate}
          demoDriveEnabled
        />
      ) : null}
      </MapView>
    </>
  );
}
