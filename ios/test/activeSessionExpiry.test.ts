import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  ACTIVE_SESSION_EXPIRY_MAX_TIMER_DELAY_MS,
  createActiveSessionExpiryMonitor,
  resolveActiveSessionExpiry,
  type ActiveSessionExpiryIdentity,
} from '../src/features/auth/activeSessionExpiry';
import { shouldHandleActiveSessionExpiry } from '../src/features/api/sessionExpiry';

function tokenWithExpiry(
  exp: number,
  {
    algorithm = 'HS256',
    issuedAt = 0,
    subject = 'driver@example.com',
    tokenType = 'access',
  }: {
    algorithm?: string;
    issuedAt?: number | null;
    subject?: string | null;
    tokenType?: string | null;
  } = {},
): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: algorithm, typ: 'JWT' })}.${encode({
    exp,
    ...(issuedAt === null ? {} : { iat: issuedAt }),
    ...(subject === null ? {} : { sub: subject }),
    ...(tokenType === null ? {} : { typ: tokenType }),
  })}.signature`;
}

describe('active session expiry', () => {
  it('uses the established clock-skew boundary without inventing opaque expiry', () => {
    assert.deepEqual(
      resolveActiveSessionExpiry({
        accessToken: tokenWithExpiry(200),
        nowMs: 100_000,
      }),
      {
        delayMs: 70_000,
        status: 'scheduled',
      },
    );
    assert.deepEqual(
      resolveActiveSessionExpiry({
        accessToken: tokenWithExpiry(130),
        nowMs: 100_000,
      }),
      { status: 'expired' },
    );
    assert.deepEqual(
      resolveActiveSessionExpiry({
        accessToken: 'opaque-production-token',
        nowMs: 100_000,
      }),
      { status: 'untracked' },
    );
    assert.deepEqual(
      resolveActiveSessionExpiry({
        accessToken: 'not.a.valid.jwt',
        nowMs: 100_000,
      }),
      { status: 'untracked' },
    );
    assert.deepEqual(
      resolveActiveSessionExpiry({
        accessToken: tokenWithExpiry(200, { issuedAt: null }),
        nowMs: 100_000,
      }),
      { status: 'untracked' },
    );
    assert.deepEqual(
      resolveActiveSessionExpiry({
        accessToken: tokenWithExpiry(Number.MAX_VALUE),
        nowMs: 100_000,
      }),
      { status: 'untracked' },
    );
  });

  it('tracks only the same trusted access-token shape accepted for offline restore', () => {
    const untrustedTokens = [
      tokenWithExpiry(200, { algorithm: 'none' }),
      tokenWithExpiry(200, { tokenType: 'refresh' }),
      tokenWithExpiry(200, { issuedAt: null }),
      tokenWithExpiry(200, { subject: null }),
      tokenWithExpiry(90, { issuedAt: 100 }),
      tokenWithExpiry(300, { issuedAt: 131 }),
    ];

    for (const accessToken of untrustedTokens) {
      assert.deepEqual(
        resolveActiveSessionExpiry({
          accessToken,
          nowMs: 100_000,
        }),
        { status: 'untracked' },
      );
    }
  });

  it('chunks delays that exceed the JavaScript timer limit', () => {
    assert.deepEqual(
      resolveActiveSessionExpiry({
        accessToken: tokenWithExpiry(5_000_000),
        nowMs: 0,
      }),
      {
        delayMs: ACTIVE_SESSION_EXPIRY_MAX_TIMER_DELAY_MS,
        status: 'scheduled',
      },
    );
  });

  it('reschedules across multiple timer-limit chunks before expiry', () => {
    let nowMs = 0;
    const timers: Array<{ callback: () => void; delayMs: number }> = [];
    const expired: ActiveSessionExpiryIdentity[] = [];
    const monitor = createActiveSessionExpiryMonitor({
      now: () => nowMs,
      onExpire: (identity) => expired.push(identity),
      schedule: (callback, delayMs) => {
        timers.push({ callback, delayMs });
        return () => undefined;
      },
    });

    monitor.arm({
      accessToken: tokenWithExpiry(5_000_000),
      sessionEpoch: 1,
    });
    assert.equal(
      timers[0]?.delayMs,
      ACTIVE_SESSION_EXPIRY_MAX_TIMER_DELAY_MS,
    );

    nowMs = ACTIVE_SESSION_EXPIRY_MAX_TIMER_DELAY_MS;
    timers[0]?.callback();
    assert.equal(
      timers[1]?.delayMs,
      ACTIVE_SESSION_EXPIRY_MAX_TIMER_DELAY_MS,
    );
    assert.deepEqual(expired, []);

    nowMs = ACTIVE_SESSION_EXPIRY_MAX_TIMER_DELAY_MS * 2;
    timers[1]?.callback();
    assert.equal(
      timers[2]?.delayMs,
      4_999_970_000 - ACTIVE_SESSION_EXPIRY_MAX_TIMER_DELAY_MS * 2,
    );
    assert.deepEqual(expired, []);

    nowMs = 4_999_970_000;
    timers[2]?.callback();
    assert.equal(expired.length, 1);
  });

  it('expires once when an armed boundary is reached', () => {
    let nowMs = 100_000;
    const scheduled: Array<{
      callback: () => void;
      cancelled: boolean;
      delayMs: number;
    }> = [];
    const expired: ActiveSessionExpiryIdentity[] = [];
    const monitor = createActiveSessionExpiryMonitor({
      now: () => nowMs,
      onExpire: (identity) => expired.push(identity),
      schedule: (callback, delayMs) => {
        const timer = { callback, cancelled: false, delayMs };
        scheduled.push(timer);
        return () => {
          timer.cancelled = true;
        };
      },
    });
    const identity = {
      accessToken: tokenWithExpiry(200),
      sessionEpoch: 4,
    };

    monitor.arm(identity);
    assert.equal(scheduled[0]?.delayMs, 70_000);
    nowMs = 170_000;
    scheduled[0]?.callback();
    assert.deepEqual(expired, [identity]);
    assert.equal(monitor.checkNow(), true);
    assert.deepEqual(expired, [identity]);
  });

  it('cancels stale timers and cannot expire a replacement session', () => {
    let nowMs = 100_000;
    const callbacks: Array<() => void> = [];
    const cancelled: boolean[] = [];
    const expired: ActiveSessionExpiryIdentity[] = [];
    const monitor = createActiveSessionExpiryMonitor({
      now: () => nowMs,
      onExpire: (identity) => expired.push(identity),
      schedule: (callback) => {
        const index = callbacks.length;
        callbacks.push(callback);
        cancelled[index] = false;
        return () => {
          cancelled[index] = true;
        };
      },
    });
    const first = {
      accessToken: tokenWithExpiry(200),
      sessionEpoch: 1,
    };
    const replacement = {
      accessToken: tokenWithExpiry(400),
      sessionEpoch: 2,
    };

    monitor.arm(first);
    monitor.arm(replacement);
    assert.equal(cancelled[0], true);

    nowMs = 200_000;
    callbacks[0]?.();
    assert.deepEqual(expired, []);
    assert.equal(monitor.checkNow(), false);

    nowMs = 370_000;
    assert.equal(monitor.checkNow(), true);
    assert.deepEqual(expired, [replacement]);
  });

  it('fails closed immediately when foregrounded across expiry', () => {
    let nowMs = 100_000;
    const expired: ActiveSessionExpiryIdentity[] = [];
    const monitor = createActiveSessionExpiryMonitor({
      now: () => nowMs,
      onExpire: (identity) => expired.push(identity),
      schedule: () => () => undefined,
    });
    const identity = {
      accessToken: tokenWithExpiry(200),
      sessionEpoch: 7,
    };

    monitor.arm(identity);
    nowMs = 171_000;

    assert.equal(monitor.checkNow(), true);
    assert.deepEqual(expired, [identity]);
  });

  it('composes foreground expiry with one guarded user-visible cleanup and no protected refresh', () => {
    let nowMs = 100_000;
    const identity = {
      accessToken: tokenWithExpiry(200),
      sessionEpoch: 7,
    };
    const state = {
      accessToken: identity.accessToken,
      activeGuidance: true,
      cleanupCount: 0,
      handled: false,
      pendingGuidance: true,
      protectedRefreshCount: 0,
      screen: 'routes',
      sessionEpoch: identity.sessionEpoch,
      sessionMessage: '',
    };
    const monitor = createActiveSessionExpiryMonitor({
      now: () => nowMs,
      onExpire: (expiredIdentity) => {
        if (
          !shouldHandleActiveSessionExpiry({
            activeAccessToken: state.accessToken,
            activeSessionEpoch: state.sessionEpoch,
            expiredAccessToken: expiredIdentity.accessToken,
            expiredSessionEpoch: expiredIdentity.sessionEpoch,
            handled: state.handled,
          })
        ) {
          return;
        }
        state.handled = true;
        state.accessToken = '';
        state.activeGuidance = false;
        state.pendingGuidance = false;
        state.cleanupCount += 1;
        state.screen = 'login';
        state.sessionMessage =
          'Your LunarChain session expired. Sign in again.';
      },
      schedule: () => () => undefined,
    });
    monitor.arm(identity);

    nowMs = 171_000;
    const expiredBeforeRefresh = monitor.checkNow();
    if (!expiredBeforeRefresh) {
      state.protectedRefreshCount += 1;
    }

    assert.deepEqual(state, {
      accessToken: '',
      activeGuidance: false,
      cleanupCount: 1,
      handled: true,
      pendingGuidance: false,
      protectedRefreshCount: 0,
      screen: 'login',
      sessionEpoch: 7,
      sessionMessage: 'Your LunarChain session expired. Sign in again.',
    });
    monitor.checkNow();
    assert.equal(state.cleanupCount, 1);
  });

  it('wires foreground expiry before workspace revalidation and reuses guarded cleanup', () => {
    const appSource = fs.readFileSync(
      path.resolve(process.cwd(), 'App.tsx'),
      'utf8',
    );
    const foregroundExpiryIndex = appSource.indexOf(
      "nextAppState === 'active' &&",
    );
    const workspaceDecisionIndex = appSource.indexOf(
      'const decision = resolveWorkspaceForegroundRevalidation',
      foregroundExpiryIndex,
    );

    assert.ok(foregroundExpiryIndex >= 0);
    assert.ok(workspaceDecisionIndex > foregroundExpiryIndex);
    assert.match(
      appSource,
      /activeSessionExpiryMonitorRef\.current\?\.checkNow\(\)[\s\S]*return;[\s\S]*resolveWorkspaceForegroundRevalidation/,
    );
    assert.match(
      appSource,
      /activeSessionExpiryHandlerRef\.current = \(\{[\s\S]*accessToken,[\s\S]*sessionEpoch: expiredSessionEpoch,[\s\S]*handleSessionExpired\([\s\S]*accessToken,[\s\S]*expiredSessionEpoch/,
    );
    assert.match(
      appSource,
      /activeSessionExpiryMonitorRef\.current\?\.arm\([\s\S]*sessionEpoch,[\s\S]*return \(\) => activeSessionExpiryMonitorRef\.current\?\.cancel\(\)/,
    );
    assert.match(
      appSource,
      /sessionExpiryHandledRef\.current \|\|[\s\S]*activeSessionTokenRef\.current !== accessToken/,
    );
  });
});
