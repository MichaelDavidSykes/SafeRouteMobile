import type { RefObject } from "react";
import { useRef, useState } from "react";
import { Platform, StyleSheet } from "react-native";
import MapView, { Polyline, type LatLng } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { PermissionStatus } from "./liveLocationState";
import type { RouteRiskProximity } from "./routeRisk";
import type {
  RiskZone,
  SavedSafeRoutePlan,
  SupportFacility,
} from "./liveMapTypes";
import type { NavigationLifecycle } from "./liveMapUiState";
import { shouldShowNativeUserLocation } from "./liveMapUiState";
import {
  CheckpointMarker,
  CompassTrackedMarker,
  RiskOverlay,
  SupportFacilityMarker,
} from "./LiveMapMarkers";
import { LiveMapRiskDetailCallout } from "./LiveMapRiskDetailCallout";
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
  heading: number | null;
  mapRef: RefObject<MapView | null>;
  onMapReady: () => void;
  onMapPress: () => void;
  onPanDrag: () => void;
  onRegionChangeComplete?: () => void;
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
  visibleSupportFacilities: SupportFacility[];
}

export function LiveMapCanvas({
  activeNavigationState,
  activeRiskZoneId,
  demoDriveActive,
  heading,
  mapRef,
  onMapReady,
  onMapPress,
  onPanDrag,
  onRegionChangeComplete,
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
  visibleSupportFacilities,
}: LiveMapCanvasProps) {
  const safeAreaInsets = useSafeAreaInsets();
  const mapCameraRequestIdRef = useRef(0);
  const [mapCameraHeadingDegrees, setMapCameraHeadingDegrees] = useState(0);
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
  const refreshMapCameraHeading = () => {
    const requestId = mapCameraRequestIdRef.current + 1;
    mapCameraRequestIdRef.current = requestId;
    const cameraPromise = mapRef.current?.getCamera();
    if (!cameraPromise) {
      return;
    }
    void cameraPromise.then((camera) => {
      if (mapCameraRequestIdRef.current !== requestId) {
        return;
      }
      const nextHeading = Number(camera.heading);
      setMapCameraHeadingDegrees(Number.isFinite(nextHeading) ? nextHeading : 0);
    }).catch(() => undefined);
  };

  return (
    <>
      <MapView
      ref={mapRef}
      testID={uiTestIds.liveMapCanvas}
      style={StyleSheet.absoluteFill}
      initialRegion={routePlan.region}
      cameraZoomRange={SAFE_ROUTE_CAMERA_ZOOM_RANGE}
      showsUserLocation={showNativeUserLocation}
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
      onPress={onMapPress}
      onPanDrag={onPanDrag}
      onMapReady={() => {
        onMapReady();
        refreshMapCameraHeading();
      }}
      onRegionChangeComplete={() => {
        refreshMapCameraHeading();
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
              nativeUserLocationVisible: showNativeUserLocation,
            })
          ).map((checkpoint) => (
            <CheckpointMarker key={checkpoint.id} checkpoint={checkpoint} />
          ))
        : null}

      {vehicleCoordinate ? (
        <CompassTrackedMarker
          coordinate={vehicleCoordinate}
          demoDriveEnabled={demoDriveActive}
          enabled={!demoDriveActive && permissionStatus === "granted"}
          fallbackHeading={heading}
          mapHeading={mapCameraHeadingDegrees}
        />
      ) : null}
      </MapView>
      {selectedRiskZone ? (
        <LiveMapRiskDetailCallout
          bottomInset={safeAreaInsets.bottom + 12}
          mapRef={mapRef}
          proximity={selectedRiskProximity}
          zone={selectedRiskZone}
          onDismiss={onDismissRiskDetail}
        />
      ) : null}
    </>
  );
}
