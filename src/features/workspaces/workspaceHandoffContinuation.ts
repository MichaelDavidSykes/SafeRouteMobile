import {
  findWorkspace,
  type SafeRouteWorkspace,
} from "./activeWorkspace";

export type WorkspaceHandoffContinuationRequest = {
  principalId: string;
  sessionEpoch: number;
  sourceWorkspaceId: string | null;
  targetWorkspaceId: string;
};

type WorkspaceHandoffContinuationContext = {
  availableWorkspaces: SafeRouteWorkspace[];
  catalogBusy: boolean;
  cleanupPending: boolean;
  cleanupRequired: boolean;
  currentPrincipalId: string;
  currentSessionEpoch: number;
  currentSourceWorkspaceId: string | null;
  hasActiveNavigation: boolean;
  hasPendingNavigation: boolean;
  selectionPending: boolean;
  unavailableWorkspaceIds: ReadonlySet<string>;
};

export type WorkspaceHandoffContinuationDecision =
  | {
      status: "deferred" | "ready";
      target: SafeRouteWorkspace;
    }
  | {
      status: "stale";
      target: null;
    };

export type WorkspaceHandoffRetargetDecision =
  | {
      status: "ready";
      target: SafeRouteWorkspace;
    }
  | {
      status: "deferred" | "keep-current" | "stale";
      target: null;
    };

export type WorkspaceHandoffRetargetOwnershipDecision =
  | "deferred"
  | "ready"
  | "stale";

export type WorkspaceHandoffTargetRemovalRecoveryDecision =
  | "choose-alternative"
  | "deferred"
  | "clear-stale";

export type WorkspaceHandoffAlternativeReason =
  | "explicit-choice"
  | "target-removed";

export type WorkspaceHandoffAlternativeRecoveryDecision =
  | "clear-stale"
  | "deferred"
  | "restore-direct-retry"
  | "retain-alternative";

export type WorkspaceHandoffSelectionFailureResolution =
  | "clear-stale"
  | "storage-blocked"
  | "retain-retry";

export function resolveWorkspaceHandoffAlternativeRecovery({
  continuationStatus,
  ownershipStatus,
  reason,
  targetAuthorizationFresh,
}: {
  continuationStatus: WorkspaceHandoffContinuationDecision["status"];
  ownershipStatus: WorkspaceHandoffRetargetOwnershipDecision;
  reason: WorkspaceHandoffAlternativeReason | null;
  targetAuthorizationFresh: boolean;
}): WorkspaceHandoffAlternativeRecoveryDecision {
  if (ownershipStatus === "stale") {
    return "clear-stale";
  }
  if (ownershipStatus === "deferred") {
    return "deferred";
  }
  if (
    reason === "target-removed" &&
    targetAuthorizationFresh &&
    continuationStatus === "ready"
  ) {
    return "restore-direct-retry";
  }
  return "retain-alternative";
}

export function replaceWorkspaceHandoffTarget<
  Request extends {
    requestedSourceWorkspaceName: string;
    requestedTargetName: string;
    requestedTargetWorkspaceId: string;
  },
>({
  request,
  sourceWorkspaceName,
  target,
}: {
  request: Request;
  sourceWorkspaceName: string;
  target: SafeRouteWorkspace;
}): Request {
  return {
    ...request,
    requestedSourceWorkspaceName:
      sourceWorkspaceName || request.requestedSourceWorkspaceName,
    requestedTargetName: target.name,
    requestedTargetWorkspaceId: target.id,
  };
}

export function canRequestWorkspaceHandoffNavigationCleanupFault({
  evidenceSessionIsCurrent,
  faultContractEnabled,
  handoffPending,
  navigationStateIsCurrent,
  pendingRequestIsCurrent,
  principalIsCurrent,
  sessionIsCurrent,
  sourceIsCurrent,
  targetIsCurrent,
}: {
  evidenceSessionIsCurrent: boolean;
  faultContractEnabled: boolean;
  handoffPending: boolean;
  navigationStateIsCurrent: boolean;
  pendingRequestIsCurrent: boolean;
  principalIsCurrent: boolean;
  sessionIsCurrent: boolean;
  sourceIsCurrent: boolean;
  targetIsCurrent: boolean;
}): boolean {
  return (
    evidenceSessionIsCurrent &&
    faultContractEnabled &&
    handoffPending &&
    navigationStateIsCurrent &&
    pendingRequestIsCurrent &&
    principalIsCurrent &&
    sessionIsCurrent &&
    sourceIsCurrent &&
    targetIsCurrent
  );
}

export async function shouldInjectWorkspaceHandoffNavigationCleanupFault({
  faultContractEnabled,
  requestFault,
  requestIsCurrent,
}: {
  faultContractEnabled: boolean;
  requestFault: () => Promise<boolean>;
  requestIsCurrent: () => boolean;
}): Promise<boolean> {
  if (!faultContractEnabled || !requestIsCurrent()) {
    return false;
  }
  try {
    const injectFault = await requestFault();
    return injectFault && requestIsCurrent();
  } catch {
    return false;
  }
}

export async function recoverWorkspaceHandoffNavigationCleanupAfterOwnershipLoss({
  clearNavigation,
  requestIsCurrent,
}: {
  clearNavigation: () => Promise<boolean>;
  requestIsCurrent: () => boolean;
}): Promise<boolean> {
  if (requestIsCurrent()) {
    return false;
  }
  try {
    return await clearNavigation();
  } catch {
    return false;
  }
}

export function canRequestWorkspaceHandoffTargetSelectionFault({
  completedRouteHandoff,
  faultContractEnabled,
  requestOwnerIsCurrent,
  selectionRetryIsCurrent,
  targetIsCurrent,
}: {
  completedRouteHandoff: boolean;
  faultContractEnabled: boolean;
  requestOwnerIsCurrent: boolean;
  selectionRetryIsCurrent: boolean;
  targetIsCurrent: boolean;
}): boolean {
  return (
    completedRouteHandoff &&
    faultContractEnabled &&
    requestOwnerIsCurrent &&
    selectionRetryIsCurrent &&
    targetIsCurrent
  );
}

export function resolveWorkspaceHandoffSelectionFailure({
  continuationStatus,
  requestOwnerIsCurrent,
  sourceReconciliationPersisted,
}: {
  continuationStatus: WorkspaceHandoffContinuationDecision["status"];
  requestOwnerIsCurrent: boolean;
  sourceReconciliationPersisted: boolean;
}): WorkspaceHandoffSelectionFailureResolution {
  if (!sourceReconciliationPersisted) {
    return "storage-blocked";
  }
  if (!requestOwnerIsCurrent || continuationStatus === "stale") {
    return "clear-stale";
  }
  return "retain-retry";
}

export function resolveDeferredWorkspaceRefreshAfterSelection({
  refreshDeferred,
  requestOwnerIsCurrent,
}: {
  refreshDeferred: boolean;
  requestOwnerIsCurrent: boolean;
}): "discard" | "none" | "resume" {
  if (!refreshDeferred) {
    return "none";
  }
  return requestOwnerIsCurrent ? "resume" : "discard";
}

export function resolveWorkspaceHandoffContinuation({
  context,
  request,
}: {
  context: WorkspaceHandoffContinuationContext;
  request: WorkspaceHandoffContinuationRequest;
}): WorkspaceHandoffContinuationDecision {
  if (
    request.principalId !== context.currentPrincipalId ||
    request.sessionEpoch !== context.currentSessionEpoch ||
    request.sourceWorkspaceId !== context.currentSourceWorkspaceId ||
    context.hasActiveNavigation ||
    context.hasPendingNavigation ||
    context.unavailableWorkspaceIds.has(request.targetWorkspaceId)
  ) {
    return { status: "stale", target: null };
  }

  const target = findWorkspace(
    context.availableWorkspaces,
    request.targetWorkspaceId,
  );
  if (
    !target ||
    (
      request.sourceWorkspaceId !== null &&
      request.sourceWorkspaceId === target.id
    )
  ) {
    return { status: "stale", target: null };
  }

  if (
    context.catalogBusy ||
    context.cleanupPending ||
    context.cleanupRequired ||
    context.selectionPending
  ) {
    return { status: "deferred", target };
  }

  return { status: "ready", target };
}

export function resolveWorkspaceHandoffRetarget({
  context,
  request,
  selectedWorkspaceId,
}: {
  context: WorkspaceHandoffContinuationContext;
  request: WorkspaceHandoffContinuationRequest;
  selectedWorkspaceId: string;
}): WorkspaceHandoffRetargetDecision {
  const ownership = resolveWorkspaceHandoffRetargetOwnership({
    context,
    request,
  });
  if (ownership !== "ready") {
    return { status: ownership, target: null };
  }

  if (
    request.sourceWorkspaceId !== null &&
    selectedWorkspaceId === request.sourceWorkspaceId
  ) {
    return { status: "keep-current", target: null };
  }

  const target = findWorkspace(
    context.availableWorkspaces,
    selectedWorkspaceId,
  );
  if (
    !target ||
    context.unavailableWorkspaceIds.has(selectedWorkspaceId)
  ) {
    return { status: "stale", target: null };
  }

  return { status: "ready", target };
}

export function resolveWorkspaceHandoffRetargetOwnership({
  context,
  request,
}: {
  context: WorkspaceHandoffContinuationContext;
  request: WorkspaceHandoffContinuationRequest;
}): WorkspaceHandoffRetargetOwnershipDecision {
  if (
    request.principalId !== context.currentPrincipalId ||
    request.sessionEpoch !== context.currentSessionEpoch ||
    request.sourceWorkspaceId !== context.currentSourceWorkspaceId ||
    context.hasActiveNavigation ||
    context.hasPendingNavigation
  ) {
    return "stale";
  }

  if (
    context.catalogBusy ||
    context.cleanupPending ||
    context.cleanupRequired ||
    context.selectionPending
  ) {
    return "deferred";
  }

  return "ready";
}

export function resolveWorkspaceHandoffTargetRemovalRecovery({
  context,
  currentSelectionOwnsPending = false,
  request,
}: {
  context: WorkspaceHandoffContinuationContext;
  currentSelectionOwnsPending?: boolean;
  request: WorkspaceHandoffContinuationRequest;
}): WorkspaceHandoffTargetRemovalRecoveryDecision {
  const ownership = resolveWorkspaceHandoffRetargetOwnership({
    context: currentSelectionOwnsPending
      ? { ...context, selectionPending: false }
      : context,
    request,
  });

  if (ownership === "ready") {
    return "choose-alternative";
  }
  if (ownership === "deferred") {
    return "deferred";
  }
  return "clear-stale";
}
