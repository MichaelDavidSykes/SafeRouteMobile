import type { RefObject } from "react";
import { StyleSheet } from "react-native";
import MapView, { Polyline, type LatLng } from "react-native-maps";

import type { PermissionStatus } from "./liveLocationState";
import type { RiskZone, SavedSafeRoutePlan } from "./liveMapTypes";
import type { NavigationLifecycle } from "./liveMapUiState";
import { shouldShowNativeUserLocation } from "./liveMapUiState";
import { CheckpointMarker, RiskOverlay, VehicleMarker } from "./LiveMapMarkers";
import { uiTestIds } from "../../testing/uiTestIds";
import { colors } from "../../theme";

interface LiveMapCanvasProps {
  activeNavigationState: NavigationLifecycle;
  activeRiskZoneId?: string | null;
  demoDriveActive: boolean;
  heading: number;
  mapRef: RefObject<MapView | null>;
  onMapReady: () => void;
  onPanDrag: () => void;
  onRiskZonePress: (zone: RiskZone) => void;
  permissionStatus: PermissionStatus;
  progressCoordinates: LatLng[];
  routePlan: SavedSafeRoutePlan;
  selectedRiskZoneId?: string | null;
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
  permissionStatus,
  progressCoordinates,
  routePlan,
  selectedRiskZoneId,
  vehicleCoordinate,
  visibleRiskZones,
}: LiveMapCanvasProps) {
  const routeCoordinates = routePlan.route.coordinates;
  const showRouteCheckpoints =
    activeNavigationState !== "navigating" &&
    activeNavigationState !== "off-route";
  const showNativeUserLocation = shouldShowNativeUserLocation({
    demoDriveActive,
    permissionStatus,
    state: activeNavigationState,
  });

  return (
    <MapView
      ref={mapRef}
      testID={uiTestIds.liveMapCanvas}
      style={StyleSheet.absoluteFill}
      initialRegion={routePlan.region}
      showsUserLocation={showNativeUserLocation}
      showsMyLocationButton={false}
      showsCompass={false}
      showsBuildings={false}
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
      userInterfaceStyle="light"
      onPanDrag={onPanDrag}
      onMapReady={onMapReady}
    >
      {routeCoordinates.length > 1 ? (
        <>
          <Polyline
            coordinates={routeCoordinates}
            strokeColor="rgba(255, 255, 255, 0.92)"
            strokeWidth={13}
            lineCap="round"
            lineJoin="round"
          />
          <Polyline
            coordinates={routeCoordinates}
            strokeColor="rgba(60, 60, 67, 0.18)"
            strokeWidth={10}
            lineCap="round"
            lineJoin="round"
          />
          <Polyline
            coordinates={routeCoordinates}
            strokeColor={colors.routeRemaining}
            strokeWidth={7}
            lineCap="round"
            lineJoin="round"
          />
        </>
      ) : null}

      {progressCoordinates.length > 1 ? (
        <Polyline
          coordinates={progressCoordinates}
          strokeColor={colors.routePrimary}
          strokeWidth={7}
          lineCap="round"
          lineJoin="round"
        />
      ) : null}

      {visibleRiskZones.map((zone) => (
        <RiskOverlay
          key={zone.id}
          active={zone.id === activeRiskZoneId}
          selected={zone.id === selectedRiskZoneId}
          zone={zone}
          onPress={onRiskZonePress}
        />
      ))}

      {showRouteCheckpoints
        ? routePlan.checkpoints.map((checkpoint) => (
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
  );
}
