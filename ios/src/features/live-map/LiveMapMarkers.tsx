import { memo } from 'react';
import {
  AlertTriangle,
  CircleAlert,
  Hospital,
  MapPin,
  Shield,
  ShieldCheck,
} from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import {
  Circle,
  Marker,
  Polygon,
  Polyline,
  type LatLng,
} from 'react-native-maps';

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

const ROUTE_PROXIMITY_CASING_Z_INDEX = 32;
const ROUTE_PROXIMITY_CORE_Z_INDEX = 33;
const ROUTE_ALERT_CONNECTOR_Z_INDEX = 39;
const ROUTE_ALERT_CASING_Z_INDEX = 40;
const ROUTE_ALERT_CORE_Z_INDEX = 41;
const ROUTE_ALERT_MARKER_Z_INDEX = 42;

export const RiskOverlay = memo(function RiskOverlay({
  active,
  interactive = true,
  onPress,
  routeCoordinates,
  selected,
  visible = true,
  zone
}: {
  active?: boolean;
  interactive?: boolean;
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
    routeSegmentCoordinates.length <= 1
      ? buildRouteRiskAlertSegment(routeCoordinates || [], zone)
      : [];
  const riskTone = resolveRiskOverlayTone(zone);
  const riskColors = severityOverlayColors(riskTone);
  const tappable = visible && interactive && Boolean(onPress);
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
          <Polyline
            coordinates={routeAlertCoordinates}
            strokeColor={showRouteProximitySegment && showSegmentCasing
              ? casingColor
              : 'transparent'}
            strokeWidth={segmentCasingWidth}
            lineCap="round"
            lineJoin="round"
            zIndex={segmentCasingZIndex}
          />
          <Polyline
            coordinates={routeAlertCoordinates}
            strokeColor={showRouteProximitySegment ? riskStrokeColor : 'transparent'}
            strokeWidth={segmentCoreWidth}
            lineCap="round"
            lineJoin="round"
            zIndex={segmentCoreZIndex}
            testID={uiTestIds.liveMapRouteRiskSegment(zone.id)}
          />
        </>
      ) : null}
      {routeSegmentCoordinates.length > 1 ? (
        <>
          <Polyline
            coordinates={routeSegmentCoordinates}
            strokeColor={
              showRouteProximitySegment && showSegmentCasing
                ? casingColor
                : 'transparent'
            }
            strokeWidth={segmentCasingWidth}
            lineCap="round"
            lineJoin="round"
            zIndex={segmentCasingZIndex}
          />
          <Polyline
            coordinates={routeSegmentCoordinates}
            strokeColor={showRouteProximitySegment ? riskStrokeColor : 'transparent'}
            strokeWidth={segmentCoreWidth}
            lineCap="round"
            lineJoin="round"
            zIndex={segmentCoreZIndex}
            testID={uiTestIds.liveMapRouteRiskSegment(zone.id)}
          />
        </>
      ) : null}
      {connectorCoordinates.length > 1 ? (
        <Polyline
          coordinates={connectorCoordinates}
          strokeColor={
            showRouteProximitySegment && (!routeAlert || emphasized)
              ? riskStrokeColor
              : 'transparent'
          }
          strokeWidth={2}
          lineDashPattern={[3, 9]}
          lineCap="round"
          lineJoin="round"
          zIndex={routeAlert
            ? ROUTE_ALERT_CONNECTOR_Z_INDEX
            : ROUTE_PROXIMITY_CASING_Z_INDEX}
        />
      ) : null}
      {shouldRenderRiskCoverage(zone) && polygonCoordinates.length > 2 ? (
        <Polygon
          coordinates={polygonCoordinates}
          strokeColor={coverageStrokeColor}
          fillColor={coverageFillColor}
          strokeWidth={selected ? 1 : 0}
          testID={uiTestIds.liveMapRiskZoneArea(zone.id)}
        />
      ) : shouldRenderRiskCoverage(zone) ? (
        <Circle
          center={zone.coordinate}
          radius={visibleRiskRadiusMeters(zone)}
          strokeColor={coverageStrokeColor}
          fillColor={coverageFillColor}
          strokeWidth={selected ? 1 : 0}
          testID={uiTestIds.liveMapRiskZoneArea(zone.id)}
        />
      ) : null}
      <RiskMarker
        interactive={tappable}
        onPress={onPress ? () => onPress(zone) : undefined}
        routeAlert={routeAlert}
        selected={selected}
        visible={visible}
        zone={zone}
      />
    </>
  );
});

export function CheckpointMarker({
  checkpoint,
  visible = true,
}: {
  checkpoint: RouteCheckpoint;
  visible?: boolean;
}) {
  const markerRole = checkpointMarkerRole(checkpoint.kind);

  return (
    <Marker
      coordinate={checkpoint.coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      opacity={visible ? 1 : 0}
      tappable={visible}
      title={checkpoint.caption}
      description={markerRole}
      tracksViewChanges={false}
    >
      <View
        accessible={visible}
        accessibilityElementsHidden={!visible}
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
  visible = true,
}: {
  facility: SupportFacility;
  visible?: boolean;
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
      opacity={visible ? 1 : 0}
      tappable={visible}
      title={facility.label}
      description={supportFacilityCalloutDescription(facility)}
      testID={uiTestIds.supportFacility(facility.id)}
      tracksViewChanges={false}
      zIndex={43}
    >
      <View
        accessible={visible}
        accessibilityElementsHidden={!visible}
        accessibilityLabel={`${facility.label}. ${kindLabel}. ${supportFacilityCalloutDescription(facility)}`}
        accessibilityRole="button"
        style={styles.supportFacilityMarkerHitArea}
        testID={uiTestIds.supportFacility(facility.id)}
      >
        <View style={[styles.supportFacilityMarker, { backgroundColor: color }]}>
          <Icon
            accessibilityElementsHidden
            color={colors.onAccent}
            size={14}
            strokeWidth={2.4}
          />
        </View>
      </View>
    </Marker>
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
  interactive,
  onPress,
  selected,
  routeAlert,
  visible,
  zone
}: {
  interactive: boolean;
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
      accessible={visible}
      accessibilityElementsHidden={!visible}
      accessibilityLabel={createRiskZoneAccessibilityLabel(zone, Boolean(selected))}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      identifier={zone.id}
      coordinate={zone.coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      opacity={visible ? 1 : 0}
      onPress={onPress}
      testID={uiTestIds.liveMapRiskZone(zone.id)}
      tappable={visible && interactive}
      tracksViewChanges={false}
      zIndex={routeAlert ? ROUTE_ALERT_MARKER_Z_INDEX : 10}
    >
      <View
        accessible={false}
        accessibilityElementsHidden
        onTouchStart={interactive && onPress ? (event) => {
          event.stopPropagation();
          onPress();
        } : undefined}
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
              color={colors.onAccent}
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

export function VehicleMarker({
  coordinate,
  demoDriveEnabled = false,
  testID,
  visible = true,
}: {
  coordinate: LatLng;
  demoDriveEnabled?: boolean;
  testID?: string;
  visible?: boolean;
}) {
  const markerTitle = demoDriveEnabled ? 'Route preview position' : 'Current position';

  return (
    <Marker
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      opacity={visible ? 1 : 0}
      tappable={visible}
      testID={testID}
      title={markerTitle}
      tracksViewChanges={false}
      zIndex={100}
    >
      <View
        accessible={visible}
        accessibilityElementsHidden={!visible}
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
    borderColor: colors.onAccent,
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
    borderColor: colors.onAccent,
    borderRadius: radius.pill,
    backgroundColor: colors.appleBlue,
    shadowColor: '#000000',
    shadowOpacity: 0.24,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  }
});
