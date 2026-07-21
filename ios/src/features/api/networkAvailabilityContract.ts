import NetInfo from "@react-native-community/netinfo";

import {
  LUNARCHAIN_API_URL,
  SAFEROUTE_CONNECTIVITY_CONTRACT_ENABLED,
  SAFEROUTE_SOURCE_REVISION,
} from "../../config/env";
import { createNetworkAvailabilityContractConfiguration } from "./networkAvailabilityContractCore";

export function configureNetworkAvailabilityContract(): boolean {
  const configuration = createNetworkAvailabilityContractConfiguration({
    apiUrl: LUNARCHAIN_API_URL,
    enabled: SAFEROUTE_CONNECTIVITY_CONTRACT_ENABLED,
    sourceRevision: SAFEROUTE_SOURCE_REVISION,
  });
  if (!configuration) {
    return false;
  }
  NetInfo.configure(configuration);
  return true;
}
