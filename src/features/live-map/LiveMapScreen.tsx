import { useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import type MapView from "react-native-maps";

import type { RiskZone, SavedSafeRoutePlan } from "./liveMapTypes";
import {
  DEFAULT_ROUTE_INTELLIGENCE_VISIBLE,
  liveLocationNotice,
  routeStartBlockedReason,
  type NavigationLifecycle,
} from "./liveMapUiState";
import { resolveLiveMapOverlayLayout } from "./liveMapLayout";
import { LiveMapCanvas } from "./LiveMapCanvas";
import { LiveMapOverlay } from "./LiveMapOverlay";
import { createRouteRiskAdvisory } from "./liveRouteRiskAdvisory";
import {
  calculateRiskZoneRouteProximity,
  routeRiskStartBlockedReason,
  resolveLiveRouteRiskAlert,
  resolveVisibleRiskZones,
} from "./routeRisk";
import {
  DEFAULT_SPEED_METERS_PER_SECOND,
  DEMO_DRIVE_STEP_INTERVAL_MS,
  buildInterpolatedProgressCoordinates,
  calculateRouteProgress,
  coordinateForInterpolatedStep,
  resolveDemoDriveStepIncrement,
  resolveGuidance,
} from "./routeProgress";
import {
  type DriveAlongCameraPose,
  resolveDriveAlongCamera,
  resolveActiveNavigationState,
  resolveNavigationVehicleCoordinate,
  resolveOverviewCameraReset,
  resolveVehicleHeading,
  shouldAnimateDriveAlongCamera,
  shouldSuspendDriveAlongCamera,
  shouldUseDriveAlongCamera,
} from "./liveMapNavigation";
import { useLiveLocation } from "./useLiveLocation";
import { SAFEROUTE_DEMO_DRIVE_ENABLED } from "../../config/env";
import { colors } from "../../theme";
import { uiTestIds } from "../../testing/uiTestIds";

interface LiveMapScreenProps {
  returnAccessibilityLabel?: string;
  returnLabel?: string;
  routeContext?: "guest" | "saved";
  routePlan: SavedSafeRoutePlan;
  onChangeRoute: () => void;
}

export function LiveMapScreen({
  onChangeRoute,
  returnAccessibilityLabel = "Return to saved routes",
  returnLabel = "Routes",
  routePlan,
  routeContext = "saved",
}: LiveMapScreenProps) {
  const mapRef = useRef<MapView | null>(null);
  const lastDriveAlongCameraPoseRef = useRef<DriveAlongCameraPose | null>(null);
  const viewport = useWindowDimensions();
  const [alertsVisible, setAlertsVisible] = useState(
    DEFAULT_ROUTE_INTELLIGENCE_VISIBLE,
  );
  const [followModeEnabled, setFollowModeEnabled] = useState(true);
  const [demoDriveEnabled, setDemoDriveEnabled] = useState(false);
  const [navigationState, setNavigationState] =
    useState<NavigationLifecycle>("loaded");
  const [liveLocationRequested, setLiveLocationRequested] = useState(false);
  const [pendingNavigationStart, setPendingNavigationStart] = useState(false);
  const [routeStep, setRouteStep] = useState(0);
  const [progressFloorMeters, setProgressFloorMeters] = useState(0);
  const [selectedRiskZoneId, setSelectedRiskZoneId] = useState<string | null>(
    null,
  );
  const demoDriveActive = SAFEROUTE_DEMO_DRIVE_ENABLED && demoDriveEnabled;
  const navigationLocationTrackingActive =
    !demoDriveActive &&
    (navigationState === "navigating" || navigationState === "off-route");
  const locationTrackingRequested =
    liveLocationRequested || navigationLocationTrackingActive;
  const { coordinate, errorMessage, permissionStatus, trackingLabel } =
    useLiveLocation({
      navigationActive: navigationLocationTrackingActive,
      permissionRequested: locationTrackingRequested,
    });
  const layout = useMemo(
    () =>
      resolveLiveMapOverlayLayout({
        height: viewport.height,
        platform:
          Platform.OS === "android" || Platform.OS === "web"
            ? Platform.OS
            : "ios",
        width: viewport.width,
      }),
    [viewport.height, viewport.width],
  );

  const liveCoordinate = useMemo(() => {
    if (!coordinate) {
      return null;
    }

    return {
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
    };
  }, [coordinate]);

  const demoCoordinate = coordinateForInterpolatedStep(
    routePlan.route.coordinates,
    routeStep,
  );
  const rawVehicleCoordinate = demoDriveActive
    ? demoCoordinate
    : liveCoordinate;
  const speedMetersPerSecond = demoDriveActive
    ? DEFAULT_SPEED_METERS_PER_SECOND
    : coordinate?.speed && coordinate.speed > 0
      ? coordinate.speed
      : null;
  const progress = calculateRouteProgress(
    routePlan.route.coordinates,
    rawVehicleCoordinate,
    {
      minimumDistanceAlongMeters:
        navigationState === "navigating" ||
        navigationState === "off-route" ||
        navigationState === "paused"
          ? progressFloorMeters
          : 0,
      speedMetersPerSecond,
    },
  );
  const activeNavigationState = resolveActiveNavigationState(
    navigationState,
    progress,
  );
  const vehicleCoordinate = resolveNavigationVehicleCoordinate({
    fallbackCoordinate: routePlan.route.coordinates[0],
    progress,
    rawVehicleCoordinate,
  });
  const progressCoordinates =
    progress?.completedCoordinates ||
    (demoDriveActive
      ? buildInterpolatedProgressCoordinates(routePlan.route.coordinates, routeStep)
      : []);
  const riskStartBlockedReason = useMemo(
    () => routeRiskStartBlockedReason(routePlan),
    [routePlan],
  );
  const navigationBlockedReason = riskStartBlockedReason || routeStartBlockedReason({
    demoDriveActive,
    hasLiveCoordinate: Boolean(rawVehicleCoordinate),
    permissionStatus,
    routeCoordinateCount: routePlan.route.coordinates.length,
  });
  const locationNotice = riskStartBlockedReason || liveLocationNotice({
    demoDriveActive,
    demoDriveAvailable: SAFEROUTE_DEMO_DRIVE_ENABLED,
    errorMessage,
    hasLiveCoordinate: Boolean(rawVehicleCoordinate),
    permissionStatus,
    routeCoordinateCount: routePlan.route.coordinates.length,
  });
  const guidance = resolveGuidance(
    routePlan.route,
    progress,
    activeNavigationState,
  );
  const riskAdvisory = createRouteRiskAdvisory({
    progress,
    riskZones: routePlan.riskZones,
    routeCoordinates: routePlan.route.coordinates,
  });
  const liveRiskAlert = useMemo(
    () =>
      resolveLiveRouteRiskAlert({
        navigationState: activeNavigationState,
        progress,
        routePlan,
        vehicleCoordinate: rawVehicleCoordinate,
      }),
    [
      activeNavigationState,
      progress?.isArrived,
      progress?.isOffRoute,
      progress?.snappedCoordinate.latitude,
      progress?.snappedCoordinate.longitude,
      progress?.travelledDistanceMeters,
      rawVehicleCoordinate?.latitude,
      rawVehicleCoordinate?.longitude,
      routePlan,
    ],
  );
  const visibleRiskZones = useMemo(
    () =>
      resolveVisibleRiskZones({
        alertsVisible,
        liveRiskAlert,
        navigationState: activeNavigationState,
        riskZones: routePlan.riskZones,
      }),
    [activeNavigationState, alertsVisible, liveRiskAlert, routePlan.riskZones],
  );
  const selectedRiskZone = useMemo(
    () =>
      routePlan.riskZones.find((zone) => zone.id === selectedRiskZoneId) ||
      null,
    [routePlan.riskZones, selectedRiskZoneId],
  );
  const selectedRiskProximity = useMemo(
    () =>
      selectedRiskZone
        ? calculateRiskZoneRouteProximity(
            routePlan.route.coordinates,
            selectedRiskZone,
          )
        : null,
    [routePlan.route.coordinates, selectedRiskZone],
  );
  const heading = resolveVehicleHeading(
    routePlan.route.coordinates,
    progress,
    coordinate?.heading,
    demoDriveActive,
    routeStep,
  );

  useEffect(() => {
    setNavigationState("loaded");
    setRouteStep(0);
    setProgressFloorMeters(0);
    setFollowModeEnabled(true);
    setPendingNavigationStart(false);
    setSelectedRiskZoneId(null);
    const timer = setTimeout(() => fitRoute(), 120);
    return () => clearTimeout(timer);
  }, [routePlan.id]);

  useEffect(() => {
    if (
      !demoDriveActive ||
      (navigationState !== "navigating" && navigationState !== "off-route")
    ) {
      return undefined;
    }

    const routeStepIncrement = resolveDemoDriveStepIncrement(
      routePlan.route.coordinates.length,
    );
    if (routeStepIncrement <= 0) {
      return undefined;
    }

    const timer = setInterval(() => {
      setRouteStep((step) => {
        const finalStep = Math.max(0, routePlan.route.coordinates.length - 1);
        return Math.min(finalStep, step + routeStepIncrement);
      });
    }, DEMO_DRIVE_STEP_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [demoDriveActive, navigationState, routePlan.route.coordinates.length]);

  useEffect(() => {
    if (navigationState === "loaded" || navigationState === "stopped") {
      setProgressFloorMeters(0);
      return;
    }

    if (!progress || progress.isOffRoute || progress.isArrived) {
      return;
    }

    setProgressFloorMeters((currentFloor) => {
      const nextFloor = Math.max(currentFloor, progress.travelledDistanceMeters);
      return Math.abs(nextFloor - currentFloor) > 0.5 ? nextFloor : currentFloor;
    });
  }, [
    navigationState,
    progress?.isArrived,
    progress?.isOffRoute,
    progress?.travelledDistanceMeters,
  ]);

  useEffect(() => {
    if (
      !progress ||
      (navigationState !== "navigating" && navigationState !== "off-route")
    ) {
      return;
    }

    if (progress.isArrived) {
      setNavigationState("arrived");
      return;
    }

    if (progress.isOffRoute && navigationState !== "off-route") {
      setNavigationState("off-route");
      return;
    }

    if (!progress.isOffRoute && navigationState === "off-route") {
      setNavigationState("navigating");
    }
  }, [navigationState, progress]);

  useEffect(() => {
    if (
      !vehicleCoordinate ||
      !shouldUseDriveAlongCamera(
        activeNavigationState,
        followModeEnabled,
        vehicleCoordinate,
      )
    ) {
      lastDriveAlongCameraPoseRef.current = null;
      return;
    }

    const nextCameraPose: DriveAlongCameraPose = {
      compact: layout.isCompact,
      coordinate: vehicleCoordinate,
      heading,
      state: activeNavigationState,
    };

    if (
      !shouldAnimateDriveAlongCamera(
        lastDriveAlongCameraPoseRef.current,
        nextCameraPose,
      )
    ) {
      return;
    }

    const driveAlongCamera = resolveDriveAlongCamera(
      nextCameraPose.coordinate,
      nextCameraPose.heading,
      nextCameraPose.compact,
    );
    mapRef.current?.animateCamera(driveAlongCamera.camera, {
      duration: driveAlongCamera.durationMs,
    });
    lastDriveAlongCameraPoseRef.current = nextCameraPose;
  }, [
    activeNavigationState,
    followModeEnabled,
    heading,
    layout.isCompact,
    vehicleCoordinate?.latitude,
    vehicleCoordinate?.longitude,
  ]);

  const resetToOverviewCamera = () => {
    lastDriveAlongCameraPoseRef.current = null;
    const overviewCamera = resolveOverviewCameraReset();
    mapRef.current?.animateCamera(overviewCamera.camera, {
      duration: overviewCamera.durationMs,
    });
  };

  const fitRoute = () => {
    resetToOverviewCamera();

    if (routePlan.route.coordinates.length >= 2) {
      mapRef.current?.fitToCoordinates(routePlan.route.coordinates, {
        animated: true,
        edgePadding: layout.edgePadding,
      });
      return;
    }

    if (vehicleCoordinate) {
      mapRef.current?.animateToRegion(
        {
          ...vehicleCoordinate,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        },
        460,
      );
    }
  };

  const suspendDriveAlongCameraForMapReview = () => {
    if (
      shouldSuspendDriveAlongCamera(activeNavigationState, followModeEnabled)
    ) {
      setFollowModeEnabled(false);
    }
  };

  const fitRouteFromControl = () => {
    suspendDriveAlongCameraForMapReview();
    fitRoute();
  };

  const centerOnVehicle = () => {
    if (!vehicleCoordinate) {
      fitRoute();
      return;
    }

    setFollowModeEnabled(true);

    if (
      shouldUseDriveAlongCamera(activeNavigationState, true, vehicleCoordinate)
    ) {
      const driveAlongCamera = resolveDriveAlongCamera(
        vehicleCoordinate,
        heading,
        layout.isCompact,
      );
      mapRef.current?.animateCamera(driveAlongCamera.camera, {
        duration: 480,
      });
      lastDriveAlongCameraPoseRef.current = {
        compact: layout.isCompact,
        coordinate: vehicleCoordinate,
        heading,
        state: activeNavigationState,
      };
      return;
    }

    resetToOverviewCamera();

    mapRef.current?.animateToRegion(
      {
        ...vehicleCoordinate,
        latitudeDelta: 0.018,
        longitudeDelta: 0.018,
      },
      420,
    );
  };

  const handlePrimaryNavigationAction = () => {
    if (
      activeNavigationState === "navigating" ||
      activeNavigationState === "off-route"
    ) {
      setNavigationState("paused");
      return;
    }

    if (activeNavigationState === "arrived" || navigationBlockedReason) {
      return;
    }

    if (!demoDriveActive && permissionStatus === "idle") {
      setLiveLocationRequested(true);
      setPendingNavigationStart(true);
      return;
    }

    setNavigationState("navigating");
    setFollowModeEnabled(true);
  };

  const liveNavigationBlockedReason =
    activeNavigationState === "navigating" ||
    activeNavigationState === "off-route" ||
    activeNavigationState === "arrived"
      ? null
      : navigationBlockedReason;

  useEffect(() => {
    if (!pendingNavigationStart) {
      return;
    }

    if (demoDriveActive) {
      setPendingNavigationStart(false);
      setNavigationState("navigating");
      setFollowModeEnabled(true);
      return;
    }

    if (permissionStatus === "denied" || riskStartBlockedReason) {
      setPendingNavigationStart(false);
      return;
    }

    if (permissionStatus !== "granted" || !rawVehicleCoordinate || navigationBlockedReason) {
      return;
    }

    setPendingNavigationStart(false);
    setNavigationState("navigating");
    setFollowModeEnabled(true);
  }, [
    demoDriveActive,
    navigationBlockedReason,
    pendingNavigationStart,
    permissionStatus,
    rawVehicleCoordinate,
    riskStartBlockedReason,
  ]);

  const handleStopRoute = () => {
    setNavigationState("stopped");
    setRouteStep(0);
    setProgressFloorMeters(0);
    setFollowModeEnabled(false);
    fitRoute();
  };

  const toggleDemoDrive = () => {
    if (!SAFEROUTE_DEMO_DRIVE_ENABLED) {
      return;
    }

    setDemoDriveEnabled((enabled) => !enabled);
    setRouteStep(0);
    setProgressFloorMeters(0);
    setNavigationState("loaded");
  };

  const handleRiskZonePress = (zone: RiskZone) => {
    setSelectedRiskZoneId(zone.id);
    setAlertsVisible(true);
  };

  const handleOpenRiskAlert = () => {
    if (!liveRiskAlert) {
      return;
    }

    setSelectedRiskZoneId(liveRiskAlert.zone.id);
    setAlertsVisible(true);
  };

  const handleDismissRiskDetail = () => {
    setSelectedRiskZoneId(null);
  };

  return (
    <View testID={uiTestIds.liveMapScreen} style={styles.screen}>
      <LiveMapCanvas
        activeNavigationState={activeNavigationState}
        activeRiskZoneId={liveRiskAlert?.zone.id}
        demoDriveActive={demoDriveActive}
        heading={heading}
        mapRef={mapRef}
        onMapReady={fitRoute}
        onPanDrag={suspendDriveAlongCameraForMapReview}
        onRiskZonePress={handleRiskZonePress}
        permissionStatus={permissionStatus}
        progressCoordinates={progressCoordinates}
        routePlan={routePlan}
        selectedRiskZoneId={selectedRiskZoneId}
        vehicleCoordinate={vehicleCoordinate}
        visibleRiskZones={visibleRiskZones}
      />

      <LiveMapOverlay
        activeNavigationState={activeNavigationState}
        alertsVisible={alertsVisible}
        demoDriveActive={demoDriveActive}
        demoDriveAvailable={SAFEROUTE_DEMO_DRIVE_ENABLED}
        followModeEnabled={followModeEnabled}
        guidance={guidance}
        hasVehicleCoordinate={Boolean(rawVehicleCoordinate)}
        layout={layout}
        locationNotice={locationNotice}
        onCenterVehicle={centerOnVehicle}
        onChangeRoute={onChangeRoute}
        onDismissRiskDetail={handleDismissRiskDetail}
        onFitRoute={fitRouteFromControl}
        onOpenRiskAlert={handleOpenRiskAlert}
        onPrimaryAction={handlePrimaryNavigationAction}
        returnAccessibilityLabel={returnAccessibilityLabel}
        returnLabel={returnLabel}
        routeContext={routeContext}
        onSetAlertsVisible={setAlertsVisible}
        onSetFollowModeEnabled={setFollowModeEnabled}
        onStopRoute={handleStopRoute}
        onToggleDemoDrive={toggleDemoDrive}
        primaryDisabledReason={liveNavigationBlockedReason}
        progress={progress}
        liveRiskAlert={liveRiskAlert}
        riskAdvisory={riskAdvisory}
        routePlan={routePlan}
        selectedRiskProximity={selectedRiskProximity}
        selectedRiskZone={selectedRiskZone}
        trackingLabel={trackingLabel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.mapFallback,
  },
});
