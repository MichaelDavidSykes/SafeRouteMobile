import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Location from "expo-location";
import type { ActiveNavigationAccessScope } from "./activeNavigationSessionCore";
import {
  activateBackgroundNavigationPermit,
  getRuntimeBackgroundNavigationPermitStatus,
  hasRuntimeBackgroundNavigationPermit,
  isCurrentBackgroundNavigationAuthorization,
  prepareBackgroundNavigationPermit,
  revokeBackgroundNavigationPermit,
} from "./activeNavigationSession";
import { backgroundNavigationScopesMatch } from "./backgroundNavigationPermitCore";
import { createBackgroundNavigationLifecycleCoordinator } from "./backgroundNavigationLifecycleCore";
import { isBackgroundNavigationRuntimeSupported } from "./backgroundNavigationRuntime";

export { isBackgroundNavigationRuntimeSupported } from "./backgroundNavigationRuntime";

export const SAFEROUTE_BACKGROUND_LOCATION_TASK =
  "SAFEROUTE_ACTIVE_GUIDANCE_LOCATION_V1";

export type BackgroundNavigationStatus =
  | "active"
  | "checking"
  | "denied"
  | "error"
  | "idle"
  | "permission-required"
  | "requesting"
  | "unsupported";

export interface BackgroundNavigationResult {
  message: string;
  status: BackgroundNavigationStatus;
}

export interface BackgroundNavigationAuthorization {
  accessScope: ActiveNavigationAccessScope;
  navigationInstanceId: string;
  routeId: string;
}

const backgroundNavigationLifecycle =
  createBackgroundNavigationLifecycleCoordinator<BackgroundNavigationAuthorization>(
    (left, right) =>
      left.routeId.trim() === right.routeId.trim() &&
      left.navigationInstanceId.trim() === right.navigationInstanceId.trim() &&
      backgroundNavigationScopesMatch(left.accessScope, right.accessScope),
  );

export const SAFEROUTE_BACKGROUND_LOCATION_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.BestForNavigation,
  activityType: Location.LocationActivityType.AutomotiveNavigation,
  deferredUpdatesDistance: 20,
  deferredUpdatesInterval: 10_000,
  distanceInterval: 5,
  foregroundService: {
    killServiceOnDestroy: false,
    notificationBody: "Live route guidance and safety monitoring are active.",
    notificationColor: "#0A84FF",
    notificationTitle: "SafeRoute guidance",
  },
  pausesUpdatesAutomatically: false,
  showsBackgroundLocationIndicator: true,
  timeInterval: 3_000,
};

function unsupportedRuntimeResult(): BackgroundNavigationResult {
  return result(
    "unsupported",
    "Screen-lock guidance requires the installed SafeRoute app.",
  );
}

export async function inspectBackgroundNavigation(): Promise<BackgroundNavigationResult> {
  if (!isBackgroundNavigationRuntimeSupported({
    executionEnvironment: String(Constants.executionEnvironment || ""),
    platform: Platform.OS,
  })) {
    return unsupportedRuntimeResult();
  }

  try {
    const available = await Location.isBackgroundLocationAvailableAsync();
    if (!available) {
      return result(
        "unsupported",
        "Background guidance is unavailable in this app runtime.",
      );
    }

    const started = await Location.hasStartedLocationUpdatesAsync(
      SAFEROUTE_BACKGROUND_LOCATION_TASK,
    );
    if (started) {
      if (getRuntimeBackgroundNavigationPermitStatus() === "pending") {
        return result("checking", "Background guidance is starting.");
      }
      if (!hasRuntimeBackgroundNavigationPermit()) {
        await Location.stopLocationUpdatesAsync(
          SAFEROUTE_BACKGROUND_LOCATION_TASK,
        );
        return result(
          "permission-required",
          "Background guidance needs current route authorization.",
        );
      }
      return result("active", "Background guidance is active.");
    }

    const permission = await Location.getBackgroundPermissionsAsync();
    if (permission.status === Location.PermissionStatus.GRANTED) {
      return result(
        "permission-required",
        "Background guidance is ready to start.",
      );
    }

    return result(
      permission.canAskAgain ? "permission-required" : "denied",
      permission.canAskAgain
        ? "Allow background location to keep guidance active when the screen locks."
        : "Background location access is off in system settings.",
    );
  } catch {
    return result("error", "Background guidance could not be checked.");
  }
}

export function startBackgroundNavigationIfAuthorized(
  authorization: BackgroundNavigationAuthorization,
): Promise<BackgroundNavigationResult> {
  return backgroundNavigationLifecycle.requestStart(
    authorization,
    () => startBackgroundNavigationIfAuthorizedInternal(authorization),
    stopStaleBackgroundNavigation,
  );
}

async function startBackgroundNavigationIfAuthorizedInternal(
  authorization: BackgroundNavigationAuthorization,
): Promise<BackgroundNavigationResult> {
  const currentResult = await inspectCurrentBackgroundNavigation(authorization);
  if (currentResult) {
    return currentResult;
  }
  await revokeBackgroundNavigationPermit();
  const inspected = await inspectBackgroundNavigation();
  if (inspected.status === "unsupported") {
    return inspected;
  }
  try {
    const permission = await Location.getBackgroundPermissionsAsync();
    if (permission.status !== Location.PermissionStatus.GRANTED) {
      return inspected;
    }

    return startAuthorizedBackgroundNavigation(authorization);
  } catch {
    return result("error", "Background guidance could not be started.");
  }
}

async function startAuthorizedBackgroundNavigation(
  authorization: BackgroundNavigationAuthorization,
): Promise<BackgroundNavigationResult> {
  if (!await prepareBackgroundNavigationPermit(
    authorization.routeId,
    authorization.accessScope,
    authorization.navigationInstanceId,
  )) {
    return result("error", "Background guidance could not be authorized.");
  }
  try {
    await Location.startLocationUpdatesAsync(
      SAFEROUTE_BACKGROUND_LOCATION_TASK,
      SAFEROUTE_BACKGROUND_LOCATION_OPTIONS,
    );
  } catch {
    await revokeBackgroundNavigationPermit();
    return result("error", "Background guidance could not be started.");
  }
  if (await activateBackgroundNavigationPermit(
    authorization.routeId,
    authorization.accessScope,
    authorization.navigationInstanceId,
  )) {
    return result("active", "Background guidance is active.");
  }
  await stopBackgroundNavigationInternal();
  return result("error", "Background guidance could not be authorized.");
}

async function inspectCurrentBackgroundNavigation(
  authorization: BackgroundNavigationAuthorization,
): Promise<BackgroundNavigationResult | null> {
  if (!await isCurrentBackgroundNavigationAuthorization(
    authorization.routeId,
    authorization.accessScope,
    authorization.navigationInstanceId,
  )) {
    return null;
  }
  const inspected = await inspectBackgroundNavigation();
  return inspected.status === "active" ? inspected : null;
}

export function requestAndStartBackgroundNavigation(
  authorization: BackgroundNavigationAuthorization,
): Promise<BackgroundNavigationResult> {
  return backgroundNavigationLifecycle.requestStart(
    authorization,
    () => requestAndStartBackgroundNavigationInternal(authorization),
    stopStaleBackgroundNavigation,
  );
}

async function requestAndStartBackgroundNavigationInternal(
  authorization: BackgroundNavigationAuthorization,
): Promise<BackgroundNavigationResult> {
  const currentResult = await inspectCurrentBackgroundNavigation(authorization);
  if (currentResult) {
    return currentResult;
  }
  await revokeBackgroundNavigationPermit();
  if (!isBackgroundNavigationRuntimeSupported({
    executionEnvironment: String(Constants.executionEnvironment || ""),
    platform: Platform.OS,
  })) {
    return unsupportedRuntimeResult();
  }

  try {
    const available = await Location.isBackgroundLocationAvailableAsync();
    if (!available) {
      return result(
        "unsupported",
        "Background guidance is unavailable in this app runtime.",
      );
    }

    const foregroundPermission = await Location.getForegroundPermissionsAsync();
    if (foregroundPermission.status !== Location.PermissionStatus.GRANTED) {
      return result(
        "denied",
        "Foreground location is required before background guidance can start.",
      );
    }

    const permission = await Location.requestBackgroundPermissionsAsync();
    if (permission.status !== Location.PermissionStatus.GRANTED) {
      return result(
        permission.canAskAgain ? "permission-required" : "denied",
        "Background location access was not enabled.",
      );
    }

    return startAuthorizedBackgroundNavigation(authorization);
  } catch {
    return result("error", "Background guidance could not be started.");
  }
}

export async function stopBackgroundNavigation(
  expectedAuthorization: BackgroundNavigationAuthorization | null = null,
): Promise<void> {
  await backgroundNavigationLifecycle.requestStop(
    expectedAuthorization,
    stopBackgroundNavigationInternal,
    () => {
      void revokeBackgroundNavigationPermit();
    },
  );
}

async function stopStaleBackgroundNavigation(): Promise<BackgroundNavigationResult> {
  await stopBackgroundNavigationInternal();
  return result("idle", "Background guidance is off.");
}

async function stopBackgroundNavigationInternal(): Promise<void> {
  await revokeBackgroundNavigationPermit();
  if (!isBackgroundNavigationRuntimeSupported({
    executionEnvironment: String(Constants.executionEnvironment || ""),
    platform: Platform.OS,
  })) {
    return;
  }

  try {
    const started = await Location.hasStartedLocationUpdatesAsync(
      SAFEROUTE_BACKGROUND_LOCATION_TASK,
    );
    if (started) {
      await Location.stopLocationUpdatesAsync(
        SAFEROUTE_BACKGROUND_LOCATION_TASK,
      );
    }
  } catch {
    // The foreground navigation lifecycle still stops safely if native cleanup fails.
  }
}

function result(
  status: BackgroundNavigationStatus,
  message: string,
): BackgroundNavigationResult {
  return { message, status };
}
