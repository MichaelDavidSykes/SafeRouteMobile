import {
  LUNARCHAIN_API_URL,
  SAFEROUTE_SOURCE_REVISION,
  SAFEROUTE_STORAGE_FAULT_CONTRACT_ENABLED,
} from "../config/env";
import {
  createConnectivityContractStorageFaultRequest,
  isInjectedConnectivityContractStorageFaultStatus,
  type ConnectivityContractStorageFaultOperation,
} from "./connectivityContractStorageFaultCore";

export async function shouldInjectConnectivityContractStorageFault(
  operation: ConnectivityContractStorageFaultOperation,
): Promise<boolean> {
  if (!SAFEROUTE_STORAGE_FAULT_CONTRACT_ENABLED) {
    return false;
  }
  const request = createConnectivityContractStorageFaultRequest(
    LUNARCHAIN_API_URL,
    operation,
    SAFEROUTE_SOURCE_REVISION,
  );
  if (!request) {
    return false;
  }
  try {
    const response = await fetch(request.url, {
      headers: request.headers,
      method: request.method,
    });
    return isInjectedConnectivityContractStorageFaultStatus(
      response.status,
    );
  } catch {
    return false;
  }
}
