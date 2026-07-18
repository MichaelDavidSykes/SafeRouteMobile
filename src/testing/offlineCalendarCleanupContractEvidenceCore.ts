import { parseOfflineOperationsCacheRecord } from "../features/operations/offlineOperationsCacheCore";
import {
  getOfflineOperationsPreferenceScope,
  parseOfflineOperationsPreferenceRecord,
} from "../features/operations/offlineOperationsPreferenceCore";

export type OfflineCalendarContractStorageState = {
  payload: "absent" | "present" | "unknown";
  preference:
    | "cleanup-pending"
    | "disabled"
    | "enabled"
    | "unavailable";
  slot:
    | "empty"
    | "payload"
    | "principal-revoked"
    | "unreadable"
    | "unknown"
    | "workspace-revoked";
};

export function classifyOfflineCalendarContractStorage({
  calendarRaw,
  calendarWorkspaceId,
  nowMs = Date.now(),
  preferenceRaw,
  preferenceWorkspaceId,
  principalId,
}: {
  calendarRaw: string | null | undefined;
  calendarWorkspaceId: string;
  nowMs?: number;
  preferenceRaw: string | null | undefined;
  preferenceWorkspaceId: string;
  principalId: string;
}): OfflineCalendarContractStorageState {
  const preferenceRecord =
    preferenceRaw === undefined
      ? null
      : parseOfflineOperationsPreferenceRecord(preferenceRaw);
  const preferenceScope =
    preferenceRecord &&
    getOfflineOperationsPreferenceScope(
      preferenceRecord,
      principalId,
      preferenceWorkspaceId,
    );
  const preference =
    preferenceRaw === undefined || !preferenceRecord
      ? "unavailable"
      : preferenceScope?.cleanupPending
        ? "cleanup-pending"
        : preferenceScope
          ? "disabled"
          : "enabled";

  if (calendarRaw === undefined) {
    return {
      payload: "unknown",
      preference,
      slot: "unknown",
    };
  }
  if (calendarRaw === null) {
    return {
      payload: "absent",
      preference,
      slot: "empty",
    };
  }
  let parsedCalendar: unknown;
  try {
    parsedCalendar = JSON.parse(calendarRaw);
  } catch {
    return {
      payload: "unknown",
      preference,
      slot: "unreadable",
    };
  }
  if (
    parseOfflineOperationsCacheRecord(
      parsedCalendar,
      principalId,
      calendarWorkspaceId,
      nowMs,
    )
  ) {
    return {
      payload: "present",
      preference,
      slot: "payload",
    };
  }
  if (
    parsedCalendar &&
    typeof parsedCalendar === "object" &&
    !Array.isArray(parsedCalendar)
  ) {
    const revocation = parsedCalendar as {
      principalId?: unknown;
      revoked?: unknown;
      schema?: unknown;
      workspaceId?: unknown;
    };
    const exactRevocationShape =
      Object.keys(revocation).sort().join(",") ===
      "principalId,revoked,schema,workspaceId";
    if (
      exactRevocationShape &&
      revocation.schema === 1 &&
      revocation.revoked === true &&
      revocation.principalId === principalId &&
      revocation.workspaceId === calendarWorkspaceId
    ) {
      return {
        payload: "absent",
        preference,
        slot: "workspace-revoked",
      };
    }
    if (
      exactRevocationShape &&
      revocation.schema === 1 &&
      revocation.revoked === true &&
      revocation.principalId === principalId &&
      revocation.workspaceId === null
    ) {
      return {
        payload: "absent",
        preference,
        slot: "principal-revoked",
      };
    }
  }
  return {
    payload: "unknown",
    preference,
    slot: "unreadable",
  };
}
