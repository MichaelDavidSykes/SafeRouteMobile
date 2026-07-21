import type { RefObject } from "react";
import { Platform, StyleSheet } from "react-native";
import MapView, { Polyline, type LatLng } from "react-native-maps";

import type { PermissionStatus } from "./liveLocationState";
import type { RouteRiskProximity } from "./routeRisk";
import type { RiskZone, SavedSafeRoutePlan } from "./liveMapTypes";
import type { NavigationLifecycle } from "./liveMapUiState";
import { shouldShowNativeUserLocation } from "./liveMapUiState";
import { CheckpointMarker, RiskOverlay, VehicleMarker } from "./LiveMapMarkers";
import { LiveMapRiskDetailCallout } from "./LiveMapRiskDetailCallout";
import { resolveRouteLinePresentation } from "./routeLinePresentation";
import { uiTestIds } from "../../testing/uiTestIds";
import {
  SAFE_ROUTE_DARK_MAP_STYLE,
  SAFE_ROUTE_DARK_ROUTE_CASING,
  SAFE_ROUTE_DARK_ROUTE_GLOW,
  SAFE_ROUTE_ROUTE_CASING_WIDTH,
  SAFE_ROUTE_ROUTE_GLOW_WIDTH,
} from "../maps/safeRouteMapTheme";
import { shouldRenderRouteCheckpointMarker } from "../maps/mapMarkerPresentation";
import { resolveSafeRouteMapType } from "../api/mapTransportState";

interface LiveMapCanvasProps {
  activeNavigationState: NavigationLifecycle;
  activeRiskZoneId?: string | null;
  demoDriveActive: boolean;
  heading: number;
  mapRef: RefObject<MapView | null>;
  onMapReady: () => void;
  onPanDrag: () => void;
  onRiskZonePress: (zone: RiskZone) => void;
  onDismissRiskDetail: () => void;
  offline: boolean;
  permissionStatus: PermissionStatus;
  progressCoordinates: LatLng[];
  routePlan: SavedSafeRoutePlan;
  selectedRiskZoneId?: string | null;
  selectedRiskZone?: RiskZone | null;
  selectedRiskProximity?: RouteRiskProximity | null;
  vehicleCoordinate: LatLng | null;
  visibleRiskZones: RiskZone[];
}

export function LiveMapCanvas({
  activeNavigationState,
  activeRiskZoneId,
  demoDriveActive,
  heading,
  mapRef,
  onMapReady,
  onPanDrag,
  onRiskZonePress,
  onDismissRiskDetail,
  offline,
  permissionStatus,
  progressCoordinates,
  routePlan,
  selectedRiskZoneId,
  selectedRiskZone,
  selectedRiskProximity,
  vehicleCoordinate,
  visibleRiskZones,
}: LiveMapCanvasProps) {
  const routeCoordinates = routePlan.route.coordinates;
  const routeLinePresentation = resolveRouteLinePresentation({
    progressCoordinateCount: progressCoordinates.length,
    routeCoordinateCount: routeCoordinates.length,
  });
  const showRouteCheckpoints =
    activeNavigationState !== "navigating" &&
    activeNavigationState !== "off-route";
  const showNativeUserLocation = shouldShowNativeUserLocation({
    demoDriveActive,
    permissionStatus,
    state: activeNavigationState,
  });

  return (
    <>
      <MapView
      ref={mapRef}
      testID={uiTestIds.liveMapCanvas}
      style={StyleSheet.absoluteFill}
      initialRegion={routePlan.region}
      showsUserLocation={showNativeUserLocation}
      showsMyLocationButton={false}
      showsCompass={false}
      showsBuildings
      showsIndoors={false}
      showsIndoorLevelPicker={false}
      showsScale={false}
      showsTraffic={false}
      pitchEnabled
      rotateEnabled={
        activeNavigationState === "navigating" ||
        activeNavigationState === "off-route"
      }
      toolbarEnabled={false}
      customMapStyle={SAFE_ROUTE_DARK_MAP_STYLE}
      mapType={resolveSafeRouteMapType({
        online: !offline,
        platform: Platform.OS,
      })}
      userInterfaceStyle="dark"
      onPanDrag={onPanDrag}
      onMapReady={onMapReady}
    >
      {routeCoordinates.length > 1 ? (
        <>
          <Polyline
            coordinates={routeCoordinates}
            strokeColor={SAFE_ROUTE_DARK_ROUTE_CASING}
            strokeWidth={SAFE_ROUTE_ROUTE_CASING_WIDTH}
            lineCap="round"
            lineJoin="round"
          />
          <Polyline
            coordinates={routeCoordinates}
            strokeColor={SAFE_ROUTE_DARK_ROUTE_GLOW}
            strokeWidth={SAFE_ROUTE_ROUTE_GLOW_WIDTH}
            lineCap="round"
            lineJoin="round"
          />
          <Polyline
            coordinates={routeCoordinates}
            strokeColor={routeLinePresentation.remainingStrokeColor}
            strokeWidth={routeLinePresentation.remainingStrokeWidth}
            lineCap="round"
            lineJoin="round"
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

      {showRouteCheckpoints
        ? routePlan.checkpoints.filter((checkpoint) =>
            shouldRenderRouteCheckpointMarker({
              checkpoint,
              liveCoordinate: vehicleCoordinate,
              nativeUserLocationVisible: showNativeUserLocation,
            })
          ).map((checkpoint) => (
            <CheckpointMarker key={checkpoint.id} checkpoint={checkpoint} />
          ))
        : null}

      {vehicleCoordinate ? (
        <VehicleMarker
          coordinate={vehicleCoordinate}
          demoDriveEnabled={demoDriveActive}
          heading={heading}
        />
      ) : null}
      </MapView>
      {selectedRiskZone ? (
        <LiveMapRiskDetailCallout
          mapRef={mapRef}
          proximity={selectedRiskProximity}
          zone={selectedRiskZone}
          onDismiss={onDismissRiskDetail}
        />
      ) : null}
    </>
  );
}
