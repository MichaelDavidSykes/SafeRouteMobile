import NetInfo from "@react-native-community/netinfo";
import { AppState } from "react-native";
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  createNetworkAvailabilityMachineState,
  reduceNetworkAvailabilityMachine,
  type NetworkAvailabilityStatus,
} from "./networkAvailabilityState";

export interface NetworkAvailability {
  checking: boolean;
  offline: boolean;
  online: boolean;
  status: NetworkAvailabilityStatus;
}

const NetworkAvailabilityContext =
  createContext<NetworkAvailability | null>(null);

export function NetworkAvailabilityProvider({
  children,
}: {
  children: ReactNode;
}) {
  const machineRef = useRef(
    createNetworkAvailabilityMachineState(AppState.currentState === "active"),
  );
  const mountedRef = useRef(true);
  const [status, setStatus] = useState<NetworkAvailabilityStatus>("checking");
  const dispatch = useCallback(
    (
      action: Parameters<typeof reduceNetworkAvailabilityMachine>[1],
    ) => {
      if (!mountedRef.current) {
        return machineRef.current;
      }
      const next = reduceNetworkAvailabilityMachine(machineRef.current, action);
      machineRef.current = next;
      setStatus(next.status);
      return next;
    },
    [],
  );
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(
    () =>
      NetInfo.addEventListener((snapshot) => {
        dispatch({ snapshot, type: "snapshot" });
      }),
    [dispatch],
  );
  useEffect(() => {
    const handleAppStateChange = (nextState: typeof AppState.currentState) => {
      if (nextState !== "active") {
        dispatch({ active: false, type: "app-state" });
        return;
      }
      const generation = dispatch({
        active: true,
        type: "app-state",
      }).refreshGeneration;
      void NetInfo.refresh()
        .then((snapshot) => {
          dispatch({ generation, snapshot, type: "refresh-settled" });
        })
        .catch(() => {
          dispatch({ generation, type: "refresh-settled" });
        });
    };
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );
    handleAppStateChange(AppState.currentState);
    return () => subscription.remove();
  }, [dispatch]);
  const availability = {
    checking: status === "checking",
    offline: status === "offline",
    online: status === "online",
    status,
  };

  return createElement(
    NetworkAvailabilityContext.Provider,
    { value: availability },
    children,
  );
}

export function useNetworkAvailability(): NetworkAvailability {
  const availability = useContext(NetworkAvailabilityContext);
  if (!availability) {
    throw new Error(
      "useNetworkAvailability must be used within NetworkAvailabilityProvider",
    );
  }
  return availability;
}
