import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';

import {
  resolveDeviceHeadingDegrees,
  smoothDeviceHeadingDegrees
} from './deviceHeading';

export interface DeviceHeadingOptions {
  deadbandDegrees?: number;
  minimumUpdateIntervalMs?: number;
}

export function useDeviceHeading(
  enabled: boolean,
  {
    deadbandDegrees = 3,
    minimumUpdateIntervalMs = 250,
  }: DeviceHeadingOptions = {},
): number | null {
  const [headingDegrees, setHeadingDegrees] = useState<number | null>(null);
  const [appStateActive, setAppStateActive] = useState(AppState.currentState === 'active');
  const lastPublishedAtRef = useRef(0);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppStateActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!enabled || Platform.OS === 'web') {
      setHeadingDegrees(null);
      return;
    }

    if (!appStateActive) {
      return;
    }

    let mounted = true;
    let subscription: Location.LocationSubscription | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let starting = false;

    const scheduleRetry = () => {
      if (!mounted || retryTimer !== null) {
        return;
      }
      subscription?.remove();
      subscription = null;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void startWatching();
      }, 750);
    };

    const startWatching = async () => {
      if (!mounted || starting) {
        return;
      }
      starting = true;
      subscription?.remove();
      subscription = null;
      try {
        const nextSubscription = await Location.watchHeadingAsync(
          (sample) => {
            if (!mounted) {
              return;
            }

            const nextHeading = resolveDeviceHeadingDegrees(sample);
            if (nextHeading === null) {
              return;
            }
            const now = Date.now();
            if (now - lastPublishedAtRef.current < minimumUpdateIntervalMs) {
              return;
            }
            lastPublishedAtRef.current = now;
            setHeadingDegrees((previousHeading) => {
              const smoothed = smoothDeviceHeadingDegrees(previousHeading, nextHeading);
              if (
                previousHeading !== null &&
                angularDifference(previousHeading, smoothed) < deadbandDegrees
              ) {
                return previousHeading;
              }
              return smoothed;
            });
          },
          scheduleRetry,
        );
        if (!mounted) {
          nextSubscription.remove();
          return;
        }
        subscription = nextSubscription;
      } catch {
        scheduleRetry();
      } finally {
        starting = false;
      }
    };

    void startWatching();

    return () => {
      mounted = false;
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
      }
      subscription?.remove();
    };
  }, [appStateActive, deadbandDegrees, enabled, minimumUpdateIntervalMs]);

  return headingDegrees;
}

function angularDifference(first: number, second: number): number {
  const difference = Math.abs(first - second) % 360;
  return Math.min(difference, 360 - difference);
}
