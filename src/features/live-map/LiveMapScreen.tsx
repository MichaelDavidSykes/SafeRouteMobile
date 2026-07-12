import { useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import type MapView from "react-native-maps";

import { fetchSafeRouteRoadRoutePreview } from "../guest-map/safeRouteRoadRouteProvider";
import { isPreviewAccessToken } from "../auth/previewSession";
import { mergeRiskZonesById } from "./areaRiskApiCore";
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
  auditRouteRiskAvoidance,
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
import { useViewportRiskAreas } from "./useViewportRiskAreas";
import { fetchAreaRiskAlongRoute } from "./routeRiskCorridorApi";
import {
  applyLiveRerouteSample,
  createLiveRerouteState,
  getManualRerouteRetryEligibility,
  resolveLiveRerouteFailure,
  resolveLiveRerouteSuccess,
  requestImmediateLiveReroute,
  requestManualLiveReroute,
  retryFailedLiveReroute,
  startLiveRerouteMonitoring,
  stopLiveRerouteMonitoring,
  type LiveRerouteRequest,
  type LiveRerouteState,
} from "./liveRerouteState";
import {
  applyLiveReroutePreview,
  buildLiveRerouteAvoidRectangles,
  buildLiveRerouteTargets,
  createLiveRiskRegion,
} from "./liveReroutePlan";
import { SAFEROUTE_DEMO_DRIVE_ENABLED } from "../../config/env";
import { colors } from "../../theme";
import { uiTestIds } from "../../testing/uiTestIds";
import { stopBackgroundNavigation } from "./backgroundNavigation";
import { createBackgroundNavigationPresentation } from "./backgroundNavigationState";
import {
  createActiveNavigationSession,
  isPersistedNavigationLifecycle,
  type ActiveNavigationSession,
} from "./activeNavigationSessionCore";
import {
  clearActiveNavigationSession,
  saveActiveNavigationSession,
} from "./activeNavigationSession";
import { normalizeReliableLocationSample } from "./locationSignal";
import { useNetworkAvailability } from "../api/useNetworkAvailability";

interface LiveMapScreenProps {
  accessToken?: string | null;
  initialNavigationSession?: ActiveNavigationSession | null;
  onNavigationSessionChange?: (session: ActiveNavigationSession | null) => void;
  returnAccessibilityLabel?: string;
  returnLabel?: string;
  routeContext?: "guest" | "saved";
  routePlan: SavedSafeRoutePlan;
  onChangeRoute: () => void;
}

export function LiveMapScreen({
  accessToken,
  initialNavigationSession = null,
  onChangeRoute,
  onNavigationSessionChange,
  returnAccessibilityLabel = "Return to saved routes",
  returnLabel = "Routes",
  routePlan,
  routeContext = "saved",
}: LiveMapScreenProps) {
  const { offline } = useNetworkAvailability();
  const resumedNavigationSession =
    initialNavigationSession?.routePlan.route.id === routePlan.route.id
      ? initialNavigationSession
      : null;
  const mapRef = useRef<MapView | null>(null);
  const lastDriveAlongCameraPoseRef = useRef<DriveAlongCameraPose | null>(null);
  const rerouteStateRef = useRef<LiveRerouteState>(createLiveRerouteState());
  const liveRoutePlanRef = useRef(
    resumedNavigationSession?.routePlan || routePlan,
  );
  const progressRef = useRef<ReturnType<typeof calculateRouteProgress>>(null);
  const activeSessionSnapshotRef = useRef<ActiveNavigationSession | null>(null);
  const onNavigationSessionChangeRef = useRef(onNavigationSessionChange);
  const viewport = useWindowDimensions();
  const [alertsVisible, setAlertsVisible] = useState(
    DEFAULT_ROUTE_INTELLIGENCE_VISIBLE,
  );
  const [followModeEnabled, setFollowModeEnabled] = useState(
    resumedNavigationSession?.followModeEnabled ?? true,
  );
  const [navigationState, setNavigationState] =
    useState<NavigationLifecycle>(
      resumedNavigationSession?.navigationState || "loaded",
    );
  const [liveLocationRequested, setLiveLocationRequested] = useState(
    Boolean(resumedNavigationSession),
  );
  const [pendingNavigationStart, setPendingNavigationStart] = useState(false);
  const [routeStep, setRouteStep] = useState(0);
  const [activeRoutePlan, setActiveRoutePlan] = useState(
    resumedNavigationSession?.routePlan || routePlan,
  );
  const [rerouteState, setRerouteState] = useState<LiveRerouteState>(
    rerouteStateRef.current,
  );
  const [rerouteClockMs, setRerouteClockMs] = useState(Date.now());
  const [progressFloorMeters, setProgressFloorMeters] = useState(
    resumedNavigationSession?.progressFloorMeters || 0,
  );
  const [selectedRiskZoneId, setSelectedRiskZoneId] = useState<string | null>(
    null,
  );
  // Expo preview sessions advance along the real snapped route automatically
  // once guidance starts. This keeps QA deterministic without exposing a
  // confusing simulation control in the customer-facing route sheet.
  const demoDriveActive = SAFEROUTE_DEMO_DRIVE_ENABLED && isPreviewAccessToken(accessToken);
  const navigationLocationTrackingActive =
    !demoDriveActive &&
    (navigationState === "navigating" || navigationState === "off-route");
  const locationTrackingRequested =
    liveLocationRequested || navigationLocationTrackingActive;
  const {
    backgroundStatus,
    coordinate,
    enableBackgroundTracking,
    errorMessage,
    permissionStatus,
    timestampMs,
    trackingLabel,
  } = useLiveLocation({
    backgroundRouteId: activeRoutePlan.route.id,
    initialLocationSample: resumedNavigationSession?.lastLocation || null,
    manageBackgroundNavigation: true,
    navigationActive: navigationLocationTrackingActive,
    permissionRequested: locationTrackingRequested,
  });
  onNavigationSessionChangeRef.current = onNavigationSessionChange;
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

  const liveRiskRegion = useMemo(
    () => createLiveRiskRegion(liveCoordinate, activeRoutePlan.region),
    [
      activeRoutePlan.region,
      liveCoordinate?.latitude,
      liveCoordinate?.longitude,
    ],
  );
  const liveApiAccessToken = accessToken && !isPreviewAccessToken(accessToken)
    ? accessToken
    : null;
  const viewportRisk = useViewportRiskAreas({
    accessToken: liveApiAccessToken,
    clientId: activeRoutePlan.clientId,
    region: liveRiskRegion,
  });
  const liveRoutePlan = useMemo<SavedSafeRoutePlan>(
    () => ({
      ...activeRoutePlan,
      riskZones: mergeRiskZonesById(
        activeRoutePlan.riskZones,
        viewportRisk.zones,
      ),
    }),
    [activeRoutePlan, viewportRisk.zones],
  );
  liveRoutePlanRef.current = liveRoutePlan;

  const demoCoordinate = coordinateForInterpolatedStep(
    liveRoutePlan.route.coordinates,
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
    liveRoutePlan.route.coordinates,
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
  progressRef.current = progress;
  const activeNavigationState = resolveActiveNavigationState(
    navigationState,
    progress,
  );
  const backgroundNavigationPresentation =
    createBackgroundNavigationPresentation({
      navigationActive:
        activeNavigationState === "navigating" ||
        activeNavigationState === "off-route",
      status: backgroundStatus,
    });
  activeSessionSnapshotRef.current =
    !demoDriveActive && isPersistedNavigationLifecycle(navigationState)
      ? createActiveNavigationSession({
          backgroundTrackingEnabled: backgroundStatus === "active",
          followModeEnabled,
          lastLocation: normalizeReliableLocationSample({
            accuracyMeters: coordinate?.accuracy,
            headingDegrees: coordinate?.heading,
            latitude: coordinate?.latitude,
            longitude: coordinate?.longitude,
            speedMetersPerSecond: coordinate?.speed,
            timestampMs,
          }),
          navigationState,
          progressFloorMeters,
          routeContext,
          routePlan: liveRoutePlan,
        })
      : null;
  const vehicleCoordinate = resolveNavigationVehicleCoordinate({
    fallbackCoordinate: liveRoutePlan.route.coordinates[0],
    progress,
    rawVehicleCoordinate,
  });
  const progressCoordinates =
    progress?.completedCoordinates ||
    (demoDriveActive
      ? buildInterpolatedProgressCoordinates(liveRoutePlan.route.coordinates, routeStep)
      : []);
  const riskStartBlockedReason = useMemo(
    () => routeRiskStartBlockedReason(liveRoutePlan),
    [liveRoutePlan],
  );
  const navigationBlockedReason = riskStartBlockedReason || routeStartBlockedReason({
    demoDriveActive,
    hasLiveCoordinate: Boolean(rawVehicleCoordinate),
    permissionStatus,
    routeCoordinateCount: liveRoutePlan.route.coordinates.length,
  });
  const locationNotice = (
    navigationState === "loaded" ||
    navigationState === "paused" ||
    navigationState === "stopped"
      ? riskStartBlockedReason
      : null
  ) || liveLocationNotice({
    demoDriveActive,
    errorMessage,
    hasLiveCoordinate: Boolean(rawVehicleCoordinate),
    permissionStatus,
    routeCoordinateCount: liveRoutePlan.route.coordinates.length,
  });
  const guidance = resolveGuidance(
    liveRoutePlan.route,
    progress,
    activeNavigationState,
  );
  const riskAdvisory = createRouteRiskAdvisory({
    progress,
    riskZones: liveRoutePlan.riskZones,
    routeCoordinates: liveRoutePlan.route.coordinates,
  });
  const liveRiskAlert = useMemo(
    () =>
      resolveLiveRouteRiskAlert({
        navigationState: activeNavigationState,
        progress,
        routePlan: liveRoutePlan,
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
      liveRoutePlan,
    ],
  );
  const visibleRiskZones = useMemo(
    () =>
      resolveVisibleRiskZones({
        alertsVisible,
        liveRiskAlert,
        navigationState: activeNavigationState,
        riskZones: liveRoutePlan.riskZones,
      }),
    [activeNavigationState, alertsVisible, liveRiskAlert, liveRoutePlan.riskZones],
  );
  const selectedRiskZone = useMemo(
    () =>
      liveRoutePlan.riskZones.find((zone) => zone.id === selectedRiskZoneId) ||
      null,
    [liveRoutePlan.riskZones, selectedRiskZoneId],
  );
  const selectedRiskProximity = useMemo(
    () =>
      selectedRiskZone
        ? calculateRiskZoneRouteProximity(
            liveRoutePlan.route.coordinates,
            selectedRiskZone,
          )
        : null,
    [liveRoutePlan.route.coordinates, selectedRiskZone],
  );
  const severeRouteRiskViolation = useMemo(
    () => auditRouteRiskAvoidance(liveRoutePlan).violations.some(
      (violation) => violation.zone.severity === "high",
    ),
    [liveRoutePlan],
  );
  const heading = resolveVehicleHeading(
    liveRoutePlan.route.coordinates,
    progress,
    coordinate?.heading,
    demoDriveActive,
    routeStep,
  );

  const commitRerouteState = (nextState: LiveRerouteState) => {
    rerouteStateRef.current = nextState;
    setRerouteState(nextState);
  };

  const failRerouteRequest = (
    request: LiveRerouteRequest,
    message = "A safer route could not be calculated right now.",
  ) => {
    const transition = resolveLiveRerouteFailure(rerouteStateRef.current, {
      code: "route-provider-unavailable",
      failedAtMs: Date.now(),
      message,
      requestRevision: request.requestRevision,
      routeId: request.routeId,
      routeRevision: request.routeRevision,
    });
    if (transition.accepted) {
      commitRerouteState(transition.state);
    }
  };

  const executeLiveReroute = async (request: LiveRerouteRequest) => {
    const plan = liveRoutePlanRef.current;
    const currentCoordinate = request.sample.coordinate;
    const targets = buildLiveRerouteTargets(
      plan,
      currentCoordinate,
      progressRef.current,
    );
    if (targets.stops.length < 2) {
      failRerouteRequest(request, "No remaining destination is available for rerouting.");
      return;
    }
    const routingAccessToken = liveApiAccessToken;
    const avoidRectangles = buildLiveRerouteAvoidRectangles(
      plan.riskZones,
      plan.route.coordinates,
      targets.stops,
    );

    try {
      const preview = await fetchSafeRouteRoadRoutePreview({
        accessToken: routingAccessToken,
        avoidRectangles,
        clientId: plan.clientId,
        stops: targets.stops,
        timeoutMs: 15_000,
      });
      if (!preview?.snapped || preview.coordinates.length < 2) {
        failRerouteRequest(request);
        return;
      }
      const corridorRiskZones = await fetchAreaRiskAlongRoute(
        preview.coordinates,
        {
          accessToken: routingAccessToken,
          clientId: plan.clientId,
          maxChunks: 8,
          timeoutMs: 9000,
        },
      );
      const finalRiskZones = mergeRiskZonesById(
        plan.riskZones,
        corridorRiskZones,
      );
      const corridorAvoidRectangles = buildLiveRerouteAvoidRectangles(
        finalRiskZones,
        preview.coordinates,
        targets.stops,
      );
      const finalPreview = JSON.stringify(corridorAvoidRectangles) === JSON.stringify(avoidRectangles)
        ? preview
        : await fetchSafeRouteRoadRoutePreview({
            accessToken: routingAccessToken,
            avoidRectangles: corridorAvoidRectangles,
            clientId: plan.clientId,
            stops: targets.stops,
            timeoutMs: 15_000,
          });
      if (!finalPreview?.snapped || finalPreview.coordinates.length < 2) {
        failRerouteRequest(request);
        return;
      }
      const nextPlan = applyLiveReroutePreview({
        currentCoordinate,
        preview: finalPreview,
        requestRevision: request.requestRevision,
        riskZones: finalRiskZones,
        routePlan: plan,
        targets,
      });
      const transition = resolveLiveRerouteSuccess(rerouteStateRef.current, {
        nextRouteId: nextPlan.route.id,
        receivedAtMs: Date.now(),
        requestRevision: request.requestRevision,
        routeId: request.routeId,
        routeRevision: request.routeRevision,
      });
      if (!transition.accepted) {
        return;
      }
      commitRerouteState(transition.state);
      liveRoutePlanRef.current = nextPlan;
      setActiveRoutePlan(nextPlan);
      setProgressFloorMeters(0);
      setNavigationState("navigating");
      setFollowModeEnabled(true);
      setSelectedRiskZoneId(null);
    } catch {
      failRerouteRequest(request);
    }
  };

  const rerouteMonitoringActive = Boolean(
    !demoDriveActive &&
      (navigationState === "navigating" || navigationState === "off-route"),
  );

  useEffect(() => {
    const currentState = rerouteStateRef.current;
    if (rerouteMonitoringActive) {
      if (
        currentState.status === "idle" ||
        currentState.routeId !== liveRoutePlan.route.id
      ) {
        commitRerouteState(
          startLiveRerouteMonitoring(currentState, {
            nowMs: Date.now(),
            routeId: liveRoutePlan.route.id,
          }),
        );
      }
      return;
    }
    if (currentState.status !== "idle") {
      commitRerouteState(stopLiveRerouteMonitoring(currentState, Date.now()));
    }
  }, [liveRoutePlan.route.id, rerouteMonitoringActive]);

  useEffect(() => {
    if (
      !rerouteMonitoringActive ||
      !rawVehicleCoordinate ||
      !progress ||
      !Number.isFinite(timestampMs)
    ) {
      return;
    }
    const transition = applyLiveRerouteSample(rerouteStateRef.current, {
      coordinate: rawVehicleCoordinate,
      distanceFromRouteMeters: progress.offRouteDistanceMeters,
      horizontalAccuracyMeters:
        typeof coordinate?.accuracy === "number" ? coordinate.accuracy : null,
      timestampMs: timestampMs as number,
    });
    if (transition.state !== rerouteStateRef.current) {
      commitRerouteState(transition.state);
    }
    if (transition.request) {
      void executeLiveReroute(transition.request);
    }
  }, [
    coordinate?.accuracy,
    progress?.offRouteDistanceMeters,
    rawVehicleCoordinate?.latitude,
    rawVehicleCoordinate?.longitude,
    rerouteMonitoringActive,
    timestampMs,
  ]);

  useEffect(() => {
    if (
      !rerouteMonitoringActive ||
      !severeRouteRiskViolation ||
      progress?.isOffRoute ||
      !rawVehicleCoordinate ||
      !progress ||
      !Number.isFinite(timestampMs)
    ) {
      return;
    }
    const transition = requestImmediateLiveReroute(
      rerouteStateRef.current,
      {
        coordinate: rawVehicleCoordinate,
        distanceFromRouteMeters: progress.offRouteDistanceMeters,
        horizontalAccuracyMeters:
          typeof coordinate?.accuracy === "number" ? coordinate.accuracy : null,
        timestampMs: timestampMs as number,
      },
      timestampMs as number,
    );
    if (!transition.request) {
      return;
    }
    commitRerouteState(transition.state);
    void executeLiveReroute(transition.request);
  }, [
    coordinate?.accuracy,
    progress?.isOffRoute,
    progress?.offRouteDistanceMeters,
    rawVehicleCoordinate?.latitude,
    rawVehicleCoordinate?.longitude,
    rerouteMonitoringActive,
    severeRouteRiskViolation,
    timestampMs,
  ]);

  useEffect(() => {
    if (rerouteState.status !== "failed") {
      return;
    }
    const delay = Math.max(0, rerouteState.failure.retryEligibleAtMs - Date.now());
    const timer = setTimeout(() => setRerouteClockMs(Date.now()), delay + 20);
    return () => clearTimeout(timer);
  }, [rerouteState]);

  const rerouteRetryEligibility = getManualRerouteRetryEligibility(
    rerouteState,
    rerouteClockMs,
  );
  const reroutePresentation = rerouteState.status === "pending"
    ? {
        message: "Using your live position and mapped risk areas.",
        retryAvailable: false,
        status: "pending" as const,
      }
    : rerouteState.status === "failed"
      ? {
          message: rerouteState.failure.message,
          retryAvailable: rerouteRetryEligibility.eligible,
          status: "failed" as const,
        }
      : null;
  const manualRerouteUnavailableReason = rerouteState.status === "failed"
    ? "failed" as const
    : rerouteState.status === "monitoring" &&
        Number.isFinite(timestampMs) &&
        (timestampMs as number) < rerouteState.cooldownUntilMs
      ? "cooldown" as const
      : !rerouteMonitoringActive ||
          !rawVehicleCoordinate ||
          !progress ||
          !Number.isFinite(timestampMs)
        ? "location" as const
        : null;

  const handleRetryReroute = () => {
    const transition = retryFailedLiveReroute(rerouteStateRef.current, Date.now());
    if (!transition.request) {
      return;
    }
    commitRerouteState(transition.state);
    void executeLiveReroute(transition.request);
  };

  const handleManualReroute = () => {
    if (!rawVehicleCoordinate || !progress || !Number.isFinite(timestampMs)) {
      return;
    }
    const transition = requestManualLiveReroute(
      rerouteStateRef.current,
      {
        coordinate: rawVehicleCoordinate,
        distanceFromRouteMeters: progress.offRouteDistanceMeters,
        horizontalAccuracyMeters:
          typeof coordinate?.accuracy === "number" ? coordinate.accuracy : null,
        timestampMs: timestampMs as number,
      },
      timestampMs as number,
    );
    if (!transition.request) {
      return;
    }
    commitRerouteState(transition.state);
    void executeLiveReroute(transition.request);
  };

  useEffect(() => {
    const nextResumeSession =
      initialNavigationSession?.routePlan.route.id === routePlan.route.id
        ? initialNavigationSession
        : null;
    const nextRoutePlan = nextResumeSession?.routePlan || routePlan;
    setActiveRoutePlan(nextRoutePlan);
    liveRoutePlanRef.current = nextRoutePlan;
    const resetRerouteState = createLiveRerouteState();
    rerouteStateRef.current = resetRerouteState;
    setRerouteState(resetRerouteState);
    setNavigationState(nextResumeSession?.navigationState || "loaded");
    setRouteStep(0);
    setProgressFloorMeters(nextResumeSession?.progressFloorMeters || 0);
    setFollowModeEnabled(nextResumeSession?.followModeEnabled ?? true);
    setLiveLocationRequested(Boolean(nextResumeSession));
    setPendingNavigationStart(false);
    setSelectedRiskZoneId(null);
    const timer = setTimeout(() => {
      if (nextRoutePlan.route.coordinates.length >= 2) {
        mapRef.current?.fitToCoordinates(nextRoutePlan.route.coordinates, {
          animated: true,
          edgePadding: layout.edgePadding,
        });
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [routePlan.id]);

  useEffect(() => {
    if (demoDriveActive) {
      return;
    }

    if (navigationState === "stopped" || navigationState === "arrived") {
      activeSessionSnapshotRef.current = null;
      onNavigationSessionChangeRef.current?.(null);
      void clearActiveNavigationSession();
      return;
    }

    if (!isPersistedNavigationLifecycle(navigationState)) {
      return;
    }

    const persistCurrentSession = () => {
      const snapshot = activeSessionSnapshotRef.current;
      if (!snapshot) {
        return;
      }
      onNavigationSessionChangeRef.current?.(snapshot);
      void saveActiveNavigationSession(snapshot);
    };

    persistCurrentSession();
    const interval = setInterval(persistCurrentSession, 5_000);
    return () => clearInterval(interval);
  }, [activeRoutePlan.route.id, demoDriveActive, navigationState, routeContext]);

  useEffect(() => {
    if (
      !demoDriveActive ||
      (navigationState !== "navigating" && navigationState !== "off-route")
    ) {
      return undefined;
    }

    const routeStepIncrement = resolveDemoDriveStepIncrement(
      liveRoutePlan.route.coordinates.length,
    );
    if (routeStepIncrement <= 0) {
      return undefined;
    }

    const timer = setInterval(() => {
      setRouteStep((step) => {
        const finalStep = Math.max(0, liveRoutePlan.route.coordinates.length - 1);
        return Math.min(finalStep, step + routeStepIncrement);
      });
    }, DEMO_DRIVE_STEP_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [demoDriveActive, navigationState, liveRoutePlan.route.coordinates.length]);

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
      void stopBackgroundNavigation();
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

    if (liveRoutePlan.route.coordinates.length >= 2) {
      mapRef.current?.fitToCoordinates(liveRoutePlan.route.coordinates, {
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
    void stopBackgroundNavigation();
    setNavigationState("stopped");
    setRouteStep(0);
    setProgressFloorMeters(0);
    setFollowModeEnabled(false);
    fitRoute();
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
        offline={offline}
        permissionStatus={permissionStatus}
        progressCoordinates={progressCoordinates}
        routePlan={liveRoutePlan}
        selectedRiskZoneId={selectedRiskZoneId}
        vehicleCoordinate={vehicleCoordinate}
        visibleRiskZones={visibleRiskZones}
      />

      <LiveMapOverlay
        activeNavigationState={activeNavigationState}
        alertsVisible={alertsVisible}
        backgroundNavigationPresentation={backgroundNavigationPresentation}
        followModeEnabled={followModeEnabled}
        guidance={guidance}
        hasVehicleCoordinate={Boolean(rawVehicleCoordinate)}
        layout={layout}
        locationNotice={locationNotice}
        onCenterVehicle={centerOnVehicle}
        onChangeRoute={onChangeRoute}
        onDismissRiskDetail={handleDismissRiskDetail}
        onEnableBackgroundNavigation={() => {
          void enableBackgroundTracking();
        }}
        onFitRoute={fitRouteFromControl}
        onOpenRiskAlert={handleOpenRiskAlert}
        onPrimaryAction={handlePrimaryNavigationAction}
        onReroute={handleManualReroute}
        onRetryReroute={handleRetryReroute}
        returnAccessibilityLabel={returnAccessibilityLabel}
        returnLabel={returnLabel}
        routeContext={routeContext}
        onSetAlertsVisible={setAlertsVisible}
        onSetFollowModeEnabled={setFollowModeEnabled}
        onStopRoute={handleStopRoute}
        primaryDisabledReason={liveNavigationBlockedReason}
        progress={progress}
        liveRiskAlert={liveRiskAlert}
        riskAdvisory={riskAdvisory}
        reroutePresentation={reroutePresentation}
        rerouteUnavailable={
          manualRerouteUnavailableReason !== null
        }
        rerouteUnavailableReason={manualRerouteUnavailableReason || undefined}
        routePlan={liveRoutePlan}
        selectedRiskProximity={selectedRiskProximity}
        selectedRiskZone={selectedRiskZone}
        trackingLabel={
          offline
            ? "Offline route map"
            : viewportRisk.loading
              ? "Updating risk"
              : trackingLabel
        }
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
