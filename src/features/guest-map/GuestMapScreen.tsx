import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
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
import { colors } from '../../theme';
import { uiTestIds } from '../../testing/uiTestIds';
import type { SavedSafeRoutePlan } from '../live-map/liveMapTypes';
import type { RiskZone } from '../live-map/liveMapTypes';
import { RiskOverlay } from '../live-map/LiveMapMarkers';
import { useViewportRiskAreas } from '../live-map/useViewportRiskAreas';
import { mergeRiskZonesById } from '../live-map/areaRiskApiCore';
import { fetchAreaRiskAlongRoute } from '../live-map/routeRiskCorridorApi';
import { buildLiveRerouteAvoidRectangles } from '../live-map/liveReroutePlan';
import { useLiveLocation } from '../live-map/useLiveLocation';
import { isPreviewAccessToken } from '../auth/previewSession';
import { ApiSessionExpiredError } from '../api/apiClient';
import { fetchSavedRoutes } from '../routes/routeApi';
import {
  GUEST_MAP_REGION,
  GUEST_ROUTE_LABEL_MAX_LENGTH,
  createGuestMapHomeCopy,
  createGuestRoadSnappedRoutePlan,
  createGuestRouteActionState,
  createGuestRouteInputCopy,
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
  resolveGuestRouteDraftStopCoordinate,
  setGuestRouteCurrentLocation
} from './guestRouteDraft';
import { guestMapStyles as styles } from './GuestMapScreen.styles';
import { createGuestRiskArea } from './guestRiskAreaApi';

const GUEST_ROUTE_PROVIDER_UI_TIMEOUT_MS = 15000;
const GUEST_LOCATION_SEARCH_DEBOUNCE_MS = 320;
const GUEST_LOCATION_SEARCH_MIN_LENGTH = 2;

type GuestRoadRoutePreviewFetcher = (
  options: GuestRoadRoutePreviewOptions
) => Promise<GuestRoadRoutePreview | null>;

interface GuestMapScreenProps {
  accessToken?: string | null;
  authenticated: boolean;
  onOpenFullAccessFeature: (feature: GuestFullAccessFeature) => void;
  onOpenRoutePreview?: (routePlan: SavedSafeRoutePlan) => void;
  onSessionExpired?: (message?: string) => void;
  roadRoutePreviewFetcher?: GuestRoadRoutePreviewFetcher;
  onSignIn: () => void;
}

export function GuestMapScreen({
  accessToken,
  authenticated,
  onOpenFullAccessFeature,
  onOpenRoutePreview,
  onSessionExpired,
  roadRoutePreviewFetcher,
  onSignIn
}: GuestMapScreenProps) {
  const viewport = useWindowDimensions();
  const mapRef = useRef<MapView | null>(null);
  const activeRoadRouteRequestRef = useRef<AbortController | null>(null);
  const activeLocationSearchRef = useRef<AbortController | null>(null);
  const hasCenteredOnLocationRef = useRef(false);
  const pendingOpenPreviewRef = useRef(false);
  const roadRouteRequestIdRef = useRef(0);
  const sheetProgress = useRef(new Animated.Value(0)).current;
  const sheetGestureActionRef = useRef<(collapsed: boolean) => void>(() => undefined);
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
  const [mapAction, setMapAction] = useState<{
    coordinate: LatLng;
    label: string;
    pending: boolean;
  } | null>(null);
  const [mapRegion, setMapRegion] = useState<Region>(GUEST_MAP_REGION);
  const [routeMessage, setRouteMessage] = useState('');
  const [routingClientId, setRoutingClientId] = useState<string | null>(null);
  const [selectedRiskZone, setSelectedRiskZone] = useState<RiskZone | null>(null);
  const [routePlan, setRoutePlan] = useState<SavedSafeRoutePlan | null>(null);
  const [roadPreviewPending, setRoadPreviewPending] = useState(false);
  const [riskAreaSavePending, setRiskAreaSavePending] = useState(false);
  const {
    coordinate: liveLocation,
    errorMessage: locationErrorMessage,
    permissionStatus
  } = useLiveLocation({ permissionRequested: true });
  const liveCoordinate = liveLocation
    ? { latitude: liveLocation.latitude, longitude: liveLocation.longitude }
    : null;
  const origin = routeDraft.origin.label;
  const destination = routeDraft.destination.label;
  const routeSheetMaxHeight = Math.max(
    230,
    Math.min(520, viewport.height * (activeInput ? 0.43 : 0.62))
  );
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
  const routeActionDisabled = routeAction.disabled || roadPreviewPending;
  const routeActionLabel = roadPreviewPending ? 'Finding safest route…' : routeAction.label;
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
    accessToken: accessToken && !isPreviewAccessToken(accessToken) ? accessToken : null,
    clientId: routingClientId,
    region: mapRegion
  });
  const animateRouteSheet = (collapsed: boolean) => {
    setSheetCollapsed(collapsed);
    Keyboard.dismiss();
    if (collapsed) {
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
    dispatchRouteDraft({
      coordinate: liveCoordinate,
      type: 'current-location/set'
    });
  }, [liveCoordinate?.latitude, liveCoordinate?.longitude]);

  useEffect(() => {
    let active = true;
    if (!authenticated || !accessToken?.trim()) {
      setRoutingClientId(null);
      return () => {
        active = false;
      };
    }

    void fetchSavedRoutes(accessToken).then((result) => {
      if (active) {
        setRoutingClientId(result.selectedClientId || result.clients[0]?.id || null);
      }
    }).catch(() => {
      if (active) {
        setRoutingClientId(null);
      }
    });

    return () => {
      active = false;
    };
  }, [accessToken, authenticated]);

  useEffect(() => {
    if (
      selectedRiskZone &&
      !viewportRisk.zones.some((zone) => zone.id === selectedRiskZone.id)
    ) {
      setSelectedRiskZone(null);
    }
  }, [selectedRiskZone, viewportRisk.zones]);

  useEffect(() => {
    if (!liveCoordinate || hasCenteredOnLocationRef.current || routePlan) {
      return;
    }

    hasCenteredOnLocationRef.current = true;
    const nextRegion = regionAroundCoordinate(liveCoordinate);
    setMapRegion(nextRegion);
    mapRef.current?.animateToRegion(nextRegion, 650);
  }, [liveCoordinate?.latitude, liveCoordinate?.longitude, routePlan]);

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

    const controller = new AbortController();
    activeLocationSearchRef.current = controller;
    const timer = setTimeout(() => {
      setLocationSearchPending(true);
      void searchGuestLocations(query, {
        bias: {
          center: liveCoordinate,
          region: mapRegion
        },
        serviceBaseUrl: LUNARCHAIN_API_BASE,
        signal: controller.signal
      }).then((results) => {
        if (controller.signal.aborted) {
          return;
        }
        setLocationSearchResults(results);
        setLocationSearchMessage(results.length ? '' : 'No matching places found.');
      }).finally(() => {
        if (!controller.signal.aborted) {
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
  }, []);

  const cancelRoadRouteUpgrade = () => {
    roadRouteRequestIdRef.current += 1;
    pendingOpenPreviewRef.current = false;
    activeRoadRouteRequestRef.current?.abort();
    activeRoadRouteRequestRef.current = null;
    setRoadPreviewPending(false);
  };

  const handlePlotRoute = async () => {
    if (routeActionDisabled) {
      return;
    }

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
    const unresolvedStopIds = getGuestRouteDraftUnresolvedStopIds(plottingDraft);
    if (unresolvedStopIds.length) {
      const firstStopId = unresolvedStopIds[0];
      const firstStop = findGuestRouteDraftStop(plottingDraft, firstStopId);
      setRouteMessage(
        firstStopId === GUEST_ROUTE_DRAFT_ORIGIN_ID && permissionStatus !== 'denied'
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

    const localRoutePlan = createGuestRoutePlan({
      authenticated,
      checkpoints,
      destinationCoordinate: resolvedDestinationCoordinate,
      origin,
      originCoordinate: resolvedOriginCoordinate,
      destination,
      riskZones: viewportRisk.zones
    });
    setRoutePlan(SAFEROUTE_PREVIEW_MODE_ENABLED ? localRoutePlan : null);
    upgradeGuestRouteWithRoadPreview(localRoutePlan);
  };

  const upgradeGuestRouteWithRoadPreview = (localRoutePlan: SavedSafeRoutePlan) => {
    const stops = resolveRoadPreviewStops(localRoutePlan);

    if (!stops) {
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
    let acceptedRoadPreview = false;

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
        accessToken,
        clientId: routingClientId
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
          roadRouteRequestIdRef.current !== requestId
        ) {
          return;
        }

        let finalRoadPreview = roadPreview;
        let finalRiskZones = riskZonesSnapshot;
        try {
          const corridorRiskZones = await fetchAreaRiskAlongRoute(
            roadPreview.coordinates,
            {
              accessToken: accessToken && !isPreviewAccessToken(accessToken)
                ? accessToken
                : null,
              clientId: routingClientId || undefined,
              maxChunks: 8,
              signal: controller.signal,
              timeoutMs: 9000
            }
          );
          if (
            controller.signal.aborted ||
            roadRouteRequestIdRef.current !== requestId
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
        } catch {
          if (!SAFEROUTE_PREVIEW_MODE_ENABLED) {
            return;
          }
        }

        if (
          controller.signal.aborted ||
          roadRouteRequestIdRef.current !== requestId
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
          riskZones: finalRiskZones,
          roadSnappedCoordinates: finalRoadPreview.coordinates,
          routeDistanceMeters: finalRoadPreview.distanceMeters,
          routeDurationSeconds: finalRoadPreview.durationSeconds,
          routeGuidanceSteps: finalRoadPreview.guidanceSteps
        });

        if (roadRoutePlan) {
          if (routingClientId) {
            roadRoutePlan.clientId = routingClientId;
          }
          acceptedRoadPreview = true;
          setRoutePlan(roadRoutePlan);
          openPendingPreview(roadRoutePlan);
        }
      })
      .catch(() => {
        // The finalizer keeps preview-mode fixtures usable while production fails
        // closed instead of presenting straight-line geometry as a drivable route.
      })
      .finally(() => {
        if (roadRouteRequestIdRef.current === requestId) {
          activeRoadRouteRequestRef.current = null;
          setRoadPreviewPending(false);
          if (!acceptedRoadPreview) {
            if (SAFEROUTE_PREVIEW_MODE_ENABLED) {
              setRoutePlan(localRoutePlan);
              openPendingPreview(localRoutePlan);
            } else {
              pendingOpenPreviewRef.current = false;
              setRouteMessage('A road-snapped safe route is unavailable. Retry in a moment.');
            }
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
    setMapAction({
      coordinate,
      label: formatCoordinateLabel(coordinate),
      pending: true
    });
    const controller = new AbortController();
    void reverseGeocodeGuestLocation(coordinate, {
      serviceBaseUrl: LUNARCHAIN_API_BASE,
      signal: controller.signal,
      timeoutMs: 7000
    }).then((result) => {
      setMapAction((current) => current && coordinatesMatch(current.coordinate, coordinate)
        ? {
            ...current,
            label: result?.displayName || current.label,
            pending: false
          }
        : current);
    });
  };

  const handleAddMapWaypoint = () => {
    if (!mapAction || !canAddGuestRouteWaypoint(routeDraft)) {
      return;
    }
    dispatchRouteDraft({
      options: {
        coordinate: mapAction.coordinate,
        label: mapAction.label.slice(0, GUEST_ROUTE_LABEL_MAX_LENGTH),
        select: false
      },
      type: 'waypoint/add'
    });
    cancelRoadRouteUpgrade();
    setRoutePlan(null);
    setRouteMessage('Stop added. Plot the route when ready.');
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
    if (!action || !routingClientId || !accessToken || isPreviewAccessToken(accessToken)) {
      setMapAction(null);
      setRouteMessage('Your workspace is still loading. Try adding the risk area again.');
      return;
    }
    setRiskAreaSavePending(true);
    try {
      await createGuestRiskArea({
        accessToken,
        clientId: routingClientId,
        coordinate: action.coordinate,
        locationLabel: action.label
      });
      setMapAction(null);
      setRouteMessage('Risk area added for your workspace.');
      viewportRisk.retry();
    } catch (error) {
      if (error instanceof ApiSessionExpiredError) {
        setMapAction(null);
        onSessionExpired?.(error.message);
      } else {
        setRouteMessage(error instanceof Error
          ? error.message
          : 'The risk area could not be added. Try again.');
      }
    } finally {
      setRiskAreaSavePending(false);
    }
  };

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={GUEST_MAP_REGION}
        showsBuildings={false}
        showsCompass={false}
        showsIndoors={false}
        showsIndoorLevelPicker={false}
        showsMyLocationButton={false}
        showsUserLocation={permissionStatus === 'granted'}
        showsScale={false}
        showsTraffic={false}
        toolbarEnabled={false}
        userInterfaceStyle="light"
        onLongPress={(event) => handleMapLongPress(event.nativeEvent.coordinate)}
        onRegionChangeComplete={setMapRegion}
      >
        {viewportRisk.zones.map((zone) => (
          <RiskOverlay
            key={zone.id}
            selected={selectedRiskZone?.id === zone.id}
            zone={zone}
            onPress={setSelectedRiskZone}
          />
        ))}
        {routePlan ? (
          <>
            <Polyline
              coordinates={routePlan.route.coordinates}
              strokeColor="rgba(255, 255, 255, 0.9)"
              strokeWidth={13}
              lineCap="round"
              lineJoin="round"
            />
            <Polyline
              coordinates={routePlan.route.coordinates}
              strokeColor="rgba(60, 60, 67, 0.18)"
              strokeWidth={10}
              lineCap="round"
              lineJoin="round"
            />
            <Polyline
              coordinates={routePlan.route.coordinates}
              strokeColor={colors.routePrimary}
              strokeWidth={7}
              lineCap="round"
              lineJoin="round"
            />
            {routePlan.checkpoints.map((checkpoint) => (
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

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
        pointerEvents="box-none"
        style={styles.overlay}
      >
      <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.topBar}>
          {viewportRisk.loading || viewportRisk.errorMessage ? (
            <Pressable
              accessibilityLabel={viewportRisk.loading
                ? 'Risk areas are loading'
                : 'Retry loading risk areas'}
              accessibilityRole={viewportRisk.loading ? 'progressbar' : 'button'}
              disabled={viewportRisk.loading}
              style={styles.riskLoadStatus}
              onPress={viewportRisk.retry}
            >
              {viewportRisk.loading ? (
                <ActivityIndicator color={colors.appleBlue} size="small" />
              ) : null}
              <Text numberOfLines={1} style={styles.riskLoadStatusText}>
                {viewportRisk.loading ? 'Loading risks…' : 'Retry risks'}
              </Text>
            </Pressable>
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
              style={[
                styles.signInButtonText,
                authenticated ? styles.signInButtonTextAuthenticated : null
              ]}
            >
              {mapHomeCopy.primaryActionLabel}
            </Text>
          </Pressable>
        </View>

        {selectedRiskZone ? (
          <GuestRiskDetail zone={selectedRiskZone} onDismiss={() => setSelectedRiskZone(null)} />
        ) : null}

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
              <Text style={styles.mapActionSubtitle}>Choose what to add here.</Text>
            </View>
            <View style={styles.mapActionButtons}>
              <Pressable
                accessibilityLabel="Add this location as a route stop"
                accessibilityRole="button"
                disabled={!canAddGuestRouteWaypoint(routeDraft)}
                testID={uiTestIds.guestMapLongPressAddWaypoint}
                style={({ pressed }) => [
                  styles.mapActionButton,
                  pressed ? styles.mapActionButtonPressed : null
                ]}
                onPress={handleAddMapWaypoint}
              >
                <Text style={styles.mapActionButtonText}>Add stop</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={authenticated ? 'Add a risk area here' : 'Sign in to add a risk area'}
                accessibilityRole="button"
                accessibilityState={{ disabled: riskAreaSavePending }}
                disabled={riskAreaSavePending}
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

              <View style={styles.inputStack}>
                <RouteInput
                  divided
                  accessibilityHint={originInputCopy.accessibilityHint}
                  label={originInputCopy.accessibilityLabel}
                  placeholder={originInputCopy.placeholder}
                  testID={uiTestIds.guestMapOriginInput}
                  value={origin}
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

              {routeMessage || (locationErrorMessage && isCurrentLocationLabel(origin)) ? (
                <Text accessibilityRole="alert" style={styles.routeMessage}>
                  {routeMessage || locationErrorMessage}
                </Text>
              ) : null}

              <Pressable
                accessibilityHint={routeAction.accessibilityHint}
                accessibilityLabel={routeAction.accessibilityLabel}
                accessibilityRole="button"
                accessibilityState={{ disabled: routeActionDisabled }}
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
              accessibilityHint="Expands route planning controls."
              accessibilityLabel={`Route from ${origin || 'start point'} to ${destination || 'destination'}`}
              accessibilityRole="button"
              testID={uiTestIds.guestMapCollapsedSheet}
              style={({ pressed }) => [
                styles.collapsedSheetButton,
                pressed ? styles.collapsedSheetPressed : null
              ]}
              onPress={() => animateRouteSheet(false)}
            >
              <View style={styles.collapsedSheetCopy}>
                <Text numberOfLines={1} style={styles.collapsedSheetTitle}>
                  {destination || 'Where to?'}
                </Text>
                <Text numberOfLines={1} style={styles.collapsedSheetSubtitle}>
                  {routeDraft.waypoints.length
                    ? `${origin} · ${routeDraft.waypoints.length} stop${routeDraft.waypoints.length === 1 ? '' : 's'}`
                    : origin}
                </Text>
              </View>
              {routePlan ? (
                <RoutePreview authenticated={authenticated} inline routePlan={routePlan} />
              ) : (
                <Text style={styles.collapsedSheetAction}>Expand</Text>
              )}
            </Pressable>
          </Animated.View>
        </View>
      </SafeAreaView>
      </KeyboardAvoidingView>
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
            style={styles.waypointAction}
            onPress={() => onMove(index - 1)}
          >
            <Text style={styles.waypointActionText}>Earlier</Text>
          </Pressable>
        ) : null}
        {canMoveDown ? (
          <Pressable
            accessibilityLabel={`Move stop ${index + 1} later`}
            accessibilityRole="button"
            style={styles.waypointAction}
            onPress={() => onMove(index + 1)}
          >
            <Text style={styles.waypointActionText}>Later</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel={`Remove stop ${index + 1}`}
          accessibilityRole="button"
          style={styles.waypointAction}
          onPress={onRemove}
        >
          <Text style={styles.waypointRemoveText}>Remove</Text>
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

function GuestRiskDetail({
  onDismiss,
  zone
}: {
  onDismiss: () => void;
  zone: RiskZone;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${zone.title}. ${zone.severity} risk. ${zone.description}`}
      style={styles.guestRiskDetail}
      testID={uiTestIds.liveMapRiskDetail}
    >
      <View style={styles.guestRiskDetailHeader}>
        <View style={styles.guestRiskDetailCopy}>
          <Text style={styles.guestRiskEyebrow}>Risk area</Text>
          <Text numberOfLines={1} style={styles.guestRiskTitle}>{zone.title}</Text>
        </View>
        <Pressable
          accessibilityLabel="Close risk details"
          accessibilityRole="button"
          style={styles.guestRiskDismiss}
          onPress={onDismiss}
        >
          <Text style={styles.guestRiskDismissText}>Done</Text>
        </Pressable>
      </View>
      <Text numberOfLines={1} style={styles.guestRiskMeta}>
        {zone.severity.charAt(0).toUpperCase() + zone.severity.slice(1)} · {zone.category}
      </Text>
      <Text numberOfLines={3} style={styles.guestRiskBody}>{zone.description}</Text>
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
