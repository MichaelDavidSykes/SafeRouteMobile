import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import {
  getPersistedActiveRouteId,
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
      if (error || !Array.isArray(data?.locations)) {
        return;
      }

      const routeId = await getPersistedActiveRouteId();
      if (!routeId) {
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

      await saveBackgroundNavigationLocation(routeId, sample);
    },
  );
}
