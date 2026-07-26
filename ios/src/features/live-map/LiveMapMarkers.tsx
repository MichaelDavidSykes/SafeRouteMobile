import type { ComponentProps, ComponentType } from 'react';
import { AlertTriangle, MapPin } from 'lucide-react-native';
import { Animated, StyleSheet, View } from 'react-native';
import { Circle, Marker, Polygon, Polyline } from 'react-native-maps';

import type { RiskSeverity, RiskZone, RouteCheckpoint } from './liveMapTypes';
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
  useLoopingPulse,
  useMotionValue,
  useReduceMotionEnabled,
} from '../../motion/SafeRouteMotion';

type TappableCircleProps = ComponentProps<typeof Circle> & {
  onPress?: () => void;
  tappable?: boolean;
};

const TappableCircle = Circle as ComponentType<TappableCircleProps>;

export function RiskOverlay({
  active,
  onPress,
  routeCoordinates,
  selected,
  zone
}: {
  active?: boolean;
  onPress?: (zone: RiskZone) => void;
  routeCoordinates?: Array<{ latitude: number; longitude: number }>;
  selected?: boolean;
  zone: RiskZone;
}) {
  const routeSegmentCoordinates = zone.routeSegmentCoordinates || [];
  const connectorCoordinates = zone.connectorCoordinates || [];
  const polygonCoordinates = zone.polygonCoordinates || [];
  const routeAlertCoordinates = routeSegmentCoordinates.length > 1
    ? []
    : buildRouteRiskAlertSegment(routeCoordinates || [], zone);
  const handlePress = (event?: { stopPropagation?: () => void }) => {
    event?.stopPropagation?.();
    onPress?.(zone);
  };
  const routeAlert = isRouteAlertZone(zone);
  const riskColors = severityOverlayColors(zone.severity);

  return (
    <>
      {routeAlertCoordinates.length > 1 ? (
        <>
          <Polyline
            coordinates={routeAlertCoordinates}
            strokeColor={SAFE_ROUTE_DARK_ROUTE_CASING}
            strokeWidth={selected || active ? 6 : 5}
            lineCap="round"
            lineJoin="round"
            tappable={Boolean(onPress)}
            onPress={handlePress}
          />
          <Polyline
            coordinates={routeAlertCoordinates}
            strokeColor={riskColors.stroke}
            strokeWidth={selected || active ? 3 : 2}
            lineCap="round"
            lineJoin="round"
            testID={uiTestIds.liveMapRouteRiskSegment(zone.id)}
            tappable={Boolean(onPress)}
            onPress={handlePress}
          />
        </>
      ) : null}
      {routeSegmentCoordinates.length > 1 ? (
        <>
          <Polyline
            coordinates={routeSegmentCoordinates}
            strokeColor={SAFE_ROUTE_DARK_ROUTE_CASING}
            strokeWidth={selected || active ? 6 : 5}
            lineCap="round"
            lineJoin="round"
            tappable={Boolean(onPress)}
            onPress={handlePress}
          />
          <Polyline
            coordinates={routeSegmentCoordinates}
            strokeColor={riskColors.stroke}
            strokeWidth={selected || active ? 3 : 2}
            lineCap="round"
            lineJoin="round"
            testID={uiTestIds.liveMapRouteRiskSegment(zone.id)}
            tappable={Boolean(onPress)}
            onPress={handlePress}
          />
        </>
      ) : null}
      {connectorCoordinates.length > 1 ? (
        <Polyline
          coordinates={connectorCoordinates}
          strokeColor={riskColors.stroke}
          strokeWidth={2}
          lineDashPattern={[3, 9]}
          lineCap="round"
          lineJoin="round"
          tappable={Boolean(onPress)}
          onPress={handlePress}
        />
      ) : null}
      {shouldRenderRiskCoverage(zone) && polygonCoordinates.length > 2 ? (
        <Polygon
          coordinates={polygonCoordinates}
          strokeColor={selected ? riskColors.selectionStroke : 'transparent'}
          fillColor={selected ? riskColors.selectedFill : riskColors.fill}
          strokeWidth={selected ? 1 : 0}
          testID={uiTestIds.liveMapRiskZoneArea(zone.id)}
          tappable={Boolean(onPress)}
          onPress={handlePress}
        />
      ) : shouldRenderRiskCoverage(zone) ? (
        <TappableCircle
          center={zone.coordinate}
          radius={visibleRiskRadiusMeters(zone)}
          strokeColor={selected ? riskColors.selectionStroke : 'transparent'}
          fillColor={selected ? riskColors.selectedFill : riskColors.fill}
          strokeWidth={selected ? 1 : 0}
          testID={uiTestIds.liveMapRiskZoneArea(zone.id)}
          tappable={Boolean(onPress)}
          onPress={handlePress}
        />
      ) : null}
      <RiskMarker
        active={active}
        onPress={handlePress}
        routeAlert={routeAlert}
        selected={selected}
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
  zone
}: {
  active?: boolean;
  onPress?: () => void;
  selected?: boolean;
  routeAlert: boolean;
  zone: RiskZone;
}) {
  const riskColors = severityOverlayColors(zone.severity);
  const markerColor = riskColors.stroke;
  const selectionProgress = useMotionValue(selected ? 1 : 0, {
    spring: true,
  });

  return (
    <Marker
      coordinate={zone.coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      testID={uiTestIds.liveMapRiskZone(zone.id)}
      tappable={Boolean(onPress)}
      zIndex={10}
      onPress={onPress}
    >
      <View
        accessibilityLabel={createRiskZoneAccessibilityLabel(zone, Boolean(selected))}
        accessibilityRole="button"
        testID={uiTestIds.liveMapRiskZone(zone.id)}
        style={routeAlert ? styles.routeAlertMarkerHitArea : styles.riskMarkerHitArea}
      >
        <View
          style={[
            styles.riskMarker,
            active ? styles.riskMarkerActive : null,
            selected ? styles.riskMarkerSelected : null,
            severityMarkerStyle(zone.severity)
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
          <AlertTriangle
            accessibilityElementsHidden
            color={markerColor}
            fill={severityMarkerFill(zone.severity)}
            size={severityMarkerSize(zone.severity)}
            strokeWidth={2.6}
          />
        </View>
      </View>
    </Marker>
  );
}

export function VehicleMarker({
  coordinate,
  demoDriveEnabled,
  heading
}: {
  coordinate: { latitude: number; longitude: number };
  demoDriveEnabled: boolean;
  heading: number;
}) {
  const markerTitle = demoDriveEnabled ? 'Route preview position' : 'Current position';
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
      rotation={heading}
      title={markerTitle}
    >
      <View
        accessible
        accessibilityLabel={createVehicleMarkerAccessibilityLabel(demoDriveEnabled)}
        accessibilityRole="image"
        style={styles.vehicleMarker}
      >
        <Animated.View
          accessibilityElementsHidden
          pointerEvents="none"
          style={[styles.vehicleMarkerPulse, pulseStyle]}
        />
        <View style={styles.vehicleMarkerHeading} />
      </View>
    </Marker>
  );
}

export function createVehicleMarkerAccessibilityLabel(demoDriveEnabled: boolean): string {
  return demoDriveEnabled ? 'Route preview position' : 'Current position';
}

function severityMarkerStyle(severity: RiskSeverity) {
  if (severity === 'high') {
    return styles.riskMarkerHigh;
  }

  if (severity === 'medium') {
    return styles.riskMarkerMedium;
  }

  return styles.riskMarkerLow;
}

function severityMarkerFill(severity: RiskSeverity): string {
  if (severity === 'high') {
    return 'rgba(229, 72, 77, 0.24)';
  }

  if (severity === 'medium') {
    return 'rgba(247, 107, 21, 0.22)';
  }

  return 'rgba(126, 156, 191, 0.20)';
}

function severityMarkerSize(severity: RiskSeverity): number {
  if (severity === 'high') {
    return 22;
  }

  if (severity === 'medium') {
    return 19;
  }

  return 16;
}

function severityOverlayColors(severity: RiskSeverity) {
  if (severity === 'high') {
    return {
      fill: 'rgba(229, 72, 77, 0.15)',
      selectedFill: 'rgba(229, 72, 77, 0.20)',
      selectionHalo: 'rgba(229, 72, 77, 0.13)',
      selectionStroke: 'rgba(255, 132, 136, 0.94)',
      stroke: colors.danger,
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
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
    borderRadius: radius.pill,
    backgroundColor: colors.appleBlue,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0
  },
  vehicleMarkerPulse: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.appleBlue,
  },
  vehicleMarkerHeading: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 11,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.surface,
    transform: [{ translateY: -1 }]
  }
});
