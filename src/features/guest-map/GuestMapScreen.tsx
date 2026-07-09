import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../theme';
import { uiTestIds } from '../../testing/uiTestIds';
import type { SavedSafeRoutePlan } from '../live-map/liveMapTypes';
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
import { guestMapStyles as styles } from './GuestMapScreen.styles';

const GUEST_ROUTE_PROVIDER_UI_TIMEOUT_MS = 3500;

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
  const roadRouteRequestIdRef = useRef(0);
  const [origin, setOrigin] = useState('Current location');
  const [destination, setDestination] = useState('');
  const [routePlan, setRoutePlan] = useState<SavedSafeRoutePlan | null>(null);
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
  }, []);

  const cancelRoadRouteUpgrade = () => {
    roadRouteRequestIdRef.current += 1;
    activeRoadRouteRequestRef.current?.abort();
    activeRoadRouteRequestRef.current = null;
  };

  const handlePlotRoute = () => {
    if (routeAction.disabled) {
      return;
    }

    Keyboard.dismiss();
    cancelRoadRouteUpgrade();
    const localRoutePlan = createGuestRoutePlan({
      authenticated,
      origin,
      destination
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
    const originSnapshot = origin;
    const destinationSnapshot = destination;
    const authenticatedSnapshot = authenticated;

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
          origin: originSnapshot,
          roadSnappedCoordinates: roadPreview.coordinates,
          routeDistanceMeters: roadPreview.distanceMeters,
          routeDurationSeconds: roadPreview.durationSeconds
        });

        if (roadRoutePlan) {
          setRoutePlan(roadRoutePlan);
        }
      })
      .catch(() => {
        // The local route is already visible. Keep the map-first experience calm
        // if the road preview provider times out, aborts, or fails offline.
      })
      .finally(() => {
        if (roadRouteRequestIdRef.current === requestId) {
          activeRoadRouteRequestRef.current = null;
        }
      });
  };

  const handleOpenPreview = () => {
    if (routeAction.disabled) {
      return;
    }

    Keyboard.dismiss();
    if (!routePlan) {
      handlePlotRoute();
      return;
    }

    onOpenRoutePreview?.(routePlan);
  };

  const handleOriginChange = (value: string) => {
    cancelRoadRouteUpgrade();
    setOrigin(value);
    setRoutePlan(null);
  };

  const handleDestinationChange = (value: string) => {
    cancelRoadRouteUpgrade();
    setDestination(value);
    setRoutePlan(null);
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
        showsScale={false}
        showsTraffic={false}
        toolbarEnabled={false}
        userInterfaceStyle="light"
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
            />
            <RouteInput
              accessibilityHint={destinationInputCopy.accessibilityHint}
              label={destinationInputCopy.accessibilityLabel}
              placeholder={destinationInputCopy.placeholder}
              testID={uiTestIds.guestMapDestinationInput}
              value={destination}
              onChangeText={handleDestinationChange}
              onSubmitEditing={routePlan ? handleOpenPreview : handlePlotRoute}
            />
          </View>

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
            onPress={routePlan ? handleOpenPreview : handlePlotRoute}
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
    </View>
  );
}

function resolveRoadPreviewStops(routePlan: SavedSafeRoutePlan) {
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
        onSubmitEditing={onSubmitEditing}
      />
    </View>
  );
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
