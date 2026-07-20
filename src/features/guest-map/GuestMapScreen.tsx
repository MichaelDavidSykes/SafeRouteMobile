import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from 'react-native';
import MapView, { Marker, Polyline, type LatLng, type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LUNARCHAIN_API_BASE, SAFEROUTE_PREVIEW_MODE_ENABLED } from '../../config/env';
import { colors, spacing } from '../../theme';
import { uiTestIds } from '../../testing/uiTestIds';
import type { SavedSafeRoutePlan } from '../live-map/liveMapTypes';
import type { RiskZone } from '../live-map/liveMapTypes';
import { RiskOverlay } from '../live-map/LiveMapMarkers';
import { LiveMapRiskDetailCallout } from '../live-map/LiveMapRiskDetailCallout';
import { useViewportRiskAreas } from '../live-map/useViewportRiskAreas';
import { mergeRiskZonesById } from '../live-map/areaRiskApiCore';
import { fetchAreaRiskAlongRoute } from '../live-map/routeRiskCorridorApi';
import { buildLiveRerouteAvoidRectangles } from '../live-map/liveReroutePlan';
import { useLiveLocation } from '../live-map/useLiveLocation';
import {
  SAFE_ROUTE_DARK_MAP_STYLE,
  SAFE_ROUTE_DARK_ROUTE_CASING,
  SAFE_ROUTE_DARK_ROUTE_GLOW,
  SAFE_ROUTE_ROUTE_CASING_WIDTH,
  SAFE_ROUTE_ROUTE_CORE_WIDTH,
  SAFE_ROUTE_ROUTE_GLOW_WIDTH
} from '../maps/safeRouteMapTheme';
import {
  createDeviceHeadingAccessibilityLabel,
  resolveDeviceHeadingScreenRotation
} from '../maps/deviceHeading';
import { shouldRenderRouteCheckpointMarker } from '../maps/mapMarkerPresentation';
import { useDeviceHeading } from '../maps/useDeviceHeading';
import { isPreviewAccessToken } from '../auth/previewSession';
import { createSessionNoticeState } from '../auth/sessionNoticeState';
import { resolveSafeRouteMapType } from '../api/mapTransportState';
import { useNetworkAvailability } from '../api/useNetworkAvailability';
import { getRequestSessionExpiry } from '../api/sessionExpiry';
import type { SafeRouteWorkspace } from '../workspaces/activeWorkspace';
import { getRequestUnavailableWorkspaceId } from '../workspaces/workspaceAccessRecovery';
import { isCurrentWorkspaceAuthorizationEpoch } from '../workspaces/workspaceForegroundRevalidation';
import { WorkspaceAccessRefreshControl } from '../workspaces/WorkspaceAccessRefreshControl';
import type { WorkspaceAccessIssue } from '../workspaces/workspaceAccessRefreshState';
import {
  GUEST_MAP_REGION,
  GUEST_ROUTE_LABEL_MAX_LENGTH,
  createGuestMapHomeCopy,
  createGuestRoadSnappedRoutePlan,
  createGuestRouteActionState,
  createGuestRouteInputCopy,
  createGuestRoutePlanId,
  createGuestRoutePlan,
  createGuestRoutePreviewState,
  getGuestFullAccessCopy,
  getGuestMapGateFeatures,
  resolveGuestRoadPreviewStops,
  shouldShowGuestMapSubtitle,
  type GuestFullAccessFeature
} from './guestRoutePlanner';
import {
  type GuestRoadRoutePreview,
  type GuestRoadRoutePreviewOptions
} from './guestRoadRouteProvider';
import { fetchSafeRouteRoadRoutePreview } from './safeRouteRoadRouteProvider';
import {
  reverseGeocodeGuestLocation,
  searchGuestLocations,
  type GuestLocationSearchResult
} from './guestLocationSearch';
import { resolveGuestRouteDraftSearchInputs } from './guestRouteDraftResolution';
import {
  addGuestRouteWaypoint,
  canAddGuestRouteWaypoint,
  createGuestRouteDraft,
  exportGuestRouteDraftCoordinates,
  findGuestRouteDraftStop,
  GUEST_ROUTE_DRAFT_DESTINATION_ID,
  GUEST_ROUTE_DRAFT_ORIGIN_ID,
  getGuestRouteDraftUnresolvedStopIds,
  guestRouteDraftReducer,
  mapGuestRouteDraftToCheckpoints,
  resolveGuestRouteDraftNextStopInputId,
  resolveGuestRouteDraftStopCoordinate,
  setGuestRouteCurrentLocation,
  shouldUseGuestMapSelectionAsDestination
} from './guestRouteDraft';
import { guestMapStyles as styles } from './GuestMapScreen.styles';
import { createGuestRiskArea } from './guestRiskAreaApi';
import {
  shouldRecenterGuestMap,
  type GuestMapCenteredLocation
} from './guestMapLocation';

const GUEST_ROUTE_PROVIDER_UI_TIMEOUT_MS = 15000;
const GUEST_LOCATION_SEARCH_DEBOUNCE_MS = 320;
const GUEST_LOCATION_SEARCH_MIN_LENGTH = 2;
const GUEST_WAYPOINT_ACTION_HIT_SLOP = 6;

type GuestRoadRoutePreviewFetcher = (
  options: GuestRoadRoutePreviewOptions
) => Promise<GuestRoadRoutePreview | null>;

interface GuestMapScreenProps {
  accessToken?: string | null;
  activeWorkspace?: SafeRouteWorkspace | null;
  authenticated: boolean;
  availableWorkspaces?: SafeRouteWorkspace[];
  onOpenFullAccessFeature: (feature: GuestFullAccessFeature) => void;
  onOpenRoutePreview?: (routePlan: SavedSafeRoutePlan) => void;
  onSessionExpired?: (message?: string) => void;
  onWorkspaceUnavailable?: (workspaceId: string) => void;
  onRetryWorkspaceCatalog?: () => void;
  roadRoutePreviewFetcher?: GuestRoadRoutePreviewFetcher;
  sessionNotice?: string;
  onSignIn: () => void;
  onWorkspaceChange?: (workspace: SafeRouteWorkspace) => void;
  workspaceCatalogError?: string;
  workspaceCatalogLoading?: boolean;
  workspaceCatalogStoredAtMs?: number | null;
  workspaceAuthorizationFresh?: boolean;
  workspaceAccessRecoveryPending?: boolean;
  workspaceAccessRefreshAvailable?: boolean;
  workspaceAccessFocusTargetRef?: (target: View | null) => void;
  workspaceAccessIssue?: WorkspaceAccessIssue;
  workspaceAlternativeSelectionPending?: boolean;
  workspaceChangeEndsNavigation?: boolean;
  workspaceNavigationNoticeInset?: number;
  workspaceSelectionFailed?: boolean;
  workspaceSelectionPending?: boolean;
  workspaceSwitchFailure?: boolean;
  workspaceSwitchDisabled?: boolean;
}

export function GuestMapScreen({
  accessToken,
  activeWorkspace = null,
  authenticated,
  availableWorkspaces = [],
  onOpenFullAccessFeature,
  onOpenRoutePreview,
  onSessionExpired,
  onWorkspaceUnavailable,
  onRetryWorkspaceCatalog,
  roadRoutePreviewFetcher,
  sessionNotice = '',
  onSignIn,
  onWorkspaceChange,
  workspaceCatalogError = '',
  workspaceCatalogLoading = false,
  workspaceCatalogStoredAtMs = null,
  workspaceAuthorizationFresh = false,
  workspaceAccessRecoveryPending = false,
  workspaceAccessRefreshAvailable = false,
  workspaceAccessFocusTargetRef,
  workspaceAccessIssue = 'none',
  workspaceAlternativeSelectionPending = false,
  workspaceChangeEndsNavigation = false,
  workspaceNavigationNoticeInset = 0,
  workspaceSelectionFailed = false,
  workspaceSelectionPending = false,
  workspaceSwitchFailure = false,
  workspaceSwitchDisabled = false
}: GuestMapScreenProps) {
  const viewport = useWindowDimensions();
  const {
    checking: networkChecking,
    offline,
    online,
  } = useNetworkAvailability();
  const onlineRef = useRef(online);
  const networkRequestEpochRef = useRef(0);
  if (onlineRef.current !== online) {
    onlineRef.current = online;
    networkRequestEpochRef.current += 1;
  }
  const mapRef = useRef<MapView | null>(null);
  const activeRoadRouteRequestRef = useRef<AbortController | null>(null);
  const activeLocationSearchRef = useRef<AbortController | null>(null);
  const activeDraftResolutionRef = useRef<AbortController | null>(null);
  const activeRiskAreaRequestRef = useRef<AbortController | null>(null);
  const activeMapReverseGeocodeRef = useRef<AbortController | null>(null);
  const lastCenteredLocationRef = useRef<GuestMapCenteredLocation | null>(null);
  const onSessionExpiredRef = useRef(onSessionExpired);
  const onWorkspaceUnavailableRef = useRef(onWorkspaceUnavailable);
  const recoverWorkspaceAccessRef = useRef<(workspaceId: string) => void>(() => undefined);
  const userMovedMapRef = useRef(false);
  const pendingOpenPreviewRef = useRef(false);
  const roadRouteRequestIdRef = useRef(0);
  const riskAreaRequestIdRef = useRef(0);
  const mapCameraRequestIdRef = useRef(0);
  const workspaceAuthorizationEpochRef = useRef(0);
  const workspaceAuthorizationFreshRef = useRef(workspaceAuthorizationFresh);
  if (workspaceAuthorizationFreshRef.current !== workspaceAuthorizationFresh) {
    workspaceAuthorizationFreshRef.current = workspaceAuthorizationFresh;
    workspaceAuthorizationEpochRef.current += 1;
  }
  const sheetProgress = useRef(new Animated.Value(0)).current;
  const sheetGestureActionRef = useRef<(collapsed: boolean) => void>(() => undefined);
  const routeInputRefs = useRef(new Map<string, TextInput>());
  const pendingInputFocusFrameRef = useRef<number | null>(null);
  const [routeDraft, dispatchRouteDraft] = useReducer(
    guestRouteDraftReducer,
    undefined,
    () => createGuestRouteDraft()
  );
  const [activeInput, setActiveInput] = useState<string | null>(null);
  const [locationSearchResults, setLocationSearchResults] = useState<GuestLocationSearchResult[]>([]);
  const [locationSearchPending, setLocationSearchPending] = useState(false);
  const [locationSearchMessage, setLocationSearchMessage] = useState('');
  const [sheetCollapsed, setSheetCollapsed] = useState(false);
  const handleWorkspaceAccessFocusTarget = useCallback(
    (target: View | null) => {
      workspaceAccessFocusTargetRef?.(sheetCollapsed ? null : target);
    },
    [sheetCollapsed, workspaceAccessFocusTargetRef],
  );
  const [mapAction, setMapAction] = useState<{
    coordinate: LatLng;
    label: string;
    pending: boolean;
  } | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapRegion, setMapRegion] = useState<Region>(GUEST_MAP_REGION);
  const [mapCameraHeadingDegrees, setMapCameraHeadingDegrees] = useState(0);
  const [routeSheetHeight, setRouteSheetHeight] = useState(0);
  const [routeMessage, setRouteMessage] = useState('');
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [selectedRiskZone, setSelectedRiskZone] = useState<RiskZone | null>(null);
  const [routePlan, setRoutePlan] = useState<SavedSafeRoutePlan | null>(null);
  const [routeResolutionPending, setRouteResolutionPending] = useState(false);
  const [roadPreviewPending, setRoadPreviewPending] = useState(false);
  const [riskAreaSavePending, setRiskAreaSavePending] = useState(false);
  const sessionNoticeState = createSessionNoticeState(sessionNotice);
  const {
    coordinate: liveLocation,
    errorMessage: locationErrorMessage,
    permissionStatus,
    timestampMs: liveLocationTimestampMs
  } = useLiveLocation({ permissionRequested: true });
  const liveCoordinate = liveLocation
    ? { latitude: liveLocation.latitude, longitude: liveLocation.longitude }
    : null;
  const deviceHeadingDegrees = useDeviceHeading(permissionStatus === 'granted');
  const deviceHeadingScreenRotation = resolveDeviceHeadingScreenRotation(
    deviceHeadingDegrees,
    mapCameraHeadingDegrees
  );
  const routingClientId = authenticated ? activeWorkspace?.id || null : null;
  const routingClientIdRef = useRef(routingClientId);
  const workspaceSelectionRequired = authenticated && !routingClientId;
  const workspaceAuthorizationRequired =
    authenticated && Boolean(routingClientId) && !workspaceAuthorizationFresh;
  const riskAreaAuthorizationRequired =
    !online ||
    workspaceSelectionPending ||
    workspaceSelectionRequired ||
    workspaceAuthorizationRequired;
  const routingAccessToken =
    !workspaceSelectionPending &&
    !workspaceSelectionRequired &&
    !workspaceAuthorizationRequired &&
    accessToken &&
    !isPreviewAccessToken(accessToken)
    ? accessToken
    : null;
  const origin = routeDraft.origin.label;
  const destination = routeDraft.destination.label;
  const routeSheetMaxHeight = Math.max(
    230,
    Math.min(520, viewport.height * (activeInput ? 0.43 : 0.62))
  );
  const routeSheetBottomMargin = Platform.OS === 'ios' ? spacing.sm : spacing.md;
  const currentLocationControlBottom = sheetProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [
      (routeSheetHeight || routeSheetMaxHeight) + routeSheetBottomMargin + spacing.sm,
      64 + routeSheetBottomMargin + spacing.sm
    ]
  });
  const activeDraftStop = activeInput
    ? findGuestRouteDraftStop(routeDraft, activeInput)
    : null;
  const routePlotted = Boolean(routePlan);
  const mapHomeCopy = createGuestMapHomeCopy(authenticated);
  const showSheetSubtitle = shouldShowGuestMapSubtitle(routePlotted);
  const routeAction = createGuestRouteActionState({
    destination,
    routePlotted
  });
  const routeActionDisabled =
    !online ||
    routeAction.disabled ||
    routeResolutionPending ||
    roadPreviewPending ||
    workspaceSelectionPending ||
    workspaceSelectionRequired ||
    workspaceAuthorizationRequired;
  const workspaceBlockingActionLabel = workspaceCatalogLoading
    ? 'Loading workspace…'
    : workspaceCatalogError
      ? 'Workspace unavailable'
      : availableWorkspaces.length
        ? 'Choose workspace'
        : 'No workspace access';
  const routeActionLabel = routeResolutionPending
    ? 'Resolving route points…'
    : roadPreviewPending
      ? 'Finding safest route…'
    : workspaceSelectionPending
      ? 'Saving workspace…'
    : networkChecking
      ? 'Checking connection…'
    : offline
      ? 'Offline'
    : workspaceSelectionRequired
      ? workspaceBlockingActionLabel
      : workspaceAuthorizationRequired
        ? workspaceCatalogLoading
          ? 'Checking workspace…'
          : 'Verify workspace access'
      : routeAction.label;
  const routeActionAccessibilityLabel = networkChecking
    ? 'Checking connection before plotting this route'
    : offline
      ? 'Reconnect before plotting this route'
    : workspaceSelectionPending
      ? 'Saving the workspace before plotting this route'
    : workspaceSelectionRequired
    ? workspaceBlockingActionLabel
    : workspaceAuthorizationRequired
      ? workspaceCatalogLoading
        ? 'Checking workspace access before plotting this route'
        : 'Verify workspace access before plotting this route'
    : routeAction.accessibilityLabel;
  const routeActionAccessibilityHint = !online
    ? 'Wait for a connection before requesting a road-snapped route.'
    : workspaceSelectionPending
      ? 'Wait for the workspace change to finish before plotting this route.'
    : workspaceSelectionRequired
    ? availableWorkspaces.length
      ? 'Choose the SafeRoute workspace above before plotting this route.'
      : workspaceCatalogError
        ? 'Retry workspace loading before plotting this route.'
        : 'Route planning needs an available SafeRoute workspace.'
    : workspaceAuthorizationRequired
      ? 'Retry workspace loading before plotting or starting workspace guidance.'
    : routeAction.accessibilityHint;
  const mapSelectionSetsDestination = shouldUseGuestMapSelectionAsDestination(routeDraft);
  const canAddMapRoutePoint =
    mapSelectionSetsDestination || canAddGuestRouteWaypoint(routeDraft);
  const originInputCopy = createGuestRouteInputCopy({
    field: 'origin',
    routePlotted
  });
  const destinationInputCopy = createGuestRouteInputCopy({
    field: 'destination',
    routePlotted
  });
  const gateFeatures = getGuestMapGateFeatures({
    authenticated,
    routePlotted
  });
  const viewportRisk = useViewportRiskAreas({
    accessToken: routingAccessToken,
    clientId: routingClientId,
    enabled:
      online &&
      !workspaceSelectionPending &&
      !workspaceSelectionRequired &&
      !workspaceAuthorizationRequired,
    onSessionExpired,
    onWorkspaceUnavailable: onWorkspaceUnavailable
      ? (workspaceId) => recoverWorkspaceAccessRef.current(workspaceId)
      : undefined,
    region: mapRegion
  });
  routingClientIdRef.current = routingClientId;
  onSessionExpiredRef.current = onSessionExpired;
  onWorkspaceUnavailableRef.current = onWorkspaceUnavailable;
  const cancelPendingRouteInputFocus = () => {
    if (pendingInputFocusFrameRef.current === null) {
      return;
    }
    cancelAnimationFrame(pendingInputFocusFrameRef.current);
    pendingInputFocusFrameRef.current = null;
  };
  const animateRouteSheet = (collapsed: boolean) => {
    cancelPendingRouteInputFocus();
    setSheetCollapsed(collapsed);
    if (collapsed) {
      Keyboard.dismiss();
      setActiveInput(null);
    }
    Animated.spring(sheetProgress, {
      damping: 24,
      mass: 0.85,
      stiffness: 220,
      toValue: collapsed ? 1 : 0,
      useNativeDriver: true
    }).start();
  };
  const focusRouteStopInput = (stopId: string) => {
    setActiveInput(stopId);
    cancelPendingRouteInputFocus();
    pendingInputFocusFrameRef.current = requestAnimationFrame(() => {
      pendingInputFocusFrameRef.current = null;
      routeInputRefs.current.get(stopId)?.focus();
    });
  };
  const handleCollapsedLocationSearch = () => {
    const nextStopId = resolveGuestRouteDraftNextStopInputId(routeDraft);
    animateRouteSheet(false);
    focusRouteStopInput(nextStopId);
  };
  sheetGestureActionRef.current = animateRouteSheet;
  const sheetPanResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 8,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 28 || gesture.vy > 0.45) {
          sheetGestureActionRef.current(true);
        } else if (gesture.dy < -20 || gesture.vy < -0.35) {
          sheetGestureActionRef.current(false);
        }
      }
    }),
    []
  );

  useEffect(() => {
    if (
      workspaceAlternativeSelectionPending &&
      !workspaceCatalogLoading &&
      !workspaceSelectionPending &&
      !workspaceSwitchDisabled &&
      availableWorkspaces.length > 0
    ) {
      Keyboard.dismiss();
      setActiveInput(null);
      sheetGestureActionRef.current(false);
      setWorkspaceMenuOpen(true);
    }
  }, [
    availableWorkspaces.length,
    workspaceAlternativeSelectionPending,
    workspaceCatalogLoading,
    workspaceSelectionPending,
    workspaceSwitchDisabled,
  ]);

  useEffect(() => {
    if (!workspaceAlternativeSelectionPending) {
      setWorkspaceMenuOpen(false);
    }
  }, [workspaceAlternativeSelectionPending]);

  useEffect(() => {
    dispatchRouteDraft({
      coordinate: liveCoordinate,
      type: 'current-location/set'
    });
  }, [liveCoordinate?.latitude, liveCoordinate?.longitude]);

  useEffect(() => () => {
    cancelPendingRouteInputFocus();
    activeRiskAreaRequestRef.current?.abort();
    activeRiskAreaRequestRef.current = null;
    riskAreaRequestIdRef.current += 1;
    mapCameraRequestIdRef.current += 1;
  }, []);

  useEffect(() => {
    if (
      selectedRiskZone &&
      !viewportRisk.zones.some((zone) => zone.id === selectedRiskZone.id)
    ) {
      setSelectedRiskZone(null);
    }
  }, [selectedRiskZone, viewportRisk.zones]);

  useEffect(() => {
    if (!mapReady) {
      return;
    }
    const candidate = liveCoordinate
      ? {
          coordinate: liveCoordinate,
          timestampMs: Number.isFinite(liveLocationTimestampMs)
            ? Number(liveLocationTimestampMs)
            : Date.now()
        }
      : null;
    if (!candidate || !shouldRecenterGuestMap({
      candidate,
      previous: lastCenteredLocationRef.current,
      routePlotted: Boolean(routePlan),
      userMovedMap: userMovedMapRef.current
    })) {
      return;
    }

    lastCenteredLocationRef.current = candidate;
    const nextRegion = regionAroundCoordinate(candidate.coordinate);
    setMapRegion(nextRegion);
    mapRef.current?.animateToRegion(nextRegion, 650);
  }, [
    liveCoordinate?.latitude,
    liveCoordinate?.longitude,
    liveLocationTimestampMs,
    mapReady,
    routePlan
  ]);

  useEffect(() => {
    activeLocationSearchRef.current?.abort();
    setLocationSearchResults([]);
    setLocationSearchMessage('');

    if (!activeInput) {
      setLocationSearchPending(false);
      return;
    }

    const activeStop = activeDraftStop;
    const query = activeStop?.label ?? '';
    if (
      !activeStop ||
      query.trim().length < GUEST_LOCATION_SEARCH_MIN_LENGTH ||
      activeStop.resolution.type !== 'unresolved' ||
      (activeInput === GUEST_ROUTE_DRAFT_ORIGIN_ID && isCurrentLocationLabel(query))
    ) {
      setLocationSearchPending(false);
      return;
    }

    if (!online) {
      setLocationSearchPending(false);
      setLocationSearchMessage(
        networkChecking
          ? 'Checking connection before searching.'
          : 'Reconnect to search for places.',
      );
      return;
    }

    const controller = new AbortController();
    activeLocationSearchRef.current = controller;
    const requestNetworkEpoch = networkRequestEpochRef.current;
    const requestIsCurrent = () =>
      !controller.signal.aborted &&
      activeLocationSearchRef.current === controller &&
      onlineRef.current &&
      requestNetworkEpoch === networkRequestEpochRef.current;
    const timer = setTimeout(() => {
      if (!requestIsCurrent()) {
        return;
      }
      setLocationSearchPending(true);
      void searchGuestLocations(query, {
        bias: {
          center: liveCoordinate,
          region: mapRegion
        },
        serviceBaseUrl: LUNARCHAIN_API_BASE,
        signal: controller.signal
      }).then((results) => {
        if (!requestIsCurrent()) {
          return;
        }
        setLocationSearchResults(results);
        setLocationSearchMessage(results.length ? '' : 'No matching places found.');
      }).catch(() => {
        if (requestIsCurrent()) {
          setLocationSearchMessage('Places could not be searched. Check your connection and try again.');
        }
      }).finally(() => {
        if (requestIsCurrent()) {
          setLocationSearchPending(false);
        }
      });
    }, GUEST_LOCATION_SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    activeInput,
    activeDraftStop?.label,
    activeDraftStop?.resolution.type,
    liveCoordinate?.latitude,
    liveCoordinate?.longitude,
    mapRegion.latitude,
    mapRegion.longitude,
    mapRegion.latitudeDelta,
    mapRegion.longitudeDelta,
    networkChecking,
    online,
  ]);

  useEffect(() => {
    if (!routePlan?.route.coordinates.length) {
      return;
    }

    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(routePlan.route.coordinates, {
        animated: true,
        edgePadding: {
          bottom: 360,
          left: 42,
          right: 42,
          top: 150
        }
      });
    }, 120);

    return () => clearTimeout(timer);
  }, [routePlan]);

  useEffect(() => () => {
    cancelRoadRouteUpgrade();
    activeLocationSearchRef.current?.abort();
    activeMapReverseGeocodeRef.current?.abort();
  }, []);

  const cancelRoadRouteUpgrade = () => {
    activeDraftResolutionRef.current?.abort();
    activeDraftResolutionRef.current = null;
    setRouteResolutionPending(false);
    roadRouteRequestIdRef.current += 1;
    pendingOpenPreviewRef.current = false;
    activeRoadRouteRequestRef.current?.abort();
    activeRoadRouteRequestRef.current = null;
    setRoadPreviewPending(false);
  };

  useEffect(() => {
    if (!workspaceAuthorizationRequired) {
      return;
    }

    cancelRoadRouteUpgrade();
    riskAreaRequestIdRef.current += 1;
    activeRiskAreaRequestRef.current?.abort();
    activeRiskAreaRequestRef.current = null;
    setRiskAreaSavePending(false);
  }, [workspaceAuthorizationRequired]);

  useEffect(() => {
    if (online) {
      return;
    }
    cancelRoadRouteUpgrade();
    activeLocationSearchRef.current?.abort();
    activeRiskAreaRequestRef.current?.abort();
    activeMapReverseGeocodeRef.current?.abort();
    activeMapReverseGeocodeRef.current = null;
    setMapAction((current) => current ? { ...current, pending: false } : current);
    activeRiskAreaRequestRef.current = null;
    riskAreaRequestIdRef.current += 1;
    setRiskAreaSavePending(false);
  }, [online]);

  const clearWorkspaceScopedMapState = () => {
    cancelRoadRouteUpgrade();
    riskAreaRequestIdRef.current += 1;
    activeRiskAreaRequestRef.current?.abort();
    activeRiskAreaRequestRef.current = null;
    setRiskAreaSavePending(false);
    setSelectedRiskZone(null);
    setMapAction(null);
    setRoutePlan(null);
    setRouteMessage('');
  };

  recoverWorkspaceAccessRef.current = (workspaceId) => {
    if (routingClientIdRef.current !== workspaceId) {
      return;
    }
    clearWorkspaceScopedMapState();
    onWorkspaceUnavailableRef.current?.(workspaceId);
  };

  useEffect(() => {
    setWorkspaceMenuOpen(false);
    clearWorkspaceScopedMapState();
  }, [routingClientId]);

  useEffect(() => {
    if (workspaceCatalogLoading || workspaceSelectionPending) {
      setWorkspaceMenuOpen(false);
    }
  }, [workspaceCatalogLoading, workspaceSelectionPending]);

  const handleWorkspaceChange = (workspace: SafeRouteWorkspace) => {
    setWorkspaceMenuOpen(false);
    if (
      workspace.id === routingClientId &&
      !workspaceSelectionFailed &&
      !workspaceAlternativeSelectionPending
    ) {
      return;
    }

    onWorkspaceChange?.(workspace);
  };

  const handlePlotRoute = async () => {
    if (routeActionDisabled) {
      return;
    }
    const plotWorkspaceId = routingClientId;
    const plotAuthorizationEpoch = workspaceAuthorizationEpochRef.current;
    const plotNetworkRequestEpoch = networkRequestEpochRef.current;
    const plotAuthorizationIsCurrent = () =>
      onlineRef.current &&
      plotNetworkRequestEpoch === networkRequestEpochRef.current &&
      isCurrentWorkspaceAuthorizationEpoch({
        currentEpoch: workspaceAuthorizationEpochRef.current,
        currentFresh: workspaceAuthorizationFreshRef.current,
        currentWorkspaceId: routingClientIdRef.current,
        requestEpoch: plotAuthorizationEpoch,
        requestWorkspaceId: plotWorkspaceId,
      });

    Keyboard.dismiss();
    cancelRoadRouteUpgrade();
    setRouteMessage('');
    setActiveInput(null);

    let plottingDraft = routeDraft;
    if (
      SAFEROUTE_PREVIEW_MODE_ENABLED &&
      isCurrentLocationLabel(plottingDraft.origin.label) &&
      !resolveGuestRouteDraftStopCoordinate(plottingDraft, plottingDraft.origin.id)
    ) {
      plottingDraft = setGuestRouteCurrentLocation(plottingDraft, {
        latitude: GUEST_MAP_REGION.latitude,
        longitude: GUEST_MAP_REGION.longitude
      });
    }
    const typedStopIds = getGuestRouteDraftUnresolvedStopIds(plottingDraft)
      .filter((stopId) => findGuestRouteDraftStop(plottingDraft, stopId)?.resolution.type === 'unresolved');
    if (typedStopIds.length) {
      const controller = new AbortController();
      activeDraftResolutionRef.current = controller;
      setRouteResolutionPending(true);
      try {
        plottingDraft = await resolveGuestRouteDraftSearchInputs({
          draft: plottingDraft,
          search: (query, options) => searchGuestLocations(query, {
            ...options,
            serviceBaseUrl: LUNARCHAIN_API_BASE
          }),
          signal: controller.signal
        });
        if (controller.signal.aborted || !plotAuthorizationIsCurrent()) {
          return;
        }
        for (const stopId of typedStopIds) {
          const stop = findGuestRouteDraftStop(plottingDraft, stopId);
          if (stop?.resolution.type === 'coordinate') {
            dispatchRouteDraft({
              selection: {
                coordinate: stop.resolution.coordinate,
                label: stop.label
              },
              stopId,
              type: 'stop/select'
            });
          }
        }
      } catch {
        if (!controller.signal.aborted) {
          setRouteMessage('Route points could not be resolved. Check your connection and try again.');
        }
        return;
      } finally {
        if (activeDraftResolutionRef.current === controller) {
          activeDraftResolutionRef.current = null;
          setRouteResolutionPending(false);
        }
      }
    }
    const unresolvedStopIds = getGuestRouteDraftUnresolvedStopIds(plottingDraft);
    if (!plotAuthorizationIsCurrent()) {
      return;
    }
    if (unresolvedStopIds.length) {
      const firstStopId = unresolvedStopIds[0];
      const firstStop = findGuestRouteDraftStop(plottingDraft, firstStopId);
      setRouteMessage(
        firstStopId === GUEST_ROUTE_DRAFT_ORIGIN_ID &&
          isCurrentLocationLabel(firstStop?.label || '') &&
          permissionStatus !== 'denied'
          ? 'Finding your current location…'
          : `Choose ${firstStop?.kind === 'waypoint' ? 'this stop' : firstStop?.kind || 'a stop'} from the search results.`
      );
      setActiveInput(firstStopId);
      animateRouteSheet(false);
      return;
    }
    const stopCoordinates = exportGuestRouteDraftCoordinates(plottingDraft);
    const checkpoints = mapGuestRouteDraftToCheckpoints(plottingDraft);
    if (!stopCoordinates || !checkpoints || stopCoordinates.length < 2) {
      setRouteMessage('Add a start point and destination before plotting.');
      return;
    }
    if (hasAdjacentDuplicateStops(stopCoordinates)) {
      setRouteMessage('Move or remove duplicate stops before plotting.');
      return;
    }
    const resolvedOriginCoordinate = stopCoordinates[0];
    const resolvedDestinationCoordinate = stopCoordinates.at(-1) as LatLng;
    const routePlanId = createGuestRoutePlanId();

    const localRoutePlan = createGuestRoutePlan({
      authenticated,
      checkpoints,
      destinationCoordinate: resolvedDestinationCoordinate,
      origin: plottingDraft.origin.label,
      originCoordinate: resolvedOriginCoordinate,
      destination: plottingDraft.destination.label,
      planId: routePlanId,
      riskZones: viewportRisk.zones
    });
    // A straight checkpoint connector is useful as an internal request
    // scaffold, but it is never a drivable route. Keep navigation gated until
    // an authoritative provider returns road-snapped geometry.
    setRoutePlan(null);
    upgradeGuestRouteWithRoadPreview(localRoutePlan);
  };

  const upgradeGuestRouteWithRoadPreview = (localRoutePlan: SavedSafeRoutePlan) => {
    const stops = resolveRoadPreviewStops(localRoutePlan);

    if (!stops || !onlineRef.current) {
      return;
    }

    const requestId = roadRouteRequestIdRef.current + 1;
    roadRouteRequestIdRef.current = requestId;
    const controller = new AbortController();
    activeRoadRouteRequestRef.current = controller;
    setRoadPreviewPending(true);
    const originSnapshot = localRoutePlan.origin;
    const destinationSnapshot = localRoutePlan.destination;
    const originCoordinateSnapshot = localRoutePlan.checkpoints[0]?.coordinate;
    const destinationCoordinateSnapshot = localRoutePlan.checkpoints.at(-1)?.coordinate;
    const checkpointsSnapshot = localRoutePlan.checkpoints;
    const riskZonesSnapshot = localRoutePlan.riskZones;
    const authenticatedSnapshot = authenticated;
    const requestAccessToken = routingAccessToken;
    const requestWorkspaceId = routingClientId;
    const requestNetworkEpoch = networkRequestEpochRef.current;
    const requestAuthorizationEpoch = workspaceAuthorizationEpochRef.current;
    const requestAuthorizationIsCurrent = () =>
      onlineRef.current &&
      requestNetworkEpoch === networkRequestEpochRef.current &&
      isCurrentWorkspaceAuthorizationEpoch({
        currentEpoch: workspaceAuthorizationEpochRef.current,
        currentFresh: workspaceAuthorizationFreshRef.current,
        currentWorkspaceId: routingClientIdRef.current,
        requestEpoch: requestAuthorizationEpoch,
        requestWorkspaceId,
      });
    let acceptedRoadPreview = false;
    let sessionExpiryHandled = false;
    let workspaceUnavailableHandled = false;

    const handleRouteSessionExpiry = (error: unknown) => {
      const sessionExpiry = getRequestSessionExpiry({
        authenticated: Boolean(routingAccessToken && onSessionExpired),
        error,
        handled: sessionExpiryHandled,
        requestActive:
          !controller.signal.aborted &&
          roadRouteRequestIdRef.current === requestId &&
          routingClientIdRef.current === requestWorkspaceId &&
          requestAuthorizationIsCurrent()
      });
      if (!sessionExpiry) {
        return false;
      }
      sessionExpiryHandled = true;
      controller.abort();
      onSessionExpired?.(sessionExpiry.message);
      return true;
    };

    const handleRouteWorkspaceUnavailable = (error: unknown) => {
      const unavailableWorkspaceId = getRequestUnavailableWorkspaceId({
        accessToken: requestAccessToken,
        error,
        handled: workspaceUnavailableHandled,
        requestActive:
          !controller.signal.aborted &&
          roadRouteRequestIdRef.current === requestId &&
          routingClientIdRef.current === requestWorkspaceId &&
          requestAuthorizationIsCurrent() &&
          Boolean(onWorkspaceUnavailableRef.current),
        workspaceId: requestWorkspaceId
      });
      if (!unavailableWorkspaceId) {
        return false;
      }

      workspaceUnavailableHandled = true;
      recoverWorkspaceAccessRef.current(unavailableWorkspaceId);
      return true;
    };

    const openPendingPreview = (nextRoutePlan: SavedSafeRoutePlan) => {
      if (!pendingOpenPreviewRef.current) {
        return;
      }

      pendingOpenPreviewRef.current = false;
      onOpenRoutePreview?.(nextRoutePlan);
    };

    const routePreviewFetcher = roadRoutePreviewFetcher || ((options: GuestRoadRoutePreviewOptions) =>
      fetchSafeRouteRoadRoutePreview({
        ...options,
        accessToken: requestAccessToken,
        clientId: requestWorkspaceId
      }));

    const avoidRectangles = buildLiveRerouteAvoidRectangles(
      riskZonesSnapshot,
      localRoutePlan.route.coordinates,
      stops
    );

    void routePreviewFetcher({
      avoidRectangles,
      signal: controller.signal,
      stops,
      timeoutMs: GUEST_ROUTE_PROVIDER_UI_TIMEOUT_MS
    })
      .then(async (roadPreview) => {
        if (
          !roadPreview ||
          controller.signal.aborted ||
          roadRouteRequestIdRef.current !== requestId ||
          routingClientIdRef.current !== requestWorkspaceId ||
          !requestAuthorizationIsCurrent()
        ) {
          return;
        }

        let finalRoadPreview = roadPreview;
        let finalRiskZones = riskZonesSnapshot;
        try {
          const corridorRiskZones = await fetchAreaRiskAlongRoute(
            roadPreview.coordinates,
            {
              accessToken: requestAccessToken,
              clientId: requestWorkspaceId || undefined,
              maxChunks: 8,
              signal: controller.signal,
              timeoutMs: 9000
            }
          );
          if (
            controller.signal.aborted ||
            roadRouteRequestIdRef.current !== requestId ||
            routingClientIdRef.current !== requestWorkspaceId ||
            !requestAuthorizationIsCurrent()
          ) {
            return;
          }
          finalRiskZones = mergeRiskZonesById(riskZonesSnapshot, corridorRiskZones);
          const corridorAvoidRectangles = buildLiveRerouteAvoidRectangles(
            finalRiskZones,
            roadPreview.coordinates,
            stops
          );
          if (
            JSON.stringify(corridorAvoidRectangles) !== JSON.stringify(avoidRectangles)
          ) {
            const riskAwarePreview = await routePreviewFetcher({
              avoidRectangles: corridorAvoidRectangles,
              signal: controller.signal,
              stops,
              timeoutMs: GUEST_ROUTE_PROVIDER_UI_TIMEOUT_MS
            });
            if (!riskAwarePreview) {
              return;
            }
            finalRoadPreview = riskAwarePreview;
          }
        } catch (error) {
          if (handleRouteSessionExpiry(error)) {
            return;
          }
          if (handleRouteWorkspaceUnavailable(error)) {
            return;
          }
          if (!SAFEROUTE_PREVIEW_MODE_ENABLED) {
            return;
          }
        }

        if (
          controller.signal.aborted ||
          roadRouteRequestIdRef.current !== requestId ||
          routingClientIdRef.current !== requestWorkspaceId ||
          !requestAuthorizationIsCurrent()
        ) {
          return;
        }

        const roadRoutePlan = createGuestRoadSnappedRoutePlan({
          authenticated: authenticatedSnapshot,
          checkpoints: checkpointsSnapshot,
          destination: destinationSnapshot,
          destinationCoordinate: destinationCoordinateSnapshot,
          origin: originSnapshot,
          originCoordinate: originCoordinateSnapshot,
          planId: localRoutePlan.id,
          riskZones: finalRiskZones,
          roadSnappedCoordinates: finalRoadPreview.coordinates,
          routeDistanceMeters: finalRoadPreview.distanceMeters,
          routeDurationSeconds: finalRoadPreview.durationSeconds,
          routeGuidanceSteps: finalRoadPreview.guidanceSteps
        });

        if (roadRoutePlan) {
          if (requestWorkspaceId) {
            roadRoutePlan.clientId = requestWorkspaceId;
          }
          acceptedRoadPreview = true;
          setRoutePlan(roadRoutePlan);
          openPendingPreview(roadRoutePlan);
        }
      })
      .catch((error) => {
        if (handleRouteSessionExpiry(error)) {
          return;
        }
        if (handleRouteWorkspaceUnavailable(error)) {
          return;
        }
        // The finalizer fails closed instead of presenting checkpoint
        // connectors as drivable road geometry.
      })
      .finally(() => {
        if (
          roadRouteRequestIdRef.current === requestId &&
          routingClientIdRef.current === requestWorkspaceId &&
          requestAuthorizationIsCurrent()
        ) {
          activeRoadRouteRequestRef.current = null;
          setRoadPreviewPending(false);
          if (!acceptedRoadPreview && !sessionExpiryHandled && !workspaceUnavailableHandled) {
            pendingOpenPreviewRef.current = false;
            setRoutePlan(null);
            setRouteMessage('A road-snapped safe route is unavailable. Retry in a moment.');
          }
        }
      });
  };

  const handleOpenPreview = () => {
    if (routeActionDisabled) {
      return;
    }

    Keyboard.dismiss();
    if (!routePlan) {
      void handlePlotRoute();
      return;
    }

    if (roadPreviewPending) {
      pendingOpenPreviewRef.current = true;
      return;
    }

    onOpenRoutePreview?.(routePlan);
  };

  const handleCenterCurrentLocation = () => {
    if (!mapReady || !liveCoordinate) {
      return;
    }
    const candidate = {
      coordinate: liveCoordinate,
      timestampMs: Number.isFinite(liveLocationTimestampMs)
        ? Number(liveLocationTimestampMs)
        : Date.now()
    };
    lastCenteredLocationRef.current = candidate;
    userMovedMapRef.current = false;
    setMapAction(null);
    setSelectedRiskZone(null);
    mapRef.current?.animateCamera(
      { center: liveCoordinate },
      { duration: 450 }
    );
  };

  const handleMapRegionChangeComplete = (region: Region) => {
    setMapRegion(region);
    const requestId = mapCameraRequestIdRef.current + 1;
    mapCameraRequestIdRef.current = requestId;
    const cameraPromise = mapRef.current?.getCamera();
    if (!cameraPromise) {
      return;
    }

    void cameraPromise.then((camera) => {
      if (mapCameraRequestIdRef.current !== requestId) {
        return;
      }
      const nextHeading = Number(camera.heading);
      setMapCameraHeadingDegrees(Number.isFinite(nextHeading) ? nextHeading : 0);
    }).catch(() => undefined);
  };

  const handleStopChange = (stopId: string, value: string) => {
    cancelRoadRouteUpgrade();
    dispatchRouteDraft({
      label: value,
      stopId,
      type: 'stop/edit'
    });
    setRoutePlan(null);
    setRouteMessage('');
  };

  const handleOriginChange = (value: string) => {
    if (isCurrentLocationLabel(value)) {
      cancelRoadRouteUpgrade();
      dispatchRouteDraft({
        label: value,
        type: 'origin/use-current-location'
      });
      setRoutePlan(null);
      setRouteMessage('');
      return;
    }
    handleStopChange(GUEST_ROUTE_DRAFT_ORIGIN_ID, value);
  };

  const handleDestinationChange = (value: string) => handleStopChange(
    GUEST_ROUTE_DRAFT_DESTINATION_ID,
    value
  );

  const handleSelectLocation = (result: GuestLocationSearchResult) => {
    if (!activeInput) {
      return;
    }
    cancelRoadRouteUpgrade();
    dispatchRouteDraft({
      selection: {
        coordinate: result.coordinate,
        label: result.displayName
      },
      stopId: activeInput,
      type: 'stop/select'
    });
    setRoutePlan(null);
    setRouteMessage('');
    setLocationSearchResults([]);
    setLocationSearchMessage('');
    setActiveInput(null);
    Keyboard.dismiss();
    const nextRegion = regionAroundCoordinate(result.coordinate);
    setMapRegion(nextRegion);
    mapRef.current?.animateToRegion(nextRegion, 500);
  };

  const handleAddWaypoint = () => {
    const nextDraft = addGuestRouteWaypoint(routeDraft);
    if (nextDraft === routeDraft) {
      return;
    }
    const waypointId = nextDraft.waypoints.find(
      (waypoint) => !routeDraft.waypoints.some((existing) => existing.id === waypoint.id)
    )?.id;
    dispatchRouteDraft({ type: 'waypoint/add' });
    cancelRoadRouteUpgrade();
    setRoutePlan(null);
    setRouteMessage('');
    animateRouteSheet(false);
    if (waypointId) {
      setActiveInput(waypointId);
    }
  };

  const handleRemoveWaypoint = (waypointId: string) => {
    dispatchRouteDraft({ type: 'waypoint/remove', waypointId });
    if (activeInput === waypointId) {
      setActiveInput(null);
    }
    cancelRoadRouteUpgrade();
    setRoutePlan(null);
    setRouteMessage('');
  };

  const handleReorderWaypoint = (waypointId: string, toIndex: number) => {
    dispatchRouteDraft({ type: 'waypoint/reorder', waypointId, toIndex });
    cancelRoadRouteUpgrade();
    setRoutePlan(null);
    setRouteMessage('');
  };

  const handleMapLongPress = (coordinate: LatLng) => {
    Keyboard.dismiss();
    setActiveInput(null);
    setSelectedRiskZone(null);
    // Keep the contextual action card unobstructed by the route editor. The
    // compact sheet preserves route context while the map action takes focus.
    animateRouteSheet(true);
    setMapAction({
      coordinate,
      label: formatCoordinateLabel(coordinate),
      pending: online
    });
    if (!online) {
      return;
    }
    activeMapReverseGeocodeRef.current?.abort();
    const controller = new AbortController();
    activeMapReverseGeocodeRef.current = controller;
    const requestNetworkEpoch = networkRequestEpochRef.current;
    const requestIsCurrent = () =>
      !controller.signal.aborted &&
      activeMapReverseGeocodeRef.current === controller &&
      onlineRef.current &&
      requestNetworkEpoch === networkRequestEpochRef.current;
    void reverseGeocodeGuestLocation(coordinate, {
      serviceBaseUrl: LUNARCHAIN_API_BASE,
      signal: controller.signal,
      timeoutMs: 7000
    }).then((result) => {
      if (!requestIsCurrent()) {
        return;
      }
      setMapAction((current) => current && coordinatesMatch(current.coordinate, coordinate)
        ? {
            ...current,
            label: result?.displayName || current.label,
            pending: false
          }
        : current);
    }).catch(() => {
      if (!requestIsCurrent()) {
        return;
      }
      setMapAction((current) => current && coordinatesMatch(current.coordinate, coordinate)
        ? { ...current, pending: false }
        : current);
    }).finally(() => {
      if (activeMapReverseGeocodeRef.current === controller) {
        activeMapReverseGeocodeRef.current = null;
      }
    });
  };

  const handleSelectRiskZone = (zone: RiskZone) => {
    setMapAction(null);
    setSelectedRiskZone(zone);
    // Risk details are a map-level interaction, so present them above the
    // compact route summary rather than hiding them behind the expanded sheet.
    animateRouteSheet(true);
  };

  const handleAddMapRoutePoint = () => {
    if (!mapAction || !canAddMapRoutePoint) {
      return;
    }
    const selection = {
      coordinate: mapAction.coordinate,
      label: mapAction.label.slice(0, GUEST_ROUTE_LABEL_MAX_LENGTH)
    };
    if (mapSelectionSetsDestination) {
      dispatchRouteDraft({
        selection,
        stopId: GUEST_ROUTE_DRAFT_DESTINATION_ID,
        type: 'stop/select'
      });
    } else {
      dispatchRouteDraft({
        options: {
          ...selection,
          select: false
        },
        type: 'waypoint/add'
      });
    }
    cancelRoadRouteUpgrade();
    setRoutePlan(null);
    setRouteMessage(
      mapSelectionSetsDestination
        ? 'Destination set. Plot the route when ready.'
        : 'Stop added. Plot the route when ready.'
    );
    setMapAction(null);
    animateRouteSheet(false);
  };

  const handleAddMapRiskArea = async () => {
    const action = mapAction;
    if (!authenticated) {
      setMapAction(null);
      onSignIn();
      return;
    }
    if (
      !action ||
      !onlineRef.current ||
      !routingClientId ||
      !routingAccessToken
    ) {
      setMapAction(null);
      setRouteMessage(
        !online
          ? networkChecking
            ? 'Checking connection before adding a risk area.'
            : 'Reconnect before adding a risk area.'
        : workspaceAuthorizationRequired
          ? 'Verify current workspace access before adding a risk area.'
          : 'Your workspace is still loading. Try adding the risk area again.'
      );
      return;
    }
    activeRiskAreaRequestRef.current?.abort();
    const requestId = riskAreaRequestIdRef.current + 1;
    riskAreaRequestIdRef.current = requestId;
    const controller = new AbortController();
    activeRiskAreaRequestRef.current = controller;
    setRiskAreaSavePending(true);
    const requestAccessToken = routingAccessToken;
    const requestWorkspaceId = routingClientId;
    const requestNetworkEpoch = networkRequestEpochRef.current;
    const requestAuthorizationEpoch = workspaceAuthorizationEpochRef.current;
    const requestAuthorizationIsCurrent = () => isCurrentWorkspaceAuthorizationEpoch({
      currentEpoch: workspaceAuthorizationEpochRef.current,
      currentFresh: workspaceAuthorizationFreshRef.current,
      currentWorkspaceId: routingClientIdRef.current,
      requestEpoch: requestAuthorizationEpoch,
      requestWorkspaceId,
    });
    const requestIsCurrent = () =>
      onlineRef.current &&
      requestNetworkEpoch === networkRequestEpochRef.current &&
      requestAuthorizationIsCurrent();
    if (!requestIsCurrent()) {
      controller.abort();
      activeRiskAreaRequestRef.current = null;
      setRiskAreaSavePending(false);
      return;
    }
    try {
      await createGuestRiskArea({
        accessToken: requestAccessToken,
        clientId: requestWorkspaceId,
        coordinate: action.coordinate,
        locationLabel: action.label,
        signal: controller.signal
      });
      if (
        controller.signal.aborted ||
        riskAreaRequestIdRef.current !== requestId ||
        routingClientIdRef.current !== requestWorkspaceId ||
        !requestIsCurrent()
      ) {
        return;
      }
      setMapAction(null);
      setRouteMessage('Risk area added for your workspace.');
      viewportRisk.retry();
    } catch (error) {
      if (
        controller.signal.aborted ||
        riskAreaRequestIdRef.current !== requestId ||
        routingClientIdRef.current !== requestWorkspaceId ||
        !requestIsCurrent()
      ) {
        return;
      }
      const sessionExpiry = getRequestSessionExpiry({
        authenticated: Boolean(onSessionExpired),
        error,
        handled: false,
        requestActive: true
      });
      if (sessionExpiry) {
        setMapAction(null);
        onSessionExpired?.(sessionExpiry.message);
      } else {
        const unavailableWorkspaceId = getRequestUnavailableWorkspaceId({
          accessToken: requestAccessToken,
          error,
          handled: false,
          requestActive: Boolean(onWorkspaceUnavailableRef.current),
          workspaceId: requestWorkspaceId
        });
        if (unavailableWorkspaceId) {
          recoverWorkspaceAccessRef.current(unavailableWorkspaceId);
        } else {
          setRouteMessage(error instanceof Error
            ? error.message
            : 'The risk area could not be added. Try again.');
        }
      }
    } finally {
      if (
        riskAreaRequestIdRef.current === requestId &&
        routingClientIdRef.current === requestWorkspaceId &&
        requestIsCurrent()
      ) {
        activeRiskAreaRequestRef.current = null;
        setRiskAreaSavePending(false);
      }
    }
  };

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        testID={uiTestIds.guestMapCanvas}
        style={styles.map}
        initialRegion={GUEST_MAP_REGION}
        showsBuildings
        showsCompass={false}
        showsIndoors={false}
        showsIndoorLevelPicker={false}
        showsMyLocationButton={false}
        showsUserLocation={false}
        showsScale={false}
        showsTraffic={false}
        pitchEnabled
        rotateEnabled
        toolbarEnabled={false}
        customMapStyle={SAFE_ROUTE_DARK_MAP_STYLE}
        mapType={resolveSafeRouteMapType({
          online,
          platform: Platform.OS,
        })}
        userInterfaceStyle="dark"
        onMapReady={() => {
          setMapReady(true);
          mapRef.current?.animateCamera({ heading: 0, pitch: 38 }, { duration: 0 });
        }}
        onLongPress={(event) => handleMapLongPress(event.nativeEvent.coordinate)}
        onPanDrag={() => {
          userMovedMapRef.current = true;
          setSelectedRiskZone(null);
        }}
        onRegionChangeComplete={handleMapRegionChangeComplete}
      >
        {viewportRisk.zones.map((zone) => (
          <RiskOverlay
            key={zone.id}
            selected={selectedRiskZone?.id === zone.id}
            zone={zone}
            onPress={handleSelectRiskZone}
          />
        ))}
        {permissionStatus === 'granted' && liveCoordinate ? (
          <Marker
            coordinate={liveCoordinate}
            anchor={{ x: 0.5, y: 0.5 }}
            title="Current location"
            zIndex={30}
          >
            <View
              accessible
              accessibilityLabel={createDeviceHeadingAccessibilityLabel(deviceHeadingDegrees)}
              accessibilityRole="image"
              style={[
                styles.currentLocationMarker,
                deviceHeadingScreenRotation !== null
                  ? {
                      transform: [{
                        rotate: `${deviceHeadingScreenRotation}deg`
                      }]
                    }
                  : null
              ]}
              testID={uiTestIds.guestMapCurrentLocationMarker}
            >
              {deviceHeadingDegrees !== null ? (
                <>
                  <View style={styles.currentLocationDirectionBorder} />
                  <View style={styles.currentLocationDirectionFill} />
                </>
              ) : null}
              <View style={styles.currentLocationDot} />
            </View>
          </Marker>
        ) : null}
        {routePlan ? (
          <>
            <Polyline
              coordinates={routePlan.route.coordinates}
              strokeColor={SAFE_ROUTE_DARK_ROUTE_CASING}
              strokeWidth={SAFE_ROUTE_ROUTE_CASING_WIDTH}
              lineCap="round"
              lineJoin="round"
            />
            <Polyline
              coordinates={routePlan.route.coordinates}
              strokeColor={SAFE_ROUTE_DARK_ROUTE_GLOW}
              strokeWidth={SAFE_ROUTE_ROUTE_GLOW_WIDTH}
              lineCap="round"
              lineJoin="round"
            />
            <Polyline
              coordinates={routePlan.route.coordinates}
              strokeColor={colors.routePrimary}
              strokeWidth={SAFE_ROUTE_ROUTE_CORE_WIDTH}
              lineCap="round"
              lineJoin="round"
            />
            {routePlan.checkpoints.filter((checkpoint) =>
              shouldRenderRouteCheckpointMarker({
                checkpoint,
                liveCoordinate,
                nativeUserLocationVisible:
                  permissionStatus === 'granted' && Boolean(liveCoordinate)
              })
            ).map((checkpoint) => (
              <Marker
                key={checkpoint.id}
                coordinate={checkpoint.coordinate}
                title={checkpoint.caption}
                description={checkpointKindLabel(checkpoint.kind)}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View
                  accessibilityLabel={`${checkpointKindLabel(checkpoint.kind)}: ${checkpoint.caption}`}
                  accessibilityRole="image"
                  style={styles.markerHitArea}
                >
                  <View
                    style={[
                      styles.marker,
                      checkpoint.kind === 'origin'
                        ? styles.markerOrigin
                        : checkpoint.kind === 'waypoint'
                          ? styles.markerWaypoint
                          : styles.markerDestination
                    ]}
                  >
                    <View style={styles.markerCore} />
                  </View>
                </View>
              </Marker>
            ))}
          </>
        ) : null}
        {mapAction ? (
          <Marker
            coordinate={mapAction.coordinate}
            anchor={{ x: 0.5, y: 0.5 }}
            accessibilityLabel="Selected map location"
          >
            <View style={[styles.marker, styles.markerSelected]}>
              <View style={styles.markerCore} />
            </View>
          </Marker>
        ) : null}
      </MapView>

      {selectedRiskZone ? (
        <LiveMapRiskDetailCallout
          mapRef={mapRef}
          zone={selectedRiskZone}
          onDismiss={() => setSelectedRiskZone(null)}
        />
      ) : null}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
        pointerEvents="box-none"
        style={styles.overlay}
      >
      <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.currentLocationControlDock,
            { bottom: currentLocationControlBottom }
          ]}
        >
          <Pressable
            accessibilityHint={
              mapReady && liveCoordinate
                ? 'Moves the map to your live device location.'
                : permissionStatus === 'denied'
                  ? 'Allow location access in Settings to use this control.'
                  : 'Wait for SafeRoute to determine your device location.'
            }
            accessibilityLabel={
              mapReady && liveCoordinate
                ? 'Center map on current location'
                : permissionStatus === 'denied'
                  ? 'Current location unavailable'
                  : 'Waiting for current location'
            }
            accessibilityRole="button"
            accessibilityState={{
              busy: permissionStatus === 'checking',
              disabled: !mapReady || !liveCoordinate
            }}
            disabled={!mapReady || !liveCoordinate}
            testID={uiTestIds.guestMapCurrentLocation}
            style={({ pressed }) => [
              styles.currentLocationButton,
              !mapReady || !liveCoordinate
                ? styles.currentLocationButtonDisabled
                : null,
              pressed && mapReady && liveCoordinate
                ? styles.currentLocationButtonPressed
                : null
            ]}
            onPress={handleCenterCurrentLocation}
          >
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.currentLocationGlyph}
            >
              <View style={styles.currentLocationGlyphRing} />
              <View style={styles.currentLocationGlyphHorizontal} />
              <View style={styles.currentLocationGlyphVertical} />
              <View style={styles.currentLocationGlyphDot} />
            </View>
          </Pressable>
        </Animated.View>

        <View
          style={[
            styles.topBar,
            workspaceNavigationNoticeInset > 0
              ? { marginTop: workspaceNavigationNoticeInset }
              : null,
          ]}
        >
          {networkChecking || offline ? (
            <View
              accessible
              accessibilityLabel={
                networkChecking
                  ? 'Checking connection. Map downloads are paused.'
                  : 'Offline map. Saved route information remains available.'
              }
              accessibilityRole="summary"
              style={styles.riskLoadStatus}
              testID={uiTestIds.guestMapNetworkStatus}
            >
              <Text numberOfLines={1} style={styles.riskLoadStatusText}>
                {networkChecking ? 'Checking connection…' : 'Offline map'}
              </Text>
            </View>
          ) : viewportRisk.loading || viewportRisk.errorMessage ? (
            <Pressable
              accessibilityLabel={viewportRisk.loading
                ? 'Risk areas are loading'
                : viewportRisk.coverageState === 'pending-timeout'
                  ? 'Check whether risk research finished'
                  : 'Retry loading risk areas'}
              accessibilityRole={viewportRisk.loading ? 'progressbar' : 'button'}
              disabled={viewportRisk.loading}
              testID={viewportRisk.loading ? uiTestIds.guestMapRiskLoadingStatus : undefined}
              style={styles.riskLoadStatus}
              onPress={viewportRisk.retry}
            >
              {viewportRisk.loading ? (
                <ActivityIndicator color={colors.appleBlue} size="small" />
              ) : null}
              <Text numberOfLines={1} style={styles.riskLoadStatusText}>
                {viewportRisk.loading
                  ? 'Loading risks…'
                  : viewportRisk.coverageState === 'pending-timeout'
                    ? 'Check risks'
                    : 'Retry risks'}
              </Text>
            </Pressable>
          ) : viewportRisk.coverageState === 'pending' ? (
            <View
              accessible
              accessibilityLabel={viewportRisk.statusMessage || 'Risk research is in progress.'}
              accessibilityLiveRegion="polite"
              accessibilityRole="summary"
              style={styles.riskLoadStatus}
            >
              <ActivityIndicator color={colors.appleBlue} size="small" />
              <Text numberOfLines={1} style={styles.riskLoadStatusText}>
                Researching risks…
              </Text>
            </View>
          ) : viewportRisk.researchAvailable ? (
            <Pressable
              accessibilityHint={
                viewportRisk.statusMessage
                || 'Requests updated SafeRoute intelligence for the visible bounded area.'
              }
              accessibilityLabel="Research this area for updated risk intelligence"
              accessibilityRole="button"
              testID={uiTestIds.guestMapRiskResearch}
              style={styles.riskLoadStatus}
              onPress={viewportRisk.research}
            >
              <Text numberOfLines={1} style={styles.riskLoadStatusText}>
                {viewportRisk.coverageState === 'current-empty'
                  ? 'No current risks · Research'
                  : viewportRisk.coverageState === 'current'
                    ? 'Risks current · Research'
                    : viewportRisk.coverageState === 'cached'
                      ? 'Cached risks · Research'
                      : 'Research risks'}
              </Text>
            </Pressable>
          ) : viewportRisk.statusMessage ? (
            <View
              accessible
              accessibilityLabel={viewportRisk.statusMessage}
              accessibilityLiveRegion="polite"
              accessibilityRole="summary"
              style={styles.riskLoadStatus}
            >
              <Text numberOfLines={1} style={styles.riskLoadStatusText}>
                {viewportRisk.coverageState === 'current-empty'
                  ? 'No current risks'
                  : viewportRisk.coverageState === 'cooldown'
                    ? 'Research cooling down'
                    : viewportRisk.coverageState === 'missing'
                      ? 'Coverage unavailable'
                      : 'Risk coverage ready'}
              </Text>
            </View>
          ) : <View />}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={mapHomeCopy.primaryActionAccessibilityLabel}
            testID={uiTestIds.guestMapPrimaryAction}
            style={({ pressed }) => [
              styles.signInButton,
              authenticated ? styles.signInButtonAuthenticated : null,
              pressed ? styles.signInButtonPressed : null
            ]}
            onPress={() => (authenticated ? onOpenFullAccessFeature('saved-routes') : onSignIn())}
          >
            <Text
              numberOfLines={1}
              style={styles.signInButtonText}
            >
              {mapHomeCopy.primaryActionLabel}
            </Text>
          </Pressable>
        </View>

        {mapAction ? (
          <View
            accessibilityLabel={`Map actions for ${mapAction.label}`}
            style={styles.mapActionMenu}
            testID={uiTestIds.guestMapLongPressMenu}
          >
            <View style={styles.mapActionCopy}>
              <Text numberOfLines={1} style={styles.mapActionTitle}>
                {mapAction.pending ? 'Locating…' : mapAction.label}
              </Text>
              <Text style={styles.mapActionSubtitle}>
                {mapSelectionSetsDestination
                  ? 'Use this point as your destination.'
                  : 'Add this point to the route.'}
              </Text>
            </View>
            <View style={styles.mapActionButtons}>
              <Pressable
                accessibilityLabel={mapSelectionSetsDestination
                  ? 'Use this location as the route destination'
                  : 'Add this location as a route stop'}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canAddMapRoutePoint }}
                disabled={!canAddMapRoutePoint}
                testID={uiTestIds.guestMapLongPressAddWaypoint}
                style={({ pressed }) => [
                  styles.mapActionButton,
                  pressed ? styles.mapActionButtonPressed : null
                ]}
                onPress={handleAddMapRoutePoint}
              >
                <Text style={styles.mapActionButtonText}>
                  {mapSelectionSetsDestination ? 'Set destination' : 'Add stop'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel={authenticated
                  ? networkChecking
                    ? 'Checking connection before adding a risk area'
                    : offline
                      ? 'Reconnect before adding a risk area'
                  : workspaceSelectionRequired
                    ? 'Choose a workspace before adding a risk area'
                    : workspaceAuthorizationRequired
                      ? 'Verify current workspace access before adding a risk area'
                    : 'Add a risk area here'
                  : 'Sign in to add a risk area'}
                accessibilityRole="button"
                accessibilityState={{ disabled: riskAreaSavePending || riskAreaAuthorizationRequired }}
                disabled={riskAreaSavePending || riskAreaAuthorizationRequired}
                testID={uiTestIds.guestMapLongPressAddRisk}
                style={({ pressed }) => [
                  styles.mapActionButton,
                  pressed ? styles.mapActionButtonPressed : null
                ]}
                onPress={() => void handleAddMapRiskArea()}
              >
                <Text style={styles.mapActionButtonText}>
                  {riskAreaSavePending ? 'Adding…' : 'Add risk area'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Close map actions"
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.mapActionButton,
                  pressed ? styles.mapActionButtonPressed : null
                ]}
                onPress={() => setMapAction(null)}
              >
                <Text style={styles.mapActionButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View pointerEvents="box-none" style={styles.sheetDock}>
          <Animated.View
            accessibilityElementsHidden={sheetCollapsed}
            importantForAccessibility={sheetCollapsed ? 'no-hide-descendants' : 'auto'}
            pointerEvents={sheetCollapsed ? 'none' : 'auto'}
            style={[
              styles.sheet,
              {
                opacity: sheetProgress.interpolate({
                  inputRange: [0, 0.72, 1],
                  outputRange: [1, 0.3, 0]
                }),
                transform: [{
                  translateY: sheetProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 620]
                  })
                }]
              }
            ]}
            onLayout={({ nativeEvent }) => {
              const measuredHeight = Math.ceil(nativeEvent.layout.height);
              setRouteSheetHeight((currentHeight) =>
                currentHeight === measuredHeight ? currentHeight : measuredHeight
              );
            }}
          >
            <View
              accessibilityLabel="Swipe down to minimize route planning"
              accessibilityRole="adjustable"
              style={styles.sheetGrabberTouch}
              testID={uiTestIds.guestMapSheetGrabber}
              {...sheetPanResponder.panHandlers}
            >
              <View style={styles.sheetGrabber} />
            </View>
            <ScrollView
              bounces={false}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={[styles.sheetScroll, { maxHeight: routeSheetMaxHeight }]}
            >
              <View style={styles.sheetHeaderRow}>
                <View style={styles.sheetTitleBlock}>
                  <Text numberOfLines={1} style={styles.sheetTitle}>{mapHomeCopy.sheetTitle}</Text>
                  {showSheetSubtitle ? (
                    <Text numberOfLines={1} style={styles.sheetSubtitle}>{mapHomeCopy.sheetSubtitle}</Text>
                  ) : null}
                </View>
                {routePlan ? (
                  <RoutePreview authenticated={authenticated} inline routePlan={routePlan} />
                ) : null}
              </View>

              {authenticated ? (
                <>
                  <GuestWorkspaceSelector
                    activeWorkspace={activeWorkspace}
                    errorMessage={workspaceCatalogError}
                    loading={workspaceCatalogLoading}
                    menuOpen={workspaceMenuOpen}
                    workspaces={availableWorkspaces}
                    onRetry={onRetryWorkspaceCatalog}
                    onSelect={handleWorkspaceChange}
                    onToggle={() => {
                      Keyboard.dismiss();
                      setActiveInput(null);
                      setWorkspaceMenuOpen((open) => !open);
                    }}
                    sharedRetryAvailable={workspaceAccessRefreshAvailable}
                    alternativeSelectionPending={
                      workspaceAlternativeSelectionPending
                    }
                    changeEndsNavigation={workspaceChangeEndsNavigation}
                    switchDisabled={workspaceSwitchDisabled}
                    switchFailure={workspaceSwitchFailure}
                    selectionFailed={workspaceSelectionFailed}
                    selectionPending={workspaceSelectionPending}
                    focusTargetRef={handleWorkspaceAccessFocusTarget}
                  />
                  {workspaceAccessRefreshAvailable ? (
                    <WorkspaceAccessRefreshControl
                    accessRecoveryPending={workspaceAccessRecoveryPending}
                    availableWorkspaceCount={availableWorkspaces.length}
                    catalogStoredAtMs={
                      workspaceAuthorizationFresh
                        ? null
                        : workspaceCatalogStoredAtMs
                    }
                    issue={workspaceAccessIssue}
                      loading={workspaceCatalogLoading}
                      onRefresh={() => {
                        setWorkspaceMenuOpen(false);
                        onRetryWorkspaceCatalog?.();
                      }}
                    />
                  ) : null}
                </>
              ) : null}

              <View style={styles.inputStack}>
                <RouteInput
                  divided
                  accessibilityHint={originInputCopy.accessibilityHint}
                  label={originInputCopy.accessibilityLabel}
                  placeholder={originInputCopy.placeholder}
                  testID={uiTestIds.guestMapOriginInput}
                  value={origin}
                  inputRef={(input) => {
                    if (input) {
                      routeInputRefs.current.set(GUEST_ROUTE_DRAFT_ORIGIN_ID, input);
                    } else {
                      routeInputRefs.current.delete(GUEST_ROUTE_DRAFT_ORIGIN_ID);
                    }
                  }}
                  onChangeText={handleOriginChange}
                  onFocus={() => setActiveInput(GUEST_ROUTE_DRAFT_ORIGIN_ID)}
                />
                {routeDraft.waypoints.map((waypoint, index) => (
                  <WaypointInput
                    key={waypoint.id}
                    divided
                    canMoveDown={index < routeDraft.waypoints.length - 1}
                    canMoveUp={index > 0}
                    index={index}
                    stopId={waypoint.id}
                    value={waypoint.label}
                    inputRef={(input) => {
                      if (input) {
                        routeInputRefs.current.set(waypoint.id, input);
                      } else {
                        routeInputRefs.current.delete(waypoint.id);
                      }
                    }}
                    onChangeText={(value) => handleStopChange(waypoint.id, value)}
                    onFocus={() => setActiveInput(waypoint.id)}
                    onMove={(toIndex) => handleReorderWaypoint(waypoint.id, toIndex)}
                    onRemove={() => handleRemoveWaypoint(waypoint.id)}
                  />
                ))}
                <RouteInput
                  accessibilityHint={destinationInputCopy.accessibilityHint}
                  label={destinationInputCopy.accessibilityLabel}
                  placeholder={destinationInputCopy.placeholder}
                  testID={uiTestIds.guestMapDestinationInput}
                  value={destination}
                  inputRef={(input) => {
                    if (input) {
                      routeInputRefs.current.set(GUEST_ROUTE_DRAFT_DESTINATION_ID, input);
                    } else {
                      routeInputRefs.current.delete(GUEST_ROUTE_DRAFT_DESTINATION_ID);
                    }
                  }}
                  onChangeText={handleDestinationChange}
                  onFocus={() => setActiveInput(GUEST_ROUTE_DRAFT_DESTINATION_ID)}
                  onSubmitEditing={routePlan ? handleOpenPreview : () => void handlePlotRoute()}
                />
              </View>

              {activeInput ? (
                <LocationSearchResults
                  message={locationSearchMessage}
                  pending={locationSearchPending}
                  results={locationSearchResults}
                  onSelect={handleSelectLocation}
                />
              ) : null}

              <Pressable
                accessibilityLabel="Add another stop"
                accessibilityRole="button"
                accessibilityState={{ disabled: !canAddGuestRouteWaypoint(routeDraft) }}
                disabled={!canAddGuestRouteWaypoint(routeDraft)}
                testID={uiTestIds.guestMapAddWaypoint}
                style={({ pressed }) => [
                  styles.addStopButton,
                  pressed ? styles.addStopButtonPressed : null
                ]}
                onPress={handleAddWaypoint}
              >
                <Text style={styles.addStopButtonText}>Add stop</Text>
              </Pressable>

              {routeMessage || sessionNoticeState || (locationErrorMessage && isCurrentLocationLabel(origin)) ? (
                <Text
                  accessibilityLabel={
                    !routeMessage && sessionNoticeState?.accessibilityLabel
                      ? sessionNoticeState.accessibilityLabel
                      : undefined
                  }
                  accessibilityRole={
                    routeMessage || !sessionNoticeState
                      ? 'alert'
                      : sessionNoticeState.accessibilityRole
                  }
                  style={styles.routeMessage}
                >
                  {routeMessage || sessionNoticeState?.message || locationErrorMessage}
                </Text>
              ) : null}

              <Pressable
                accessibilityHint={routeActionAccessibilityHint}
                accessibilityLabel={routeActionAccessibilityLabel}
                accessibilityRole="button"
                accessibilityState={{
                  busy: workspaceAuthorizationRequired && workspaceCatalogLoading,
                  disabled: routeActionDisabled,
                }}
                disabled={routeActionDisabled}
                testID={uiTestIds.guestMapPlotAction}
                style={({ pressed }) => [
                  styles.primaryButton,
                  routeActionDisabled ? styles.primaryButtonDisabled : null,
                  pressed && !routeActionDisabled ? styles.primaryButtonPressed : null
                ]}
                onPress={routePlan ? handleOpenPreview : () => void handlePlotRoute()}
              >
                <Text numberOfLines={1} style={styles.primaryButtonText}>{routeActionLabel}</Text>
              </Pressable>

              {gateFeatures.length ? (
                <View style={styles.supportRow}>
                  {gateFeatures.map((feature) => (
                    <SupportButton
                      key={feature}
                      authenticated={authenticated}
                      feature={feature}
                      onPress={onOpenFullAccessFeature}
                    />
                  ))}
                </View>
              ) : null}
            </ScrollView>
          </Animated.View>

          <Animated.View
            accessibilityElementsHidden={!sheetCollapsed}
            importantForAccessibility={sheetCollapsed ? 'auto' : 'no-hide-descendants'}
            pointerEvents={sheetCollapsed ? 'auto' : 'none'}
            style={[
              styles.collapsedSheet,
              {
                opacity: sheetProgress.interpolate({
                  inputRange: [0, 0.35, 1],
                  outputRange: [0, 0, 1]
                }),
                transform: [{
                  translateY: sheetProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [18, 0]
                  })
                }]
              }
            ]}
          >
            <Pressable
              accessibilityHint="Opens route planning, focuses the next stop, and shows the keyboard."
              accessibilityLabel="Search for the next stop"
              accessibilityRole="button"
              testID={uiTestIds.guestMapCollapsedSheet}
              style={({ pressed }) => [
                styles.collapsedSheetButton,
                pressed ? styles.collapsedSheetPressed : null
              ]}
              onPress={handleCollapsedLocationSearch}
            >
              <View style={styles.collapsedSheetCopy}>
                <Text numberOfLines={1} style={styles.collapsedSheetTitle}>
                  Search for a location
                </Text>
                <Text numberOfLines={1} style={styles.collapsedSheetSubtitle}>
                  {destination
                    ? `Current route to ${destination}`
                    : `From ${origin || 'current location'}`}
                </Text>
              </View>
            </Pressable>
          </Animated.View>
        </View>
      </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

function GuestWorkspaceSelector({
  activeWorkspace,
  alternativeSelectionPending,
  changeEndsNavigation,
  errorMessage,
  focusTargetRef,
  loading,
  menuOpen,
  onRetry,
  onSelect,
  onToggle,
  sharedRetryAvailable,
  selectionFailed,
  selectionPending,
  switchDisabled,
  switchFailure,
  workspaces
}: {
  activeWorkspace: SafeRouteWorkspace | null;
  alternativeSelectionPending: boolean;
  changeEndsNavigation: boolean;
  errorMessage: string;
  focusTargetRef?: (target: View | null) => void;
  loading: boolean;
  menuOpen: boolean;
  onRetry?: () => void;
  onSelect: (workspace: SafeRouteWorkspace) => void;
  onToggle: () => void;
  sharedRetryAvailable: boolean;
  selectionFailed: boolean;
  selectionPending: boolean;
  switchDisabled: boolean;
  switchFailure: boolean;
  workspaces: SafeRouteWorkspace[];
}) {
  const waitingForCatalog = loading && !workspaces.length;
  const catalogUnavailable = Boolean(errorMessage) && !workspaces.length;
  const retryAvailable =
    !switchFailure &&
    !sharedRetryAvailable &&
    !loading && Boolean(onRetry && errorMessage) && (catalogUnavailable || switchDisabled);
  const switchingDisabled = switchDisabled || selectionPending || loading;
  const disabled = retryAvailable
    ? false
    : switchingDisabled ||
      waitingForCatalog ||
      (sharedRetryAvailable && catalogUnavailable) ||
      (!errorMessage && !workspaces.length);
  const value = activeWorkspace?.name || (workspaces.length
    ? 'Choose workspace'
    : loading
      ? 'Loading…'
      : errorMessage ? 'Unavailable' : 'No workspace');
  const action = retryAvailable
    ? 'Retry'
    : switchFailure
      ? 'Cleanup needed'
      : loading
        ? 'Checking…'
      : alternativeSelectionPending
        ? menuOpen ? 'Close' : 'Choose'
      : selectionFailed
        ? 'Try again'
      : selectionPending
        ? 'Saving…'
      : switchDisabled
        ? 'Finishing…'
        : catalogUnavailable
          ? (sharedRetryAvailable ? 'Check below' : 'Retry')
          : menuOpen ? 'Close' : errorMessage ? 'Verify' : 'Change';

  return (
    <View style={styles.workspacePicker}>
      <Pressable
        ref={focusTargetRef}
        accessibilityHint={retryAvailable
          ? 'Retries loading your SafeRoute workspaces.'
          : sharedRetryAvailable && catalogUnavailable
            ? 'Use the workspace access control below to check current access.'
            : switchFailure
              ? 'Retry guidance cleanup before changing workspace.'
              : loading
                ? 'Wait while SafeRoute verifies workspace access.'
              : alternativeSelectionPending
                ? menuOpen
                  ? 'Closes the workspace menu.'
                  : 'Opens the workspace menu to choose another workspace. Selecting the current workspace keeps it.'
              : selectionFailed
                ? 'Opens the workspace menu to choose the workspace again.'
              : selectionPending
                ? 'Wait while the workspace choice is saved.'
              : switchDisabled
                ? 'Finish guidance cleanup before changing workspace.'
                : changeEndsNavigation
                  ? 'Opens the workspace menu. Choosing another workspace asks before ending active guidance.'
                  : 'Opens the active workspace menu.'}
        accessibilityLabel={`Workspace, ${value}`}
        accessibilityRole={waitingForCatalog ? "progressbar" : "button"}
        accessibilityState={{
          busy: loading || selectionPending || (switchDisabled && !switchFailure),
          disabled,
          expanded: menuOpen,
        }}
        disabled={disabled}
        testID={uiTestIds.guestMapWorkspaceSelector}
        style={({ pressed }) => [
          styles.workspaceSelector,
          menuOpen ? styles.workspaceSelectorOpen : null,
          pressed ? styles.workspaceSelectorPressed : null
        ]}
        onPress={retryAvailable ? onRetry : onToggle}
      >
        <View style={styles.workspaceSelectorCopy}>
          <Text numberOfLines={1} style={styles.workspaceSelectorLabel}>Workspace</Text>
          <Text numberOfLines={1} style={styles.workspaceSelectorValue}>{value}</Text>
        </View>
        {(loading || errorMessage || workspaces.length) ? (
          <Text numberOfLines={1} style={styles.workspaceSelectorAction}>{action}</Text>
        ) : null}
      </Pressable>

      {menuOpen && workspaces.length > 0 && !switchingDisabled ? (
        <ScrollView
          nestedScrollEnabled
          contentContainerStyle={styles.workspaceMenuContent}
          showsVerticalScrollIndicator={false}
          style={styles.workspaceMenu}
        >
          {workspaces.map((workspace) => {
            const selected = activeWorkspace?.id === workspace.id;
            return (
              <Pressable
                key={workspace.id}
                accessibilityHint={changeEndsNavigation && !selected
                  ? `Asks to end active guidance before changing to ${workspace.name}.`
                  : `Uses ${workspace.name} for routes and risk intelligence.`}
                accessibilityLabel={`Use workspace ${workspace.name}${selected ? ', selected' : ''}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                testID={uiTestIds.guestMapWorkspaceOption(workspace.id)}
                style={({ pressed }) => [
                  styles.workspaceMenuItem,
                  selected ? styles.workspaceMenuItemSelected : null,
                  pressed ? styles.workspaceMenuItemPressed : null
                ]}
                onPress={() => onSelect(workspace)}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.workspaceMenuItemText,
                    selected ? styles.workspaceMenuItemTextSelected : null
                  ]}
                >
                  {workspace.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

function resolveRoadPreviewStops(routePlan: SavedSafeRoutePlan) {
  const checkpointCoordinates = routePlan.checkpoints.map((checkpoint) => checkpoint.coordinate);
  if (checkpointCoordinates.length >= 2) {
    return checkpointCoordinates;
  }

  const coordinates = resolveGuestRoadPreviewStops(routePlan.destination);
  const origin = coordinates[0];
  const destination = coordinates[coordinates.length - 1];

  if (!origin || !destination) {
    return null;
  }

  return coordinates;
}

function RouteInput({
  accessibilityHint,
  label,
  inputRef,
  onChangeText,
  onFocus,
  onSubmitEditing,
  placeholder,
  testID,
  value,
  divided = false
}: {
  accessibilityHint: string;
  divided?: boolean;
  label: string;
  inputRef?: (input: TextInput | null) => void;
  onChangeText: (value: string) => void;
  onFocus?: () => void;
  onSubmitEditing?: () => void;
  placeholder: string;
  testID: string;
  value: string;
}) {
  return (
    <View style={[styles.inputRow, divided ? styles.inputRowDivider : null]}>
      <TextInput
        ref={inputRef}
        accessibilityHint={accessibilityHint}
        accessibilityLabel={label}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={GUEST_ROUTE_LABEL_MAX_LENGTH}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        returnKeyType={onSubmitEditing ? 'done' : 'default'}
        style={styles.input}
        submitBehavior={onSubmitEditing ? 'blurAndSubmit' : 'blurAndSubmit'}
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onSubmitEditing={onSubmitEditing}
      />
    </View>
  );
}

function WaypointInput({
  canMoveDown,
  canMoveUp,
  divided,
  index,
  inputRef,
  onChangeText,
  onFocus,
  onMove,
  onRemove,
  stopId,
  value
}: {
  canMoveDown: boolean;
  canMoveUp: boolean;
  divided?: boolean;
  index: number;
  inputRef?: (input: TextInput | null) => void;
  onChangeText: (value: string) => void;
  onFocus: () => void;
  onMove: (toIndex: number) => void;
  onRemove: () => void;
  stopId: string;
  value: string;
}) {
  return (
    <View style={[styles.waypointRow, divided ? styles.inputRowDivider : null]}>
      <TextInput
        ref={inputRef}
        accessibilityHint="Enter a place, address, or coordinate for this stop."
        accessibilityLabel={`Stop ${index + 1}`}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={GUEST_ROUTE_LABEL_MAX_LENGTH}
        placeholder={`Stop ${index + 1}`}
        placeholderTextColor={colors.muted}
        returnKeyType="next"
        style={styles.input}
        submitBehavior="blurAndSubmit"
        testID={uiTestIds.guestMapWaypointInput(stopId)}
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
      />
      <View style={styles.waypointActions}>
        {canMoveUp ? (
          <Pressable
            accessibilityLabel={`Move stop ${index + 1} earlier`}
            accessibilityRole="button"
            hitSlop={GUEST_WAYPOINT_ACTION_HIT_SLOP}
            style={({ pressed }) => [
              styles.waypointAction,
              pressed ? styles.waypointActionPressed : null
            ]}
            onPress={() => onMove(index - 1)}
          >
            <Text numberOfLines={1} style={styles.waypointActionText}>Earlier</Text>
          </Pressable>
        ) : null}
        {canMoveDown ? (
          <Pressable
            accessibilityLabel={`Move stop ${index + 1} later`}
            accessibilityRole="button"
            hitSlop={GUEST_WAYPOINT_ACTION_HIT_SLOP}
            style={({ pressed }) => [
              styles.waypointAction,
              pressed ? styles.waypointActionPressed : null
            ]}
            onPress={() => onMove(index + 1)}
          >
            <Text numberOfLines={1} style={styles.waypointActionText}>Later</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel={`Remove stop ${index + 1}`}
          accessibilityRole="button"
          hitSlop={GUEST_WAYPOINT_ACTION_HIT_SLOP}
          style={({ pressed }) => [
            styles.waypointAction,
            pressed ? styles.waypointActionPressed : null
          ]}
          onPress={onRemove}
        >
          <Text numberOfLines={1} style={styles.waypointRemoveText}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

function LocationSearchResults({
  message,
  onSelect,
  pending,
  results
}: {
  message: string;
  onSelect: (result: GuestLocationSearchResult) => void;
  pending: boolean;
  results: GuestLocationSearchResult[];
}) {
  if (!pending && !message && !results.length) {
    return null;
  }

  return (
    <View style={styles.searchResults} testID={uiTestIds.guestMapSearchResults}>
      {pending ? (
        <View
          accessible
          accessibilityLabel="Searching nearby places"
          accessibilityRole="progressbar"
          style={styles.searchStateRow}
        >
          <ActivityIndicator color={colors.appleBlue} size="small" />
          <Text style={styles.searchStateText}>Searching nearby…</Text>
        </View>
      ) : null}
      {!pending ? results.map((result) => (
        <Pressable
          key={result.id}
          accessibilityHint="Selects this place for the active route field."
          accessibilityLabel={result.displayName}
          accessibilityRole="button"
          testID={uiTestIds.guestMapSearchResult(result.id)}
          style={({ pressed }) => [
            styles.searchResultRow,
            pressed ? styles.searchResultRowPressed : null
          ]}
          onPress={() => onSelect(result)}
        >
          <Text numberOfLines={1} style={styles.searchResultTitle}>{result.label}</Text>
          <Text numberOfLines={1} style={styles.searchResultSubtitle}>{result.displayName}</Text>
        </Pressable>
      )) : null}
      {!pending && message ? (
        <Text accessible accessibilityLiveRegion="polite" style={styles.searchStateText}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

function isCurrentLocationLabel(value: string): boolean {
  return value.trim().toLowerCase() === 'current location';
}

function hasAdjacentDuplicateStops(coordinates: LatLng[]): boolean {
  return coordinates.slice(1).some((coordinate, index) =>
    coordinatesMatch(coordinate, coordinates[index], 0.00002)
  );
}

function coordinatesMatch(
  left: LatLng,
  right: LatLng,
  tolerance = 0.000001
): boolean {
  return Math.abs(left.latitude - right.latitude) <= tolerance &&
    Math.abs(left.longitude - right.longitude) <= tolerance;
}

function formatCoordinateLabel(coordinate: LatLng): string {
  return `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`;
}

function checkpointKindLabel(kind: 'origin' | 'waypoint' | 'destination'): string {
  if (kind === 'origin') {
    return 'Route start';
  }
  return kind === 'waypoint' ? 'Route stop' : 'Destination';
}

function regionAroundCoordinate(coordinate: LatLng): Region {
  return {
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    latitudeDelta: 0.045,
    longitudeDelta: 0.055
  };
}

function RoutePreview({
  authenticated,
  inline = false,
  routePlan
}: {
  authenticated: boolean;
  inline?: boolean;
  routePlan: SavedSafeRoutePlan;
}) {
  const previewState = createGuestRoutePreviewState(routePlan, {
    authenticated
  });

  return (
    <View
      accessible
      accessibilityLabel={previewState.accessibilityLabel}
      testID={uiTestIds.guestMapRoutePreview}
      style={[styles.routePreview, inline ? styles.routePreviewInline : null]}
    >
      <Text numberOfLines={1} style={styles.routePreviewSummary}>
        {previewState.summaryLabel}
      </Text>
    </View>
  );
}

function SupportButton({
  authenticated,
  feature,
  onPress
}: {
  authenticated: boolean;
  feature: GuestFullAccessFeature;
  onPress: (feature: GuestFullAccessFeature) => void;
}) {
  const copy = getGuestFullAccessCopy(feature);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={authenticated ? `Open ${copy.title}` : copy.action}
      accessibilityHint={authenticated ? 'Opens authenticated SafeRoute functionality.' : copy.body}
      testID={uiTestIds.guestMapGateAction(feature)}
      style={({ pressed }) => [styles.supportButton, pressed ? styles.supportButtonPressed : null]}
      onPress={() => onPress(feature)}
    >
      <Text numberOfLines={1} style={styles.supportLabel}>{copy.title}</Text>
    </Pressable>
  );
}
