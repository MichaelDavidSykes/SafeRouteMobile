import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';

import {
  resolveDeviceHeadingDegrees,
  smoothDeviceHeadingDegrees
} from './deviceHeading';

export function useDeviceHeading(enabled: boolean): number | null {
  const [headingDegrees, setHeadingDegrees] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled || Platform.OS === 'web') {
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
        if (nextHeading !== null) {
          setHeadingDegrees((previousHeading) =>
            smoothDeviceHeadingDegrees(previousHeading, nextHeading)
          );
        }
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
  }, [enabled]);

  return headingDegrees;
}
