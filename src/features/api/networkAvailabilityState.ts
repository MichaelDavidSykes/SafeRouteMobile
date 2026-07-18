export type NetworkAvailabilityStatus = "checking" | "offline" | "online";

export interface NetworkAvailabilitySnapshot {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}

export interface NetworkAvailabilityMachineState {
  active: boolean;
  refreshGeneration: number;
  refreshPending: boolean;
  status: NetworkAvailabilityStatus;
}

export type NetworkAvailabilityMachineAction =
  | { active: boolean; type: "app-state" }
  | {
      generation: number;
      snapshot?: NetworkAvailabilitySnapshot;
      type: "refresh-settled";
    }
  | { snapshot: NetworkAvailabilitySnapshot; type: "snapshot" };

export function createNetworkAvailabilityMachineState(
  active: boolean,
): NetworkAvailabilityMachineState {
  return {
    active,
    refreshGeneration: 0,
    refreshPending: false,
    status: "checking",
  };
}

export function reduceNetworkAvailabilityMachine(
  state: NetworkAvailabilityMachineState,
  action: NetworkAvailabilityMachineAction,
): NetworkAvailabilityMachineState {
  if (action.type === "app-state") {
    if (!action.active) {
      return {
        active: false,
        refreshGeneration: state.refreshGeneration + 1,
        refreshPending: false,
        status: "checking",
      };
    }
    return {
      active: true,
      refreshGeneration: state.refreshGeneration + 1,
      refreshPending: true,
      status: "checking",
    };
  }

  if (action.type === "refresh-settled") {
    if (
      !state.active ||
      !state.refreshPending ||
      action.generation !== state.refreshGeneration
    ) {
      return state;
    }
    return {
      ...state,
      refreshPending: false,
      status: action.snapshot
        ? resolveNetworkAvailabilityStatus(action.snapshot)
        : "checking",
    };
  }

  if (!state.active || state.refreshPending) {
    return state;
  }
  return {
    ...state,
    status: resolveNetworkAvailabilityStatus(action.snapshot),
  };
}

export function resolveNetworkAvailabilityStatus({
  isConnected,
  isInternetReachable,
}: NetworkAvailabilitySnapshot): NetworkAvailabilityStatus {
  if (isConnected === false || isInternetReachable === false) {
    return "offline";
  }

  if (isConnected === true && isInternetReachable === true) {
    return "online";
  }

  return "checking";
}

export function resolveNetworkReconnectTransition({
  current,
  offlineObserved,
  previous,
}: {
  current: NetworkAvailabilityStatus;
  offlineObserved: boolean;
  previous: NetworkAvailabilityStatus;
}): { offlineObserved: boolean; retry: boolean } {
  if (current === "offline") {
    return { offlineObserved: true, retry: false };
  }
  if (current === "checking") {
    return { offlineObserved, retry: false };
  }
  const retry = offlineObserved && previous !== "online";
  return { offlineObserved: false, retry };
}
