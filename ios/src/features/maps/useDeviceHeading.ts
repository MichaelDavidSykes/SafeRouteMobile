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
    if (!enabled || !appStateActive || Platform.OS === 'web') {
      setHeadingDegrees(null);
      return;
    }

    let mounted = true;
    let subscription: Location.LocationSubscription | null = null;

    void Location.watchHeadingAsync(
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
      () => {
        if (mounted) {
          setHeadingDegrees(null);
        }
      }
    ).then((nextSubscription) => {
      if (!mounted) {
        nextSubscription.remove();
        return;
      }
      subscription = nextSubscription;
    }).catch(() => {
      if (mounted) {
        setHeadingDegrees(null);
      }
    });

    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, [appStateActive, deadbandDegrees, enabled, minimumUpdateIntervalMs]);

  return headingDegrees;
}

function angularDifference(first: number, second: number): number {
  const difference = Math.abs(first - second) % 360;
  return Math.min(difference, 360 - difference);
}
