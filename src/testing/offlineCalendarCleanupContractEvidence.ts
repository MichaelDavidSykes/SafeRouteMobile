import {
  SAFEROUTE_GUIDANCE_CONTRACT_EVIDENCE_ENABLED,
  SAFEROUTE_STORAGE_FAULT_CONTRACT_ENABLED,
} from "../config/env";
import { readAuthSessionContractState } from "../features/auth/authStorage";
import { readOfflineOperationsCalendarContractState } from "../features/operations/offlineOperationsCache";
import { recordGuidanceContractEvidence } from "./guidanceContractEvidence";

const CONTRACT_PRINCIPAL_ID = "66d1b2c3d4e5f60718293d40";
const CONTRACT_CALENDAR_WORKSPACE_ID = "66a1b2c3d4e5f60718293a40";
const CONTRACT_PREFERENCE_WORKSPACE_ID = "66a1b2c3d4e5f60718293a41";

export type OfflineCalendarCleanupContractCause =
  | "cleanup-retry"
  | "inactive-account"
  | "signed-out-boot"
  | "startup-terminal-replay";

export async function recordOfflineCalendarCleanupContractEvidence(
  cause: OfflineCalendarCleanupContractCause,
  outcome: "clean" | "retry-required",
): Promise<boolean> {
  if (
    !SAFEROUTE_GUIDANCE_CONTRACT_EVIDENCE_ENABLED ||
    !SAFEROUTE_STORAGE_FAULT_CONTRACT_ENABLED
  ) {
    return false;
  }
  const [authSession, calendar] = await Promise.all([
    readAuthSessionContractState(),
    readOfflineOperationsCalendarContractState(
      CONTRACT_PRINCIPAL_ID,
      CONTRACT_CALENDAR_WORKSPACE_ID,
      CONTRACT_PREFERENCE_WORKSPACE_ID,
    ),
  ]);
  return recordGuidanceContractEvidence({
    authorization: {
      catalog: "not-checked",
      principal: authSession === "present" ? "matching" : "none",
    },
    cause,
    durability: {
      authSession,
      offlineCalendarCleanup: calendar.cleanup,
      offlineCalendarPayload: calendar.payload,
      offlineCalendarPreference: calendar.preference,
      offlineCalendarSlot: calendar.slot,
    },
    navigationInstanceId: null,
    outcome,
    routeId: null,
    type: "offline.calendar.cleanup",
    unavailableWorkspaceIds: [],
    workspaceId: null,
  });
}
