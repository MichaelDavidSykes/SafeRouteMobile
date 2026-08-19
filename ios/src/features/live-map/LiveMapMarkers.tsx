import type { ComponentProps, ComponentType, RefObject } from 'react';
import { memo, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CircleAlert,
  Hospital,
  MapPin,
  Shield,
  ShieldCheck,
} from 'lucide-react-native';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import type MapView from 'react-native-maps';
import {
  Circle,
  Marker,
  Polygon,
  Polyline,
  type LatLng,
  type Point,
} from 'react-native-maps';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import type {
  RiskAvoidanceSeverity,
  RiskSeverity,
  RiskZone,
  RouteCheckpoint,
  SupportFacility,
} from './liveMapTypes';
import {
  buildRouteRiskAlertSegment,
  createRiskZoneAccessibilityLabel
} from './routeRisk';
import {
  isRouteAlertZone,
  shouldRenderRiskCoverage,
  visibleRiskRadiusMeters,
} from './riskOverlayPresentation';
import { uiTestIds } from '../../testing/uiTestIds';
import { colors, radius } from '../../theme';
import { SAFE_ROUTE_DARK_ROUTE_CASING } from '../maps/safeRouteMapTheme';
import {
  supportFacilityCalloutDescription,
  supportFacilityKindLabel,
} from './supportFacilities';
import { useDeviceHeading } from '../maps/useDeviceHeading';
import { resolveDeviceHeadingScreenRotation } from '../maps/deviceHeading';

type TappableCircleProps = ComponentProps<typeof Circle> & {
  onPress?: () => void;
  tappable?: boolean;
};

const TappableCircle = Circle as ComponentType<TappableCircleProps>;

const ROUTE_PROXIMITY_CASING_Z_INDEX = 32;
const ROUTE_PROXIMITY_CORE_Z_INDEX = 33;
const ROUTE_ALERT_CONNECTOR_Z_INDEX = 39;
const ROUTE_ALERT_CASING_Z_INDEX = 40;
const ROUTE_ALERT_CORE_Z_INDEX = 41;
const ROUTE_ALERT_MARKER_Z_INDEX = 42;

export const RiskOverlay = memo(function RiskOverlay({
  active,
  onPress,
  routeCoordinates,
  selected,
  visible = true,
  zone
}: {
  active?: boolean;
  onPress?: (zone: RiskZone) => void;
  routeCoordinates?: Array<{ latitude: number; longitude: number }>;
  selected?: boolean;
  visible?: boolean;
  zone: RiskZone;
}) {
  if (!visible) {
    return null;
  }

  const routeSegmentCoordinates = zone.routeSegmentCoordinates || [];
  const connectorCoordinates = zone.connectorCoordinates || [];
  const polygonCoordinates = zone.polygonCoordinates || [];
  const routeAlert = isRouteAlertZone(zone);
  const showRouteProximitySegment = routeAlert || selected || active;
  const routeAlertCoordinates =
    showRouteProximitySegment && routeSegmentCoordinates.length <= 1
      ? buildRouteRiskAlertSegment(routeCoordinates || [], zone)
      : [];
  const handlePress = (event?: { stopPropagation?: () => void }) => {
    if (!visible) {
      return;
    }
    event?.stopPropagation?.();
    onPress?.(zone);
  };
  const riskTone = resolveRiskOverlayTone(zone);
  const riskColors = severityOverlayColors(riskTone);
  const tappable = visible && Boolean(onPress);
  const emphasized = Boolean(selected || active);
  const showSegmentCasing = !routeAlert || emphasized;
  const casingColor = visible ? SAFE_ROUTE_DARK_ROUTE_CASING : 'transparent';
  const riskStrokeColor = visible ? riskColors.stroke : 'transparent';
  const segmentCasingWidth = routeAlert
    ? 7
    : (emphasized ? 6 : 5);
  const segmentCoreWidth = routeAlert
    ? (emphasized ? 4 : 3)
    : (emphasized ? 3 : 2);
  const segmentCasingZIndex = routeAlert
    ? ROUTE_ALERT_CASING_Z_INDEX
    : ROUTE_PROXIMITY_CASING_Z_INDEX;
  const segmentCoreZIndex = routeAlert
    ? ROUTE_ALERT_CORE_Z_INDEX
    : ROUTE_PROXIMITY_CORE_Z_INDEX;
  const coverageStrokeColor = visible && selected
    ? riskColors.selectionStroke
    : 'transparent';
  const coverageFillColor = visible
    ? selected
      ? riskColors.selectedFill
      : riskColors.fill
    : 'transparent';

  return (
    <>
      {routeAlertCoordinates.length > 1 ? (
        <>
          {showSegmentCasing ? (
            <Polyline
              coordinates={routeAlertCoordinates}
              strokeColor={casingColor}
              strokeWidth={segmentCasingWidth}
              lineCap="round"
              lineJoin="round"
              zIndex={segmentCasingZIndex}
              tappable={tappable}
              onPress={handlePress}
            />
          ) : null}
          <Polyline
            coordinates={routeAlertCoordinates}
            strokeColor={riskStrokeColor}
            strokeWidth={segmentCoreWidth}
            lineCap="round"
            lineJoin="round"
            zIndex={segmentCoreZIndex}
            testID={uiTestIds.liveMapRouteRiskSegment(zone.id)}
            tappable={tappable}
            onPress={handlePress}
          />
        </>
      ) : null}
      {showRouteProximitySegment && routeSegmentCoordinates.length > 1 ? (
        <>
          {showSegmentCasing ? (
            <Polyline
              coordinates={routeSegmentCoordinates}
              strokeColor={casingColor}
              strokeWidth={segmentCasingWidth}
              lineCap="round"
              lineJoin="round"
              zIndex={segmentCasingZIndex}
              tappable={tappable}
              onPress={handlePress}
            />
          ) : null}
          <Polyline
            coordinates={routeSegmentCoordinates}
            strokeColor={riskStrokeColor}
            strokeWidth={segmentCoreWidth}
            lineCap="round"
            lineJoin="round"
            zIndex={segmentCoreZIndex}
            testID={uiTestIds.liveMapRouteRiskSegment(zone.id)}
            tappable={tappable}
            onPress={handlePress}
          />
        </>
      ) : null}
      {showRouteProximitySegment
        && connectorCoordinates.length > 1
        && (!routeAlert || emphasized) ? (
        <Polyline
          coordinates={connectorCoordinates}
          strokeColor={riskStrokeColor}
          strokeWidth={2}
          lineDashPattern={[3, 9]}
          lineCap="round"
          lineJoin="round"
          zIndex={routeAlert
            ? ROUTE_ALERT_CONNECTOR_Z_INDEX
            : ROUTE_PROXIMITY_CASING_Z_INDEX}
          tappable={tappable}
          onPress={handlePress}
        />
      ) : null}
      {shouldRenderRiskCoverage(zone) && polygonCoordinates.length > 2 ? (
        <Polygon
          coordinates={polygonCoordinates}
          strokeColor={coverageStrokeColor}
          fillColor={coverageFillColor}
          strokeWidth={selected ? 1 : 0}
          testID={uiTestIds.liveMapRiskZoneArea(zone.id)}
          tappable={tappable}
          onPress={handlePress}
        />
      ) : shouldRenderRiskCoverage(zone) ? (
        <TappableCircle
          center={zone.coordinate}
          radius={visibleRiskRadiusMeters(zone)}
          strokeColor={coverageStrokeColor}
          fillColor={coverageFillColor}
          strokeWidth={selected ? 1 : 0}
          testID={uiTestIds.liveMapRiskZoneArea(zone.id)}
          tappable={tappable}
          onPress={handlePress}
        />
      ) : null}
      <RiskMarker
        onPress={handlePress}
        routeAlert={routeAlert}
        selected={selected}
        visible={visible}
        zone={zone}
      />
    </>
  );
});

export function CheckpointMarker({ checkpoint }: { checkpoint: RouteCheckpoint }) {
  const markerRole = checkpointMarkerRole(checkpoint.kind);

  return (
    <Marker
      coordinate={checkpoint.coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      title={checkpoint.caption}
      description={markerRole}
    >
      <View
        accessibilityLabel={`${markerRole}: ${checkpoint.caption}`}
        accessibilityRole="image"
        style={styles.checkpointMarkerHitArea}
      >
        {checkpoint.kind === 'destination' ? (
          <MapPin
            accessibilityElementsHidden
            color={colors.appleBlue}
            fill={colors.appleBlue}
            size={27}
            strokeWidth={1.8}
          />
        ) : (
          <View
            style={[
              styles.checkpointMarker,
              checkpoint.kind === 'origin'
                ? styles.checkpointMarkerOrigin
                : styles.checkpointMarkerWaypoint
            ]}
          >
            <View style={styles.checkpointMarkerCore} />
          </View>
        )}
      </View>
    </Marker>
  );
}

export const SupportFacilityMarker = memo(function SupportFacilityMarker({
  facility,
}: {
  facility: SupportFacility;
}) {
  const hospital = facility.kind === 'hospital' || facility.supportType === 'hospital';
  const police = facility.kind === 'police';
  const color = hospital ? '#f43f5e' : police ? '#38bdf8' : '#22c55e';
  const Icon = hospital ? Hospital : police ? Shield : ShieldCheck;
  const kindLabel = supportFacilityKindLabel(facility);

  return (
    <Marker
      coordinate={facility.coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      title={facility.label}
      description={supportFacilityCalloutDescription(facility)}
      testID={uiTestIds.supportFacility(facility.id)}
      tracksViewChanges={false}
      zIndex={43}
    >
      <View
        accessible
        accessibilityLabel={`${facility.label}. ${kindLabel}. ${supportFacilityCalloutDescription(facility)}`}
        accessibilityRole="button"
        style={styles.supportFacilityMarkerHitArea}
        testID={uiTestIds.supportFacility(facility.id)}
      >
        <View style={[styles.supportFacilityMarker, { backgroundColor: color }]}>
          <Icon
            accessibilityElementsHidden
            color={colors.surface}
            size={14}
            strokeWidth={2.4}
          />
        </View>
      </View>
    </Marker>
  );
});

export const CompassTrackedHeadingOverlay = memo(function CompassTrackedHeadingOverlay({
  coordinate,
  enabled,
  fallbackHeading = null,
  mapRef,
  mapHeading = 0,
  projectionRevision,
  testID,
}: {
  coordinate: LatLng;
  enabled: boolean;
  fallbackHeading?: number | null;
  mapRef: RefObject<MapView | null>;
  mapHeading?: number;
  projectionRevision: number | string;
  testID?: string;
}) {
  const deviceHeading = useDeviceHeading(enabled, {
    deadbandDegrees: 1.2,
    minimumUpdateIntervalMs: 120,
  });
  return (
    <VehicleHeadingOverlay
      coordinate={coordinate}
      heading={deviceHeading ?? fallbackHeading}
      mapRef={mapRef}
      mapHeading={mapHeading}
      projectionRevision={projectionRevision}
      testID={testID}
    />
  );
});

function checkpointMarkerRole(kind: RouteCheckpoint['kind']): string {
  if (kind === 'origin') {
    return 'Route start';
  }

  if (kind === 'waypoint') {
    return 'Waypoint';
  }

  return 'Destination';
}

function RiskMarker({
  onPress,
  selected,
  routeAlert,
  visible,
  zone
}: {
  onPress?: () => void;
  selected?: boolean;
  routeAlert: boolean;
  visible: boolean;
  zone: RiskZone;
}) {
  const riskTone = resolveRiskOverlayTone(zone);
  const riskColors = severityOverlayColors(riskTone);
  const markerColor = riskColors.stroke;

  return (
    <Marker
      coordinate={zone.coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      opacity={visible ? 1 : 0}
      testID={uiTestIds.liveMapRiskZone(zone.id)}
      tappable={visible && Boolean(onPress)}
      tracksViewChanges={false}
      zIndex={routeAlert ? ROUTE_ALERT_MARKER_Z_INDEX : 10}
      onPress={onPress}
    >
      <View
        accessible={visible}
        accessibilityLabel={createRiskZoneAccessibilityLabel(zone, Boolean(selected))}
        accessibilityElementsHidden={!visible}
        accessibilityRole="button"
        accessibilityState={{ selected: Boolean(selected) }}
        testID={uiTestIds.liveMapRiskZone(zone.id)}
        style={routeAlert ? styles.routeAlertMarkerHitArea : styles.riskMarkerHitArea}
      >
        <View
          style={[
            styles.riskMarker,
            routeAlert ? styles.routeAlertMarker : null,
            severityMarkerStyle(riskTone),
            routeAlert ? { backgroundColor: markerColor } : null,
          ]}
        >
          {routeAlert ? (
            <CircleAlert
              accessibilityElementsHidden
              color={colors.surface}
              size={14}
              strokeWidth={2.4}
            />
          ) : (
            <AlertTriangle
              accessibilityElementsHidden
              color={markerColor}
              fill={severityMarkerFill(riskTone)}
              size={severityMarkerSize(riskTone)}
              strokeWidth={2.6}
            />
          )}
        </View>
      </View>
    </Marker>
  );
}

export const VehicleHeadingOverlay = memo(function VehicleHeadingOverlay({
  coordinate,
  heading,
  mapRef,
  mapHeading,
  projectionRevision,
  testID,
}: {
  coordinate: LatLng;
  heading: number | null;
  mapRef: RefObject<MapView | null>;
  mapHeading: number;
  projectionRevision: number | string;
  testID?: string;
}) {
  const screenRotation = resolveDeviceHeadingScreenRotation(heading, mapHeading);
  const [projectedPoint, setProjectedPoint] = useState<Point | null>(null);
  const projectionRequestIdRef = useRef(0);
  const animatedRotation = useRef(new Animated.Value(screenRotation ?? 0)).current;
  const previousRotationRef = useRef<number | null>(screenRotation);
  const continuousRotationRef = useRef(screenRotation ?? 0);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const requestId = projectionRequestIdRef.current + 1;
    projectionRequestIdRef.current = requestId;
    let mounted = true;
    void map.pointForCoordinate(coordinate).then((point) => {
      if (
        !mounted ||
        projectionRequestIdRef.current !== requestId ||
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y)
      ) {
        return;
      }
      setProjectedPoint((current) =>
        current &&
        Math.abs(current.x - point.x) < 0.5 &&
        Math.abs(current.y - point.y) < 0.5
          ? current
          : point,
      );
    }).catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, [
    coordinate.latitude,
    coordinate.longitude,
    mapRef,
    projectionRevision,
  ]);

  useEffect(() => {
    if (screenRotation === null) {
      return;
    }
    const previousRotation = previousRotationRef.current;
    if (previousRotation === null) {
      continuousRotationRef.current = screenRotation;
      animatedRotation.setValue(screenRotation);
    } else {
      continuousRotationRef.current += shortestHeadingDelta(previousRotation, screenRotation);
      animatedRotation.stopAnimation();
      Animated.timing(animatedRotation, {
        duration: 160,
        easing: Easing.out(Easing.cubic),
        isInteraction: false,
        toValue: continuousRotationRef.current,
        useNativeDriver: true,
      }).start();
    }
    previousRotationRef.current = screenRotation;
  }, [animatedRotation, screenRotation]);

  if (!projectedPoint || (screenRotation === null && previousRotationRef.current === null)) {
    return null;
  }

  return (
    <Animated.View
      accessibilityElementsHidden
      accessible={false}
      pointerEvents="none"
      style={[
        styles.vehicleHeadingOverlay,
        {
          left: projectedPoint.x - 36,
          top: projectedPoint.y - 36,
          transform: [{
            rotate: animatedRotation.interpolate({
              inputRange: [-36000, 36000],
              outputRange: ['-36000deg', '36000deg'],
            }),
          }],
        },
      ]}
      testID={testID}
    >
      <Svg height={72} width={72} viewBox="0 0 72 72">
        <Defs>
          <LinearGradient id="nativePuckHeadingFan" x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0" stopColor="#0A84FF" stopOpacity="0.32" />
            <Stop offset="0.72" stopColor="#0A84FF" stopOpacity="0.14" />
            <Stop offset="1" stopColor="#0A84FF" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Path
          d="M36 38 L13 7 Q36 -2 59 7 Z"
          fill="url(#nativePuckHeadingFan)"
        />
      </Svg>
    </Animated.View>
  );
});

export function VehicleMarker({
  coordinate,
  demoDriveEnabled = false,
  testID,
}: {
  coordinate: LatLng;
  demoDriveEnabled?: boolean;
  testID?: string;
}) {
  const markerTitle = demoDriveEnabled ? 'Route preview position' : 'Current position';

  return (
    <Marker
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      testID={testID}
      title={markerTitle}
      tracksViewChanges={false}
      zIndex={100}
    >
      <View
        accessible
        accessibilityLabel={createVehicleMarkerAccessibilityLabel(demoDriveEnabled)}
        accessibilityRole="image"
        collapsable={false}
        style={styles.vehicleMarker}
      >
        {!demoDriveEnabled ? (
          <View
            accessibilityElementsHidden
            pointerEvents="none"
            style={styles.vehicleMarkerHalo}
          />
        ) : null}
        <View accessibilityElementsHidden style={styles.vehicleMarkerCore} />
      </View>
    </Marker>
  );
}

export function createVehicleMarkerAccessibilityLabel(demoDriveEnabled: boolean): string {
  return demoDriveEnabled ? 'Route preview position' : 'Current position';
}

function shortestHeadingDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

type RiskOverlayTone = RiskSeverity | Extract<RiskAvoidanceSeverity, 'critical'>;

function resolveRiskOverlayTone(zone: RiskZone): RiskOverlayTone {
  return zone.avoidanceSeverity === 'critical' ? 'critical' : zone.severity;
}

function severityMarkerStyle(severity: RiskOverlayTone) {
  if (severity === 'critical') {
    return styles.riskMarkerHigh;
  }

  if (severity === 'high' || severity === 'medium') {
    return styles.riskMarkerMedium;
  }

  return styles.riskMarkerLow;
}

function severityMarkerFill(severity: RiskOverlayTone): string {
  if (severity === 'critical') {
    return 'rgba(229, 72, 77, 0.24)';
  }

  if (severity === 'high') {
    return 'rgba(223, 122, 22, 0.24)';
  }

  if (severity === 'medium') {
    return 'rgba(247, 107, 21, 0.22)';
  }

  return 'rgba(126, 156, 191, 0.20)';
}

function severityMarkerSize(severity: RiskOverlayTone): number {
  if (severity === 'critical' || severity === 'high') {
    return 22;
  }

  if (severity === 'medium') {
    return 19;
  }

  return 16;
}

function severityOverlayColors(severity: RiskOverlayTone) {
  if (severity === 'critical') {
    return {
      fill: 'rgba(229, 72, 77, 0.15)',
      selectedFill: 'rgba(229, 72, 77, 0.20)',
      selectionHalo: 'rgba(229, 72, 77, 0.13)',
      selectionStroke: 'rgba(255, 132, 136, 0.94)',
      stroke: colors.danger,
    };
  }

  if (severity === 'high') {
    return {
      fill: 'rgba(245, 165, 36, 0.16)',
      selectedFill: 'rgba(245, 165, 36, 0.22)',
      selectionHalo: 'rgba(245, 165, 36, 0.14)',
      selectionStroke: 'rgba(255, 209, 102, 0.96)',
      stroke: '#f5a524',
    };
  }

  if (severity === 'medium') {
    return {
      fill: 'rgba(245, 165, 36, 0.10)',
      selectedFill: 'rgba(245, 165, 36, 0.16)',
      selectionHalo: 'rgba(245, 165, 36, 0.12)',
      selectionStroke: 'rgba(255, 197, 92, 0.94)',
      stroke: colors.amber,
    };
  }

  return {
    fill: colors.infoSoft,
    selectedFill: 'rgba(126, 156, 191, 0.16)',
    selectionHalo: 'rgba(126, 156, 191, 0.12)',
    selectionStroke: 'rgba(177, 207, 239, 0.94)',
    stroke: colors.info,
  };
}

const styles = StyleSheet.create({
  checkpointMarkerHitArea: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center'
  },
  checkpointMarker: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
    borderRadius: radius.pill,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0
  },
  checkpointMarkerOrigin: {
    backgroundColor: colors.safe,
    borderRadius: radius.pill
  },
  checkpointMarkerWaypoint: {
    backgroundColor: colors.inkSoft,
    borderRadius: radius.pill
  },
  checkpointMarkerCore: {
    width: 5,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.surface
  },
  riskMarkerHitArea: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center'
  },
  riskMarker: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.78,
    shadowOpacity: 0.45,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4
  },
  routeAlertMarker: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderColor: 'rgba(248, 250, 252, 0.9)',
    borderRadius: radius.pill,
    opacity: 0.96,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  riskMarkerHigh: {
    shadowColor: colors.danger
  },
  riskMarkerMedium: {
    shadowColor: colors.amber
  },
  riskMarkerLow: {
    shadowColor: colors.info
  },
  routeAlertMarkerHitArea: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center'
  },
  supportFacilityMarkerHitArea: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportFacilityMarker: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(248, 250, 252, 0.92)',
    borderRadius: radius.pill,
    shadowOpacity: 0,
    elevation: 0,
  },
  vehicleHeadingOverlay: {
    position: 'absolute',
    width: 72,
    height: 72,
    zIndex: 101,
    elevation: 101,
  },
  vehicleMarker: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0
  },
  vehicleMarkerHalo: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(10, 132, 255, 0.16)',
  },
  vehicleMarkerCore: {
    width: 20,
    height: 20,
    borderWidth: 3,
    borderColor: colors.surface,
    borderRadius: radius.pill,
    backgroundColor: colors.appleBlue,
    shadowColor: '#000000',
    shadowOpacity: 0.24,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  }
});
