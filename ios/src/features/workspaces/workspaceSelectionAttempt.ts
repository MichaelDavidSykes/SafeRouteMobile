export type DurableWorkspaceSelectionAttemptResult<
  Target,
  Reconciliation,
> =
  | {
      status: "failed";
      reconciliation: Reconciliation;
    }
  | {
      status: "verified";
      target: Target;
    };

export async function runDurableWorkspaceSelectionAttempt<
  PersistedSelection,
  Target,
  Reconciliation,
>({
  persistTarget,
  reconcileSource,
  reconciliationFailure,
  resolvePersistedTarget,
}: {
  persistTarget: () => Promise<PersistedSelection>;
  reconcileSource: () => Promise<Reconciliation>;
  reconciliationFailure: Reconciliation;
  resolvePersistedTarget: (
    persistedSelection: PersistedSelection,
  ) => Target | null;
}): Promise<
  DurableWorkspaceSelectionAttemptResult<Target, Reconciliation>
> {
  try {
    const persistedSelection = await persistTarget();
    const target = resolvePersistedTarget(persistedSelection);
    if (target) {
      return { status: "verified", target };
    }
  } catch {
    // A failed or unverified target write must reconcile back to the source.
  }

  try {
    return {
      reconciliation: await reconcileSource(),
      status: "failed",
    };
  } catch {
    return {
      reconciliation: reconciliationFailure,
      status: "failed",
    };
  }
}
