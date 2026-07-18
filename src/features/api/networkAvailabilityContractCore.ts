export const CONNECTIVITY_CONTRACT_REACHABILITY_PATH =
  "/__connectivity_contract__/reachability";

export interface NetworkAvailabilityContractConfiguration {
  reachabilityHeaders: Record<string, string>;
  reachabilityLongTimeout: number;
  reachabilityMethod: "HEAD";
  reachabilityRequestTimeout: number;
  reachabilityShortTimeout: number;
  reachabilityTest: (response: Response) => Promise<boolean>;
  reachabilityUrl: string;
  useNativeReachability: false;
}

export function createNetworkAvailabilityContractConfiguration({
  apiUrl,
  enabled,
  sourceRevision,
}: {
  apiUrl: string;
  enabled: boolean;
  sourceRevision: string;
}): NetworkAvailabilityContractConfiguration | null {
  const normalizedApiUrl = apiUrl.trim().replace(/\/+$/, "");
  const normalizedRevision = sourceRevision.trim().toLowerCase();
  if (
    !enabled ||
    !isLoopbackUrl(normalizedApiUrl) ||
    !/^[0-9a-f]{40}$/.test(normalizedRevision)
  ) {
    return null;
  }
  return {
    reachabilityHeaders: {
      "X-SafeRoute-Connectivity-Contract": "1",
      "X-SafeRoute-Source-Revision": normalizedRevision,
    },
    reachabilityLongTimeout: 60_000,
    reachabilityMethod: "HEAD",
    reachabilityRequestTimeout: 120_000,
    reachabilityShortTimeout: 60_000,
    reachabilityTest: async (response) => response.status === 204,
    reachabilityUrl:
      `${normalizedApiUrl}${CONNECTIVITY_CONTRACT_REACHABILITY_PATH}` +
      `?source_revision=${normalizedRevision}`,
    useNativeReachability: false,
  };
}

function isLoopbackUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname === "[::1]"
    ) {
      return true;
    }
    const octets = hostname.split(".");
    return (
      octets.length === 4 &&
      octets[0] === "127" &&
      octets.every(
        (octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255,
      )
    );
  } catch {
    return false;
  }
}
