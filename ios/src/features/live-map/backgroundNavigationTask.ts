import { AppState } from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import {
  getPersistedActiveNavigationAuthorization,
  hasCurrentBackgroundNavigationAuthorization,
  getRuntimeBackgroundNavigationPermitStatus,
  revokeBackgroundNavigationPermit,
  saveBackgroundNavigationLocation,
} from "./activeNavigationSession";
import { SAFEROUTE_BACKGROUND_LOCATION_TASK } from "./backgroundNavigation";
import { normalizeReliableLocationSample } from "./locationSignal";

interface BackgroundLocationTaskData {
  locations?: Location.LocationObject[];
}

if (!TaskManager.isTaskDefined(SAFEROUTE_BACKGROUND_LOCATION_TASK)) {
  TaskManager.defineTask<BackgroundLocationTaskData>(
    SAFEROUTE_BACKGROUND_LOCATION_TASK,
    async ({ data, error }) => {
      const runtimePermitStatus = getRuntimeBackgroundNavigationPermitStatus();
      if (runtimePermitStatus === "pending") {
        return;
      }
      if (runtimePermitStatus === "none") {
        await stopUnauthorizedBackgroundNavigationTask();
        return;
      }
      if (error || !Array.isArray(data?.locations)) {
        return;
      }

      // Foreground guidance owns the high-frequency stream while the app is active.
      if (AppState.currentState === "active") {
        return;
      }

      const authorization = await getPersistedActiveNavigationAuthorization();
      if (!authorization) {
        await stopUnauthorizedBackgroundNavigationTask();
        return;
      }

      const newestLocation = [...data.locations]
        .filter((location) => location?.coords && location.mocked !== true)
        .sort((left, right) => right.timestamp - left.timestamp)[0];
      if (!newestLocation) {
        return;
      }

      const sample = normalizeReliableLocationSample({
        accuracyMeters: newestLocation.coords.accuracy,
        headingDegrees: newestLocation.coords.heading,
        latitude: newestLocation.coords.latitude,
        longitude: newestLocation.coords.longitude,
        speedMetersPerSecond: newestLocation.coords.speed,
        timestampMs: newestLocation.timestamp,
      });
      if (!sample) {
        return;
      }

      if ((await saveBackgroundNavigationLocation(
        authorization.routeId,
        authorization.navigationInstanceId,
        sample,
      )) === "unauthorized") {
        await stopUnauthorizedBackgroundNavigationTask();
      }
    },
  );
}

async function stopUnauthorizedBackgroundNavigationTask(): Promise<void> {
  if (await hasCurrentBackgroundNavigationAuthorization()) {
    return;
  }
  await revokeBackgroundNavigationPermit();
  try {
    if (
      await Location.hasStartedLocationUpdatesAsync(
        SAFEROUTE_BACKGROUND_LOCATION_TASK,
      )
    ) {
      await Location.stopLocationUpdatesAsync(
        SAFEROUTE_BACKGROUND_LOCATION_TASK,
      );
    }
  } catch {
    // The missing process-local permit still prevents background writes.
  }
}
