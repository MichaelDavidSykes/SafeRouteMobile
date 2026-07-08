import { StyleSheet, View } from 'react-native';
import { Circle, Marker, Polyline } from 'react-native-maps';

import type { RiskSeverity, RiskZone, RouteCheckpoint } from './liveMapTypes';
import { colors, radius } from '../../theme';

export function RiskOverlay({ zone }: { zone: RiskZone }) {
  const routeSegmentCoordinates = zone.routeSegmentCoordinates || [];
  const connectorCoordinates = zone.connectorCoordinates || [];

  return (
    <>
      {routeSegmentCoordinates.length > 1 ? (
        <>
          <Polyline
            coordinates={routeSegmentCoordinates}
            strokeColor="rgba(255, 255, 255, 0.78)"
            strokeWidth={10}
            lineCap="round"
            lineJoin="round"
          />
          <Polyline
            coordinates={routeSegmentCoordinates}
            strokeColor={zone.markerColor}
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
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
        />
      ) : null}
      <Circle
        center={zone.coordinate}
        radius={zone.radiusMeters}
        strokeColor={zone.strokeColor}
        fillColor={zone.fillColor}
        strokeWidth={2}
      />
      <RiskMarker zone={zone} />
    </>
  );
}

export function CheckpointMarker({ checkpoint }: { checkpoint: RouteCheckpoint }) {
  const isOrigin = checkpoint.kind === 'origin';
  const markerRole = isOrigin ? 'Route start' : 'Destination';

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
        style={[
          styles.checkpointMarker,
          isOrigin ? styles.checkpointMarkerOrigin : styles.checkpointMarkerDestination
        ]}
      >
        <View style={styles.checkpointMarkerCore} />
      </View>
    </Marker>
  );
}

function RiskMarker({ zone }: { zone: RiskZone }) {
  return (
    <Marker coordinate={zone.coordinate} anchor={{ x: 0.5, y: 0.5 }} title={zone.title} description={zone.description}>
      <View style={[styles.riskMarker, severityMarkerStyle(zone.severity)]}>
        <View style={styles.riskMarkerCore} />
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
  return (
    <Marker
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      rotation={heading}
      title={demoDriveEnabled ? 'Simulated convoy' : 'Current convoy'}
    >
      <View style={styles.vehicleMarker}>
        <View style={styles.vehicleMarkerHeading} />
      </View>
    </Marker>
  );
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
  checkpointMarker: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
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
  checkpointMarkerDestination: {
    backgroundColor: colors.ink,
    borderRadius: radius.pill
  },
  checkpointMarkerCore: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface
  },
  riskMarker: {
    width: 24,
    height: 24,
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
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface
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
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
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
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.surface,
    transform: [{ translateY: -1 }]
  }
});
