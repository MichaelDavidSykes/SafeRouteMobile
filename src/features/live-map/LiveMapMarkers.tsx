import type { ComponentProps, ComponentType } from 'react';
import { StyleSheet, View } from 'react-native';
import { Circle, Marker, Polygon, Polyline } from 'react-native-maps';

import type { RiskSeverity, RiskZone, RouteCheckpoint } from './liveMapTypes';
import {
  buildRouteRiskAlertSegment,
  createRiskZoneAccessibilityLabel
} from './routeRisk';
import { uiTestIds } from '../../testing/uiTestIds';
import { colors, radius } from '../../theme';
import { SAFE_ROUTE_DARK_ROUTE_CASING } from '../maps/safeRouteMapTheme';

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
  const handlePress = () => onPress?.(zone);

  return (
    <>
      {routeAlertCoordinates.length > 1 ? (
        <>
          <Polyline
            coordinates={routeAlertCoordinates}
            strokeColor={SAFE_ROUTE_DARK_ROUTE_CASING}
            strokeWidth={selected || active ? 9 : 7}
            lineCap="round"
            lineJoin="round"
            tappable={Boolean(onPress)}
            onPress={handlePress}
          />
          <Polyline
            coordinates={routeAlertCoordinates}
            strokeColor={zone.markerColor}
            strokeWidth={selected || active ? 5 : 4}
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
            strokeWidth={selected || active ? 8 : 6}
            lineCap="round"
            lineJoin="round"
            tappable={Boolean(onPress)}
            onPress={handlePress}
          />
          <Polyline
            coordinates={routeSegmentCoordinates}
            strokeColor={zone.markerColor}
            strokeWidth={selected || active ? 4 : 3}
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
          strokeColor={zone.strokeColor}
          strokeWidth={2}
          lineDashPattern={[3, 9]}
          lineCap="round"
          lineJoin="round"
          tappable={Boolean(onPress)}
          onPress={handlePress}
        />
      ) : null}
      {polygonCoordinates.length > 2 ? (
        <Polygon
          coordinates={polygonCoordinates}
          strokeColor={zone.strokeColor}
          fillColor={zone.fillColor}
          strokeWidth={selected || active ? 3 : 2}
          testID={uiTestIds.liveMapRiskZoneArea(zone.id)}
          tappable={Boolean(onPress)}
          onPress={handlePress}
        />
      ) : (
        <TappableCircle
          center={zone.coordinate}
          radius={zone.radiusMeters}
          strokeColor={zone.strokeColor}
          fillColor={zone.fillColor}
          strokeWidth={selected || active ? 3 : 2}
          testID={uiTestIds.liveMapRiskZoneArea(zone.id)}
          tappable={Boolean(onPress)}
          onPress={handlePress}
        />
      )}
      <RiskMarker active={active} onPress={handlePress} selected={selected} zone={zone} />
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
        <View
          style={[
            styles.checkpointMarker,
            checkpoint.kind === 'origin'
              ? styles.checkpointMarkerOrigin
              : checkpoint.kind === 'waypoint'
                ? styles.checkpointMarkerWaypoint
                : styles.checkpointMarkerDestination
          ]}
        >
          <View style={styles.checkpointMarkerCore} />
        </View>
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
  zone
}: {
  active?: boolean;
  onPress?: () => void;
  selected?: boolean;
  zone: RiskZone;
}) {
  return (
    <Marker
      coordinate={zone.coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      title={zone.title}
      description={zone.description}
      testID={uiTestIds.liveMapRiskZone(zone.id)}
      tappable={Boolean(onPress)}
      zIndex={selected || active ? 20 : 10}
      onPress={onPress}
    >
      <View
        accessibilityLabel={createRiskZoneAccessibilityLabel(zone, Boolean(selected))}
        accessibilityRole="button"
        testID={uiTestIds.liveMapRiskZone(zone.id)}
        style={styles.riskMarkerHitArea}
      >
        <View
          style={[
            styles.riskMarker,
            active ? styles.riskMarkerActive : null,
            selected ? styles.riskMarkerSelected : null,
            severityMarkerStyle(zone.severity)
          ]}
        >
          <View style={styles.riskMarkerCore} />
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
    backgroundColor: colors.appleBlue,
    borderRadius: radius.pill
  },
  checkpointMarkerWaypoint: {
    backgroundColor: colors.safe,
    borderRadius: radius.pill
  },
  checkpointMarkerDestination: {
    backgroundColor: colors.ink,
    borderRadius: radius.pill
  },
  checkpointMarkerCore: {
    width: 5,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.surface
  },
  riskMarkerHitArea: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center'
  },
  riskMarker: {
    width: 20,
    height: 20,
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
  riskMarkerCore: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface
  },
  riskMarkerActive: {
    width: 22,
    height: 22
  },
  riskMarkerSelected: {
    width: 24,
    height: 24,
    borderWidth: 2
  },
  riskMarkerHigh: {
    backgroundColor: colors.danger
  },
  riskMarkerMedium: {
    backgroundColor: colors.amber
  },
  riskMarkerLow: {
    backgroundColor: colors.info
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
