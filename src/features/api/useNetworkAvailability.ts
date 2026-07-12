import NetInfo from "@react-native-community/netinfo";
import { useEffect, useState } from "react";

export function useNetworkAvailability(): { offline: boolean } {
  const [offline, setOffline] = useState(false);
  useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        setOffline(
          state.isConnected === false || state.isInternetReachable === false,
        );
      }),
    [],
  );
  return { offline };
}
