export const CONNECTIVITY_CONTRACT_STORAGE_FAULT_PATH =
  "/__connectivity_contract__/storage-fault";

export const CONNECTIVITY_CONTRACT_STORAGE_FAULT_OPERATIONS = [
  "auth-session-tombstone-set",
] as const;

export type ConnectivityContractStorageFaultOperation =
  (typeof CONNECTIVITY_CONTRACT_STORAGE_FAULT_OPERATIONS)[number];

const SOURCE_REVISION_PATTERN = /^[0-9a-f]{40}$/;
const OPERATION_SET = new Set<string>(
  CONNECTIVITY_CONTRACT_STORAGE_FAULT_OPERATIONS,
);

export function createConnectivityContractStorageFaultRequest(
  apiUrlValue: string,
  operationValue: string,
  sourceRevisionValue: string,
): {
  headers: Record<string, string>;
  method: "POST";
  url: string;
} | null {
  const apiUrl = normalizeLoopbackApiUrl(apiUrlValue);
  const operation = String(operationValue || "").trim();
  const sourceRevision = String(sourceRevisionValue || "")
    .trim()
    .toLowerCase();
  if (
    !apiUrl ||
    !OPERATION_SET.has(operation) ||
    !SOURCE_REVISION_PATTERN.test(sourceRevision)
  ) {
    return null;
  }
  return {
    headers: {
      "X-SafeRoute-Connectivity-Contract": "1",
      "X-SafeRoute-Source-Revision": sourceRevision,
    },
    method: "POST",
    url:
      `${apiUrl}${CONNECTIVITY_CONTRACT_STORAGE_FAULT_PATH}/${operation}` +
      `?source_revision=${sourceRevision}`,
  };
}

export function isInjectedConnectivityContractStorageFaultStatus(
  status: unknown,
): boolean {
  return status === 503;
}

function normalizeLoopbackApiUrl(value: string): string {
  try {
    const url = new URL(String(value || "").trim());
    const hostname = url.hostname.toLowerCase();
    const loopback =
      hostname === "localhost" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname === "[::1]" ||
      isIpv4Loopback(hostname);
    if (!loopback || !["http:", "https:"].includes(url.protocol)) {
      return "";
    }
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function isIpv4Loopback(hostname: string): boolean {
  const octets = hostname.split(".");
  return (
    octets.length === 4 &&
    octets[0] === "127" &&
    octets.every(
      (octet) =>
        /^\d{1,3}$/.test(octet) &&
        Number(octet) >= 0 &&
        Number(octet) <= 255,
    )
  );
}
