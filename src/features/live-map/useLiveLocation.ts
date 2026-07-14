import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import * as Location from 'expo-location';

import {
  LIVE_LOCATION_UNAVAILABLE_MESSAGE,
  LOCATION_PERMISSION_DENIED_MESSAGE,
  pendingForegroundPermissionStatus,
  permissionStatusFromForegroundPermission,
  resolveLiveLocationTrackingCadence,
  trackingLabelForPermissionStatus,
  type PermissionStatus
} from './liveLocationState';
import { loadBackgroundNavigationLocation } from './activeNavigationSession';
import type { ActiveNavigationAccessScope } from './activeNavigationSessionCore';
import {
  inspectBackgroundNavigation,
  requestAndStartBackgroundNavigation,
  startBackgroundNavigationIfAuthorized,
  stopBackgroundNavigation,
  type BackgroundNavigationStatus
} from './backgroundNavigation';
import {
  applyReliableLocationSample,
  canAcceptLocationSource,
  createLocationSignalState,
  isReliableLocationSampleRecent,
  type ReliableLocationSample
} from './locationSignal';

export type { PermissionStatus } from './liveLocationState';

interface UseLiveLocationOptions {
  backgroundAccessScope?: ActiveNavigationAccessScope | null;
  backgroundNavigationInstanceId?: string | null;
  backgroundRouteId?: string | null;
  backgroundTrackingRequested?: boolean;
  initialLocationSample?: ReliableLocationSample | null;
  manageBackgroundNavigation?: boolean;
  navigationActive?: boolean;
  permissionRequested?: boolean;
}

export function useLiveLocation({
  backgroundAccessScope = null,
  backgroundNavigationInstanceId = null,
  backgroundRouteId = null,
  backgroundTrackingRequested = false,
  initialLocationSample = null,
  manageBackgroundNavigation = false,
  navigationActive = false,
  permissionRequested = false
}: UseLiveLocationOptions = {}) {
  const initialReliableLocationRef = useRef(
    isReliableLocationSampleRecent(initialLocationSample)
      ? initialLocationSample
      : null
  );
  const signalStateRef = useRef(
    createLocationSignalState(initialReliableLocationRef.current)
  );
  const navigationActiveRef = useRef(navigationActive);
  const mountedRef = useRef(true);
  const [coordinate, setCoordinate] = useState<Location.LocationObjectCoords | null>(() =>
    initialReliableLocationRef.current
      ? {
          accuracy: initialReliableLocationRef.current.accuracyMeters,
          altitude: null,
          altitudeAccuracy: null,
          heading: initialReliableLocationRef.current.headingDegrees,
          latitude: initialReliableLocationRef.current.latitude,
          longitude: initialReliableLocationRef.current.longitude,
          speed: initialReliableLocationRef.current.speedMetersPerSecond
        }
      : null
  );
  const [timestampMs, setTimestampMs] = useState<number | null>(
    initialReliableLocationRef.current?.timestampMs || null
  );
  // The hook always inspects the current foreground permission on mount. Mark
  // that brief preflight as pending so route actions cannot race it and appear
  // to ignore the first tap.
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('checking');
  const [errorMessage, setErrorMessage] = useState('');
  const [locationQuality, setLocationQuality] = useState<'degraded' | 'good'>('degraded');
  const [backgroundStatus, setBackgroundStatus] = useState<BackgroundNavigationStatus>('idle');

  navigationActiveRef.current = navigationActive;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const acceptReliableSample = useCallback((
    sample: ReliableLocationSample,
    sourceCoords?: Location.LocationObjectCoords | null
  ) => {
    const transition = applyReliableLocationSample(signalStateRef.current, sample, {
      navigationActive: navigationActiveRef.current,
      nowMs: Date.now()
    });
    signalStateRef.current = transition.state;
    setLocationQuality(transition.quality);
    if (!transition.accepted || !transition.state.sample) {
      return false;
    }

    const accepted = transition.state.sample;
    setCoordinate({
      accuracy: accepted.accuracyMeters,
      altitude: sourceCoords?.altitude ?? null,
      altitudeAccuracy: sourceCoords?.altitudeAccuracy ?? null,
      heading: accepted.headingDegrees,
      latitude: accepted.latitude,
      longitude: accepted.longitude,
      speed: accepted.speedMetersPerSecond
    });
    setTimestampMs(accepted.timestampMs);
    setErrorMessage('');
    return true;
  }, []);

  const acceptLocationObject = useCallback((location: Location.LocationObject | null | undefined) => {
    if (!location?.coords || !canAcceptLocationSource(location.mocked, __DEV__)) {
      return false;
    }

    return acceptReliableSample({
      accuracyMeters: location.coords.accuracy,
      headingDegrees: location.coords.heading,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      speedMetersPerSecond: location.coords.speed,
      timestampMs: Number.isFinite(location.timestamp) ? location.timestamp : Date.now()
    }, location.coords);
  }, [acceptReliableSample]);

  useEffect(() => {
    let mounted = true;
    let subscription: Location.LocationSubscription | undefined;
    const trackingCadence = resolveLiveLocationTrackingCadence(navigationActive);

    const startTracking = async () => {
      const pendingStatus = pendingForegroundPermissionStatus(permissionRequested);
      if (mounted && pendingStatus) {
        setPermissionStatus(pendingStatus);
        setErrorMessage('');
      }

      let permission: Location.PermissionResponse;
      try {
        permission = permissionRequested
          ? await Location.requestForegroundPermissionsAsync()
          : await Location.getForegroundPermissionsAsync();
      } catch {
        if (mounted) {
          setPermissionStatus('denied');
          setErrorMessage(LIVE_LOCATION_UNAVAILABLE_MESSAGE);
        }
        return;
      }

      if (!mounted) {
        return;
      }

      const nextPermissionStatus = permissionStatusFromForegroundPermission(
        permission.status === Location.PermissionStatus.GRANTED,
        permission.status === Location.PermissionStatus.UNDETERMINED
      );

      if (nextPermissionStatus !== 'granted') {
        setPermissionStatus(nextPermissionStatus);
        setErrorMessage(
          nextPermissionStatus === 'denied' ? LOCATION_PERMISSION_DENIED_MESSAGE : ''
        );
        return;
      }

      setPermissionStatus('granted');
      setErrorMessage('');

      try {
        const lastKnown = await Location.getLastKnownPositionAsync({
          maxAge: trackingCadence.lastKnownMaxAgeMs,
          requiredAccuracy: trackingCadence.lastKnownRequiredAccuracyMeters
        });
        if (mounted && lastKnown?.coords) {
          acceptLocationObject(lastKnown);
        }
      } catch {
        // Keep foreground permission granted; the live watcher below may still return a fresh fix.
      }

      try {
        const nextSubscription = await Location.watchPositionAsync(
          {
            accuracy: navigationActive
              ? Location.Accuracy.BestForNavigation
              : Location.Accuracy.Balanced,
            distanceInterval: trackingCadence.distanceIntervalMeters,
            timeInterval: trackingCadence.timeIntervalMs
          },
          (nextLocation) => {
            if (mounted) {
              acceptLocationObject(nextLocation);
            }
          }
        );
        if (!mounted) {
          nextSubscription.remove();
          return;
        }
        subscription = nextSubscription;
      } catch {
        if (mounted) {
          setErrorMessage(LIVE_LOCATION_UNAVAILABLE_MESSAGE);
        }
      }
    };

    const restoreBackgroundLocation = async () => {
      if (
        !backgroundRouteId ||
        !backgroundAccessScope ||
        !backgroundNavigationInstanceId
      ) {
        return;
      }
      const backgroundLocation = await loadBackgroundNavigationLocation(
        backgroundRouteId,
        backgroundAccessScope,
        backgroundNavigationInstanceId || "",
      );
      if (mounted && backgroundLocation) {
        acceptReliableSample(backgroundLocation);
      }
    };

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void restoreBackgroundLocation();
        if (
          manageBackgroundNavigation &&
          navigationActiveRef.current &&
          backgroundTrackingRequested
        ) {
          void inspectBackgroundNavigation().then((nextResult) => {
            if (mounted) {
              setBackgroundStatus(nextResult.status);
            }
          });
        }
      }
    });

    void startTracking().catch(() => {
      if (!mounted) {
        return;
      }

      setErrorMessage(LIVE_LOCATION_UNAVAILABLE_MESSAGE);
    });
    void restoreBackgroundLocation();

    return () => {
      mounted = false;
      subscription?.remove();
      appStateSubscription.remove();
    };
  }, [
    acceptLocationObject,
    acceptReliableSample,
    backgroundAccessScope,
    backgroundNavigationInstanceId,
    backgroundRouteId,
    backgroundTrackingRequested,
    manageBackgroundNavigation,
    navigationActive,
    permissionRequested
  ]);

  useEffect(() => {
    if (!manageBackgroundNavigation) {
      return;
    }

    let mounted = true;
    if (!navigationActive) {
      setBackgroundStatus('idle');
      void stopBackgroundNavigation();
      return () => {
        mounted = false;
      };
    }

    setBackgroundStatus('checking');
    if (
      !backgroundRouteId ||
      !backgroundAccessScope ||
      !backgroundNavigationInstanceId
    ) {
      setBackgroundStatus('error');
      void stopBackgroundNavigation();
      return;
    }
    if (!backgroundTrackingRequested) {
      void stopBackgroundNavigation()
        .then(() => inspectBackgroundNavigation())
        .then((nextResult) => {
          if (mounted) {
            setBackgroundStatus(nextResult.status);
          }
        });
      return () => {
        mounted = false;
      };
    }
    void startBackgroundNavigationIfAuthorized({
      accessScope: backgroundAccessScope,
      navigationInstanceId: backgroundNavigationInstanceId,
      routeId: backgroundRouteId,
    }).then((nextResult) => {
      if (mounted) {
        setBackgroundStatus(nextResult.status);
      }
    });

    return () => {
      mounted = false;
    };
  }, [
    backgroundAccessScope,
    backgroundNavigationInstanceId,
    backgroundRouteId,
    backgroundTrackingRequested,
    manageBackgroundNavigation,
    navigationActive,
  ]);

  const enableBackgroundTracking = useCallback(async () => {
    if (!manageBackgroundNavigation) {
      return false;
    }

    if (backgroundStatus === 'denied') {
      await Linking.openSettings();
      return false;
    }

    if (mountedRef.current) {
      setBackgroundStatus('requesting');
    }
    if (
      !backgroundRouteId ||
      !backgroundAccessScope ||
      !backgroundNavigationInstanceId
    ) {
      await stopBackgroundNavigation();
      return false;
    }
    const nextResult = await requestAndStartBackgroundNavigation({
      accessScope: backgroundAccessScope,
      navigationInstanceId: backgroundNavigationInstanceId,
      routeId: backgroundRouteId,
    });
    if (mountedRef.current) {
      setBackgroundStatus(nextResult.status);
    }
    return nextResult.status === 'active';
  }, [
    backgroundAccessScope,
    backgroundNavigationInstanceId,
    backgroundRouteId,
    backgroundStatus,
    manageBackgroundNavigation,
  ]);

  const refreshBackgroundTrackingStatus = useCallback(async () => {
    if (!manageBackgroundNavigation) {
      return 'idle' as const;
    }

    if (mountedRef.current) {
      setBackgroundStatus('checking');
    }
    const nextResult = await inspectBackgroundNavigation();
    if (mountedRef.current) {
      setBackgroundStatus(nextResult.status);
    }
    return nextResult.status;
  }, [manageBackgroundNavigation]);

  return {
    backgroundStatus,
    coordinate,
    enableBackgroundTracking,
    errorMessage,
    locationQuality,
    permissionStatus,
    refreshBackgroundTrackingStatus,
    rejectedSampleCount: signalStateRef.current.rejectedSampleCount,
    timestampMs,
    trackingLabel:
      permissionStatus === 'granted' && locationQuality === 'degraded'
        ? 'Low accuracy'
        : trackingLabelForPermissionStatus(permissionStatus)
  };
}
