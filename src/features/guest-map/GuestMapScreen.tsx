import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View
} from 'react-native';
import MapView, { Marker, Polyline, type LatLng, type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SAFEROUTE_PREVIEW_MODE_ENABLED } from '../../config/env';
import { colors } from '../../theme';
import { uiTestIds } from '../../testing/uiTestIds';
import type { SavedSafeRoutePlan } from '../live-map/liveMapTypes';
import { useLiveLocation } from '../live-map/useLiveLocation';
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
  fetchGuestRoadRoutePreview,
  type GuestRoadRoutePreview,
  type GuestRoadRoutePreviewOptions
} from './guestRoadRouteProvider';
import {
  parseCoordinateSearch,
  searchGuestLocations,
  type GuestLocationSearchResult
} from './guestLocationSearch';
import { guestMapStyles as styles } from './GuestMapScreen.styles';

const GUEST_ROUTE_PROVIDER_UI_TIMEOUT_MS = 3500;
const GUEST_LOCATION_SEARCH_DEBOUNCE_MS = 320;
const GUEST_LOCATION_SEARCH_MIN_LENGTH = 2;

type GuestRoadRoutePreviewFetcher = (
  options: GuestRoadRoutePreviewOptions
) => Promise<GuestRoadRoutePreview | null>;

interface GuestMapScreenProps {
  authenticated: boolean;
  onOpenFullAccessFeature: (feature: GuestFullAccessFeature) => void;
  onOpenRoutePreview?: (routePlan: SavedSafeRoutePlan) => void;
  roadRoutePreviewFetcher?: GuestRoadRoutePreviewFetcher;
  onSignIn: () => void;
}

export function GuestMapScreen({
  authenticated,
  onOpenFullAccessFeature,
  onOpenRoutePreview,
  roadRoutePreviewFetcher = fetchGuestRoadRoutePreview,
  onSignIn
}: GuestMapScreenProps) {
  const mapRef = useRef<MapView | null>(null);
  const activeRoadRouteRequestRef = useRef<AbortController | null>(null);
  const activeLocationSearchRef = useRef<AbortController | null>(null);
  const hasCenteredOnLocationRef = useRef(false);
  const pendingOpenPreviewRef = useRef(false);
  const roadRouteRequestIdRef = useRef(0);
  const [origin, setOrigin] = useState('Current location');
  const [destination, setDestination] = useState('');
  const [originSelection, setOriginSelection] = useState<GuestLocationSearchResult | null>(null);
  const [destinationSelection, setDestinationSelection] = useState<GuestLocationSearchResult | null>(null);
  const [activeInput, setActiveInput] = useState<'origin' | 'destination' | null>(null);
  const [locationSearchResults, setLocationSearchResults] = useState<GuestLocationSearchResult[]>([]);
  const [locationSearchPending, setLocationSearchPending] = useState(false);
  const [locationSearchMessage, setLocationSearchMessage] = useState('');
  const [mapRegion, setMapRegion] = useState<Region>(GUEST_MAP_REGION);
  const [routeMessage, setRouteMessage] = useState('');
  const [routePlan, setRoutePlan] = useState<SavedSafeRoutePlan | null>(null);
  const [roadPreviewPending, setRoadPreviewPending] = useState(false);
  const {
    coordinate: liveLocation,
    errorMessage: locationErrorMessage,
    permissionStatus
  } = useLiveLocation({ permissionRequested: true });
  const liveCoordinate = liveLocation
    ? { latitude: liveLocation.latitude, longitude: liveLocation.longitude }
    : null;
  const routePlotted = Boolean(routePlan);
  const mapHomeCopy = createGuestMapHomeCopy(authenticated);
  const showSheetSubtitle = shouldShowGuestMapSubtitle(routePlotted);
  const routeAction = createGuestRouteActionState({
    destination,
    routePlotted
  });
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

    const query = activeInput === 'origin' ? origin : destination;
    const selected = activeInput === 'origin' ? originSelection : destinationSelection;
    if (
      query.trim().length < GUEST_LOCATION_SEARCH_MIN_LENGTH ||
      query.trim() === selected?.displayName ||
      (activeInput === 'origin' && isCurrentLocationLabel(query))
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
    destination,
    destinationSelection,
    liveCoordinate?.latitude,
    liveCoordinate?.longitude,
    mapRegion.latitude,
    mapRegion.longitude,
    mapRegion.latitudeDelta,
    mapRegion.longitudeDelta,
    origin,
    originSelection
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
    if (routeAction.disabled) {
      return;
    }

    Keyboard.dismiss();
    cancelRoadRouteUpgrade();
    setRouteMessage('');
    setActiveInput(null);

    const resolvedOriginCoordinate = resolveOriginCoordinate({
      liveCoordinate,
      origin,
      originSelection
    });
    if (!resolvedOriginCoordinate) {
      setRouteMessage(
        permissionStatus === 'denied'
          ? 'Choose a start point or enable location access.'
          : 'Finding your current location…'
      );
      return;
    }

    const resolvedDestination = destinationSelection ||
      parseCoordinateSearch(destination) ||
      (SAFEROUTE_PREVIEW_MODE_ENABLED
        ? await resolveTypedLocation(destination, mapRegion, liveCoordinate)
        : null);
    if (!resolvedDestination) {
      setRouteMessage('Choose a destination from the search results.');
      setActiveInput('destination');
      return;
    }
    if (!destinationSelection) {
      setDestinationSelection(resolvedDestination);
      setDestination(resolvedDestination.displayName);
    }

    const localRoutePlan = createGuestRoutePlan({
      authenticated,
      destinationCoordinate: resolvedDestination.coordinate,
      origin,
      originCoordinate: resolvedOriginCoordinate,
      destination: resolvedDestination.displayName,
      riskZones: []
    });
    setRoutePlan(localRoutePlan);
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
    const riskZonesSnapshot = localRoutePlan.riskZones;
    const authenticatedSnapshot = authenticated;

    const openPendingPreview = (nextRoutePlan: SavedSafeRoutePlan) => {
      if (!pendingOpenPreviewRef.current) {
        return;
      }

      pendingOpenPreviewRef.current = false;
      onOpenRoutePreview?.(nextRoutePlan);
    };

    void roadRoutePreviewFetcher({
      signal: controller.signal,
      stops,
      timeoutMs: GUEST_ROUTE_PROVIDER_UI_TIMEOUT_MS
    })
      .then((roadPreview) => {
        if (
          !roadPreview ||
          controller.signal.aborted ||
          roadRouteRequestIdRef.current !== requestId
        ) {
          return;
        }

        const roadRoutePlan = createGuestRoadSnappedRoutePlan({
          authenticated: authenticatedSnapshot,
          destination: destinationSnapshot,
          destinationCoordinate: destinationCoordinateSnapshot,
          origin: originSnapshot,
          originCoordinate: originCoordinateSnapshot,
          riskZones: riskZonesSnapshot,
          roadSnappedCoordinates: roadPreview.coordinates,
          routeDistanceMeters: roadPreview.distanceMeters,
          routeDurationSeconds: roadPreview.durationSeconds
        });

        if (roadRoutePlan) {
          setRoutePlan(roadRoutePlan);
          openPendingPreview(roadRoutePlan);
        }
      })
      .catch(() => {
        // The local route is already visible. Keep the map-first experience calm
        // if the road preview provider times out, aborts, or fails offline.
      })
      .finally(() => {
        if (roadRouteRequestIdRef.current === requestId) {
          activeRoadRouteRequestRef.current = null;
          setRoadPreviewPending(false);
          openPendingPreview(localRoutePlan);
        }
      });
  };

  const handleOpenPreview = () => {
    if (routeAction.disabled) {
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

  const handleOriginChange = (value: string) => {
    cancelRoadRouteUpgrade();
    setOriginSelection(null);
    setOrigin(value);
    setRoutePlan(null);
    setRouteMessage('');
  };

  const handleDestinationChange = (value: string) => {
    cancelRoadRouteUpgrade();
    setDestinationSelection(null);
    setDestination(value);
    setRoutePlan(null);
    setRouteMessage('');
  };

  const handleSelectLocation = (result: GuestLocationSearchResult) => {
    cancelRoadRouteUpgrade();
    if (activeInput === 'origin') {
      setOrigin(result.displayName);
      setOriginSelection(result);
    } else {
      setDestination(result.displayName);
      setDestinationSelection(result);
    }
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
        onRegionChangeComplete={setMapRegion}
      >
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
                description={checkpoint.kind === 'origin' ? 'Route start' : 'Destination'}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View
                  accessibilityLabel={`${checkpoint.kind === 'origin' ? 'Route start' : 'Destination'}: ${checkpoint.caption}`}
                  accessibilityRole="image"
                  style={[
                    styles.marker,
                    checkpoint.kind === 'origin' ? styles.markerOrigin : styles.markerDestination
                  ]}
                >
                  <View style={styles.markerCore} />
                </View>
              </Marker>
            ))}
          </>
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

        <View pointerEvents="box-none" style={styles.sheet}>
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
              onFocus={() => setActiveInput('origin')}
            />
            <RouteInput
              accessibilityHint={destinationInputCopy.accessibilityHint}
              label={destinationInputCopy.accessibilityLabel}
              placeholder={destinationInputCopy.placeholder}
              testID={uiTestIds.guestMapDestinationInput}
              value={destination}
              onChangeText={handleDestinationChange}
              onFocus={() => setActiveInput('destination')}
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

          {routeMessage || (locationErrorMessage && isCurrentLocationLabel(origin)) ? (
            <Text accessibilityRole="alert" style={styles.routeMessage}>
              {routeMessage || locationErrorMessage}
            </Text>
          ) : null}

          <Pressable
            accessibilityHint={routeAction.accessibilityHint}
            accessibilityLabel={routeAction.accessibilityLabel}
            accessibilityRole="button"
            accessibilityState={{ disabled: routeAction.disabled }}
            disabled={routeAction.disabled}
            testID={uiTestIds.guestMapPlotAction}
            style={({ pressed }) => [
              styles.primaryButton,
              routeAction.disabled ? styles.primaryButtonDisabled : null,
              pressed && !routeAction.disabled ? styles.primaryButtonPressed : null
            ]}
            onPress={routePlan ? handleOpenPreview : () => void handlePlotRoute()}
          >
            <Text numberOfLines={1} style={styles.primaryButtonText}>{routeAction.label}</Text>
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
        </View>
      </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

function resolveRoadPreviewStops(routePlan: SavedSafeRoutePlan) {
  if (!routePlan.riskZones.length) {
    const checkpointCoordinates = routePlan.checkpoints.map((checkpoint) => checkpoint.coordinate);
    if (checkpointCoordinates.length >= 2) {
      return checkpointCoordinates;
    }
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

async function resolveTypedLocation(
  query: string,
  region: Region,
  liveCoordinate: LatLng | null
): Promise<GuestLocationSearchResult | null> {
  const results = await searchGuestLocations(query, {
    bias: {
      center: liveCoordinate,
      region
    }
  });
  return results[0] || null;
}

function resolveOriginCoordinate({
  liveCoordinate,
  origin,
  originSelection
}: {
  liveCoordinate: LatLng | null;
  origin: string;
  originSelection: GuestLocationSearchResult | null;
}): LatLng | null {
  if (originSelection) {
    return originSelection.coordinate;
  }
  if (isCurrentLocationLabel(origin)) {
    if (liveCoordinate) {
      return liveCoordinate;
    }
    return SAFEROUTE_PREVIEW_MODE_ENABLED
      ? { latitude: GUEST_MAP_REGION.latitude, longitude: GUEST_MAP_REGION.longitude }
      : null;
  }
  return null;
}

function isCurrentLocationLabel(value: string): boolean {
  return value.trim().toLowerCase() === 'current location';
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
