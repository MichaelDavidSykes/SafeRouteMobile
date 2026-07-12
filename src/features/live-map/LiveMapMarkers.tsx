import type { ComponentProps, ComponentType } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Callout, Circle, Marker, Polygon, Polyline } from 'react-native-maps';

import type { RiskSeverity, RiskZone, RouteCheckpoint } from './liveMapTypes';
import {
  buildRouteRiskAlertSegment,
  createRiskZoneAccessibilityLabel
} from './routeRisk';
import { createRiskZoneDetailPresentation, type RouteRiskProximity } from './routeRisk';
import {
  isRouteAlertZone,
  shouldRenderRiskCoverage,
  visibleRiskRadiusMeters,
} from './riskOverlayPresentation';
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
  proximity,
  onDismiss,
  zone
}: {
  active?: boolean;
  onPress?: (zone: RiskZone) => void;
  routeCoordinates?: Array<{ latitude: number; longitude: number }>;
  selected?: boolean;
  proximity?: RouteRiskProximity | null;
  onDismiss?: () => void;
  zone: RiskZone;
}) {
  const routeSegmentCoordinates = zone.routeSegmentCoordinates || [];
  const connectorCoordinates = zone.connectorCoordinates || [];
  const polygonCoordinates = zone.polygonCoordinates || [];
  const routeAlertCoordinates = routeSegmentCoordinates.length > 1
    ? []
    : buildRouteRiskAlertSegment(routeCoordinates || [], zone);
  const handlePress = () => onPress?.(zone);
  const routeAlert = isRouteAlertZone(zone);

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
            strokeColor={zone.markerColor}
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
            strokeColor={zone.markerColor}
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
          strokeColor={zone.strokeColor}
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
          strokeColor={zone.strokeColor}
          fillColor={zone.fillColor}
          strokeWidth={selected || active ? 3 : 2}
          testID={uiTestIds.liveMapRiskZoneArea(zone.id)}
          tappable={Boolean(onPress)}
          onPress={handlePress}
        />
      ) : shouldRenderRiskCoverage(zone) ? (
        <TappableCircle
          center={zone.coordinate}
          radius={visibleRiskRadiusMeters(zone)}
          strokeColor={zone.strokeColor}
          fillColor={zone.fillColor}
          strokeWidth={selected || active ? 3 : 2}
          testID={uiTestIds.liveMapRiskZoneArea(zone.id)}
          tappable={Boolean(onPress)}
          onPress={handlePress}
        />
      ) : null}
      <RiskMarker
        active={active}
        onDismiss={onDismiss}
        onPress={handlePress}
        proximity={proximity}
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
  proximity,
  routeAlert,
  onDismiss,
  zone
}: {
  active?: boolean;
  onPress?: () => void;
  selected?: boolean;
  proximity?: RouteRiskProximity | null;
  routeAlert: boolean;
  onDismiss?: () => void;
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
      onCalloutPress={onDismiss}
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
            routeAlert ? styles.routeAlertMarker : null,
            active ? styles.riskMarkerActive : null,
            selected ? styles.riskMarkerSelected : null,
            severityMarkerStyle(zone.severity)
          ]}
        >
          <View style={routeAlert ? styles.routeAlertMarkerCore : styles.riskMarkerCore} />
        </View>
      </View>
      <RiskCallout proximity={proximity || null} zone={zone} onDismiss={onDismiss} />
    </Marker>
  );
}

function RiskCallout({
  onDismiss,
  proximity,
  zone,
}: {
  onDismiss?: () => void;
  proximity: RouteRiskProximity | null;
  zone: RiskZone;
}) {
  const presentation = createRiskZoneDetailPresentation({ proximity, zone });
  return (
    <Callout tooltip onPress={onDismiss}>
      <View
        accessible
        accessibilityLabel={presentation.accessibilityLabel}
        testID={uiTestIds.liveMapRiskDetail}
        style={styles.riskCalloutWrap}
      >
        <View style={styles.riskCallout}>
          <Text numberOfLines={1} style={styles.riskCalloutEyebrow}>Risk area</Text>
          <Text numberOfLines={2} style={styles.riskCalloutTitle}>{presentation.title}</Text>
          <Text numberOfLines={2} style={styles.riskCalloutBody}>{presentation.body}</Text>
          <Text numberOfLines={2} style={styles.riskCalloutMeta}>{presentation.metaLabel}</Text>
          <Text numberOfLines={1} style={styles.riskCalloutClearance}>{presentation.clearanceLabel}</Text>
          <Text
            accessibilityLabel="Close risk details"
            testID={uiTestIds.liveMapRiskDetailDismiss}
            style={styles.riskCalloutDismiss}
          >
            Tap to close
          </Text>
        </View>
        <View style={styles.riskCalloutPointer} />
      </View>
    </Callout>
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
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center'
  },
  riskMarker: {
    width: 14,
    height: 14,
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
    width: 4,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface
  },
  riskMarkerActive: {
    width: 18,
    height: 18
  },
  riskMarkerSelected: {
    width: 20,
    height: 20,
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
  routeAlertMarkerHitArea: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center'
  },
  routeAlertMarker: {
    width: 9,
    height: 9,
    borderWidth: 1,
    borderRadius: 2,
    opacity: 0.86
  },
  routeAlertMarkerCore: {
    width: 3,
    height: 3,
    borderRadius: 1,
    backgroundColor: colors.surface
  },
  riskCalloutWrap: {
    width: 286,
    alignItems: 'center'
  },
  riskCallout: {
    width: 286,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 18,
    backgroundColor: 'rgba(8,11,15,0.94)'
  },
  riskCalloutEyebrow: {
    color: 'rgba(226,232,240,0.72)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  riskCalloutTitle: {
    marginTop: 4,
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 19
  },
  riskCalloutBody: {
    marginTop: 6,
    color: 'rgba(226,232,240,0.78)',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16
  },
  riskCalloutMeta: {
    marginTop: 8,
    color: 'rgba(226,232,240,0.9)',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 14,
    textTransform: 'uppercase'
  },
  riskCalloutClearance: {
    marginTop: 6,
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '800'
  },
  riskCalloutDismiss: {
    marginTop: 9,
    color: '#8cc8ff',
    fontSize: 11,
    fontWeight: '900'
  },
  riskCalloutPointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(8,11,15,0.94)'
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
