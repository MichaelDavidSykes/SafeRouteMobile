import type { RefObject } from "react";
import { StyleSheet } from "react-native";
import MapView, { Polyline, type LatLng } from "react-native-maps";

import type { PermissionStatus } from "./liveLocationState";
import type { SavedSafeRoutePlan } from "./liveMapTypes";
import type { NavigationLifecycle } from "./liveMapUiState";
import { CheckpointMarker, RiskOverlay, VehicleMarker } from "./LiveMapMarkers";
import { uiTestIds } from "../../testing/uiTestIds";
import { colors } from "../../theme";

interface LiveMapCanvasProps {
  activeNavigationState: NavigationLifecycle;
  alertsVisible: boolean;
  demoDriveActive: boolean;
  heading: number;
  mapRef: RefObject<MapView | null>;
  onMapReady: () => void;
  onPanDrag: () => void;
  permissionStatus: PermissionStatus;
  progressCoordinates: LatLng[];
  routePlan: SavedSafeRoutePlan;
  vehicleCoordinate: LatLng | null;
}

export function LiveMapCanvas({
  activeNavigationState,
  alertsVisible,
  demoDriveActive,
  heading,
  mapRef,
  onMapReady,
  onPanDrag,
  permissionStatus,
  progressCoordinates,
  routePlan,
  vehicleCoordinate,
}: LiveMapCanvasProps) {
  const routeCoordinates = routePlan.route.coordinates;

  return (
    <MapView
      ref={mapRef}
      testID={uiTestIds.liveMapCanvas}
      style={StyleSheet.absoluteFill}
      initialRegion={routePlan.region}
      showsUserLocation={permissionStatus === "granted" && !demoDriveActive}
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

      {alertsVisible
        ? routePlan.riskZones.map((zone) => (
            <RiskOverlay key={zone.id} zone={zone} />
          ))
        : null}

      {routePlan.checkpoints.map((checkpoint) => (
        <CheckpointMarker key={checkpoint.id} checkpoint={checkpoint} />
      ))}

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
