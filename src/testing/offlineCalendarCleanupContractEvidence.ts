import {
  SAFEROUTE_CONNECTIVITY_CONTRACT_ENABLED,
  SAFEROUTE_GUIDANCE_CONTRACT_EVIDENCE_ENABLED,
  SAFEROUTE_STORAGE_FAULT_CONTRACT_ENABLED,
} from "../config/env";
import { readAuthSessionContractState } from "../features/auth/authStorage";
import { readOfflineOperationsCalendarContractState } from "../features/operations/offlineOperationsCache";
import { recordGuidanceContractEvidence } from "./guidanceContractEvidence";

const CONTRACT_PRINCIPAL_ID = "66d1b2c3d4e5f60718293d40";
const CONTRACT_CALENDAR_WORKSPACE_ID = "66a1b2c3d4e5f60718293a40";
const CONTRACT_PREFERENCE_WORKSPACE_ID = "66a1b2c3d4e5f60718293a41";
const workspaceRevocationEvidence = new Map<string, Promise<boolean>>();

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

export type OfflineCalendarWorkspaceRevocationContractCause =
  | "workspace-denial"
  | "workspace-denial-relaunch";

export function recordOfflineCalendarWorkspaceSeedContractEvidence(
  principalId: string,
  workspaceId: string,
): Promise<boolean> {
  const normalizedPrincipalId = principalId.trim();
  const normalizedWorkspaceId = workspaceId.trim();
  if (
    !SAFEROUTE_CONNECTIVITY_CONTRACT_ENABLED ||
    !SAFEROUTE_GUIDANCE_CONTRACT_EVIDENCE_ENABLED ||
    normalizedPrincipalId !== CONTRACT_PRINCIPAL_ID ||
    normalizedWorkspaceId !== CONTRACT_CALENDAR_WORKSPACE_ID
  ) {
    return Promise.resolve(false);
  }
  const evidenceKey = `workspace-denial-seed:${normalizedPrincipalId}:${normalizedWorkspaceId}`;
  const existing = workspaceRevocationEvidence.get(evidenceKey);
  if (existing) {
    return existing;
  }
  const pending = recordWorkspaceSeedEvidence(normalizedPrincipalId);
  workspaceRevocationEvidence.set(evidenceKey, pending);
  void pending.then((recorded) => {
    if (!recorded && workspaceRevocationEvidence.get(evidenceKey) === pending) {
      workspaceRevocationEvidence.delete(evidenceKey);
    }
  });
  return pending;
}

export function recordOfflineCalendarWorkspaceRevocationContractEvidence({
  authorizationCatalog,
  cause,
  principalId,
  unavailableWorkspaceIds,
}: {
  authorizationCatalog: "fresh-denied" | "not-checked";
  cause: OfflineCalendarWorkspaceRevocationContractCause;
  principalId: string;
  unavailableWorkspaceIds: Iterable<string>;
}): Promise<boolean> {
  const normalizedPrincipalId = principalId.trim();
  const normalizedUnavailableWorkspaceIds = Array.from(
    new Set(
      Array.from(unavailableWorkspaceIds)
        .map((workspaceId) => workspaceId.trim())
        .filter(Boolean),
    ),
  );
  if (
    !SAFEROUTE_CONNECTIVITY_CONTRACT_ENABLED ||
    !SAFEROUTE_GUIDANCE_CONTRACT_EVIDENCE_ENABLED ||
    normalizedPrincipalId !== CONTRACT_PRINCIPAL_ID ||
    !normalizedUnavailableWorkspaceIds.includes(
      CONTRACT_CALENDAR_WORKSPACE_ID,
    )
  ) {
    return Promise.resolve(false);
  }

  const evidenceKey = `${cause}:${normalizedPrincipalId}:${normalizedUnavailableWorkspaceIds.join(",")}`;
  const existing = workspaceRevocationEvidence.get(evidenceKey);
  if (existing) {
    return existing;
  }
  const pending = recordWorkspaceRevocationEvidence({
    authorizationCatalog,
    cause,
    principalId: normalizedPrincipalId,
    unavailableWorkspaceIds: normalizedUnavailableWorkspaceIds,
  });
  workspaceRevocationEvidence.set(evidenceKey, pending);
  void pending.then((recorded) => {
    if (!recorded && workspaceRevocationEvidence.get(evidenceKey) === pending) {
      workspaceRevocationEvidence.delete(evidenceKey);
    }
  });
  return pending;
}

async function recordWorkspaceRevocationEvidence({
  authorizationCatalog,
  cause,
  principalId,
  unavailableWorkspaceIds,
}: {
  authorizationCatalog: "fresh-denied" | "not-checked";
  cause: OfflineCalendarWorkspaceRevocationContractCause;
  principalId: string;
  unavailableWorkspaceIds: string[];
}): Promise<boolean> {
  const [authSession, calendar] = await Promise.all([
    readAuthSessionContractState(),
    readOfflineOperationsCalendarContractState(
      principalId,
      CONTRACT_CALENDAR_WORKSPACE_ID,
      CONTRACT_PREFERENCE_WORKSPACE_ID,
    ),
  ]);
  return recordGuidanceContractEvidence({
    authorization: {
      catalog: authorizationCatalog,
      principal: authSession === "present" ? "matching" : "none",
    },
    cause,
    durability: {
      authSession,
      offlineCalendarCleanup: calendar.cleanup,
      offlineCalendarPayload: calendar.payload,
      offlineCalendarPreference: calendar.preference,
      offlineCalendarSlot: calendar.slot,
      workspaceContext: "persisted",
    },
    navigationInstanceId: null,
    outcome: "clean",
    routeId: null,
    type: "offline.calendar.workspace-lifecycle",
    unavailableWorkspaceIds,
    workspaceId: CONTRACT_CALENDAR_WORKSPACE_ID,
  });
}

async function recordWorkspaceSeedEvidence(
  principalId: string,
): Promise<boolean> {
  const [authSession, calendar] = await Promise.all([
    readAuthSessionContractState(),
    readOfflineOperationsCalendarContractState(
      principalId,
      CONTRACT_CALENDAR_WORKSPACE_ID,
      CONTRACT_PREFERENCE_WORKSPACE_ID,
    ),
  ]);
  if (
    authSession !== "present" ||
    calendar.cleanup !== "absent" ||
    calendar.payload !== "present" ||
    calendar.preference !== "disabled" ||
    calendar.slot !== "payload"
  ) {
    return false;
  }
  return recordGuidanceContractEvidence({
    authorization: {
      catalog: "fresh-authorized",
      principal: "matching",
    },
    cause: "workspace-denial-seed",
    durability: {
      authSession,
      offlineCalendarCleanup: calendar.cleanup,
      offlineCalendarPayload: calendar.payload,
      offlineCalendarPreference: calendar.preference,
      offlineCalendarSlot: calendar.slot,
    },
    navigationInstanceId: null,
    outcome: "seeded",
    routeId: null,
    type: "offline.calendar.workspace-lifecycle",
    unavailableWorkspaceIds: [],
    workspaceId: CONTRACT_CALENDAR_WORKSPACE_ID,
  });
}
