import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  Bike,
  BriefcaseBusiness,
  CarFront,
  ChevronDown,
  ChevronUp,
  Clock3,
  Crosshair,
  Ellipsis,
  Globe2,
  House,
  Map as MapIcon,
  MapPin,
  Navigation,
  PersonStanding,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  UserRound,
} from 'lucide-react-native';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from 'react-native';
import {
  BottomSheetScrollView,
  BottomSheetTextInput,
  type BottomSheetHandleProps,
  type BottomSheetScrollViewMethods,
} from '@gorhom/bottom-sheet';
import MapView, {
  Marker,
  Polyline,
  type LatLng,
  type MapPressEvent,
  type Region,
} from 'react-native-maps';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { LUNARCHAIN_API_BASE, SAFEROUTE_PREVIEW_MODE_ENABLED } from '../../config/env';
import {
  configureNextSafeRouteLayoutAnimation,
  MotionEntrance,
  safeRouteMotion,
  useReduceMotionEnabled,
} from '../../motion/SafeRouteMotion';
import { chrome, colors, spacing } from '../../theme';
import {
  SafeRouteBottomSheet,
  type SafeRouteBottomSheetRef,
} from '../../components/SafeRouteBottomSheet';
import { uiTestIds } from '../../testing/uiTestIds';
import type {
  RouteCheckpoint,
  SafeRouteTravelMode,
  SavedSafeRoutePlan,
} from '../live-map/liveMapTypes';
import type { RiskZone } from '../live-map/liveMapTypes';
import {
  CheckpointMarker,
  RiskOverlay,
  SupportFacilityMarker,
} from '../live-map/LiveMapMarkers';
import {
  LiveMapDetailContent,
  LiveMapRiskDetailContent,
} from '../live-map/LiveMapRiskDetailCallout';
import { useViewportRiskAreas } from '../live-map/useViewportRiskAreas';
import { invalidateWorkspaceRiskAreaCache } from '../live-map/workspaceRiskAreaApi';
import {
  areaRiskItemIntersectsBounds,
  mergeRiskZonesById,
} from '../live-map/areaRiskApiCore';
import { withLiveReroutePreferences } from '../live-map/liveReroutePlan';
import { useLiveLocation } from '../live-map/useLiveLocation';
import {
  SAFE_ROUTE_CAMERA_ZOOM_RANGE,
  SAFE_ROUTE_DARK_MAP_STYLE,
  SAFE_ROUTE_ROUTE_CORE_WIDTH,
} from '../maps/safeRouteMapTheme';
import { shouldRenderRouteCheckpointMarker } from '../maps/mapMarkerPresentation';
import { SafeRouteDarkMapMask } from '../maps/SafeRouteDarkMapMask';
import { isPreviewAccessToken } from '../auth/previewSession';
import { createSessionNoticeState } from '../auth/sessionNoticeState';
import {
  resolveSafeRouteMapInterfaceStyle,
  resolveSafeRouteMapType,
} from '../api/mapTransportState';
import { useNetworkAvailability } from '../api/useNetworkAvailability';
import { getRequestSessionExpiry } from '../api/sessionExpiry';
import { ApiRequestError } from '../api/apiClient';
import type { SafeRouteWorkspace } from '../workspaces/activeWorkspace';
import { getRequestUnavailableWorkspaceId } from '../workspaces/workspaceAccessRecovery';
import { isCurrentWorkspaceAuthorizationEpoch } from '../workspaces/workspaceForegroundRevalidation';
import { WorkspaceAccessRefreshControl } from '../workspaces/WorkspaceAccessRefreshControl';
import type { WorkspaceAccessIssue } from '../workspaces/workspaceAccessRefreshState';
import {
  persistentPlacesStore,
  type PersistentPlaceInput,
  type PersistentPlacesRecord,
  type PersistentRecentDestination,
  type PersistentSavedPlace,
} from '../places/persistentPlacesStore';
import {
  GUEST_MAP_REGION,
  GUEST_ROUTE_LABEL_MAX_LENGTH,
  createGuestMapHomeCopy,
  createGuestRouteActionState,
  createGuestRouteInputCopy,
  createGuestRoutePlanId,
  createGuestRoutePlan,
  createGuestRoutePreviewState,
  resolveGuestCollapsedRouteCardState,
  resolveGuestRoadPreviewStops,
  type GuestFullAccessFeature
} from './guestRoutePlanner';
import {
  type GuestRoadRoutePreviewOptions,
  type ProvisionalSafeRoutePreview,
  type VerifiedSafeRoutePreview,
} from './guestRoadRouteProvider';
import {
  fetchSafeRouteRoadRoutePreview,
  invalidateSafeRoutePreviewCache,
} from './safeRouteRoadRouteProvider';
import { fetchRouteSupportFacilities } from './safeRouteSupportFacilitiesApi';
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
  mapGuestRouteDraftToResolvedCheckpoints,
  resolveGuestRouteDraftNextStopInputId,
  resolveGuestRouteDraftStopCoordinate,
  setGuestRouteCurrentLocation,
  shouldUseGuestMapSelectionAsDestination,
  type GuestRouteDraft,
} from './guestRouteDraft';
import { guestMapStyles as styles } from './GuestMapScreen.styles';
import { createGuestRiskArea } from './guestRiskAreaApi';
import {
  shouldRecenterGuestMap,
  type GuestMapCenteredLocation
} from './guestMapLocation';
import { createGuestMapRiskSummary } from './guestMapRiskSummary';
import {
  createGuestMapSheetLayout,
  regionForGuestSelectedLocation,
  resolveGuestRouteFitBottomPadding,
  resolveGuestRouteSheetBottomPadding,
} from './guestMapSheetLayout';
import {
  GUEST_TRAVEL_MODE_OPTIONS,
  getGuestTravelModeRouteLabel,
  type GuestTravelModeOption,
} from './guestTravelMode';
import { createGuestMapRouteRenderSession } from './guestMapRoutePresentation';
import {
  countEnabledSafeRoutePreferences,
  DEFAULT_SAFE_ROUTE_PREFERENCES,
  SAFE_ROUTE_PREFERENCE_OPTIONS,
  type SafeRouteRoutePreferences,
} from './routePreferences';
import { routePreferencesStore } from './routePreferencesStore';
import {
  resolveMapPolylineAtCoordinate,
  resolveRiskMapTapToleranceMeters,
  resolveRiskZoneAtMapCoordinate,
} from '../live-map/mapRiskInteraction';

const GUEST_LOCATION_SEARCH_DEBOUNCE_MS = 320;
const GUEST_LOCATION_SEARCH_MIN_LENGTH = 2;
const GUEST_WAYPOINT_ACTION_HIT_SLOP = 6;
const GUEST_MAP_MAX_RENDERED_RISK_ZONES = 80;
const GUEST_MAP_MAX_ROUTE_COORDINATES = 1200;
const GUEST_MAP_MAX_ROUTE_FIT_COORDINATES = 420;
const GUEST_PROVISIONAL_ROUTE_MESSAGE =
  'Road route found. Risk coverage is still being verified before the route can be shown or started.';
const GUEST_MAP_ALTERNATIVE_ROUTE_COLORS = [
  'rgba(91, 174, 255, 0.88)',
  'rgba(111, 132, 186, 0.88)',
] as const;

type GuestRoadRoutePreviewFetcher = (
  options: GuestRoadRoutePreviewOptions
) => Promise<VerifiedSafeRoutePreview | null>;

type LocationSearchShortcut = {
  id: string;
  kind: 'home' | 'work' | 'favourite' | 'recent';
  result: GuestLocationSearchResult;
};

export interface GuestRoutePreviewReturnState {
  routeAlternatives: SavedSafeRoutePlan[];
  routeDraft: GuestRouteDraft;
  routePlan: SavedSafeRoutePlan;
  travelMode: SafeRouteTravelMode;
}

interface GuestMapScreenProps {
  accessToken?: string | null;
  activeWorkspace?: SafeRouteWorkspace | null;
  authenticated: boolean;
  availableWorkspaces?: SafeRouteWorkspace[];
  initialRouteState?: GuestRoutePreviewReturnState | null;
  mapLayer?: 'dark' | 'satellite';
  onMapLayerChange?: (layer: 'dark' | 'satellite') => void;
  onMapModalVisibilityChange?: (open: boolean) => void;
  onOpenFullAccessFeature: (feature: GuestFullAccessFeature) => void;
  onPlannerVisibilityChange?: (open: boolean) => void;
  onOpenRoutePreview?: (
    routePlan: SavedSafeRoutePlan,
    returnState: GuestRoutePreviewReturnState,
  ) => void;
  placesScopeId?: string | null;
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

function RouteSheetHandle({
  hidden,
}: BottomSheetHandleProps & { hidden: boolean }) {
  return (
    <View
      accessibilityElementsHidden={hidden}
      accessibilityHint="Swipes down to return to location search."
      accessibilityLabel="Swipe down to minimize this panel"
      accessibilityRole="adjustable"
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      style={styles.sheetGrabberTouch}
      testID={uiTestIds.guestMapSheetGrabber}
    >
      {hidden ? null : <View style={styles.sheetGrabber} />}
    </View>
  );
}

export function GuestMapScreen({
  accessToken,
  activeWorkspace = null,
  authenticated,
  availableWorkspaces = [],
  initialRouteState = null,
  mapLayer = 'dark',
  onMapLayerChange,
  onMapModalVisibilityChange,
  onOpenFullAccessFeature,
  onPlannerVisibilityChange,
  onOpenRoutePreview,
  placesScopeId,
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
  const safeAreaInsets = useSafeAreaInsets();
  const reduceMotionEnabled = useReduceMotionEnabled();
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
  const lastRiskZonePressAtMsRef = useRef(0);
  const activeRoadRouteRequestRef = useRef<AbortController | null>(null);
  const activeRoadRouteWorkspaceIdRef = useRef<string | null>(null);
  const provisionalRoutePlanIdRef = useRef<string | null>(null);
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
  const routePreviewHandoffResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roadRouteRequestIdRef = useRef(0);
  const riskAreaRequestIdRef = useRef(0);
  const workspaceAuthorizationEpochRef = useRef(0);
  const workspaceAuthorizationFreshRef = useRef(workspaceAuthorizationFresh);
  if (workspaceAuthorizationFreshRef.current !== workspaceAuthorizationFresh) {
    workspaceAuthorizationFreshRef.current = workspaceAuthorizationFresh;
    workspaceAuthorizationEpochRef.current += 1;
  }
  const routeSheetRef = useRef<SafeRouteBottomSheetRef | null>(null);
  const routeSheetScrollRef = useRef<BottomSheetScrollViewMethods | null>(null);
  const pendingRouteSheetCompletionRef = useRef<{
    collapsed: boolean;
    callback?: () => void;
  } | null>(null);
  const routeInputRefs = useRef(new Map<string, TextInput>());
  const riskDetailScrollOffsetRef = useRef(0);
  const riskDetailTouchStartYRef = useRef<number | null>(null);
  const pendingInputFocusFrameRef = useRef<number | null>(null);
  const locationSearchOwnerRef = useRef<string | null>(null);
  const [routeDraft, dispatchRouteDraft] = useReducer(
    guestRouteDraftReducer,
    undefined,
    () => initialRouteState?.routeDraft || createGuestRouteDraft()
  );
  const [activeInput, setActiveInput] = useState<string | null>(null);
  const [locationSearchResults, setLocationSearchResults] = useState<GuestLocationSearchResult[]>([]);
  const [locationSearchResultsQuery, setLocationSearchResultsQuery] = useState('');
  const [locationSearchPending, setLocationSearchPending] = useState(false);
  const [locationSearchMessage, setLocationSearchMessage] = useState('');
  const [persistentPlaces, setPersistentPlaces] = useState<PersistentPlacesRecord | null>(null);
  const [sheetCollapsed, setSheetCollapsed] = useState(true);
  const [sheetAtAnchor, setSheetAtAnchor] = useState(true);
  const [mapSheetIndex, setMapSheetIndex] = useState(0);
  const routeSheetAnimatedIndex = useSharedValue(0);
  const renderRouteSheetHandle = useCallback(
    (props: BottomSheetHandleProps) => (
      <RouteSheetHandle {...props} hidden={sheetAtAnchor} />
    ),
    [sheetAtAnchor],
  );
  const animateNextMapLayout = (
    duration: number = safeRouteMotion.scrimDurationMs,
    options?: {
      animateCreate?: boolean;
      animateDelete?: boolean;
    },
  ) => {
    if (!reduceMotionEnabled) {
      configureNextSafeRouteLayoutAnimation(duration, options);
    }
  };
  const transitionActiveInput = (nextInput: string | null) => {
    setActiveInput(nextInput);
  };
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
  const [readyMapSessionKey, setReadyMapSessionKey] = useState<string | null>(null);
  const [mapRegion, setMapRegion] = useState<Region>(GUEST_MAP_REGION);
  const [routeMessage, setRouteMessage] = useState('');
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [selectedRiskZone, setSelectedRiskZone] = useState<RiskZone | null>(null);
  const [routePlan, setRoutePlan] = useState<SavedSafeRoutePlan | null>(
    initialRouteState?.routePlan || null,
  );
  const [routeAlternatives, setRouteAlternatives] = useState<SavedSafeRoutePlan[]>(
    () => initialRouteState?.routeAlternatives || [],
  );
  const [travelMode, setTravelMode] = useState<SafeRouteTravelMode>(
    initialRouteState?.travelMode || 'drive',
  );
  const [routeOptionsOpen, setRouteOptionsOpen] = useState(false);
  const [routePreferences, setRoutePreferences] =
    useState<SafeRouteRoutePreferences>(DEFAULT_SAFE_ROUTE_PREFERENCES);
  const [routeResolutionPending, setRouteResolutionPending] = useState(false);
  const [roadPreviewPending, setRoadPreviewPending] = useState(false);
  const [routePreviewHandoffPending, setRoutePreviewHandoffPending] = useState(false);
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
  const locationSearchBiasRef = useRef({
    center: {
      latitude: mapRegion.latitude,
      longitude: mapRegion.longitude,
    },
    region: mapRegion,
  });
  locationSearchBiasRef.current = {
    center: {
      latitude: mapRegion.latitude,
      longitude: mapRegion.longitude,
    },
    region: mapRegion,
  };
  const currentLocationVisible =
    Boolean(liveCoordinate) && permissionStatus !== 'denied';
  const routingClientId = authenticated ? activeWorkspace?.id || null : null;
  const resolvedPlacesScopeId =
    placesScopeId?.trim() || (authenticated ? 'signed-in' : 'guest');
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

  useEffect(() => {
    if (
      !online
      || !routePlan
      || routePlan.supportFacilities?.length
      || (routePlan.clientId && (!routingAccessToken || !workspaceAuthorizationFresh))
    ) {
      return;
    }
    const routeId = routePlan.id;
    const controller = new AbortController();
    void fetchRouteSupportFacilities({
      accessToken: routingAccessToken,
      clientId: routePlan.clientId,
      coordinates: routePlan.route.coordinates,
      signal: controller.signal,
    }).then((supportFacilities) => {
      if (!supportFacilities.length || controller.signal.aborted) {
        return;
      }
      setRoutePlan((current) => current?.id === routeId
        ? { ...current, supportFacilities }
        : current);
      setRouteAlternatives((current) => current.map((plan) => plan.id === routeId
        ? { ...plan, supportFacilities }
        : plan));
    }).catch((error) => {
      const sessionExpiry = getRequestSessionExpiry({
        authenticated: Boolean(routePlan.clientId && onSessionExpiredRef.current),
        error,
        handled: false,
        requestActive: !controller.signal.aborted,
      });
      if (sessionExpiry) {
        onSessionExpiredRef.current?.(sessionExpiry.message);
      }
    });
    return () => controller.abort();
  }, [
    online,
    routePlan?.clientId,
    routePlan?.id,
    routePlan?.route.coordinates,
    routePlan?.supportFacilities?.length,
    routingAccessToken,
    workspaceAuthorizationFresh,
  ]);
  const origin = routeDraft.origin.label;
  const destination = routeDraft.destination.label;
  const routeFitBottomPadding = resolveGuestRouteFitBottomPadding(
    viewport.height,
  );
  const routeSheetBottomPadding = resolveGuestRouteSheetBottomPadding(
    safeAreaInsets.bottom,
  );
  const mapSheetLayout = useMemo(
    () => createGuestMapSheetLayout(
      viewport.height,
      chrome.screenBottomInset,
    ),
    [viewport.height],
  );
  const collapsedSheetHeight =
    mapSheetLayout.snapPoints[mapSheetLayout.collapsedIndex];
  const detailCompactSheetHeight =
    mapSheetLayout.snapPoints[mapSheetLayout.detailCompactIndex];
  const plannerSheetHeight =
    mapSheetLayout.snapPoints[mapSheetLayout.plannerIndex];
  const routeSheetSnapPoints = useMemo(
    () => Array.from(new Set([
      collapsedSheetHeight,
      detailCompactSheetHeight,
      plannerSheetHeight,
    ])).sort((left, right) => left - right),
    [collapsedSheetHeight, detailCompactSheetHeight, plannerSheetHeight],
  );
  const routeSheetDetailCompactIndex = routeSheetSnapPoints.indexOf(
    detailCompactSheetHeight,
  );
  const routeSheetPlannerIndex = routeSheetSnapPoints.indexOf(plannerSheetHeight);
  const routeSheetExpandedIndex = routeSheetPlannerIndex;
  const detailExpanded = Boolean(
    selectedRiskZone &&
      mapSheetIndex === routeSheetExpandedIndex,
  );
  const activeSheetTargetIndex = mapSheetIndex;
  const collapsedSheetAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      routeSheetAnimatedIndex.value,
      [mapSheetLayout.collapsedIndex, 0.45, routeSheetDetailCompactIndex],
      [1, 0, 0],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        translateY: interpolate(
          routeSheetAnimatedIndex.value,
          [mapSheetLayout.collapsedIndex, routeSheetDetailCompactIndex],
          [-8, 0],
          Extrapolation.CLAMP,
        ),
      },
      {
        scale: interpolate(
        routeSheetAnimatedIndex.value,
        [mapSheetLayout.collapsedIndex, routeSheetDetailCompactIndex],
        [1, 0.985],
        Extrapolation.CLAMP,
      ),
      },
    ],
  }), [mapSheetLayout.collapsedIndex, routeSheetDetailCompactIndex]);
  const expandedSheetContentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: activeSheetTargetIndex === mapSheetLayout.collapsedIndex
      ? 0
      : interpolate(
          routeSheetAnimatedIndex.value,
          [
            mapSheetLayout.collapsedIndex,
            Math.min(activeSheetTargetIndex, 0.45),
            activeSheetTargetIndex,
          ],
          [0, 0, 1],
          Extrapolation.CLAMP,
        ),
    transform: [{
      translateY: activeSheetTargetIndex === mapSheetLayout.collapsedIndex
        ? 8
        : interpolate(
            routeSheetAnimatedIndex.value,
            [mapSheetLayout.collapsedIndex, activeSheetTargetIndex],
            [8, 0],
            Extrapolation.CLAMP,
          ),
    }],
  }), [activeSheetTargetIndex, mapSheetLayout.collapsedIndex]);
  const riskExpandedPanelAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      routeSheetAnimatedIndex.value,
      [
        routeSheetDetailCompactIndex,
        routeSheetDetailCompactIndex + 0.45,
        routeSheetExpandedIndex,
      ],
      [0, 0, 1],
      Extrapolation.CLAMP,
    ),
  }), [routeSheetDetailCompactIndex, routeSheetExpandedIndex]);
  const activeDraftStop = activeInput
    ? findGuestRouteDraftStop(routeDraft, activeInput)
    : null;
  const activeLocationSearchQuery = activeDraftStop?.label.trim() ?? '';
  const locationSearchResultsDisabled = Boolean(
    locationSearchResults.length &&
    (
      locationSearchPending ||
      locationSearchResultsQuery !== activeLocationSearchQuery
    )
  );
  const locationSearchShortcuts = useMemo(
    () => createLocationSearchShortcuts(
      persistentPlaces,
      activeDraftStop?.label || '',
    ),
    [activeDraftStop?.label, persistentPlaces],
  );
  const routePlotted = Boolean(routePlan);
  const provisionalRouteVisible = Boolean(
    routePlan && provisionalRoutePlanIdRef.current === routePlan.id,
  );
  const verifiedRouteGeometryVisible = Boolean(
    routePlan && !provisionalRouteVisible,
  );
  const routeDraftReady =
    getGuestRouteDraftUnresolvedStopIds(routeDraft).length === 0;
  const searchStageActive = Boolean(activeInput);
  const draftCheckpointMarkers = useMemo(
    () => routePlan ? [] : mapGuestRouteDraftToResolvedCheckpoints(routeDraft),
    [routeDraft, routePlan],
  );
  const showRouteFooter =
    routePlotted ||
    (
      !searchStageActive &&
      (
      routeDraftReady ||
      Boolean(routeMessage) ||
      Boolean(sessionNoticeState) ||
      Boolean(locationErrorMessage && isCurrentLocationLabel(origin))
      )
    );
  const mapHomeCopy = createGuestMapHomeCopy(authenticated);
  const nativeMapType = resolveSafeRouteMapType({
    layer: mapLayer,
    online,
    platform: Platform.OS,
  });
  const mapInterfaceStyle = resolveSafeRouteMapInterfaceStyle({
    layer: mapLayer,
    online,
  });
  const routeAction = createGuestRouteActionState({
    destination,
    routePlotted,
    routeVerificationPending: provisionalRouteVisible,
  });
  const travelModeRouteLabel = getGuestTravelModeRouteLabel(travelMode);
  const collapsedRouteCardState = resolveGuestCollapsedRouteCardState({
    roadPreviewPending,
    routePlotted,
  });
  useEffect(() => {
    onPlannerVisibilityChange?.(!sheetCollapsed);
  }, [onPlannerVisibilityChange, sheetCollapsed]);
  useEffect(() => {
    onMapModalVisibilityChange?.(Boolean(selectedRiskZone || mapAction));
  }, [mapAction, onMapModalVisibilityChange, selectedRiskZone]);
  useEffect(
    () => () => onMapModalVisibilityChange?.(false),
    [onMapModalVisibilityChange],
  );
  useEffect(() => {
    let active = true;
    setPersistentPlaces(null);
    void persistentPlacesStore.load(resolvedPlacesScopeId).then((record) => {
      if (active) {
        setPersistentPlaces(record);
      }
    });
    return () => {
      active = false;
    };
  }, [resolvedPlacesScopeId]);
  useEffect(() => {
    let active = true;
    setRoutePreferences(DEFAULT_SAFE_ROUTE_PREFERENCES);
    void routePreferencesStore.load(resolvedPlacesScopeId).then((preferences) => {
      if (active) {
        setRoutePreferences(preferences);
      }
    });
    return () => {
      active = false;
    };
  }, [resolvedPlacesScopeId]);
  const routeRequestContextDisabled =
    routeResolutionPending ||
    roadPreviewPending;
  const routeContextDisabled =
    routeAction.disabled || routeRequestContextDisabled;
  const routeRequestDisabled = !online || routeRequestContextDisabled;
  const routePlanningDisabled = !online || routeContextDisabled;
  const routeActionDisabled = routePlan
    ? routeContextDisabled
    : routePlanningDisabled;
  const stagedRouteActionDisabled =
    routePreviewHandoffPending ||
    routeActionDisabled ||
    (!routePlan && !routeDraftReady);
  const stagedRouteActionBusy =
    routePreviewHandoffPending ||
    routeResolutionPending ||
    roadPreviewPending ||
    (networkChecking && !routePlan);
  const routeActionLabel = routeResolutionPending
    ? 'Resolving route points…'
    : roadPreviewPending
      ? provisionalRouteVisible
        ? 'Verifying risk coverage…'
        : 'Finding safest route…'
    : networkChecking && !routePlan
      ? 'Checking connection…'
    : offline && !routePlan
      ? 'Offline'
      : routeAction.label;
  const routeActionAccessibilityLabel = networkChecking && !routePlan
    ? 'Checking connection before plotting this route'
    : offline && !routePlan
      ? 'Reconnect before plotting this route'
    : routeAction.accessibilityLabel;
  const routeActionAccessibilityHint = !online && !routePlan
    ? 'Wait for a connection before requesting a road-snapped route.'
    : routeAction.accessibilityHint;
  const stagedRouteActionLabel =
    !routePlan && !routeDraftReady ? 'Select locations' : routeActionLabel;
  const collapsedRouteActionLabel =
    routePlan && !stagedRouteActionBusy ? 'Start' : stagedRouteActionLabel;
  const stagedRouteActionAccessibilityLabel =
    !routePlan && !routeDraftReady
      ? 'Select both locations before plotting a route'
      : routeActionAccessibilityLabel;
  const stagedRouteActionAccessibilityHint =
    !routePlan && !routeDraftReady
      ? 'Choose a start point, destination, and every added stop from the search results.'
      : routeActionAccessibilityHint;
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
  const viewportRisk = useViewportRiskAreas({
    accessToken: routingAccessToken,
    cacheScopeId: resolvedPlacesScopeId,
    clientId: routingClientId,
    enabled:
      !workspaceSelectionPending &&
      !workspaceSelectionRequired &&
      !workspaceAuthorizationRequired,
    onSessionExpired,
    onWorkspaceUnavailable: onWorkspaceUnavailable
      ? (workspaceId) => recoverWorkspaceAccessRef.current(workspaceId)
      : undefined,
    refreshEnabled:
      online &&
      !workspaceSelectionPending &&
      !workspaceSelectionRequired &&
      !workspaceAuthorizationRequired,
    region: mapRegion
  });
  const visibleRiskZones = useMemo(
    () => mergeRiskZonesById(
      viewportRisk.zones,
      routePlan?.riskZones || []
    ),
    [routePlan?.riskZones, viewportRisk.zones]
  );
  const routeRenderSession = useMemo(
    () => createGuestMapRouteRenderSession({
      alternativeColors: GUEST_MAP_ALTERNATIVE_ROUTE_COLORS,
      alternativeStrokeWidth: SAFE_ROUTE_ROUTE_CORE_WIDTH,
      maxFitCoordinates: GUEST_MAP_MAX_ROUTE_FIT_COORDINATES,
      maxRenderedRiskZones: GUEST_MAP_MAX_RENDERED_RISK_ZONES,
      maxRouteCoordinates: GUEST_MAP_MAX_ROUTE_COORDINATES,
      routes: routeAlternatives,
      selectedColor: colors.routePrimary,
      selectedRoute: routePlan,
      selectedStrokeWidth: SAFE_ROUTE_ROUTE_CORE_WIDTH + 2,
    }),
    [routeAlternatives, routePlan],
  );
  const routeMapCoordinates = routeRenderSession.selectedCoordinates;
  const routeFitCoordinates = routeRenderSession.fitCoordinates;
  const routeCollectionRevision = routeRenderSession.collectionRevision;
  const renderedRiskZones = useMemo(
    () => routePlan
      ? routeRenderSession.riskZones
      : resolveGuestMapRenderedRiskZones({
          mapRegion,
          zones: visibleRiskZones,
        }),
    [
      mapRegion.latitude,
      mapRegion.longitude,
      mapRegion.latitudeDelta,
      mapRegion.longitudeDelta,
      routeCollectionRevision,
      routePlan,
      visibleRiskZones,
    ],
  );
  // Route geometry changes should update overlays and trigger the fit effect,
  // never destroy and rebuild the native MapKit view while the sheet moves.
  const mapRenderSessionKey = `guest-map-${nativeMapType}`;
  const mapReady = readyMapSessionKey === mapRenderSessionKey;
  const riskSummary = useMemo(
    () => createGuestMapRiskSummary(visibleRiskZones),
    [visibleRiskZones],
  );
  routingClientIdRef.current = routingClientId;
  onSessionExpiredRef.current = onSessionExpired;
  onWorkspaceUnavailableRef.current = onWorkspaceUnavailable;
  const cancelPendingRouteInputFocus = () => {
    if (pendingInputFocusFrameRef.current !== null) {
      cancelAnimationFrame(pendingInputFocusFrameRef.current);
      pendingInputFocusFrameRef.current = null;
    }
  };
  const finishRouteSheetTransition = (collapsed: boolean) => {
    const pending = pendingRouteSheetCompletionRef.current;
    if (!pending || pending.collapsed !== collapsed) {
      return;
    }
    pendingRouteSheetCompletionRef.current = null;
    pending.callback?.();
  };
  const animateRouteSheet = (
    collapsed: boolean,
    onComplete?: () => void,
  ) => {
    cancelPendingRouteInputFocus();
    pendingRouteSheetCompletionRef.current = onComplete
      ? { callback: onComplete, collapsed }
      : null;
    if (collapsed) {
      Keyboard.dismiss();
      transitionActiveInput(null);
      setWorkspaceMenuOpen(false);
      routeSheetRef.current?.snapToIndex(mapSheetLayout.collapsedIndex);
    } else {
      setSheetCollapsed(false);
      setSheetAtAnchor(false);
      routeSheetScrollRef.current?.scrollTo({ animated: false, y: 0 });
      routeSheetRef.current?.snapToIndex(routeSheetPlannerIndex);
    }
  };
  const handleRouteSheetChange = (index: number) => {
    setMapSheetIndex(index);
    if (index === mapSheetLayout.collapsedIndex) {
      setSheetCollapsed(true);
      setSheetAtAnchor(true);
      setSelectedRiskZone(null);
      setMapAction(null);
      finishRouteSheetTransition(true);
      return;
    }
    setSheetAtAnchor(false);
    if (!selectedRiskZone && !mapAction) {
      setSheetCollapsed(false);
      finishRouteSheetTransition(false);
    }
  };
  const handleRouteSheetAnimate = (_fromIndex: number, toIndex: number) => {
    setMapSheetIndex(toIndex);
    if (toIndex === mapSheetLayout.collapsedIndex) {
      Keyboard.dismiss();
      transitionActiveInput(null);
    }
  };
  const handleRouteSheetClose = () => {
    cancelPendingRouteInputFocus();
    Keyboard.dismiss();
    transitionActiveInput(null);
    setWorkspaceMenuOpen(false);
    routeSheetRef.current?.snapToIndex(mapSheetLayout.collapsedIndex);
  };
  const scheduleRouteStopInputFocus = (stopId: string) => {
    cancelPendingRouteInputFocus();
    pendingInputFocusFrameRef.current = requestAnimationFrame(() => {
      pendingInputFocusFrameRef.current = null;
      routeInputRefs.current.get(stopId)?.focus();
    });
  };
  const handleCollapsedLocationSearch = () => {
    const nextStopId = resolveGuestRouteDraftNextStopInputId(routeDraft);
    transitionActiveInput(nextStopId);
    // Focus only after Gorhom reports the planner detent so the keyboard and
    // persistent sheet do not compete for the same interactive transition.
    animateRouteSheet(
      false,
      () => scheduleRouteStopInputFocus(nextStopId),
    );
  };
  const handleCollapsedRouteEdit = () => {
    Keyboard.dismiss();
    transitionActiveInput(null);
    animateRouteSheet(false);
  };

  useEffect(() => {
    if (
      workspaceAlternativeSelectionPending &&
      !workspaceCatalogLoading &&
      !workspaceSelectionPending &&
      !workspaceSwitchDisabled &&
      availableWorkspaces.length > 0
    ) {
      Keyboard.dismiss();
      transitionActiveInput(null);
      cancelPendingRouteInputFocus();
      routeSheetScrollRef.current?.scrollTo({ animated: false, y: 0 });
      setSheetAtAnchor(false);
      routeSheetRef.current?.snapToIndex(routeSheetPlannerIndex);
      setSheetCollapsed(false);
      setWorkspaceMenuOpen(true);
    }
  }, [
    availableWorkspaces.length,
    workspaceAlternativeSelectionPending,
    workspaceCatalogLoading,
    workspaceSelectionPending,
    workspaceSwitchDisabled,
    routeSheetPlannerIndex,
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
  }, []);

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
    activeLocationSearchRef.current = null;
    setLocationSearchPending(false);
    setLocationSearchMessage('');

    const activeStop = activeDraftStop;
    const query = activeStop?.label ?? '';
    const normalizedQuery = query.trim();
    const inputChanged = locationSearchOwnerRef.current !== activeInput;
    locationSearchOwnerRef.current = activeInput;
    if (
      inputChanged ||
      !activeInput ||
      normalizedQuery.length < GUEST_LOCATION_SEARCH_MIN_LENGTH ||
      activeStop?.resolution.type !== 'unresolved'
    ) {
      setLocationSearchResults([]);
      setLocationSearchResultsQuery('');
    }

    if (!activeInput) {
      return;
    }

    if (
      !activeStop ||
      normalizedQuery.length < GUEST_LOCATION_SEARCH_MIN_LENGTH ||
      activeStop.resolution.type !== 'unresolved' ||
      (activeInput === GUEST_ROUTE_DRAFT_ORIGIN_ID && isCurrentLocationLabel(query))
    ) {
      return;
    }

    if (!online) {
      setLocationSearchResults([]);
      setLocationSearchResultsQuery('');
      setLocationSearchMessage(
        networkChecking
          ? 'Checking connection before searching.'
          : 'Reconnect to search for places.',
      );
      return;
    }

    setLocationSearchPending(true);
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
      void searchGuestLocations(normalizedQuery, {
        bias: locationSearchBiasRef.current,
        serviceBaseUrl: LUNARCHAIN_API_BASE,
        signal: controller.signal
      }).then((results) => {
        if (!requestIsCurrent()) {
          return;
        }
        setLocationSearchResults(results);
        setLocationSearchResultsQuery(normalizedQuery);
        setLocationSearchMessage(results.length ? '' : 'No matching places found.');
      }).catch(() => {
        if (requestIsCurrent()) {
          setLocationSearchResults([]);
          setLocationSearchResultsQuery('');
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
    networkChecking,
    online,
  ]);

  useEffect(() => {
    if (
      !mapReady ||
      routeFitCoordinates.length < 2
    ) {
      return;
    }

    const timer = setTimeout(() => {
      const coordinatesToFit =
        liveCoordinate && isCurrentLocationLabel(origin)
          ? [liveCoordinate, ...routeFitCoordinates]
          : routeFitCoordinates;
      mapRef.current?.fitToCoordinates(coordinatesToFit, {
        animated: !reduceMotionEnabled,
        edgePadding: {
          bottom: routeFitBottomPadding,
          left: 42,
          right: 42,
          top: 150
        }
      });
    }, 120);

    return () => clearTimeout(timer);
  }, [
    mapReady,
    mapRenderSessionKey,
    reduceMotionEnabled,
    routeCollectionRevision,
    routeFitBottomPadding,
  ]);

  useEffect(() => () => {
    cancelRoadRouteUpgrade();
    activeLocationSearchRef.current?.abort();
    activeMapReverseGeocodeRef.current?.abort();
    if (routePreviewHandoffResetTimerRef.current) {
      clearTimeout(routePreviewHandoffResetTimerRef.current);
    }
  }, []);

  const cancelRoadRouteUpgrade = () => {
    activeDraftResolutionRef.current?.abort();
    activeDraftResolutionRef.current = null;
    setRouteResolutionPending(false);
    roadRouteRequestIdRef.current += 1;
    pendingOpenPreviewRef.current = false;
    activeRoadRouteRequestRef.current?.abort();
    activeRoadRouteRequestRef.current = null;
    activeRoadRouteWorkspaceIdRef.current = null;
    setRoadPreviewPending(false);
    const provisionalRoutePlanId = provisionalRoutePlanIdRef.current;
    provisionalRoutePlanIdRef.current = null;
    if (provisionalRoutePlanId) {
      setRoutePlan((current) =>
        current?.id === provisionalRoutePlanId ? null : current,
      );
      setRouteAlternatives((current) =>
        current.filter((plan) => plan.id !== provisionalRoutePlanId),
      );
      setRouteMessage((current) =>
        current === GUEST_PROVISIONAL_ROUTE_MESSAGE ? '' : current,
      );
    }
  };

  useEffect(() => {
    if (!workspaceAuthorizationRequired) {
      return;
    }

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
    if (activeRoadRouteWorkspaceIdRef.current) {
      cancelRoadRouteUpgrade();
    }
    riskAreaRequestIdRef.current += 1;
    activeRiskAreaRequestRef.current?.abort();
    activeRiskAreaRequestRef.current = null;
    setRiskAreaSavePending(false);
    setSelectedRiskZone(null);
    setMapAction(null);
    setSheetCollapsed(true);
    setSheetAtAnchor(true);
    routeSheetRef.current?.snapToIndex(mapSheetLayout.collapsedIndex);
    setRoutePlan((current) => current?.clientId ? null : current);
    setRouteAlternatives((current) =>
      current.filter((plan) => !plan.clientId),
    );
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

  const handlePlotRoute = async (
    requestedTravelMode: SafeRouteTravelMode = travelMode,
    requestedDraft?: GuestRouteDraft,
  ) => {
    if (routeRequestDisabled) {
      return;
    }
    const plotNetworkRequestEpoch = networkRequestEpochRef.current;
    const plotRequestIsCurrent = () =>
      onlineRef.current &&
      plotNetworkRequestEpoch === networkRequestEpochRef.current;

    Keyboard.dismiss();
    cancelRoadRouteUpgrade();
    setRouteMessage('');
    transitionActiveInput(null);

    let plottingDraft = requestedDraft ?? routeDraft;
    if (
      isCurrentLocationLabel(plottingDraft.origin.label) &&
      !resolveGuestRouteDraftStopCoordinate(plottingDraft, plottingDraft.origin.id)
    ) {
      const currentCoordinate = liveCoordinate ?? (
        SAFEROUTE_PREVIEW_MODE_ENABLED
          ? {
              latitude: GUEST_MAP_REGION.latitude,
              longitude: GUEST_MAP_REGION.longitude,
            }
          : null
      );
      if (currentCoordinate) {
        plottingDraft = setGuestRouteCurrentLocation(
          plottingDraft,
          currentCoordinate,
        );
      }
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
        if (controller.signal.aborted || !plotRequestIsCurrent()) {
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
    if (!plotRequestIsCurrent()) {
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
      transitionActiveInput(firstStopId);
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
      riskZones: viewportRisk.zones,
      travelMode: requestedTravelMode,
    });
    // A straight checkpoint connector is useful as an internal request
    // scaffold, but it is never a drivable route. Keep navigation gated until
    // an authoritative provider returns road-snapped geometry.
    setRoutePlan(null);
    setRouteAlternatives([]);
    upgradeGuestRouteWithRoadPreview(localRoutePlan);
  };

  const showRoutePlotFailure = (
    requestedMode: SafeRouteTravelMode,
    message?: string,
  ) => {
    const requestedModeLabel = getGuestTravelModeRouteLabel(requestedMode);
    animateNextMapLayout(safeRouteMotion.disclosureDurationMs);
    setRouteMessage(
      message
        || `We couldn't plot the ${requestedModeLabel} route. Tap Plot Route to retry.`,
    );
    animateRouteSheet(false);
  };

  const openRoutePreviewWithReturnState = (
    nextRoutePlan: SavedSafeRoutePlan,
    nextRouteAlternatives: SavedSafeRoutePlan[] = routeAlternatives,
  ) => {
    onOpenRoutePreview?.(nextRoutePlan, {
      routeAlternatives: nextRouteAlternatives.length
        ? nextRouteAlternatives
        : [nextRoutePlan],
      routeDraft,
      routePlan: nextRoutePlan,
      travelMode,
    });
  };

  const upgradeGuestRouteWithRoadPreview = (localRoutePlan: SavedSafeRoutePlan) => {
    const stops = resolveRoadPreviewStops(localRoutePlan);

    if (!stops || !onlineRef.current) {
      showRoutePlotFailure(localRoutePlan.travelMode ?? 'drive');
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
    const authenticatedSnapshot = authenticated;
    const routePreferencesSnapshot = routePreferences;
    const requestAccessToken = routingAccessToken;
    const requestWorkspaceContextId = routingClientId;
    const requestWorkspaceId = requestAccessToken
      ? requestWorkspaceContextId
      : null;
    const requestUsesWorkspace = Boolean(
      requestAccessToken && requestWorkspaceId,
    );
    activeRoadRouteWorkspaceIdRef.current = requestWorkspaceId;
    const requestNetworkEpoch = networkRequestEpochRef.current;
    const requestContextIsCurrent = () =>
      onlineRef.current &&
      requestNetworkEpoch === networkRequestEpochRef.current &&
      (
        !requestUsesWorkspace ||
        routingClientIdRef.current === requestWorkspaceContextId
      );
    const requestOwnsState = () =>
      roadRouteRequestIdRef.current === requestId;
    const requestIsCurrent = () =>
      !controller.signal.aborted &&
      requestOwnsState() &&
      requestContextIsCurrent();
    let acceptedRoadPreview = false;
    let acceptedRoadPreviewPlan: SavedSafeRoutePlan | null = null;
    let acceptedRoutePlansSnapshot: SavedSafeRoutePlan[] = [];
    let publishedProvisionalPreview = false;
    let terminalRouteErrorMessage: string | null = null;
    let sessionExpiryHandled = false;
    let workspaceUnavailableHandled = false;

    const handleRouteSessionExpiry = (error: unknown) => {
      const sessionExpiry = getRequestSessionExpiry({
        authenticated: Boolean(requestUsesWorkspace && onSessionExpired),
        error,
        handled: sessionExpiryHandled,
        requestActive: requestIsCurrent(),
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
          requestIsCurrent() &&
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

    const openPendingPreview = (
      nextRoutePlan: SavedSafeRoutePlan,
      nextRouteAlternatives: SavedSafeRoutePlan[] = acceptedRoutePlansSnapshot,
    ) => {
      if (!pendingOpenPreviewRef.current) {
        return;
      }

      pendingOpenPreviewRef.current = false;
      openRoutePreviewWithReturnState(nextRoutePlan, nextRouteAlternatives);
    };

    const publishRoadPreview = (preview: VerifiedSafeRoutePreview): boolean => {
      const roadRoutePlans = [
        preview,
        ...(preview.alternatives || []),
      ].slice(0, 3).map((routePreview, index) => {
        const routePlanOptions = {
          authenticated: authenticatedSnapshot,
          checkpoints: checkpointsSnapshot,
          destination: destinationSnapshot,
          destinationCoordinate: destinationCoordinateSnapshot,
          origin: originSnapshot,
          originCoordinate: originCoordinateSnapshot,
          planId: index === 0
            ? localRoutePlan.id
            : `${localRoutePlan.id}-alternative-${index}`,
          riskZones: mergeRiskZonesById(
            routePreview.riskZones,
            routePreview.routeAlerts || [],
          ),
          supportFacilities: routePreview.supportFacilities,
          roadSnappedCoordinates: routePreview.coordinates,
          routeDistanceMeters: routePreview.distanceMeters,
          routeDurationSeconds: routePreview.durationSeconds,
          routeGuidanceSteps: routePreview.guidanceSteps,
          travelMode: localRoutePlan.travelMode ?? 'drive',
        };
        return withLiveReroutePreferences(
          createGuestRoutePlan(routePlanOptions),
          routePreferencesSnapshot,
        );
      }).filter((plan) => plan.updatedAtLabel === 'Road preview');
      const acceptedRoutePlans = roadRoutePlans.slice(0, 3);
      acceptedRoutePlansSnapshot = acceptedRoutePlans;
      acceptedRoutePlans.forEach((plan, index) => {
        plan.route.label = index === 0
          ? 'Primary route'
          : `Alternative ${index}`;
      });
      const [roadRoutePlan] = acceptedRoutePlans;

      if (!roadRoutePlan) {
        return false;
      }
      if (requestWorkspaceId) {
        acceptedRoutePlans.forEach((plan) => {
          plan.clientId = requestWorkspaceId;
        });
      }
      acceptedRoadPreview = true;
      acceptedRoadPreviewPlan = roadRoutePlan;
      provisionalRoutePlanIdRef.current = null;
      setRoutePlan(roadRoutePlan);
      setRouteAlternatives(acceptedRoutePlans);
      setRouteMessage('');
      animateRouteSheet(true);
      openPendingPreview(roadRoutePlan, acceptedRoutePlans);
      return true;
    };

    const publishProvisionalRoadPreview = (
      preview: ProvisionalSafeRoutePreview,
    ): void => {
      if (
        !requestIsCurrent()
        || acceptedRoadPreview
        || publishedProvisionalPreview
      ) {
        return;
      }
      const provisionalPlan = withLiveReroutePreferences(
        createGuestRoutePlan({
          authenticated: authenticatedSnapshot,
          checkpoints: checkpointsSnapshot,
          destination: destinationSnapshot,
          destinationCoordinate: destinationCoordinateSnapshot,
          origin: originSnapshot,
          originCoordinate: originCoordinateSnapshot,
          planId: localRoutePlan.id,
          // Pending coverage intentionally exposes no partial risk cohort.
          riskZones: [],
          roadSnappedCoordinates: preview.coordinates,
          routeDistanceMeters: preview.distanceMeters,
          routeDurationSeconds: preview.durationSeconds,
          // Guidance must never be attached to a provisional route.
          routeGuidanceSteps: [],
          travelMode: localRoutePlan.travelMode ?? 'drive',
        }),
        routePreferencesSnapshot,
      );
      if (provisionalPlan.updatedAtLabel !== 'Road preview') {
        return;
      }
      publishedProvisionalPreview = true;
      provisionalPlan.route.label = 'Risk verification pending';
      provisionalPlan.route.riskLabel = 'Pending';
      provisionalPlan.route.tone = 'amber';
      provisionalPlan.route.description = GUEST_PROVISIONAL_ROUTE_MESSAGE;
      provisionalPlan.route.nextInstruction =
        'Wait for verified risk coverage before starting guidance.';
      if (requestWorkspaceId) {
        provisionalPlan.clientId = requestWorkspaceId;
      }
      provisionalRoutePlanIdRef.current = provisionalPlan.id;
      setRoutePlan(provisionalPlan);
      setRouteAlternatives([provisionalPlan]);
      setRouteMessage(GUEST_PROVISIONAL_ROUTE_MESSAGE);
      animateRouteSheet(true);
    };

    const routePreviewFetcher = roadRoutePreviewFetcher || ((options: GuestRoadRoutePreviewOptions) =>
      fetchSafeRouteRoadRoutePreview({
        ...options,
        accessToken: requestAccessToken,
        clientId: requestWorkspaceId
      }));

    void routePreviewFetcher({
      onProvisionalPreview: publishProvisionalRoadPreview,
      preferences: routePreferencesSnapshot,
      signal: controller.signal,
      stops,
      travelMode: localRoutePlan.travelMode ?? 'drive',
    })
      .then((roadPreview) => {
        if (!roadPreview || !requestIsCurrent()) {
          return;
        }
        publishRoadPreview(roadPreview);
      })
      .catch((error) => {
        if (handleRouteSessionExpiry(error)) {
          return;
        }
        if (handleRouteWorkspaceUnavailable(error)) {
          return;
        }
        if (error instanceof ApiRequestError && requestIsCurrent()) {
          terminalRouteErrorMessage = error.message;
        }
        // The finalizer fails closed instead of presenting checkpoint
        // connectors as drivable road geometry.
      })
      .finally(() => {
        if (requestOwnsState()) {
          activeRoadRouteRequestRef.current = null;
          activeRoadRouteWorkspaceIdRef.current = null;
          setRoadPreviewPending(false);
          if (!acceptedRoadPreview) {
            const provisionalRoutePlanId = provisionalRoutePlanIdRef.current;
            provisionalRoutePlanIdRef.current = null;
            if (provisionalRoutePlanId) {
              setRoutePlan((current) =>
                current?.id === provisionalRoutePlanId ? null : current,
              );
              setRouteAlternatives((current) =>
                current.filter((plan) => plan.id !== provisionalRoutePlanId),
              );
              setRouteMessage((current) =>
                current === GUEST_PROVISIONAL_ROUTE_MESSAGE ? '' : current,
              );
            }
          }
          if (!requestContextIsCurrent()) {
            return;
          }
          if (acceptedRoadPreviewPlan) {
            openPendingPreview(acceptedRoadPreviewPlan);
          }
          if (!acceptedRoadPreview && !sessionExpiryHandled && !workspaceUnavailableHandled) {
            pendingOpenPreviewRef.current = false;
            setRoutePlan(null);
            setRouteAlternatives([]);
            showRoutePlotFailure(
              localRoutePlan.travelMode ?? 'drive',
              terminalRouteErrorMessage || undefined,
            );
          }
        }
      });
  };

  const handleOpenPreview = () => {
    if (
      routePreviewHandoffPending ||
      routeActionDisabled
      || provisionalRoutePlanIdRef.current === routePlan?.id
    ) {
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

    setRoutePreviewHandoffPending(true);
    requestAnimationFrame(() => {
      openRoutePreviewWithReturnState(routePlan);
      routePreviewHandoffResetTimerRef.current = setTimeout(() => {
        setRoutePreviewHandoffPending(false);
      }, 700);
    });
  };

  const plotTravelMode = (nextMode: SafeRouteTravelMode) => {
    if (routePlanningDisabled) {
      return;
    }

    cancelRoadRouteUpgrade();
    setTravelMode(nextMode);
    animateNextMapLayout(safeRouteMotion.disclosureDurationMs);
    setRoutePlan(null);
    setRouteAlternatives([]);
    setRouteMessage('');
    void handlePlotRoute(nextMode);
  };

  const handlePlotRouteAction = () => {
    if (!routeDraftReady) {
      return;
    }

    plotTravelMode(travelMode);
  };

  const handleTravelModeChange = (nextMode: SafeRouteTravelMode) => {
    plotTravelMode(nextMode);
  };

  const handleRouteAlternativeSelect = (nextRoutePlan: SavedSafeRoutePlan) => {
    if (nextRoutePlan.id === routePlan?.id) {
      return;
    }
    setRoutePlan(nextRoutePlan);
    setRouteMessage('');
  };

  const handleRoutePreferenceChange = (
    preference: keyof SafeRouteRoutePreferences,
    enabled: boolean,
  ) => {
    cancelRoadRouteUpgrade();
    const nextPreferences = {
      ...routePreferences,
      [preference]: enabled,
    };
    setRoutePreferences(nextPreferences);
    setRoutePlan(null);
    setRouteAlternatives([]);
    setRouteMessage('');
    void routePreferencesStore
      .save(resolvedPlacesScopeId, nextPreferences)
      .catch(() => undefined);
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
      { center: liveCoordinate, heading: 0, pitch: 0 },
      { duration: 450 }
    );
  };

  const handleMapRegionChangeComplete = (region: Region) => {
    setMapRegion(region);
  };

  const handleStopChange = (stopId: string, value: string) => {
    cancelRoadRouteUpgrade();
    dispatchRouteDraft({
      label: value,
      stopId,
      type: 'stop/edit'
    });
    setRoutePlan(null);
    setRouteAlternatives([]);
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
      setRouteAlternatives([]);
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
    const selectedStopId = activeInput;
    const selectionAction = {
      selection: {
        coordinate: result.coordinate,
        label: result.displayName,
      },
      stopId: selectedStopId,
      type: 'stop/select' as const,
    };
    const nextRouteDraft = guestRouteDraftReducer(routeDraft, selectionAction);
    const shouldAutoPlotBaseRoute =
      selectedStopId === GUEST_ROUTE_DRAFT_DESTINATION_ID &&
      nextRouteDraft.waypoints.length === 0;
    cancelRoadRouteUpgrade();
    dispatchRouteDraft(selectionAction);
    setRoutePlan(null);
    setRouteAlternatives([]);
    setRouteMessage('');
    setLocationSearchResults([]);
    setLocationSearchResultsQuery('');
    setLocationSearchMessage('');
    transitionActiveInput(null);
    Keyboard.dismiss();
    const nextRegion = regionForGuestSelectedLocation(result.coordinate);
    setMapRegion(nextRegion);
    mapRef.current?.animateToRegion(nextRegion, 500);
    if (selectedStopId === GUEST_ROUTE_DRAFT_DESTINATION_ID) {
      void persistentPlacesStore
        .recordRecentDestination(
          resolvedPlacesScopeId,
          toPersistentPlaceInput(result),
        )
        .then(setPersistentPlaces)
        .catch(() => undefined);
    }
    if (shouldAutoPlotBaseRoute) {
      void handlePlotRoute(travelMode, nextRouteDraft);
    }
  };

  const handleManageLocation = (result: GuestLocationSearchResult) => {
    const favourite = findMatchingFavourite(persistentPlaces, result);
    const updatePlaces = (
      operation: () => Promise<PersistentPlacesRecord>,
    ) => {
      void operation().then(setPersistentPlaces).catch(() => {
        Alert.alert(
          'Place not saved',
          'SafeRoute could not update your saved places on this device.',
        );
      });
    };
    const input = toPersistentPlaceInput(result);
    Alert.alert(result.label, result.displayName, [
      {
        text: 'Set as Home',
        onPress: () => updatePlaces(
          () => persistentPlacesStore.setHome(resolvedPlacesScopeId, input),
        ),
      },
      {
        text: 'Set as Work',
        onPress: () => updatePlaces(
          () => persistentPlacesStore.setWork(resolvedPlacesScopeId, input),
        ),
      },
      {
        text: favourite ? 'Remove Favourite' : 'Add Favourite',
        onPress: () => updatePlaces(
          () => favourite
            ? persistentPlacesStore.removeFavourite(
                resolvedPlacesScopeId,
                favourite.id,
              )
            : persistentPlacesStore.saveFavourite(
                resolvedPlacesScopeId,
                input,
              ),
        ),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
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
    setRouteAlternatives([]);
    setRouteMessage('');
    animateRouteSheet(false);
    if (waypointId) {
      transitionActiveInput(waypointId);
    }
  };

  const handleRemoveWaypoint = (waypointId: string) => {
    dispatchRouteDraft({ type: 'waypoint/remove', waypointId });
    if (activeInput === waypointId) {
      transitionActiveInput(null);
    }
    cancelRoadRouteUpgrade();
    setRoutePlan(null);
    setRouteAlternatives([]);
    setRouteMessage('');
  };

  const handleReorderWaypoint = (waypointId: string, toIndex: number) => {
    dispatchRouteDraft({ type: 'waypoint/reorder', waypointId, toIndex });
    cancelRoadRouteUpgrade();
    setRoutePlan(null);
    setRouteAlternatives([]);
    setRouteMessage('');
  };

  const handleMapLongPress = (coordinate: LatLng) => {
    Keyboard.dismiss();
    transitionActiveInput(null);
    setSelectedRiskZone(null);
    setSheetCollapsed(true);
    setSheetAtAnchor(false);
    setMapAction({
      coordinate,
      label: formatCoordinateLabel(coordinate),
      pending: online
    });
    routeSheetRef.current?.snapToIndex(routeSheetDetailCompactIndex);
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

  const handleSelectRiskZone = useCallback((zone: RiskZone) => {
    lastRiskZonePressAtMsRef.current = Date.now();
    setMapAction(null);
    setSelectedRiskZone(zone);
    setSheetCollapsed(true);
    setSheetAtAnchor(false);
    cancelPendingRouteInputFocus();
    Keyboard.dismiss();
    routeSheetRef.current?.snapToIndex(routeSheetDetailCompactIndex);
  }, [routeSheetDetailCompactIndex]);

  const dismissMapDetail = () => {
    handleRouteSheetClose();
  };

  const handleMapPress = (event: MapPressEvent) => {
    if (
      event.nativeEvent.action === 'marker-press' ||
      Date.now() - lastRiskZonePressAtMsRef.current < 500
    ) {
      return;
    }

    const tapToleranceMeters = resolveRiskMapTapToleranceMeters({
      region: mapRegion,
      viewportHeight: viewport.height,
    });
    const zone = resolveRiskZoneAtMapCoordinate({
      coordinate: event.nativeEvent.coordinate,
      toleranceMeters: tapToleranceMeters,
      zones: renderedRiskZones,
    });
    if (zone) {
      handleSelectRiskZone(zone);
      return;
    }

    const alternativeLine = resolveMapPolylineAtCoordinate({
      coordinate: event.nativeEvent.coordinate,
      polylines: routeRenderSession.lines.filter((line) => !line.selected),
      toleranceMeters: tapToleranceMeters,
    });
    if (alternativeLine) {
      handleRouteAlternativeSelect(alternativeLine.plan);
      return;
    }

    if (selectedRiskZone || mapAction) {
      dismissMapDetail();
    }
  };

  const handleAddMapRoutePoint = () => {
    if (!mapAction || !canAddMapRoutePoint) {
      return;
    }
    const selection = {
      coordinate: mapAction.coordinate,
      label: mapAction.label.slice(0, GUEST_ROUTE_LABEL_MAX_LENGTH)
    };
    let nextRouteDraft: GuestRouteDraft | null = null;
    if (mapSelectionSetsDestination) {
      const selectionAction = {
        selection,
        stopId: GUEST_ROUTE_DRAFT_DESTINATION_ID,
        type: 'stop/select' as const,
      };
      nextRouteDraft = guestRouteDraftReducer(routeDraft, selectionAction);
      dispatchRouteDraft(selectionAction);
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
    setRouteAlternatives([]);
    setRouteMessage(
      mapSelectionSetsDestination
        ? ''
        : 'Stop added. Plot the route when ready.'
    );
    setMapAction(null);
    animateRouteSheet(false);
    if (nextRouteDraft) {
      void handlePlotRoute(travelMode, nextRouteDraft);
    }
  };

  const handleAddMapRiskArea = async () => {
    const action = mapAction;
    if (!authenticated) {
      setMapAction(null);
      dismissMapDetail();
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
      dismissMapDetail();
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
      // The next route must be verified against the newly saved workspace risk
      // state instead of reusing a preview prepared before this mutation.
      invalidateSafeRoutePreviewCache();
      invalidateWorkspaceRiskAreaCache(requestWorkspaceId);
      dismissMapDetail();
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
        dismissMapDetail();
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
        key={mapRenderSessionKey}
        ref={mapRef}
        testID={uiTestIds.guestMapCanvas}
        style={styles.map}
        initialRegion={routeRenderSession.initialRegion || mapRegion}
        cameraZoomRange={SAFE_ROUTE_CAMERA_ZOOM_RANGE}
        showsBuildings
        showsCompass={false}
        showsIndoors={false}
        showsIndoorLevelPicker={false}
        showsMyLocationButton={false}
        showsUserLocation={permissionStatus === 'granted'}
        {...(Platform.OS === 'ios' && permissionStatus === 'granted'
          ? { showsUserHeadingIndicator: true }
          : {})}
        tintColor={colors.appleBlue}
        userLocationAnnotationTitle="Current location"
        showsScale={false}
        showsTraffic={online && travelMode === 'drive'}
        zoomEnabled
        pitchEnabled
        rotateEnabled
        toolbarEnabled={false}
        customMapStyle={SAFE_ROUTE_DARK_MAP_STYLE}
        mapType={nativeMapType}
        userInterfaceStyle={mapInterfaceStyle}
        onMapReady={() => {
          setReadyMapSessionKey(mapRenderSessionKey);
          mapRef.current?.animateCamera({ heading: 0, pitch: 0 }, { duration: 0 });
        }}
        onLongPress={(event) => handleMapLongPress(event.nativeEvent.coordinate)}
        onPress={handleMapPress}
        onPanDrag={() => {
          userMovedMapRef.current = true;
        }}
        onRegionChangeComplete={handleMapRegionChangeComplete}
      >
        {(mapLayer === 'dark' || !online) && Platform.OS === 'ios'
          ? <SafeRouteDarkMapMask />
          : null}
        {verifiedRouteGeometryVisible ? routeRenderSession.lines.map((line) => (
          <Polyline
            key={line.plan.id}
            coordinates={line.coordinates}
            strokeColor={line.strokeColor}
            strokeWidth={line.strokeWidth}
            lineCap="round"
            lineJoin="round"
            zIndex={line.zIndex}
          />
        )) : null}
        {renderedRiskZones.map((zone) => (
          <RiskOverlay
            key={zone.id}
            interactive
            onPress={handleSelectRiskZone}
            routeCoordinates={routeMapCoordinates}
            zone={zone}
          />
        ))}
        {(routePlan?.supportFacilities || []).map((facility) => (
          <SupportFacilityMarker facility={facility} key={facility.id} />
        ))}
        {!routePlan ? draftCheckpointMarkers.filter((checkpoint) =>
          shouldRenderRouteCheckpointMarker({
            checkpoint,
            liveCoordinate,
            nativeUserLocationVisible: currentLocationVisible
          })
        ).map((checkpoint) => (
          <GuestDraftCheckpointMarker
            checkpoint={checkpoint}
            key={checkpoint.id}
            selected={checkpoint.id === routeDraft.selectedStopId}
          />
        )) : null}
        {routePlan ? (
          routePlan.checkpoints.filter((checkpoint) =>
            shouldRenderRouteCheckpointMarker({
              checkpoint,
              liveCoordinate,
              nativeUserLocationVisible: false
            })
          ).map((checkpoint) => (
            <CheckpointMarker key={checkpoint.id} checkpoint={checkpoint} />
          ))
        ) : null}
        {mapAction ? (
          <Marker
            coordinate={mapAction.coordinate}
            anchor={{ x: 0.5, y: 0.5 }}
            accessibilityLabel="Selected map location"
            tracksViewChanges={false}
          >
            <View style={[styles.marker, styles.markerSelected]}>
              <View style={styles.markerCore} />
            </View>
          </Marker>
        ) : null}
      </MapView>

      <SafeAreaView
        edges={['top', 'right', 'left']}
        pointerEvents="box-none"
        style={styles.overlay}
      >
        {!selectedRiskZone && !mapAction && sheetCollapsed ? (
        <View style={styles.currentLocationControlDock}>
          <MotionEntrance variant="control">
            <Pressable
              accessibilityHint={`Switches to the ${mapLayer === 'dark' ? 'satellite' : 'dark'} map.`}
              accessibilityLabel={mapLayer === 'dark' ? 'Show satellite map' : 'Show dark map'}
              accessibilityRole="button"
              accessibilityState={{ disabled: !online }}
              disabled={!online}
              testID={uiTestIds.guestMapLayerToggle}
              style={({ pressed }) => [
                styles.currentLocationButton,
                styles.layerButton,
                !online ? styles.currentLocationButtonDisabled : null,
                pressed && online ? styles.currentLocationButtonPressed : null,
              ]}
              onPress={() => onMapLayerChange?.(mapLayer === 'dark' ? 'satellite' : 'dark')}
            >
              {mapLayer === 'dark' ? (
                <Globe2 accessibilityElementsHidden color={colors.appleBlue} size={21} strokeWidth={1.9} />
              ) : (
                <MapIcon accessibilityElementsHidden color={colors.appleBlue} size={21} strokeWidth={1.9} />
              )}
            </Pressable>
          </MotionEntrance>
          <MotionEntrance delay={45} variant="control">
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
              <Crosshair accessibilityElementsHidden color={colors.appleBlue} size={21} strokeWidth={1.9} />
            </Pressable>
          </MotionEntrance>
        </View>
        ) : null}

        <MotionEntrance
          style={[
            styles.topBar,
            workspaceNavigationNoticeInset > 0
              ? { marginTop: workspaceNavigationNoticeInset }
              : null,
          ]}
          variant="chrome"
        >
          <View style={styles.mapStatusStack}>
            <View
              accessible
              accessibilityLabel={riskSummary.accessibilityLabel}
              accessibilityRole="summary"
              style={styles.riskSummary}
            >
              <View style={[styles.summaryDot, styles.summaryDotDanger]} />
              <Text style={styles.riskSummaryText}>{riskSummary.riskAreaLabel}</Text>
              <View style={styles.summaryDivider} />
              <View style={[styles.summaryDot, styles.summaryDotAmber]} />
              <Text style={styles.riskSummaryText}>{riskSummary.routeAlertLabel}</Text>
            </View>
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
                : !viewportRisk.retryAvailable
                  ? 'Risk coverage is temporarily unavailable; retry is waiting for the server delay'
                : viewportRisk.coverageState === 'pending-timeout'
                  ? 'Check whether risk research finished'
                  : 'Retry loading risk areas'}
              accessibilityRole={viewportRisk.loading ? 'progressbar' : 'button'}
              disabled={viewportRisk.loading || !viewportRisk.retryAvailable}
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
                  : !viewportRisk.retryAvailable
                    ? 'Risk retry waiting…'
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
          ) : viewportRisk.coverageState === 'partial' && viewportRisk.statusMessage ? (
            <View
              accessible
              accessibilityLabel={viewportRisk.statusMessage}
              accessibilityLiveRegion="polite"
              accessibilityRole="summary"
              style={styles.riskLoadStatus}
            >
              <Text numberOfLines={1} style={styles.riskLoadStatusText}>
                Broad risks excluded
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
                    : viewportRisk.coverageState === 'unavailable'
                      ? 'Risk service unavailable'
                    : viewportRisk.coverageState === 'missing'
                      ? 'Coverage unavailable'
                      : 'Risk coverage ready'}
              </Text>
            </View>
          ) : null}
          </View>
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
            <UserRound accessibilityElementsHidden color={colors.appleBlue} size={17} strokeWidth={2} />
            <Text
              numberOfLines={1}
              style={styles.signInButtonText}
            >
              {mapHomeCopy.primaryActionLabel}
            </Text>
          </Pressable>
        </MotionEntrance>

        <SafeRouteBottomSheet
          ref={routeSheetRef}
          animateOnMount={false}
          animatedIndex={routeSheetAnimatedIndex}
          backdrop
          backdropAppearsOnIndex={routeSheetDetailCompactIndex}
          backdropDisappearsOnIndex={mapSheetLayout.collapsedIndex}
          backdropPressBehavior={mapSheetLayout.collapsedIndex}
          bottomInset={chrome.screenBottomInset}
          containerStyle={styles.persistentMapSheetContainer}
          enablePanDownToClose={false}
          handleComponent={renderRouteSheetHandle}
          index={mapSheetLayout.collapsedIndex}
          snapPoints={routeSheetSnapPoints}
          style={styles.sheetDock}
          surfaceColor={colors.sheet}
          onAnimate={handleRouteSheetAnimate}
          onChange={handleRouteSheetChange}
          onClose={handleRouteSheetClose}
        >
          <Animated.View
            accessibilityElementsHidden={!sheetAtAnchor}
            importantForAccessibility={
              sheetAtAnchor ? 'auto' : 'no-hide-descendants'
            }
            pointerEvents={sheetAtAnchor ? 'auto' : 'none'}
            style={[
              styles.persistentCollapsedContent,
              collapsedSheetAnimatedStyle,
            ]}
          >
            {collapsedRouteCardState === 'finding' ? (
              <View
                accessible
                accessibilityLabel={provisionalRouteVisible
                  ? 'Road route found. Risk coverage verification is pending. The route will appear when verification finishes.'
                  : `Finding the safest ${travelModeRouteLabel} route. Checking roads and nearby risk areas.`}
                accessibilityLiveRegion="polite"
                accessibilityRole="progressbar"
                style={styles.collapsedRouteStatus}
                testID={uiTestIds.guestMapCollapsedRouteStatus}
              >
                <ActivityIndicator color={colors.appleBlue} size="small" />
                <View style={styles.collapsedSearchCopy}>
                  <Text numberOfLines={1} style={styles.collapsedRouteReadyLabel}>
                    {provisionalRouteVisible
                      ? 'Safety check pending'
                      : `Finding ${travelModeRouteLabel} route`}
                  </Text>
                </View>
              </View>
            ) : routePlan ? (
              <View style={styles.collapsedRouteActions}>
                <Pressable
                  accessibilityHint="Opens the plotted route so its locations and travel mode can be reviewed."
                  accessibilityLabel={`Review route to ${destination || 'destination'}`}
                  accessibilityRole="button"
                  testID={uiTestIds.guestMapCollapsedSheet}
                  style={({ pressed }) => [
                    styles.collapsedRouteSummaryButton,
                    pressed ? styles.collapsedSheetPressed : null,
                  ]}
                  onPress={handleCollapsedRouteEdit}
                >
                  <View style={styles.collapsedSheetCopy}>
                    <View style={styles.collapsedRouteReadyIcon}>
                      <CarFront
                        accessibilityElementsHidden
                        color={colors.appleBlue}
                        size={17}
                        strokeWidth={2.1}
                      />
                    </View>
                    <Text numberOfLines={1} style={styles.collapsedRouteReadyLabel}>
                      Route ready
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  accessibilityHint={stagedRouteActionAccessibilityHint}
                  accessibilityLabel={stagedRouteActionAccessibilityLabel}
                  accessibilityRole="button"
                  accessibilityState={{
                    busy: stagedRouteActionBusy,
                    disabled: stagedRouteActionDisabled,
                  }}
                  disabled={stagedRouteActionDisabled}
                  testID={uiTestIds.guestMapCollapsedStartRoute}
                  style={({ pressed }) => [
                    styles.collapsedRouteStartButton,
                    stagedRouteActionDisabled && !routePreviewHandoffPending
                      ? styles.collapsedRouteStartButtonDisabled
                      : null,
                    pressed && !stagedRouteActionDisabled
                      ? styles.collapsedRouteStartButtonPressed
                      : null,
                  ]}
                  onPress={handleOpenPreview}
                >
                  {stagedRouteActionBusy ? (
                    <ActivityIndicator
                      color={
                        routePreviewHandoffPending || !stagedRouteActionDisabled
                          ? colors.appleBlue
                          : colors.inkSoft
                      }
                      size="small"
                    />
                  ) : (
                    <Navigation
                      accessibilityElementsHidden
                      color={stagedRouteActionDisabled ? colors.inkSoft : colors.appleBlue}
                      size={15}
                      strokeWidth={2.2}
                    />
                  )}
                  {routePreviewHandoffPending ? null : (
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.collapsedRouteStartButtonText,
                        stagedRouteActionDisabled
                          ? styles.collapsedRouteStartButtonTextDisabled
                          : null,
                      ]}
                    >
                      {collapsedRouteActionLabel}
                    </Text>
                  )}
                </Pressable>
              </View>
            ) : (
              <Pressable
                accessibilityHint="Opens location search."
                accessibilityLabel="Search for a location"
                accessibilityRole="button"
                testID={uiTestIds.guestMapCollapsedSheet}
                style={({ pressed }) => [
                  styles.collapsedSheetButton,
                  pressed ? styles.collapsedSheetPressed : null,
                ]}
                onPress={handleCollapsedLocationSearch}
              >
                <View style={styles.collapsedSheetCopy}>
                  <Search
                    accessibilityElementsHidden
                    color={colors.muted}
                    size={20}
                    strokeWidth={2.2}
                  />
                  <View style={styles.collapsedSearchCopy}>
                    <Text numberOfLines={1} style={styles.collapsedSheetTitle}>
                      Search for a location
                    </Text>
                  </View>
                </View>
              </Pressable>
            )}
          </Animated.View>

          {selectedRiskZone ? (
            <Animated.View
              style={[
                styles.persistentDetailContent,
                expandedSheetContentAnimatedStyle,
              ]}
            >
              <BottomSheetScrollView
                bounces={false}
                contentContainerStyle={styles.persistentDetailScrollContent}
                scrollEnabled={detailExpanded}
                showsVerticalScrollIndicator={false}
                style={styles.persistentDetailScroll}
                onScroll={(event) => {
                  riskDetailScrollOffsetRef.current = Math.max(
                    0,
                    event.nativeEvent.contentOffset.y,
                  );
                }}
                onTouchEnd={(event) => {
                  const touchStartY = riskDetailTouchStartYRef.current;
                  riskDetailTouchStartYRef.current = null;
                  if (
                    detailExpanded &&
                    riskDetailScrollOffsetRef.current <= 1 &&
                    touchStartY !== null &&
                    event.nativeEvent.pageY - touchStartY >= 28
                  ) {
                    routeSheetRef.current?.snapToIndex(
                      routeSheetDetailCompactIndex,
                    );
                  }
                }}
                onTouchStart={(event) => {
                  riskDetailTouchStartYRef.current = event.nativeEvent.pageY;
                }}
              >
                <LiveMapRiskDetailContent
                  expanded={detailExpanded}
                  expandedPanelStyle={riskExpandedPanelAnimatedStyle}
                  zone={selectedRiskZone}
                  onDismiss={dismissMapDetail}
                  onToggleExpanded={() => routeSheetRef.current?.snapToIndex(
                    detailExpanded
                      ? routeSheetDetailCompactIndex
                      : routeSheetExpandedIndex,
                  )}
                />
              </BottomSheetScrollView>
            </Animated.View>
          ) : null}

          {mapAction ? (
            <Animated.View
              style={[
                styles.persistentDetailContent,
                expandedSheetContentAnimatedStyle,
              ]}
            >
              <BottomSheetScrollView
                bounces={false}
                contentContainerStyle={styles.persistentDetailScrollContent}
                scrollEnabled={false}
                showsVerticalScrollIndicator={false}
                style={styles.persistentDetailScroll}
              >
                <LiveMapDetailContent
                  accessibilityLabel={`Map actions for ${mapAction.label}`}
                  dismissAccessibilityLabel="Close map actions"
                  icon={(
                    <MapPin
                      accessibilityElementsHidden
                      color={colors.appleBlue}
                      size={22}
                      strokeWidth={2}
                    />
                  )}
                  iconTileStyle={styles.mapActionIconTile}
                  onDismiss={dismissMapDetail}
                  subtitle="Selected map location"
                  testID={uiTestIds.guestMapLongPressMenu}
                  title={mapAction.pending ? 'Locating…' : mapAction.label}
                >
                  <Text style={styles.mapActionBody}>
                    {mapSelectionSetsDestination
                      ? 'Use this point as your destination.'
                      : 'Add this point to the route.'}
                  </Text>
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
                        styles.mapActionPrimaryButton,
                        !canAddMapRoutePoint ? styles.mapActionButtonDisabled : null,
                        pressed && canAddMapRoutePoint ? styles.mapActionButtonPressed : null,
                      ]}
                      onPress={handleAddMapRoutePoint}
                    >
                      <Text style={styles.mapActionPrimaryButtonText}>
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
                      accessibilityState={{
                        busy: riskAreaSavePending,
                        disabled: riskAreaSavePending || riskAreaAuthorizationRequired,
                      }}
                      disabled={riskAreaSavePending || riskAreaAuthorizationRequired}
                      testID={uiTestIds.guestMapLongPressAddRisk}
                      style={({ pressed }) => [
                        styles.mapActionButton,
                        styles.mapActionSecondaryButton,
                        riskAreaSavePending || riskAreaAuthorizationRequired
                          ? styles.mapActionButtonDisabled
                          : null,
                        pressed && !riskAreaSavePending && !riskAreaAuthorizationRequired
                          ? styles.mapActionButtonPressed
                          : null,
                      ]}
                      onPress={() => void handleAddMapRiskArea()}
                    >
                      <Text style={styles.mapActionSecondaryButtonText}>
                        {riskAreaSavePending ? 'Adding…' : 'Add risk area'}
                      </Text>
                    </Pressable>
                  </View>
                </LiveMapDetailContent>
              </BottomSheetScrollView>
            </Animated.View>
          ) : null}

          {!selectedRiskZone && !mapAction && !sheetCollapsed ? (
          <Animated.View
            style={[
              styles.sheetContentFrame,
              expandedSheetContentAnimatedStyle,
            ]}
          >
            <BottomSheetScrollView
              ref={routeSheetScrollRef}
              bounces={false}
              contentContainerStyle={[
                { paddingHorizontal: spacing.lg },
                searchStageActive
                  ? styles.sheetScrollContentSearching
                  : undefined,
                {
                  paddingBottom: showRouteFooter
                    ? spacing.md
                    : routeSheetBottomPadding,
                },
              ]}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.sheetScroll}
            >
              <View style={styles.sheetHeaderRow}>
                {routePlan && !searchStageActive ? (
                  <RoutePreview authenticated={authenticated} inline routePlan={routePlan} />
                ) : null}
                <Pressable
                  accessibilityLabel="Close directions"
                  accessibilityRole="button"
                  testID={uiTestIds.guestMapSheetClose}
                  style={({ pressed }) => [
                    styles.sheetCancel,
                    pressed ? styles.sheetCancelPressed : null,
                  ]}
                  onPress={() => animateRouteSheet(true)}
                >
                  <Text style={styles.sheetCancelText}>Cancel</Text>
                </Pressable>
              </View>

              {authenticated && !searchStageActive ? (
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
                      transitionActiveInput(null);
                      animateNextMapLayout(safeRouteMotion.disclosureDurationMs);
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
                  overline="From"
                  placeholder={originInputCopy.placeholder}
                  tone="origin"
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
                  onFocus={() => transitionActiveInput(GUEST_ROUTE_DRAFT_ORIGIN_ID)}
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
                    onFocus={() => transitionActiveInput(waypoint.id)}
                    onMove={(toIndex) => handleReorderWaypoint(waypoint.id, toIndex)}
                    onRemove={() => handleRemoveWaypoint(waypoint.id)}
                  />
                ))}
                <RouteInput
                  accessibilityHint={destinationInputCopy.accessibilityHint}
                  label={destinationInputCopy.accessibilityLabel}
                  overline="To"
                  placeholder={destinationInputCopy.placeholder}
                  tone="destination"
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
                  onFocus={() => transitionActiveInput(GUEST_ROUTE_DRAFT_DESTINATION_ID)}
                  onSubmitEditing={
                    routePlan ? handleOpenPreview : handlePlotRouteAction
                  }
                />
              </View>

              {activeInput ? (
                <LocationSearchResults
                  message={locationSearchMessage}
                  pending={locationSearchPending}
                  results={locationSearchResults}
                  resultsDisabled={locationSearchResultsDisabled}
                  shortcuts={locationSearchShortcuts}
                  onManage={handleManageLocation}
                  onSelect={handleSelectLocation}
                />
              ) : null}

              {!searchStageActive ? (
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
                  <Plus accessibilityElementsHidden color={colors.appleBlue} size={17} strokeWidth={2.1} />
                  <Text style={styles.addStopButtonText}>Add stop</Text>
                </Pressable>
              ) : null}
            </BottomSheetScrollView>

            {showRouteFooter ? (
            <View
              style={[
                styles.sheetFooter,
                {
                  paddingBottom: routeSheetBottomPadding,
                  paddingHorizontal: spacing.lg,
                },
              ]}
            >
              {!searchStageActive && routePlan && routeAlternatives.length > 1 ? (
                <RouteAlternativeSelector
                  routes={routeAlternatives}
                  selectedRouteId={routePlan.id}
                  onSelect={handleRouteAlternativeSelect}
                />
              ) : null}
              {!searchStageActive && routePlan ? (
                <MotionEntrance
                  replayKey={`ready-${travelMode}`}
                  variant="disclosure"
                >
                  <Text accessibilityRole="header" style={styles.routeChoiceLabel}>
                    Travel mode
                  </Text>
                  <TravelModeSelector
                    disabled={routePlanningDisabled}
                    selectedMode={travelMode}
                    onSelect={handleTravelModeChange}
                  />
                  <RouteOptionsPanel
                    expanded={routeOptionsOpen}
                    preferences={routePreferences}
                    onExpandedChange={(expanded) => {
                      animateNextMapLayout(safeRouteMotion.disclosureDurationMs);
                      setRouteOptionsOpen(expanded);
                    }}
                    onPreferenceChange={handleRoutePreferenceChange}
                  />
                </MotionEntrance>
              ) : null}

              {!searchStageActive && (
                routeMessage ||
                sessionNoticeState ||
                (locationErrorMessage && isCurrentLocationLabel(origin))
              ) ? (
                <MotionEntrance
                  replayKey={
                    routeMessage ||
                    sessionNoticeState?.message ||
                    locationErrorMessage
                  }
                  variant="disclosure"
                >
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
                </MotionEntrance>
              ) : null}

              <Pressable
                accessibilityHint={stagedRouteActionAccessibilityHint}
                accessibilityLabel={stagedRouteActionAccessibilityLabel}
                accessibilityRole="button"
                accessibilityState={{
                  busy: stagedRouteActionBusy,
                  disabled: stagedRouteActionDisabled,
                }}
                disabled={stagedRouteActionDisabled}
                testID={uiTestIds.guestMapPlotAction}
                style={({ pressed }) => [
                  styles.primaryButton,
                  stagedRouteActionDisabled ? styles.primaryButtonDisabled : null,
                  pressed && !stagedRouteActionDisabled ? styles.primaryButtonPressed : null
                ]}
                onPress={routePlan ? handleOpenPreview : handlePlotRouteAction}
              >
                {stagedRouteActionBusy ? (
                  <ActivityIndicator
                    color={stagedRouteActionDisabled ? colors.inkSoft : colors.surface}
                    size="small"
                  />
                ) : routePlan ? (
                  <Navigation
                    accessibilityElementsHidden
                    color={colors.onAccent}
                    size={18}
                    strokeWidth={2.3}
                  />
                ) : null}
                <Text numberOfLines={1} style={styles.primaryButtonText}>
                  {stagedRouteActionLabel}
                </Text>
              </Pressable>
            </View>
            ) : null}
          </Animated.View>
          ) : null}
        </SafeRouteBottomSheet>
      </SafeAreaView>
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
  const catalogPresentationKey = workspaces.length
    ? `ready:${workspaces.map((workspace) => workspace.id).join(':')}`
    : waitingForCatalog
      ? 'loading'
      : catalogUnavailable
        ? 'unavailable'
        : 'empty';
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
        <MotionEntrance
          key={catalogPresentationKey}
          replayKey={catalogPresentationKey}
          style={styles.workspaceSelectorContent}
          variant="disclosure"
        >
          <View style={styles.workspaceSelectorCopy}>
            <Text numberOfLines={1} style={styles.workspaceSelectorLabel}>Workspace</Text>
            <Text numberOfLines={1} style={styles.workspaceSelectorValue}>{value}</Text>
          </View>
          {(loading || errorMessage || workspaces.length) ? (
            <Text numberOfLines={1} style={styles.workspaceSelectorAction}>{action}</Text>
          ) : null}
        </MotionEntrance>
      </Pressable>

      {menuOpen && workspaces.length > 0 && !switchingDisabled ? (
        <MotionEntrance
          replayKey={catalogPresentationKey}
          variant="disclosure"
        >
          <ScrollView
            nestedScrollEnabled
            contentContainerStyle={styles.workspaceMenuContent}
            showsVerticalScrollIndicator={false}
            style={styles.workspaceMenu}
          >
            {workspaces.map((workspace, index) => {
              const selected = activeWorkspace?.id === workspace.id;
              return (
                <MotionEntrance
                  key={workspace.id}
                  delay={Math.min(index * 32, 128)}
                  variant="list"
                >
                  <Pressable
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
                </MotionEntrance>
              );
            })}
          </ScrollView>
        </MotionEntrance>
      ) : null}
    </View>
  );
}

function RouteAlternativeSelector({
  onSelect,
  routes,
  selectedRouteId,
}: {
  onSelect: (route: SavedSafeRoutePlan) => void;
  routes: SavedSafeRoutePlan[];
  selectedRouteId: string;
}) {
  return (
    <MotionEntrance
      replayKey={routes.map((route) => route.id).join(':')}
      style={styles.routeAlternativeSelector}
      variant="disclosure"
    >
      {routes.slice(0, 3).map((route, index) => {
        const selected = route.id === selectedRouteId;
        return (
          <Pressable
            key={route.id}
            accessibilityHint="Shows this backend route option on the map."
            accessibilityLabel={`Route ${index + 1}, ${route.route.eta}, ${route.route.distance}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            testID={uiTestIds.guestMapRouteAlternative(index + 1)}
            style={({ pressed }) => [
              styles.routeAlternativeOption,
              selected ? styles.routeAlternativeOptionSelected : null,
              pressed ? styles.routeAlternativeOptionPressed : null,
            ]}
            onPress={() => onSelect(route)}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.routeAlternativeTitle,
                selected ? styles.routeAlternativeTitleSelected : null,
              ]}
            >
                {index === 0 ? 'Primary' : `Alt ${index}`}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                styles.routeAlternativeMetric,
                selected ? styles.routeAlternativeMetricSelected : null,
              ]}
            >
              {route.route.eta}
            </Text>
          </Pressable>
        );
      })}
    </MotionEntrance>
  );
}

function TravelModeSelector({
  disabled = false,
  onSelect,
  selectedMode,
}: {
  disabled?: boolean;
  onSelect: (mode: SafeRouteTravelMode) => void;
  selectedMode: SafeRouteTravelMode;
}) {
  return (
    <View
      accessibilityLabel="Plot route by travel mode"
      accessibilityState={{ disabled }}
      style={styles.travelModeSelector}
      testID={uiTestIds.guestMapTravelModeSelector}
    >
      {GUEST_TRAVEL_MODE_OPTIONS.map((option) => (
        <TravelModeButton
          key={option.id}
          disabled={disabled}
          option={option}
          selected={option.id === selectedMode}
          onPress={() => onSelect(option.id)}
        />
      ))}
    </View>
  );
}

function TravelModeButton({
  disabled,
  onPress,
  option,
  selected,
}: {
  disabled: boolean;
  onPress: () => void;
  option: GuestTravelModeOption;
  selected: boolean;
}) {
  const iconColor = selected ? colors.appleBlue : colors.muted;
  const iconProps = {
    accessibilityElementsHidden: true as const,
    color: iconColor,
    size: 18,
    strokeWidth: 1.9,
  };

  return (
    <Pressable
      accessibilityLabel={option.accessibilityLabel}
      accessibilityHint="Plots this travel mode immediately."
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      testID={uiTestIds.guestMapTravelMode(option.id)}
      style={({ pressed }) => [
        styles.travelModeOption,
        selected ? styles.travelModeOptionSelected : null,
        disabled ? styles.travelModeOptionDisabled : null,
        pressed ? styles.travelModeOptionPressed : null,
      ]}
      onPress={onPress}
    >
      {option.id === 'drive' ? <CarFront {...iconProps} /> : null}
      {option.id === 'walk' ? <PersonStanding {...iconProps} /> : null}
      {option.id === 'cycle' ? <Bike {...iconProps} /> : null}
      <Text
        numberOfLines={1}
        style={[
          styles.travelModeLabel,
          selected ? styles.travelModeLabelSelected : null,
        ]}
      >
        {option.label}
      </Text>
    </Pressable>
  );
}

function RouteOptionsPanel({
  expanded,
  onExpandedChange,
  onPreferenceChange,
  preferences,
}: {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onPreferenceChange: (
    preference: keyof SafeRouteRoutePreferences,
    enabled: boolean,
  ) => void;
  preferences: SafeRouteRoutePreferences;
}) {
  const enabledCount = countEnabledSafeRoutePreferences(preferences);
  return (
    <View style={styles.routeOptions}>
      <Pressable
        accessibilityHint="Shows provider-enforced route avoidance settings."
        accessibilityLabel={`Route options, ${enabledCount} enabled`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        testID={uiTestIds.guestMapRouteOptions}
        style={({ pressed }) => [
          styles.routeOptionsHeader,
          pressed ? styles.routeOptionsHeaderPressed : null,
        ]}
        onPress={() => onExpandedChange(!expanded)}
      >
        <SlidersHorizontal
          accessibilityElementsHidden
          color={colors.appleBlue}
          size={17}
          strokeWidth={2}
        />
        <Text style={styles.routeOptionsTitle}>Route options</Text>
        <Text style={styles.routeOptionsCount}>
          {enabledCount ? `${enabledCount} on` : 'Standard'}
        </Text>
        {expanded ? (
          <ChevronUp
            accessibilityElementsHidden
            color={colors.muted}
            size={17}
            strokeWidth={2}
          />
        ) : (
          <ChevronDown
            accessibilityElementsHidden
            color={colors.muted}
            size={17}
            strokeWidth={2}
          />
        )}
      </Pressable>
      {expanded ? (
        <View style={styles.routeOptionsGrid}>
          {SAFE_ROUTE_PREFERENCE_OPTIONS.map((option) => (
            <Pressable
              key={option.id}
              accessibilityLabel={`Avoid ${option.label.toLowerCase()}`}
              accessibilityRole="switch"
              accessibilityState={{ checked: preferences[option.id] }}
              testID={uiTestIds.guestMapRoutePreference(option.id)}
              style={({ pressed }) => [
                styles.routePreference,
                pressed ? styles.routePreferencePressed : null,
              ]}
              onPress={() =>
                onPreferenceChange(option.id, !preferences[option.id])
              }
            >
              <Text numberOfLines={1} style={styles.routePreferenceLabel}>
                {option.label}
              </Text>
              <Switch
                accessibilityElementsHidden
                pointerEvents="none"
                ios_backgroundColor="#c8c8cc"
                trackColor={{ false: '#c8c8cc', true: colors.appleBlue }}
                value={preferences[option.id]}
              />
            </Pressable>
          ))}
        </View>
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
  overline,
  inputRef,
  onChangeText,
  onFocus,
  onSubmitEditing,
  placeholder,
  tone,
  testID,
  value,
  divided = false
}: {
  accessibilityHint: string;
  divided?: boolean;
  label: string;
  overline: string;
  inputRef?: (input: TextInput | null) => void;
  onChangeText: (value: string) => void;
  onFocus?: () => void;
  onSubmitEditing?: () => void;
  placeholder: string;
  tone: 'destination' | 'origin';
  testID: string;
  value: string;
}) {
  const nativeInputRef = useRef<TextInput | null>(null);
  const focusNativeInput = () => {
    nativeInputRef.current?.focus();
  };

  return (
    <Pressable
      accessible={false}
      style={[styles.inputRow, divided ? styles.inputRowDivider : null]}
      onPress={focusNativeInput}
    >
      <View style={styles.routeInputCopy}>
        <View style={styles.routeInputHeaderRow}>
          <View accessibilityElementsHidden style={styles.routeInputMarkerSpacer} />
          <Text accessibilityElementsHidden style={styles.routeInputOverline}>{overline}</Text>
        </View>
        <View style={styles.routeInputValueRow}>
          <View
            accessibilityElementsHidden
            style={[
              styles.routeInputMarker,
              tone === 'origin'
                ? styles.routeInputMarkerOrigin
                : styles.routeInputMarkerDestination,
            ]}
          >
            {tone === 'origin' ? (
              <Crosshair color={colors.safe} size={14} strokeWidth={2.3} />
            ) : (
              <MapPin color={colors.appleBlue} size={14} strokeWidth={2.3} />
            )}
          </View>
          <BottomSheetTextInput
            ref={(input) => {
              nativeInputRef.current = input ?? null;
              inputRef?.(input ?? null);
            }}
            accessibilityHint={accessibilityHint}
            accessibilityLabel={label}
            autoCapitalize="words"
            autoComplete="off"
            autoCorrect={false}
            importantForAutofill="no"
            maxLength={GUEST_ROUTE_LABEL_MAX_LENGTH}
            placeholder={placeholder}
            placeholderTextColor={colors.muted}
            returnKeyType={onSubmitEditing ? 'done' : 'default'}
            showSoftInputOnFocus
            style={styles.input}
            submitBehavior="blurAndSubmit"
            testID={testID}
            textContentType="none"
            value={value}
            onChangeText={onChangeText}
            onFocus={onFocus}
            onSubmitEditing={onSubmitEditing}
          />
        </View>
      </View>
    </Pressable>
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
      <View accessibilityElementsHidden style={styles.waypointMarker}>
        <Text style={styles.waypointMarkerLabel}>{index + 1}</Text>
      </View>
      <BottomSheetTextInput
        ref={(input) => inputRef?.(input ?? null)}
        accessibilityHint="Enter a place, address, or coordinate for this stop."
        accessibilityLabel={`Stop ${index + 1}`}
        autoCapitalize="words"
        autoComplete="off"
        autoCorrect={false}
        importantForAutofill="no"
        maxLength={GUEST_ROUTE_LABEL_MAX_LENGTH}
        placeholder={`Stop ${index + 1}`}
        placeholderTextColor={colors.muted}
        returnKeyType="next"
        style={styles.input}
        submitBehavior="blurAndSubmit"
        testID={uiTestIds.guestMapWaypointInput(stopId)}
        textContentType="none"
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
            <ChevronUp accessibilityElementsHidden color={colors.appleBlue} size={17} strokeWidth={2.1} />
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
            <ChevronDown accessibilityElementsHidden color={colors.appleBlue} size={17} strokeWidth={2.1} />
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
          <Trash2 accessibilityElementsHidden color={colors.danger} size={16} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
}

function LocationSearchResults({
  message,
  onManage,
  onSelect,
  pending,
  results,
  resultsDisabled,
  shortcuts,
}: {
  message: string;
  onManage: (result: GuestLocationSearchResult) => void;
  onSelect: (result: GuestLocationSearchResult) => void;
  pending: boolean;
  results: GuestLocationSearchResult[];
  resultsDisabled: boolean;
  shortcuts: LocationSearchShortcut[];
}) {
  if (!pending && !message && !results.length && !shortcuts.length) {
    return null;
  }

  return (
    <View
      style={styles.searchResults}
      testID={uiTestIds.guestMapSearchResults}
    >
      {shortcuts.length ? (
        <>
          <Text style={styles.searchSectionLabel}>Saved places</Text>
          {shortcuts.map((shortcut) => (
            <LocationSearchResultRow
              key={shortcut.id}
              icon={shortcut.kind}
              result={shortcut.result}
              onManage={onManage}
              onSelect={onSelect}
            />
          ))}
        </>
      ) : null}
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
      {results.length ? (
        <Text style={styles.searchSectionLabel}>Search results</Text>
      ) : null}
      {results.map((result) => (
        <LocationSearchResultRow
          disabled={resultsDisabled}
          key={result.id}
          result={result}
          onManage={onManage}
          onSelect={onSelect}
        />
      ))}
      {!pending && message ? (
        <Text accessible accessibilityLiveRegion="polite" style={styles.searchStateText}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

function LocationSearchResultRow({
  disabled = false,
  icon,
  onManage,
  onSelect,
  result,
}: {
  disabled?: boolean;
  icon?: LocationSearchShortcut['kind'];
  onManage: (result: GuestLocationSearchResult) => void;
  onSelect: (result: GuestLocationSearchResult) => void;
  result: GuestLocationSearchResult;
}) {
  const ShortcutIcon = icon === 'home'
    ? House
    : icon === 'work'
      ? BriefcaseBusiness
      : icon === 'recent'
        ? Clock3
        : Star;
  return (
    <View
      style={[
        styles.searchResultRow,
        disabled ? styles.searchResultRowDisabled : null,
      ]}
    >
        {icon ? (
          <ShortcutIcon
            accessibilityElementsHidden
            color={colors.appleBlue}
            size={17}
            strokeWidth={2}
          />
        ) : (
          <MapPin
            accessibilityElementsHidden
            color={colors.muted}
            size={17}
            strokeWidth={2}
          />
        )}
        <Pressable
          accessibilityHint="Selects this place for the active route field."
          accessibilityLabel={result.displayName}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          testID={uiTestIds.guestMapSearchResult(result.id)}
          style={({ pressed }) => [
            styles.searchResultSelection,
            pressed && !disabled ? styles.searchResultRowPressed : null,
          ]}
          onPress={() => onSelect(result)}
        >
          <Text numberOfLines={1} style={styles.searchResultTitle}>{result.label}</Text>
          <Text numberOfLines={1} style={styles.searchResultSubtitle}>{result.displayName}</Text>
        </Pressable>
        <Pressable
          accessibilityHint="Opens Home, Work, and favourite options."
          accessibilityLabel={`Manage ${result.label}`}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          hitSlop={6}
          testID={uiTestIds.guestMapManagePlace(result.id)}
          style={({ pressed }) => [
            styles.searchResultManage,
            pressed && !disabled ? styles.searchResultManagePressed : null,
          ]}
          onPress={() => onManage(result)}
        >
          <Ellipsis
            accessibilityElementsHidden
            color={colors.muted}
            size={19}
            strokeWidth={2.2}
          />
        </Pressable>
    </View>
  );
}

function createLocationSearchShortcuts(
  record: PersistentPlacesRecord | null,
  queryValue: string,
): LocationSearchShortcut[] {
  if (!record) {
    return [];
  }
  const query = queryValue.trim().toLowerCase();
  const candidates: Array<{
    kind: LocationSearchShortcut['kind'];
    place: PersistentSavedPlace | PersistentRecentDestination;
  }> = [
    ...(record.home ? [{ kind: 'home' as const, place: record.home }] : []),
    ...(record.work ? [{ kind: 'work' as const, place: record.work }] : []),
    ...record.favourites.map((place) => ({
      kind: 'favourite' as const,
      place,
    })),
    ...record.recents.map((place) => ({
      kind: 'recent' as const,
      place,
    })),
  ];
  const used = new Set<string>();
  return candidates
    .filter(({ place }) => (
      query.length < GUEST_LOCATION_SEARCH_MIN_LENGTH ||
      `${place.label} ${place.displayName}`.toLowerCase().includes(query)
    ))
    .filter(({ place }) => {
      const key = persistentPlaceMatchKey(place);
      if (used.has(key)) {
        return false;
      }
      used.add(key);
      return true;
    })
    .slice(0, 7)
    .map(({ kind, place }) => ({
      id: `${kind}-${place.id}`,
      kind,
      result: {
        category: place.category,
        coordinate: place.coordinate,
        displayName: place.displayName,
        id: place.sourceId || place.id,
        label: kind === 'home'
          ? 'Home'
          : kind === 'work'
            ? 'Work'
            : place.label,
      },
    }));
}

function toPersistentPlaceInput(
  result: GuestLocationSearchResult,
): PersistentPlaceInput {
  return {
    category: result.category,
    coordinate: result.coordinate,
    displayName: result.displayName,
    label: result.label,
    sourceId: result.id,
  };
}

function findMatchingFavourite(
  record: PersistentPlacesRecord | null,
  result: GuestLocationSearchResult,
): PersistentSavedPlace | null {
  if (!record) {
    return null;
  }
  return record.favourites.find(
    (candidate) => (
      candidate.sourceId === result.id ||
      coordinatesMatch(candidate.coordinate, result.coordinate, 0.00001)
    ),
  ) || null;
}

function persistentPlaceMatchKey(place: {
  coordinate: LatLng;
  sourceId?: string | null;
}): string {
  if (place.sourceId?.trim()) {
    return `source:${place.sourceId.trim()}`;
  }
  return [
    place.coordinate.latitude.toFixed(5),
    place.coordinate.longitude.toFixed(5),
  ].join(':');
}

function resolveGuestMapRenderedRiskZones({
  mapRegion,
  zones,
}: {
  mapRegion: Region;
  zones: RiskZone[];
}): RiskZone[] {
  const halfLatitudeDelta = Math.max(0.005, mapRegion.latitudeDelta / 2);
  const halfLongitudeDelta = Math.max(0.005, mapRegion.longitudeDelta / 2);
  const bounds = {
    south: Math.max(-90, mapRegion.latitude - halfLatitudeDelta),
    west: Math.max(-180, mapRegion.longitude - halfLongitudeDelta),
    north: Math.min(90, mapRegion.latitude + halfLatitudeDelta),
    east: Math.min(180, mapRegion.longitude + halfLongitudeDelta),
  };

  return zones
    .filter((zone) =>
      areaRiskItemIntersectsBounds({
        ...zone,
        coordinates:
          zone.polygonCoordinates?.length
            ? zone.polygonCoordinates
            : zone.routeSegmentCoordinates,
      }, bounds)
    )
    .sort((left, right) => {
      const severityPriority =
        guestRiskSeverityPriority(right.severity) -
        guestRiskSeverityPriority(left.severity);
      if (severityPriority) {
        return severityPriority;
      }
      return guestRiskDistanceFromMapCenter(left, mapRegion) -
        guestRiskDistanceFromMapCenter(right, mapRegion);
    })
    .slice(0, GUEST_MAP_MAX_RENDERED_RISK_ZONES);
}

function guestRiskSeverityPriority(severity: RiskZone['severity']): number {
  if (severity === 'high') {
    return 3;
  }
  return severity === 'medium' ? 2 : 1;
}

function guestRiskDistanceFromMapCenter(zone: RiskZone, region: Region): number {
  const latitudeDelta = zone.coordinate.latitude - region.latitude;
  const longitudeDelta = zone.coordinate.longitude - region.longitude;
  return latitudeDelta * latitudeDelta + longitudeDelta * longitudeDelta;
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

function GuestDraftCheckpointMarker({
  checkpoint,
  selected,
}: {
  checkpoint: RouteCheckpoint;
  selected: boolean;
}) {
  return (
    <Marker
      coordinate={checkpoint.coordinate}
      title={checkpoint.caption}
      description={checkpointKindLabel(checkpoint.kind)}
      anchor={checkpoint.kind === 'destination'
        ? { x: 0.5, y: 0.88 }
        : { x: 0.5, y: 0.5 }}
      zIndex={selected ? 92 : 88}
      tracksViewChanges={false}
    >
      <View
        accessibilityLabel={`Selected ${checkpointKindLabel(checkpoint.kind).toLowerCase()}: ${checkpoint.caption}`}
        accessibilityRole="image"
        style={styles.markerHitArea}
      >
        {selected ? <View style={styles.markerSelectionHalo} /> : null}
        {checkpoint.kind === 'destination' ? (
          <MapPin
            accessibilityElementsHidden
            color={colors.appleBlue}
            fill={colors.appleBlue}
            size={28}
            strokeWidth={1.8}
          />
        ) : (
          <View
            style={[
              styles.marker,
              checkpoint.kind === 'origin'
                ? styles.markerOrigin
                : styles.markerWaypoint,
              selected ? styles.markerSelected : null,
            ]}
          >
            <View style={styles.markerCore} />
          </View>
        )}
      </View>
    </Marker>
  );
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
