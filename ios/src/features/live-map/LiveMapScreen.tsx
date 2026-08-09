import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Share,
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
  activeGuidanceAuthorizationNotice,
  DEFAULT_ROUTE_INTELLIGENCE_VISIBLE,
  liveLocationNotice,
  resolveNavigationStatusNotice,
  routeStartBlockedReason,
  routeStartProximityBlockedReason,
  type NavigationLifecycle,
  workspaceGuidanceStartBlockedReason,
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
import {
  SAFEROUTE_DEMO_DRIVE_ENABLED,
  SAFEROUTE_GUIDANCE_CONTRACT_EVIDENCE_ENABLED,
} from "../../config/env";
import { colors } from "../../theme";
import { uiTestIds } from "../../testing/uiTestIds";
import {
  confirmBackgroundNavigationStopped,
  stopBackgroundNavigation,
} from "./backgroundNavigation";
import { createBackgroundNavigationPresentation } from "./backgroundNavigationState";
import {
  createActiveNavigationInstanceId,
  createActiveNavigationSession,
  isNavigationSessionForRoutePreview,
  isPersistedNavigationLifecycle,
  type ActiveNavigationSession,
} from "./activeNavigationSessionCore";
import {
  clearActiveNavigationSession,
  readActiveNavigationSession,
  saveActiveNavigationSession,
} from "./activeNavigationSession";
import { recordGuidanceContractEvidence } from "../../testing/guidanceContractEvidence";
import { normalizeReliableLocationSample } from "./locationSignal";
import { useNetworkAvailability } from "../api/useNetworkAvailability";
import { getRequestSessionExpiry } from "../api/sessionExpiry";
import { getRequestUnavailableWorkspaceId } from "../workspaces/workspaceAccessRecovery";
import { isCurrentWorkspaceAuthorizationEpoch } from "../workspaces/workspaceForegroundRevalidation";
import {
  cancelNavigationStartAuthorization,
  createNavigationStartAuthorizationGate,
  navigationStartAuthorizationNotice,
  runNavigationStartAuthorization,
} from "./navigationStartAuthorizationGate";
import { MotionEntrance } from "../../motion/SafeRouteMotion";
import {
  createRouteShareMessage,
  prepareSavedRouteShare,
} from "../routes/routeShare";
import {
  normalizeBackendManeuverBatch,
  SpokenGuidanceController,
} from "./spoken-guidance";
import { createExpoSpokenGuidanceAudioDriver } from "./spoken-guidance/expoSpokenGuidanceAudio";

interface LiveMapScreenProps {
  accessToken?: string | null;
  initialNavigationSession?: ActiveNavigationSession | null;
  onAuthorizeNavigationStart: (routePlan: SavedSafeRoutePlan) => Promise<string | null>;
  onNavigationSessionChange?: (session: ActiveNavigationSession | null) => boolean | void;
  onSessionExpired?: (message?: string) => void;
  onWorkspaceUnavailable?: (workspaceId: string) => void;
  principalId?: string | null;
  returnAccessibilityLabel?: string;
  returnLabel?: string;
  routeContext?: "guest" | "saved";
  routePlan: SavedSafeRoutePlan;
  workspaceAuthorizationFresh?: boolean;
  workspaceAuthorizationChecking?: boolean;
  workspaceAuthorizationUnavailable?: boolean;
  onChangeRoute: () => void;
}

export function LiveMapScreen({
  accessToken,
  initialNavigationSession = null,
  onAuthorizeNavigationStart,
  onChangeRoute,
  onNavigationSessionChange,
  onSessionExpired,
  onWorkspaceUnavailable,
  principalId,
  returnAccessibilityLabel = "Return to saved routes",
  returnLabel = "Routes",
  routePlan,
  routeContext = "saved",
  workspaceAuthorizationFresh = false,
  workspaceAuthorizationChecking = false,
  workspaceAuthorizationUnavailable = false,
}: LiveMapScreenProps) {
  const {
    checking: networkChecking,
    offline,
    online,
  } = useNetworkAvailability();
  const networkOnlineRef = useRef(online);
  const networkRequestEpochRef = useRef(0);
  if (networkOnlineRef.current !== online) {
    networkOnlineRef.current = online;
    networkRequestEpochRef.current += 1;
  }
  const resumedNavigationSession =
    isNavigationSessionForRoutePreview({
      navigationSession: initialNavigationSession,
      principalId,
      routeContext,
      routePlan,
    })
      ? initialNavigationSession || null
      : null;
  const mapRef = useRef<MapView | null>(null);
  const activeRerouteRequestRef = useRef<AbortController | null>(null);
  const lastDriveAlongCameraPoseRef = useRef<DriveAlongCameraPose | null>(null);
  const driveAlongCameraActiveRef = useRef(
    Boolean(
      resumedNavigationSession?.followModeEnabled
      && (
        resumedNavigationSession.navigationState === "navigating"
        || resumedNavigationSession.navigationState === "off-route"
      )
    ),
  );
  const rerouteStateRef = useRef<LiveRerouteState>(createLiveRerouteState());
  const liveRoutePlanRef = useRef(
    resumedNavigationSession?.routePlan || routePlan,
  );
  const progressRef = useRef<ReturnType<typeof calculateRouteProgress>>(null);
  const activeSessionSnapshotRef = useRef<ActiveNavigationSession | null>(null);
  const navigationPersistenceRevisionRef = useRef(0);
  const persistedEvidenceNavigationIdRef = useRef<string | null>(null);
  const prestartEvidenceRouteIdRef = useRef<string | null>(null);
  const navigationAuthorizationGateRef = useRef(createNavigationStartAuthorizationGate());
  const spokenGuidanceControllerRef = useRef<SpokenGuidanceController | null>(null);
  if (!spokenGuidanceControllerRef.current) {
    spokenGuidanceControllerRef.current = new SpokenGuidanceController({
      audio: createExpoSpokenGuidanceAudioDriver(),
    });
  }
  const navigationStartBlockedReasonRef = useRef<string | null>(null);
  const onAuthorizeNavigationStartRef = useRef(onAuthorizeNavigationStart);
  const onNavigationSessionChangeRef = useRef(onNavigationSessionChange);
  const onWorkspaceUnavailableRef = useRef(onWorkspaceUnavailable);
  const workspaceAuthorizationEpochRef = useRef(0);
  const workspaceAuthorizationFreshRef = useRef(workspaceAuthorizationFresh);
  if (workspaceAuthorizationFreshRef.current !== workspaceAuthorizationFresh) {
    workspaceAuthorizationFreshRef.current = workspaceAuthorizationFresh;
    workspaceAuthorizationEpochRef.current += 1;
  }
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
  const [backgroundTrackingRequested, setBackgroundTrackingRequested] =
    useState(Boolean(resumedNavigationSession?.backgroundTrackingEnabled));
  const [navigationInstanceId, setNavigationInstanceId] = useState(
    () =>
      resumedNavigationSession?.navigationInstanceId ||
      createActiveNavigationInstanceId(),
  );
  const [navigationStartedAtMs, setNavigationStartedAtMs] = useState(
    () => resumedNavigationSession?.navigationStartedAtMs || Date.now(),
  );
  const [pendingNavigationStart, setPendingNavigationStart] = useState(false);
  const [navigationAuthorizationPending, setNavigationAuthorizationPending] = useState(false);
  const [navigationAuthorizationNotice, setNavigationAuthorizationNotice] =
    useState<string | null>(null);
  const [sharePending, setSharePending] = useState(false);
  const [spokenGuidanceSnapshot, setSpokenGuidanceSnapshot] = useState(
    () => spokenGuidanceControllerRef.current!.getSnapshot(),
  );
  const [routeStep, setRouteStep] = useState(0);
  const [activeRoutePlan, setActiveRoutePlan] = useState(
    resumedNavigationSession?.routePlan || routePlan,
  );
  const activeRouteWorkspaceIdRef = useRef(activeRoutePlan.clientId || null);
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
  const backgroundAccessScope = useMemo<ActiveNavigationSession["accessScope"]>(
    () => activeRoutePlan.clientId?.trim()
      ? {
          clientId: activeRoutePlan.clientId.trim(),
          kind: "workspace",
          principalId: String(principalId || "").trim(),
        }
      : { kind: "public" },
    [activeRoutePlan.clientId, principalId],
  );
  const {
    backgroundStatus,
    coordinate,
    enableBackgroundTracking,
    errorMessage,
    permissionStatus,
    timestampMs,
    trackingLabel,
  } = useLiveLocation({
    backgroundAccessScope,
    backgroundNavigationInstanceId: navigationInstanceId,
    backgroundRouteId: activeRoutePlan.route.id,
    backgroundTrackingRequested,
    initialLocationSample: resumedNavigationSession?.lastLocation || null,
    manageBackgroundNavigation: true,
    navigationActive: navigationLocationTrackingActive,
    permissionRequested: locationTrackingRequested,
  });
  onAuthorizeNavigationStartRef.current = onAuthorizeNavigationStart;
  onNavigationSessionChangeRef.current = onNavigationSessionChange;
  onWorkspaceUnavailableRef.current = onWorkspaceUnavailable;
  activeRouteWorkspaceIdRef.current = activeRoutePlan.clientId || null;
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
  const closeRouteForWorkspaceLoss = (workspaceId: string) => {
    const normalizedWorkspaceId = workspaceId.trim();
    if (
      !normalizedWorkspaceId ||
      activeRouteWorkspaceIdRef.current !== normalizedWorkspaceId
    ) {
      return;
    }

    activeRouteWorkspaceIdRef.current = null;
    activeRerouteRequestRef.current?.abort();
    activeRerouteRequestRef.current = null;
    const stoppedRerouteState = stopLiveRerouteMonitoring(
      rerouteStateRef.current,
      Date.now(),
    );
    rerouteStateRef.current = stoppedRerouteState;
    setRerouteState(stoppedRerouteState);
    activeSessionSnapshotRef.current = null;
    navigationPersistenceRevisionRef.current += 1;
    onWorkspaceUnavailableRef.current?.(normalizedWorkspaceId);
    onNavigationSessionChangeRef.current?.(null);
    void clearActiveNavigationSession();
    void stopBackgroundNavigation();
    setNavigationState("stopped");
    setPendingNavigationStart(false);
    setSelectedRiskZoneId(null);
    setFollowModeEnabled(false);
    setBackgroundTrackingRequested(false);
  };
  const viewportRisk = useViewportRiskAreas({
    accessToken: liveApiAccessToken,
    cacheScopeId: principalId,
    clientId: activeRoutePlan.clientId,
    enabled:
      (!activeRoutePlan.clientId || workspaceAuthorizationFresh),
    onSessionExpired,
    onWorkspaceUnavailable: onWorkspaceUnavailable ? closeRouteForWorkspaceLoss : undefined,
    refreshEnabled:
      online &&
      (!activeRoutePlan.clientId || workspaceAuthorizationFresh),
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
  driveAlongCameraActiveRef.current =
    followModeEnabled
    && (
      activeNavigationState === "navigating"
      || activeNavigationState === "off-route"
    );
  const backendManeuverBatch = useMemo(
    () => normalizeBackendManeuverBatch({
      maneuvers: liveRoutePlan.route.navigationSteps,
      routeId: liveRoutePlan.route.id,
      routeRevision: liveRoutePlan.route.navigationStepRevision,
      source: liveRoutePlan.route.navigationStepSource,
    }),
    [
      liveRoutePlan.route.id,
      liveRoutePlan.route.navigationStepRevision,
      liveRoutePlan.route.navigationStepSource,
      liveRoutePlan.route.navigationSteps,
    ],
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
          backgroundTrackingEnabled: backgroundTrackingRequested,
          followModeEnabled,
          lastLocation: normalizeReliableLocationSample({
            accuracyMeters: coordinate?.accuracy,
            headingDegrees: coordinate?.heading,
            latitude: coordinate?.latitude,
            longitude: coordinate?.longitude,
            speedMetersPerSecond: coordinate?.speed,
            timestampMs,
          }),
          navigationInstanceId,
          navigationStartedAtMs,
          navigationState,
          principalId,
          progressFloorMeters,
          routeContext,
          routePlan: liveRoutePlan,
        })
      : null;
  const vehicleCoordinate = resolveNavigationVehicleCoordinate({
    fallbackCoordinate: liveRoutePlan.route.coordinates[0],
    navigationActive:
      activeNavigationState === "navigating" ||
      activeNavigationState === "off-route",
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
  const startProximityBlockedReason =
    !demoDriveActive &&
    (navigationState === "loaded" || navigationState === "stopped")
      ? routeStartProximityBlockedReason({
          currentCoordinate: rawVehicleCoordinate,
          routeStartCoordinate: liveRoutePlan.route.coordinates[0],
        })
      : null;
  const locationStartBlockedReason = routeStartBlockedReason({
    demoDriveActive,
    hasLiveCoordinate: Boolean(rawVehicleCoordinate),
    permissionStatus,
    routeCoordinateCount: liveRoutePlan.route.coordinates.length,
  });
  const workspaceStartBlockedReason = workspaceGuidanceStartBlockedReason({
    checking: workspaceAuthorizationChecking,
    fresh: workspaceAuthorizationFresh,
    navigationState,
    unavailable: workspaceAuthorizationUnavailable,
    workspaceScoped: Boolean(liveRoutePlan.clientId),
  });
  const navigationBlockedReason =
    workspaceStartBlockedReason ||
    riskStartBlockedReason ||
    locationStartBlockedReason ||
    startProximityBlockedReason;
  navigationStartBlockedReasonRef.current = navigationBlockedReason;
  const navigationAuthorizationRetryNotice =
    navigationAuthorizationNotice?.toLowerCase().includes("reconnect")
      ? navigationAuthorizationNotice
      : null;
  const navigationReadinessNotice = (
    navigationState === "loaded" ||
    navigationState === "paused" ||
    navigationState === "stopped"
      ? riskStartBlockedReason || startProximityBlockedReason
      : null
  ) || liveLocationNotice({
    demoDriveActive,
    errorMessage,
    hasLiveCoordinate: Boolean(rawVehicleCoordinate),
    permissionStatus,
    routeCoordinateCount: liveRoutePlan.route.coordinates.length,
  });
  const currentGuidanceAuthorizationNotice =
    activeGuidanceAuthorizationNotice({
      checking: workspaceAuthorizationChecking,
      navigationState,
      unavailable: workspaceAuthorizationUnavailable,
      workspaceScoped: Boolean(activeRoutePlan.clientId),
    });
  const locationNotice = resolveNavigationStatusNotice({
    authorizationNotice:
      currentGuidanceAuthorizationNotice || navigationAuthorizationNotice,
    authorizationPending: navigationAuthorizationPending,
    readinessNotice: navigationReadinessNotice,
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
    const currentState = rerouteStateRef.current;
    const keepsCurrentRequest =
      currentState.status === "pending" &&
      nextState.status === "pending" &&
      currentState.request.requestRevision === nextState.request.requestRevision &&
      currentState.request.routeId === nextState.request.routeId &&
      currentState.request.routeRevision === nextState.request.routeRevision;
    if (!keepsCurrentRequest) {
      activeRerouteRequestRef.current?.abort();
      activeRerouteRequestRef.current = null;
    }
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
    const requestWorkspaceId = plan.clientId || null;
    const requestNetworkEpoch = networkRequestEpochRef.current;
    const requestAuthorizationEpoch = workspaceAuthorizationEpochRef.current;
    const requestAuthorizationIsCurrent = () =>
      networkOnlineRef.current &&
      requestNetworkEpoch === networkRequestEpochRef.current &&
      isCurrentWorkspaceAuthorizationEpoch({
        currentEpoch: workspaceAuthorizationEpochRef.current,
        currentFresh: workspaceAuthorizationFreshRef.current,
        currentWorkspaceId: activeRouteWorkspaceIdRef.current,
        requestEpoch: requestAuthorizationEpoch,
        requestWorkspaceId,
      });
    if (!requestAuthorizationIsCurrent()) {
      failRerouteRequest(
        request,
        networkOnlineRef.current
          ? "Verify current workspace access before rerouting."
          : "Reconnect before requesting a safer route.",
      );
      return;
    }
    activeRerouteRequestRef.current?.abort();
    const controller = new AbortController();
    activeRerouteRequestRef.current = controller;
    const requestIsCurrent = () =>
      !controller.signal.aborted &&
      requestAuthorizationIsCurrent();
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
        clientId: requestWorkspaceId,
        signal: controller.signal,
        stops: targets.stops,
        timeoutMs: 15_000,
        travelMode: plan.travelMode ?? 'drive',
      });
      if (
        !requestIsCurrent() ||
        !preview?.snapped ||
        preview.coordinates.length < 2
      ) {
        if (!requestIsCurrent()) {
          controller.abort();
          return;
        }
        failRerouteRequest(request);
        return;
      }
      const corridorRiskZones = await fetchAreaRiskAlongRoute(
        preview.coordinates,
        {
          accessToken: routingAccessToken,
          clientId: requestWorkspaceId || undefined,
          maxChunks: 8,
          signal: controller.signal,
          timeoutMs: 9000,
        },
      );
      if (!requestIsCurrent()) {
        controller.abort();
        return;
      }
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
            clientId: requestWorkspaceId,
            signal: controller.signal,
            stops: targets.stops,
            timeoutMs: 15_000,
            travelMode: plan.travelMode ?? 'drive',
          });
      if (
        !requestIsCurrent() ||
        !finalPreview?.snapped ||
        finalPreview.coordinates.length < 2
      ) {
        if (!requestIsCurrent()) {
          controller.abort();
          return;
        }
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
    } catch (error) {
      const currentRerouteState = rerouteStateRef.current;
      const requestActive =
        requestIsCurrent() &&
        currentRerouteState.status === "pending" &&
        currentRerouteState.request.requestRevision === request.requestRevision &&
        currentRerouteState.request.routeId === request.routeId &&
        currentRerouteState.request.routeRevision === request.routeRevision;
      const sessionExpiry = getRequestSessionExpiry({
        authenticated: Boolean(liveApiAccessToken && onSessionExpired),
        error,
        handled: false,
        requestActive
      });
      if (sessionExpiry) {
        controller.abort();
        onSessionExpired?.(sessionExpiry.message);
        return;
      }
      const unavailableWorkspaceId = getRequestUnavailableWorkspaceId({
        accessToken: routingAccessToken,
        error,
        handled: false,
        requestActive:
          requestActive &&
          activeRouteWorkspaceIdRef.current === requestWorkspaceId &&
          Boolean(onWorkspaceUnavailableRef.current),
        workspaceId: requestWorkspaceId,
      });
      if (unavailableWorkspaceId) {
        controller.abort();
        closeRouteForWorkspaceLoss(unavailableWorkspaceId);
        return;
      }
      if (controller.signal.aborted || !requestActive) {
        return;
      }
      failRerouteRequest(request);
    } finally {
      if (activeRerouteRequestRef.current === controller) {
        activeRerouteRequestRef.current = null;
      }
    }
  };

  const rerouteMonitoringActive = Boolean(
    online &&
    !demoDriveActive &&
      (!activeRoutePlan.clientId || workspaceAuthorizationFresh) &&
      (navigationState === "navigating" || navigationState === "off-route"),
  );

  useEffect(() => {
    let current = true;
    const controller = spokenGuidanceControllerRef.current!;
    const update = controller.update({
      active:
        activeNavigationState === "navigating" ||
        activeNavigationState === "off-route",
      batch: backendManeuverBatch,
      speedMetersPerSecond,
      travelledDistanceMeters: progress?.travelledDistanceMeters ?? 0,
    });
    setSpokenGuidanceSnapshot(controller.getSnapshot());
    void update.finally(() => {
      if (current) {
        setSpokenGuidanceSnapshot(controller.getSnapshot());
      }
    });
    return () => {
      current = false;
    };
  }, [
    activeNavigationState,
    backendManeuverBatch,
    progress?.travelledDistanceMeters,
    speedMetersPerSecond,
  ]);

  useEffect(() => () => {
    void spokenGuidanceControllerRef.current?.dispose();
  }, []);

  useEffect(() => () => {
    activeRerouteRequestRef.current?.abort();
    activeRerouteRequestRef.current = null;
    const currentState = rerouteStateRef.current;
    if (currentState.status !== "idle") {
      rerouteStateRef.current = stopLiveRerouteMonitoring(currentState, Date.now());
    }
  }, []);

  useEffect(() => {
    if (online) {
      return;
    }
    activeRerouteRequestRef.current?.abort();
    activeRerouteRequestRef.current = null;
    const currentState = rerouteStateRef.current;
    if (currentState.status !== "idle") {
      commitRerouteState(stopLiveRerouteMonitoring(currentState, Date.now()));
    }
  }, [online]);

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
  const handleRetryReroute = () => {
    const transition = retryFailedLiveReroute(rerouteStateRef.current, Date.now());
    if (!transition.request) {
      return;
    }
    commitRerouteState(transition.state);
    void executeLiveReroute(transition.request);
  };

  useEffect(() => {
    const nextResumeSession =
      isNavigationSessionForRoutePreview({
        navigationSession: initialNavigationSession,
        principalId,
        routeContext,
        routePlan,
      })
        ? initialNavigationSession || null
        : null;
    const nextRoutePlan = nextResumeSession?.routePlan || routePlan;
    activeRerouteRequestRef.current?.abort();
    navigationPersistenceRevisionRef.current += 1;
    persistedEvidenceNavigationIdRef.current = null;
    activeRerouteRequestRef.current = null;
    setActiveRoutePlan(nextRoutePlan);
    liveRoutePlanRef.current = nextRoutePlan;
    const resetRerouteState = createLiveRerouteState();
    rerouteStateRef.current = resetRerouteState;
    setRerouteState(resetRerouteState);
    setNavigationState(nextResumeSession?.navigationState || "loaded");
    setRouteStep(0);
    setProgressFloorMeters(nextResumeSession?.progressFloorMeters || 0);
    setFollowModeEnabled(nextResumeSession?.followModeEnabled ?? true);
    setBackgroundTrackingRequested(
      Boolean(nextResumeSession?.backgroundTrackingEnabled),
    );
    if (nextResumeSession) {
      setNavigationInstanceId(nextResumeSession.navigationInstanceId);
      setNavigationStartedAtMs(nextResumeSession.navigationStartedAtMs);
    } else {
      const preparedAtMs = Date.now();
      setNavigationInstanceId(createActiveNavigationInstanceId(preparedAtMs));
      setNavigationStartedAtMs(preparedAtMs);
    }
    setLiveLocationRequested(Boolean(nextResumeSession));
    setPendingNavigationStart(false);
    cancelNavigationStartAuthorization(navigationAuthorizationGateRef.current);
    setNavigationAuthorizationPending(false);
    setNavigationAuthorizationNotice(null);
    setSelectedRiskZoneId(null);
    const timer = setTimeout(() => {
      if (
        !driveAlongCameraActiveRef.current
        && nextRoutePlan.route.coordinates.length >= 2
      ) {
        mapRef.current?.fitToCoordinates(nextRoutePlan.route.coordinates, {
          animated: true,
          edgePadding: layout.edgePadding,
        });
      }
    }, 120);
    return () => {
      clearTimeout(timer);
      cancelNavigationStartAuthorization(navigationAuthorizationGateRef.current);
    };
  }, [
    initialNavigationSession?.navigationInstanceId,
    principalId,
    routeContext,
    routePlan.clientId,
    routePlan.id,
  ]);

  useEffect(() => {
    const workspaceId = activeRoutePlan.clientId?.trim() || "";
    const routeId = activeRoutePlan.route.id.trim();
    if (
      !SAFEROUTE_GUIDANCE_CONTRACT_EVIDENCE_ENABLED ||
      routeContext !== "saved" ||
      !workspaceAuthorizationFresh ||
      resumedNavigationSession ||
      navigationState !== "loaded" ||
      !principalId?.trim() ||
      !workspaceId ||
      !routeId ||
      prestartEvidenceRouteIdRef.current === routeId
    ) {
      return;
    }

    prestartEvidenceRouteIdRef.current = routeId;
    const recordPrestartReadback = async () => {
      const navigationReadback = await readActiveNavigationSession();
      const trackingVerification = await confirmBackgroundNavigationStopped();
      await recordGuidanceContractEvidence({
        authorization: {
          catalog: "fresh-authorized",
          principal: "matching",
        },
        cause: "loaded-route-prestart-readback",
        durability: {
          activeNavigation: navigationReadback.status,
          nativeTracking: trackingVerification.nativeTracking,
          runtimePermit: trackingVerification.runtimePermit,
        },
        navigationInstanceId: null,
        outcome:
          navigationReadback.status === "absent" && trackingVerification.stopped
            ? "ready"
            : "navigation-active",
        routeId,
        type: "navigation.prestart.readback",
        unavailableWorkspaceIds: [],
        workspaceId,
      });
    };

    void recordPrestartReadback();
  }, [
    activeRoutePlan.clientId,
    activeRoutePlan.route.id,
    navigationState,
    principalId,
    resumedNavigationSession,
    routeContext,
    workspaceAuthorizationFresh,
  ]);

  useEffect(() => {
    if (demoDriveActive) {
      return;
    }

    if (navigationState === "stopped" || navigationState === "arrived") {
      activeSessionSnapshotRef.current = null;
      navigationPersistenceRevisionRef.current += 1;
      onNavigationSessionChangeRef.current?.(null);
      void clearActiveNavigationSession();
      return;
    }

    if (!isPersistedNavigationLifecycle(navigationState)) {
      return;
    }

    const persistCurrentSession = async () => {
      const snapshot = activeSessionSnapshotRef.current;
      if (!snapshot) {
        return;
      }
      const accepted = onNavigationSessionChangeRef.current?.(snapshot);
      if (accepted === false) {
        navigationPersistenceRevisionRef.current += 1;
        void clearActiveNavigationSession();
        return;
      }
      const persistenceRevision = navigationPersistenceRevisionRef.current;
      const saved = await saveActiveNavigationSession(snapshot);
      if (
        !saved ||
        persistenceRevision !== navigationPersistenceRevisionRef.current ||
        activeSessionSnapshotRef.current?.navigationInstanceId !==
          snapshot.navigationInstanceId ||
        persistedEvidenceNavigationIdRef.current === snapshot.navigationInstanceId
      ) {
        return;
      }
      const evidenceRecorded = await recordGuidanceContractEvidence({
        authorization: {
          catalog: snapshot.accessScope.kind === "workspace"
            ? "fresh-authorized"
            : "not-checked",
          principal: snapshot.accessScope.kind === "workspace" ? "matching" : "none",
        },
        cause: "navigation-state-persist",
        durability: {
          activeNavigation: "present",
        },
        navigationInstanceId: snapshot.navigationInstanceId,
        outcome: "persisted",
        routeId: snapshot.routePlan.route.id,
        type: "navigation.persisted",
        unavailableWorkspaceIds: [],
        workspaceId: snapshot.accessScope.kind === "workspace"
          ? snapshot.accessScope.clientId
          : null,
      });
      if (evidenceRecorded) {
        persistedEvidenceNavigationIdRef.current = snapshot.navigationInstanceId;
      }
    };

    void persistCurrentSession();
    const interval = setInterval(() => {
      void persistCurrentSession();
    }, 5_000);
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
      setBackgroundTrackingRequested(false);
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
    lastDriveAlongCameraPoseRef.current = null;

    if (liveRoutePlan.route.coordinates.length >= 2) {
      mapRef.current?.fitToCoordinates(liveRoutePlan.route.coordinates, {
        animated: true,
        edgePadding: layout.edgePadding,
      });
      return;
    }

    if (vehicleCoordinate) {
      const overviewCamera = resolveOverviewCameraReset();
      mapRef.current?.animateCamera(
        {
          ...overviewCamera.camera,
          center: vehicleCoordinate,
          zoom: 13.8,
        },
        { duration: 460 },
      );
    }
  };

  const handleMapReady = () => {
    if (!driveAlongCameraActiveRef.current) {
      fitRoute();
      return;
    }

    if (!vehicleCoordinate) {
      return;
    }

    const driveAlongCamera = resolveDriveAlongCamera(
      vehicleCoordinate,
      heading,
      layout.isCompact,
    );
    mapRef.current?.animateCamera(driveAlongCamera.camera, {
      duration: driveAlongCamera.durationMs,
    });
    lastDriveAlongCameraPoseRef.current = {
      compact: layout.isCompact,
      coordinate: vehicleCoordinate,
      heading,
      state: activeNavigationState,
    };
  };

  const suspendDriveAlongCameraForMapReview = () => {
    if (
      shouldSuspendDriveAlongCamera(activeNavigationState, followModeEnabled)
    ) {
      driveAlongCameraActiveRef.current = false;
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
    driveAlongCameraActiveRef.current =
      activeNavigationState === "navigating"
      || activeNavigationState === "off-route";

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

  const commitNavigationStart = () => {
    if (navigationState === "loaded" || navigationState === "stopped") {
      const startedAtMs = Date.now();
      setNavigationInstanceId(createActiveNavigationInstanceId(startedAtMs));
      setNavigationStartedAtMs(startedAtMs);
    }
    lastDriveAlongCameraPoseRef.current = null;
    driveAlongCameraActiveRef.current = true;
    setNavigationState("navigating");
    setFollowModeEnabled(true);
    if (vehicleCoordinate) {
      const driveAlongCamera = resolveDriveAlongCamera(
        vehicleCoordinate,
        heading,
        layout.isCompact,
      );
      mapRef.current?.animateCamera(driveAlongCamera.camera, {
        duration: driveAlongCamera.durationMs,
      });
      lastDriveAlongCameraPoseRef.current = {
        compact: layout.isCompact,
        coordinate: vehicleCoordinate,
        heading,
        state: "navigating",
      };
    }
  };

  const authorizeAndStartNavigation = async () => {
    const gate = navigationAuthorizationGateRef.current;
    if (gate.pending) {
      return;
    }
    if (routePlan.clientId && !workspaceAuthorizationFreshRef.current) {
      setNavigationAuthorizationNotice(
        "Workspace access is being checked. Wait before starting guidance.",
      );
      return;
    }

    setNavigationAuthorizationPending(true);
    setNavigationAuthorizationNotice("Checking workspace access before starting guidance…");

    const result = await runNavigationStartAuthorization({
      authorize: () => onAuthorizeNavigationStartRef.current(routePlan),
      commit: commitNavigationStart,
      gate,
      validate: () => navigationStartBlockedReasonRef.current,
    });
    if (result.status === "stale" || result.status === "duplicate") {
      return;
    }
    if (result.status === "authorized") {
      setNavigationAuthorizationNotice(null);
    } else {
      setNavigationAuthorizationNotice(navigationStartAuthorizationNotice(result));
    }
    setNavigationAuthorizationPending(false);
  };

  useEffect(() => {
    if (!activeRoutePlan.clientId || workspaceAuthorizationFresh) {
      return;
    }

    const startWasPending =
      navigationAuthorizationGateRef.current.pending || pendingNavigationStart;
    cancelNavigationStartAuthorization(navigationAuthorizationGateRef.current);
    setNavigationAuthorizationPending(false);
    setPendingNavigationStart(false);
    if (startWasPending) {
      setNavigationAuthorizationNotice(
        "Workspace access is being checked. Wait before starting guidance.",
      );
    }
  }, [activeRoutePlan.clientId, workspaceAuthorizationFresh]);

  const handlePrimaryNavigationAction = () => {
    if (
      activeNavigationState === "navigating" ||
      activeNavigationState === "off-route"
    ) {
      lastDriveAlongCameraPoseRef.current = null;
      driveAlongCameraActiveRef.current = false;
      setNavigationState("paused");
      setFollowModeEnabled(false);
      return;
    }

    if (activeNavigationState === "paused") {
      lastDriveAlongCameraPoseRef.current = null;
      driveAlongCameraActiveRef.current = true;
      setNavigationState("navigating");
      setFollowModeEnabled(true);
      return;
    }

    if (
      activeNavigationState === "arrived" ||
      navigationBlockedReason ||
      navigationAuthorizationPending
    ) {
      return;
    }

    if (!demoDriveActive && permissionStatus === "idle") {
      setLiveLocationRequested(true);
      setPendingNavigationStart(true);
      return;
    }

    void authorizeAndStartNavigation();
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
      void authorizeAndStartNavigation();
      return;
    }

    if (
      permissionStatus === "denied" ||
      riskStartBlockedReason ||
      startProximityBlockedReason
    ) {
      setPendingNavigationStart(false);
      return;
    }

    if (permissionStatus !== "granted" || !rawVehicleCoordinate || navigationBlockedReason) {
      return;
    }

    setPendingNavigationStart(false);
    void authorizeAndStartNavigation();
  }, [
    demoDriveActive,
    navigationAuthorizationPending,
    navigationBlockedReason,
    navigationState,
    pendingNavigationStart,
    permissionStatus,
    rawVehicleCoordinate,
    riskStartBlockedReason,
    startProximityBlockedReason,
  ]);

  const handleStopRoute = () => {
    // Commit the visible stop state before any persistence or native tracking
    // cleanup so the End button always responds on the next frame.
    setNavigationState("stopped");
    setRouteStep(0);
    setProgressFloorMeters(0);
    setFollowModeEnabled(false);
    setBackgroundTrackingRequested(false);
    setPendingNavigationStart(false);
    lastDriveAlongCameraPoseRef.current = null;
    driveAlongCameraActiveRef.current = false;

    const stoppedRerouteState = stopLiveRerouteMonitoring(
      rerouteStateRef.current,
      Date.now(),
    );
    commitRerouteState(stoppedRerouteState);
    activeSessionSnapshotRef.current = null;
    navigationPersistenceRevisionRef.current += 1;
    onNavigationSessionChangeRef.current?.(null);
    void clearActiveNavigationSession();
    void stopBackgroundNavigation();
    fitRoute();
  };

  const handleShareRoute = async () => {
    if (sharePending) {
      return;
    }

    setSharePending(true);
    try {
      const shareUrl =
        routeContext === "saved" && accessToken
          ? await prepareSavedRouteShare(accessToken, liveRoutePlan.id)
          : null;
      await Share.share({
        message: createRouteShareMessage(liveRoutePlan, shareUrl),
        ...(shareUrl ? { url: shareUrl } : {}),
      });
    } catch (error) {
      const sessionExpiry = getRequestSessionExpiry({
        authenticated: Boolean(accessToken && onSessionExpired),
        error,
        handled: false,
        requestActive: true,
      });
      if (sessionExpiry) {
        onSessionExpired?.(sessionExpiry.message);
      } else {
        Alert.alert(
          "Route could not be shared",
          error instanceof Error
            ? error.message
            : "Try sharing the route again.",
        );
      }
    } finally {
      setSharePending(false);
    }
  };

  const handleToggleSpokenGuidance = () => {
    const controller = spokenGuidanceControllerRef.current!;
    void controller
      .setMuted(!controller.getSnapshot().muted)
      .then(setSpokenGuidanceSnapshot);
  };

  const handleRepeatSpokenGuidance = () => {
    const controller = spokenGuidanceControllerRef.current!;
    void controller.repeat().finally(() => {
      setSpokenGuidanceSnapshot(controller.getSnapshot());
    });
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

  const handleSetAlertsVisible = (updater: (visible: boolean) => boolean) => {
    const nextVisible = updater(alertsVisible);
    setAlertsVisible(nextVisible);
    if (!nextVisible) {
      setSelectedRiskZoneId(null);
    }
  };

  const handleMapPanDrag = () => {
    suspendDriveAlongCameraForMapReview();
  };

  const handleMapPress = () => {
    setSelectedRiskZoneId(null);
  };

  return (
    <View testID={uiTestIds.liveMapScreen} style={styles.screen}>
      <MotionEntrance
        pointerEvents="box-none"
        replayKey={liveRoutePlan.id}
        style={styles.mapScene}
        variant="scene"
      >
        <LiveMapCanvas
          activeNavigationState={activeNavigationState}
          activeRiskZoneId={liveRiskAlert?.zone.id}
          demoDriveActive={demoDriveActive}
          heading={heading}
          mapRef={mapRef}
          onMapReady={handleMapReady}
          onMapPress={handleMapPress}
          onPanDrag={handleMapPanDrag}
          onDismissRiskDetail={handleDismissRiskDetail}
          onRiskZonePress={handleRiskZonePress}
          offline={!online}
          permissionStatus={permissionStatus}
          progressCoordinates={progressCoordinates}
          routePlan={liveRoutePlan}
          selectedRiskZoneId={selectedRiskZoneId}
          selectedRiskZone={selectedRiskZone}
          selectedRiskProximity={selectedRiskProximity}
          vehicleCoordinate={vehicleCoordinate}
          visibleRiskZones={visibleRiskZones}
        />
      </MotionEntrance>

      <LiveMapOverlay
        activeNavigationState={activeNavigationState}
        alertsVisible={alertsVisible}
        backgroundNavigationPresentation={backgroundNavigationPresentation}
        guidance={guidance}
        hasVehicleCoordinate={Boolean(rawVehicleCoordinate)}
        layout={layout}
        locationNotice={locationNotice}
        onCenterVehicle={centerOnVehicle}
        onChangeRoute={onChangeRoute}
        onEnableBackgroundNavigation={() => {
          void enableBackgroundTracking().then((enabled) => {
            if (enabled) {
              setBackgroundTrackingRequested(true);
            }
          });
        }}
        onFitRoute={fitRouteFromControl}
        onOpenRiskAlert={handleOpenRiskAlert}
        onPrimaryAction={handlePrimaryNavigationAction}
        onRepeatSpokenGuidance={handleRepeatSpokenGuidance}
        onShareRoute={() => {
          void handleShareRoute();
        }}
        onRetryReroute={handleRetryReroute}
        returnAccessibilityLabel={returnAccessibilityLabel}
        returnLabel={returnLabel}
        routeContext={routeContext}
        onSetAlertsVisible={handleSetAlertsVisible}
        onStopRoute={handleStopRoute}
        onToggleSpokenGuidance={handleToggleSpokenGuidance}
        primaryActionStatusReason={navigationAuthorizationRetryNotice}
        primaryDisabledReason={
          navigationAuthorizationPending
            ? "Checking workspace access before starting guidance…"
            : liveNavigationBlockedReason
        }
        progress={progress}
        liveRiskAlert={liveRiskAlert}
        riskAdvisory={riskAdvisory}
        reroutePresentation={reroutePresentation}
        routePlan={liveRoutePlan}
        sharePending={sharePending}
        selectedRiskZone={selectedRiskZone}
        spokenGuidanceAvailable={Boolean(backendManeuverBatch?.maneuvers.length)}
        spokenGuidanceCanRepeat={spokenGuidanceSnapshot.canRepeat}
        spokenGuidanceMuted={spokenGuidanceSnapshot.muted}
        trackingLabel={
          networkChecking
            ? "Checking connection"
            : offline
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
  mapScene: {
    ...StyleSheet.absoluteFillObject,
  },
});
