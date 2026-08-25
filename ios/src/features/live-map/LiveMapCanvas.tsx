import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import MapView, {
  Polyline,
  type Camera,
  type LatLng,
  type Region,
} from "react-native-maps";

import type { PermissionStatus } from "./liveLocationState";
import type {
  RiskZone,
  SavedSafeRoutePlan,
  SupportFacility,
} from "./liveMapTypes";
import type { NavigationLifecycle } from "./liveMapUiState";
import {
  ActiveRiskTouchMarker,
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
import {
  resolveRiskMapTapToleranceMeters,
  resolveRiskZoneAtMapCoordinate,
} from "./mapRiskInteraction";

const DIRECT_RISK_TOUCH_SUPPRESSION_MS = 1_200;
const ACTIVE_RISK_TOUCH_TARGET_SIZE = 52;
const ACTIVE_RISK_PROJECTION_REGION_MARGIN = 1.5;
const MAX_ACTIVE_RISK_TOUCH_TARGETS = 32;

interface ActiveRiskTouchTarget {
  point: { x: number; y: number };
  zone: RiskZone;
}

interface LiveMapCanvasProps {
  activeNavigationState: NavigationLifecycle;
  activeRiskZoneId?: string | null;
  demoDriveActive: boolean;
  initialCamera?: Camera | null;
  mapRef: RefObject<MapView | null>;
  onMapInteractionStart: () => void;
  onMapReady: () => void;
  onMapPress: () => void;
  onPanDrag: () => void;
  onRegionChangeComplete?: () => void;
  onRiskZonePress: (zone: RiskZone) => void;
  offline: boolean;
  permissionStatus: PermissionStatus;
  progressCoordinates: LatLng[];
  mountedRiskZones: RiskZone[];
  routePlan: SavedSafeRoutePlan;
  supportFacilities: SupportFacility[];
  supportFacilitiesVisible: boolean;
  vehicleCoordinate: LatLng | null;
  visibleRiskZoneIds: ReadonlySet<string>;
}

export function LiveMapCanvas({
  activeNavigationState,
  activeRiskZoneId,
  demoDriveActive,
  initialCamera,
  mapRef,
  onMapInteractionStart,
  onMapReady,
  onMapPress,
  onPanDrag,
  onRegionChangeComplete,
  onRiskZonePress,
  offline,
  permissionStatus,
  progressCoordinates,
  mountedRiskZones,
  routePlan,
  supportFacilities,
  supportFacilitiesVisible,
  vehicleCoordinate,
  visibleRiskZoneIds,
}: LiveMapCanvasProps) {
  const viewport = useWindowDimensions();
  const initialViewport = useRef(
    initialCamera
      ? { initialCamera }
      : { initialRegion: routePlan.region },
  ).current;
  const latestRegionRef = useRef<Region>(routePlan.region);
  const lastDirectRiskTouchAtMsRef = useRef(0);
  const riskTouchProjectionRevisionRef = useRef(0);
  const [activeRiskTouchTargets, setActiveRiskTouchTargets] = useState<
    ActiveRiskTouchTarget[]
  >([]);
  const routeCoordinates = routePlan.route.coordinates;
  const routeLinePresentation = resolveRouteLinePresentation({
    progressCoordinateCount: progressCoordinates.length,
    routeCoordinateCount: routeCoordinates.length,
  });
  const showRouteCheckpoints =
    activeNavigationState !== "navigating" &&
    activeNavigationState !== "off-route";
  const visibleRiskZones = useMemo(
    () => mountedRiskZones.filter((zone) => visibleRiskZoneIds.has(zone.id)),
    [mountedRiskZones, visibleRiskZoneIds],
  );
  const activeRiskTouchLayerVisible =
    activeNavigationState === "navigating" ||
    activeNavigationState === "off-route";
  const refreshActiveRiskTouchTargets = useCallback(() => {
    const revision = riskTouchProjectionRevisionRef.current + 1;
    riskTouchProjectionRevisionRef.current = revision;
    const map = mapRef.current;
    if (!activeRiskTouchLayerVisible || !map) {
      setActiveRiskTouchTargets([]);
      return;
    }

    const region = latestRegionRef.current;
    const candidateZones = visibleRiskZones
      .filter((zone) => riskZoneCouldBeVisibleInRegion(zone, region))
      .sort((first, second) => (
        riskZoneDistanceFromRegionCenter(first, region) -
        riskZoneDistanceFromRegionCenter(second, region)
      ))
      .slice(0, MAX_ACTIVE_RISK_TOUCH_TARGETS);

    void Promise.all(candidateZones.map(async (zone) => {
      try {
        const point = await map.pointForCoordinate(zone.coordinate);
        return { point, zone };
      } catch {
        return null;
      }
    })).then((targets) => {
      if (riskTouchProjectionRevisionRef.current !== revision) {
        return;
      }

      const viewportMargin = ACTIVE_RISK_TOUCH_TARGET_SIZE / 2;
      setActiveRiskTouchTargets(targets.filter(
        (target): target is ActiveRiskTouchTarget => Boolean(
          target &&
          Number.isFinite(target.point.x) &&
          Number.isFinite(target.point.y) &&
          target.point.x >= -viewportMargin &&
          target.point.x <= viewport.width + viewportMargin &&
          target.point.y >= -viewportMargin &&
          target.point.y <= viewport.height + viewportMargin
        ),
      ));
    });
  }, [
    activeRiskTouchLayerVisible,
    mapRef,
    viewport.height,
    viewport.width,
    visibleRiskZones,
  ]);

  useEffect(() => {
    refreshActiveRiskTouchTargets();
  }, [refreshActiveRiskTouchTargets]);
  const completedSegmentCoordinates = progressCoordinates.length > 1
    ? progressCoordinates
    : routeCoordinates.slice(0, 2);
  // Replace the whole native map only when its structural inventory changes.
  // Ordinary navigation state and visibility updates keep every child index
  // stable, avoiding AIRMap insertion crashes and camera resets.
  const mapTopologyKey = useMemo(
    () => [
      routePlan.route.id,
      mountedRiskZones
        .map((zone) => [
          zone.id,
          zone.polygonCoordinates && zone.polygonCoordinates.length > 2
            ? "polygon"
            : zone.routeSegmentCoordinates && zone.routeSegmentCoordinates.length > 1
              ? "segment"
              : "circle",
          zone.connectorCoordinates && zone.connectorCoordinates.length > 1
            ? "connector"
            : "none",
        ].join(":"))
        .join("|"),
      supportFacilities.map((facility) => facility.id).join("|"),
      routePlan.checkpoints.map((checkpoint) => checkpoint.id).join("|"),
    ].join("::"),
    [mountedRiskZones, routePlan.checkpoints, routePlan.route.id, supportFacilities],
  );
  return (
    <>
      <MapView
        key={mapTopologyKey}
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
          if (event.nativeEvent.action === "marker-press") {
            return;
          }
          if (
            Date.now() - lastDirectRiskTouchAtMsRef.current <
              DIRECT_RISK_TOUCH_SUPPRESSION_MS
          ) {
            return;
          }
          const zone = resolveRiskZoneAtMapCoordinate({
            coordinate: event.nativeEvent.coordinate,
            toleranceMeters: resolveRiskMapTapToleranceMeters({
              region: latestRegionRef.current,
              viewportHeight: viewport.height,
            }),
            zones: visibleRiskZones,
          });
          if (zone) {
            onRiskZonePress(zone);
            return;
          }
          onMapPress();
        }}
        onPanDrag={onPanDrag}
        onMapReady={() => {
          onMapReady();
          requestAnimationFrame(refreshActiveRiskTouchTargets);
        }}
        onRegionChangeComplete={(region) => {
          latestRegionRef.current = region;
          refreshActiveRiskTouchTargets();
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

      {routeCoordinates.length > 1 ? (
        <Polyline
          coordinates={completedSegmentCoordinates}
          strokeColor={routeLinePresentation.showCompletedSegment
            ? routeLinePresentation.completedStrokeColor
            : "transparent"}
          strokeWidth={routeLinePresentation.showCompletedSegment
            ? routeLinePresentation.completedStrokeWidth
            : 0}
          lineCap="round"
          lineJoin="round"
          zIndex={23}
        />
      ) : null}

      {mountedRiskZones.map((zone) => (
        <RiskOverlay
          key={zone.id}
          active={zone.id === activeRiskZoneId}
          interactive={
            visibleRiskZoneIds.has(zone.id) && !activeRiskTouchLayerVisible
          }
          markerVisible={!activeRiskTouchLayerVisible}
          onPress={onRiskZonePress}
          routeCoordinates={routeCoordinates}
          visible={visibleRiskZoneIds.has(zone.id)}
          zone={zone}
        />
      ))}

      {supportFacilities.map((facility) => (
        <SupportFacilityMarker
          facility={facility}
          key={facility.id}
          visible={supportFacilitiesVisible}
        />
      ))}

      {routePlan.checkpoints.map((checkpoint) => (
        <CheckpointMarker
          checkpoint={checkpoint}
          key={checkpoint.id}
          visible={
            showRouteCheckpoints && shouldRenderRouteCheckpointMarker({
              checkpoint,
              liveCoordinate: vehicleCoordinate,
              nativeUserLocationVisible:
                !demoDriveActive && permissionStatus === "granted",
            })
          }
        />
      ))}

      {routeCoordinates[0] ? (
        <VehicleMarker
          coordinate={vehicleCoordinate || routeCoordinates[0]}
          demoDriveEnabled
          visible={Boolean(vehicleCoordinate && demoDriveActive)}
        />
      ) : null}
      </MapView>
      {activeRiskTouchLayerVisible ? (
        <View pointerEvents="box-none" style={styles.activeRiskTouchLayer}>
          {activeRiskTouchTargets.map(({ point, zone }) => (
            <ActiveRiskTouchMarker
              key={zone.id}
              onPress={() => {
                lastDirectRiskTouchAtMsRef.current = Date.now();
                onMapInteractionStart();
                onRiskZonePress(zone);
              }}
              style={[
                styles.activeRiskTouchTarget,
                {
                  left: point.x - ACTIVE_RISK_TOUCH_TARGET_SIZE / 2,
                  top: point.y - ACTIVE_RISK_TOUCH_TARGET_SIZE / 2,
                },
              ]}
              testID={uiTestIds.liveMapActiveRiskTouchTarget(zone.id)}
              zone={zone}
            />
          ))}
        </View>
      ) : null}
    </>
  );
}

function riskZoneCouldBeVisibleInRegion(zone: RiskZone, region: Region): boolean {
  const latitudeDelta = Math.max(region.latitudeDelta, 0.001);
  const longitudeDelta = Math.max(region.longitudeDelta, 0.001);
  return (
    Math.abs(zone.coordinate.latitude - region.latitude) <=
      latitudeDelta * ACTIVE_RISK_PROJECTION_REGION_MARGIN &&
    longitudeDistance(
      zone.coordinate.longitude,
      region.longitude,
    ) <= longitudeDelta * ACTIVE_RISK_PROJECTION_REGION_MARGIN
  );
}

function riskZoneDistanceFromRegionCenter(zone: RiskZone, region: Region): number {
  const latitudeDistance = zone.coordinate.latitude - region.latitude;
  const normalizedLongitudeDistance = longitudeDistance(
    zone.coordinate.longitude,
    region.longitude,
  );
  return latitudeDistance ** 2 + normalizedLongitudeDistance ** 2;
}

function longitudeDistance(first: number, second: number): number {
  const directDistance = Math.abs(first - second);
  return Math.min(directDistance, 360 - directDistance);
}

const styles = StyleSheet.create({
  activeRiskTouchLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  activeRiskTouchTarget: {
    height: ACTIVE_RISK_TOUCH_TARGET_SIZE,
    position: "absolute",
    width: ACTIVE_RISK_TOUCH_TARGET_SIZE,
  },
});
