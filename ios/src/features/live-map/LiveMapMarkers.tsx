import type { ComponentProps, ComponentType } from 'react';
import { AlertTriangle, CircleAlert, MapPin } from 'lucide-react-native';
import { Animated, StyleSheet, View } from 'react-native';
import { Circle, Marker, Polygon, Polyline } from 'react-native-maps';

import type {
  RiskAvoidanceSeverity,
  RiskSeverity,
  RiskZone,
  RouteCheckpoint
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
import { resolveDeviceHeadingScreenRotation } from '../maps/deviceHeading';
import {
  useLoopingPulse,
  useMotionValue,
  useReduceMotionEnabled,
} from '../../motion/SafeRouteMotion';

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

export function RiskOverlay({
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
  const casingColor = visible ? SAFE_ROUTE_DARK_ROUTE_CASING : 'transparent';
  const riskStrokeColor = visible ? riskColors.stroke : 'transparent';
  const segmentCasingWidth = routeAlert
    ? (emphasized ? 11 : 10)
    : (emphasized ? 6 : 5);
  const segmentCoreWidth = routeAlert
    ? (emphasized ? 5 : 4)
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
      {showRouteProximitySegment && connectorCoordinates.length > 1 ? (
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
        active={active}
        onPress={handlePress}
        routeAlert={routeAlert}
        selected={selected}
        visible={visible}
        zone={zone}
      />
    </>
  );
}

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
  active,
  onPress,
  selected,
  routeAlert,
  visible,
  zone
}: {
  active?: boolean;
  onPress?: () => void;
  selected?: boolean;
  routeAlert: boolean;
  visible: boolean;
  zone: RiskZone;
}) {
  const riskTone = resolveRiskOverlayTone(zone);
  const riskColors = severityOverlayColors(riskTone);
  const markerColor = riskColors.stroke;
  const selectionProgress = useMotionValue(selected ? 1 : 0, {
    spring: true,
  });

  return (
    <Marker
      coordinate={zone.coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      opacity={visible ? 1 : 0}
      testID={uiTestIds.liveMapRiskZone(zone.id)}
      tappable={visible && Boolean(onPress)}
      tracksViewChanges={visible && Boolean(selected || active)}
      zIndex={routeAlert ? ROUTE_ALERT_MARKER_Z_INDEX : 10}
      onPress={onPress}
    >
      <View
        accessible={visible}
        accessibilityLabel={createRiskZoneAccessibilityLabel(zone, Boolean(selected))}
        accessibilityElementsHidden={!visible}
        accessibilityRole="button"
        testID={uiTestIds.liveMapRiskZone(zone.id)}
        style={routeAlert ? styles.routeAlertMarkerHitArea : styles.riskMarkerHitArea}
      >
        <View
          style={[
            styles.riskMarker,
            routeAlert ? styles.routeAlertMarker : null,
            active ? styles.riskMarkerActive : null,
            routeAlert && active ? styles.routeAlertMarkerActive : null,
            selected ? styles.riskMarkerSelected : null,
            severityMarkerStyle(riskTone),
            routeAlert ? { backgroundColor: markerColor } : null,
          ]}
        >
          <Animated.View
            accessible={false}
            style={[
              styles.riskMarkerSelectionRing,
              {
                backgroundColor: riskColors.selectionHalo,
                borderColor: riskColors.selectionStroke,
                opacity: selectionProgress,
                transform: [{
                  scale: selectionProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.82, 1],
                  }),
                }],
              },
            ]}
          />
          {routeAlert ? (
            <CircleAlert
              accessibilityElementsHidden
              color={colors.surface}
              size={19}
              strokeWidth={2.6}
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

export function VehicleMarker({
  coordinate,
  demoDriveEnabled,
  heading,
  mapHeading,
  testID,
}: {
  coordinate: { latitude: number; longitude: number };
  demoDriveEnabled: boolean;
  heading: number | null;
  mapHeading: number;
  testID?: string;
}) {
  const markerTitle = demoDriveEnabled ? 'Route preview position' : 'Current position';
  const screenRotation = resolveDeviceHeadingScreenRotation(heading, mapHeading);
  const reduceMotionEnabled = useReduceMotionEnabled();
  const pulseProgress = useLoopingPulse({
    duration: 2600,
    enabled: !demoDriveEnabled,
  });
  const pulseStyle = {
    opacity: reduceMotionEnabled
      ? 0
      : pulseProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.55, 0],
        }),
    transform: [
      {
        scale: pulseProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 2.8],
        }),
      },
    ],
  };

  return (
    <Marker
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      testID={testID}
      title={markerTitle}
      zIndex={100}
    >
      <View
        accessible
        accessibilityLabel={createVehicleMarkerAccessibilityLabel(demoDriveEnabled)}
        accessibilityRole="image"
        style={[
          styles.vehicleMarker,
          screenRotation !== null
            ? { transform: [{ rotate: `${screenRotation}deg` }] }
            : null,
        ]}
      >
        <Animated.View
          accessibilityElementsHidden
          pointerEvents="none"
          style={[styles.vehicleMarkerPulse, pulseStyle]}
        />
        {heading !== null ? (
          <View
            accessibilityElementsHidden
            pointerEvents="none"
            style={styles.vehicleMarkerHeading}
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
  riskMarkerActive: {
    opacity: 0.92,
  },
  riskMarkerSelected: {
    opacity: 1,
    shadowOpacity: 0.48,
    shadowRadius: 8,
  },
  routeAlertMarker: {
    width: 30,
    height: 30,
    borderWidth: 2,
    borderColor: 'rgba(248, 250, 252, 0.9)',
    borderRadius: radius.pill,
    opacity: 0.96,
  },
  routeAlertMarkerActive: {
    opacity: 0.98,
  },
  riskMarkerSelectionRing: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderWidth: 1,
    borderRadius: radius.pill,
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
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center'
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
  vehicleMarkerPulse: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.appleBlue,
  },
  vehicleMarkerHeading: {
    position: 'absolute',
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 20,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'rgba(10, 132, 255, 0.82)',
  },
  vehicleMarkerCore: {
    width: 24,
    height: 24,
    borderWidth: 3,
    borderColor: colors.surface,
    borderRadius: radius.pill,
    backgroundColor: colors.appleBlue,
  }
});
