const DEFAULT_BLOCKED_MESSAGE =
  "Workspace access could not be verified. Reconnect and try again.";

export interface NavigationStartAuthorizationGate {
  attempt: number;
  pending: boolean;
}

export type NavigationStartAuthorizationGateResult =
  | { status: "authorized" }
  | { status: "blocked"; message: string }
  | { status: "duplicate" }
  | { status: "stale" };

export function createNavigationStartAuthorizationGate(): NavigationStartAuthorizationGate {
  return { attempt: 0, pending: false };
}

export function cancelNavigationStartAuthorization(
  gate: NavigationStartAuthorizationGate,
): void {
  gate.attempt += 1;
  gate.pending = false;
}

export async function runNavigationStartAuthorization({
  authorize,
  commit,
  gate,
}: {
  authorize: () => Promise<string | null>;
  commit: () => void;
  gate: NavigationStartAuthorizationGate;
}): Promise<NavigationStartAuthorizationGateResult> {
  if (gate.pending) {
    return { status: "duplicate" };
  }

  const attempt = gate.attempt + 1;
  gate.attempt = attempt;
  gate.pending = true;

  try {
    const blockedMessage = await authorize();
    if (gate.attempt !== attempt) {
      return { status: "stale" };
    }
    if (blockedMessage) {
      return { status: "blocked", message: blockedMessage };
    }

    commit();
    return { status: "authorized" };
  } catch {
    if (gate.attempt !== attempt) {
      return { status: "stale" };
    }
    return { status: "blocked", message: DEFAULT_BLOCKED_MESSAGE };
  } finally {
    if (gate.attempt === attempt) {
      gate.pending = false;
    }
  }
}
