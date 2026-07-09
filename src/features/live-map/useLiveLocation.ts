import { useEffect, useState } from 'react';
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

export type { PermissionStatus } from './liveLocationState';

interface UseLiveLocationOptions {
  navigationActive?: boolean;
  permissionRequested?: boolean;
}

export function useLiveLocation({
  navigationActive = false,
  permissionRequested = false
}: UseLiveLocationOptions = {}) {
  const [coordinate, setCoordinate] = useState<Location.LocationObjectCoords | null>(null);
  const [timestampMs, setTimestampMs] = useState<number | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');

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
          setCoordinate(lastKnown.coords);
          setTimestampMs(Number.isFinite(lastKnown.timestamp) ? lastKnown.timestamp : Date.now());
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
              setCoordinate(nextLocation.coords);
              setTimestampMs(
                Number.isFinite(nextLocation.timestamp) ? nextLocation.timestamp : Date.now()
              );
              setErrorMessage('');
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

    void startTracking().catch(() => {
      if (!mounted) {
        return;
      }

      setErrorMessage(LIVE_LOCATION_UNAVAILABLE_MESSAGE);
    });

    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, [navigationActive, permissionRequested]);

  return {
    coordinate,
    errorMessage,
    permissionStatus,
    timestampMs,
    trackingLabel: trackingLabelForPermissionStatus(permissionStatus)
  };
}
