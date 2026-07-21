import {
  getOfflineAccessJwtClaims,
  JWT_CLOCK_SKEW_SECONDS,
} from './jwt';

export const ACTIVE_SESSION_EXPIRY_MAX_TIMER_DELAY_MS = 2_147_483_647;

export type ActiveSessionExpiryIdentity = {
  accessToken: string;
  sessionEpoch: number;
};

export type ActiveSessionExpiryDecision =
  | { status: 'untracked' }
  | { status: 'expired' }
  | { delayMs: number; status: 'scheduled' };

export type ActiveSessionExpiryMonitor = {
  arm: (identity: ActiveSessionExpiryIdentity | null) => void;
  cancel: () => void;
  checkNow: () => boolean;
};

export function resolveActiveSessionExpiry({
  accessToken,
  clockSkewSeconds = JWT_CLOCK_SKEW_SECONDS,
  maxTimerDelayMs = ACTIVE_SESSION_EXPIRY_MAX_TIMER_DELAY_MS,
  nowMs = Date.now(),
}: {
  accessToken?: string | null;
  clockSkewSeconds?: number;
  maxTimerDelayMs?: number;
  nowMs?: number;
}): ActiveSessionExpiryDecision {
  const token = String(accessToken || '').trim();
  const safeClockSkewSeconds =
    Number.isFinite(clockSkewSeconds) && clockSkewSeconds >= 0
      ? clockSkewSeconds
      : JWT_CLOCK_SKEW_SECONDS;
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const trustedClaims = token
    ? getOfflineAccessJwtClaims(token, safeNowMs / 1000)
    : null;
  const expiryBoundaryMs =
    trustedClaims === null
      ? Number.NaN
      : (trustedClaims.exp - safeClockSkewSeconds) * 1000;

  if (!Number.isFinite(expiryBoundaryMs)) {
    return { status: 'untracked' };
  }

  const remainingMs = expiryBoundaryMs - safeNowMs;
  if (remainingMs <= 0) {
    return { status: 'expired' };
  }

  const safeMaxTimerDelayMs =
    Number.isFinite(maxTimerDelayMs) && maxTimerDelayMs > 0
      ? Math.min(
          Math.floor(maxTimerDelayMs),
          ACTIVE_SESSION_EXPIRY_MAX_TIMER_DELAY_MS,
        )
      : ACTIVE_SESSION_EXPIRY_MAX_TIMER_DELAY_MS;

  return {
    delayMs: Math.max(1, Math.min(Math.ceil(remainingMs), safeMaxTimerDelayMs)),
    status: 'scheduled',
  };
}

export function createActiveSessionExpiryMonitor({
  now = Date.now,
  onExpire,
  schedule,
}: {
  now?: () => number;
  onExpire: (identity: ActiveSessionExpiryIdentity) => void;
  schedule: (callback: () => void, delayMs: number) => () => void;
}): ActiveSessionExpiryMonitor {
  let currentIdentity: ActiveSessionExpiryIdentity | null = null;
  let cancelScheduledCheck: (() => void) | null = null;
  let generation = 0;
  let expired = false;

  const clearScheduledCheck = () => {
    cancelScheduledCheck?.();
    cancelScheduledCheck = null;
  };

  const evaluate = (expectedGeneration: number): boolean => {
    if (
      expectedGeneration !== generation ||
      !currentIdentity
    ) {
      return false;
    }

    if (expired) {
      return true;
    }

    clearScheduledCheck();
    const decision = resolveActiveSessionExpiry({
      accessToken: currentIdentity.accessToken,
      nowMs: now(),
    });

    if (decision.status === 'expired') {
      expired = true;
      onExpire({ ...currentIdentity });
      return true;
    }

    if (decision.status === 'scheduled') {
      cancelScheduledCheck = schedule(() => {
        cancelScheduledCheck = null;
        evaluate(expectedGeneration);
      }, decision.delayMs);
    }

    return false;
  };

  const cancel = () => {
    generation += 1;
    clearScheduledCheck();
    currentIdentity = null;
    expired = false;
  };

  return {
    arm: (identity) => {
      generation += 1;
      clearScheduledCheck();
      const accessToken = String(identity?.accessToken || '').trim();
      currentIdentity = accessToken && identity
        ? {
            accessToken,
            sessionEpoch: identity.sessionEpoch,
          }
        : null;
      expired = false;
      if (currentIdentity) {
        evaluate(generation);
      }
    },
    cancel,
    checkNow: () => {
      if (!currentIdentity) {
        return false;
      }
      return evaluate(generation);
    },
  };
}
