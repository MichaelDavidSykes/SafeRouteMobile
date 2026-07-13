import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('authenticated map session expiry integration', () => {
  it('propagates only the active viewport request expiry and deduplicates split views', () => {
    const hook = source('src/features/live-map/useViewportRiskAreas.ts');

    assert.match(hook, /requestRevisionRef\.current !== revision/);
    assert.match(hook, /getRequestSessionExpiry/);
    assert.match(hook, /handled: sessionExpiryHandled/);
    assert.match(hook, /sessionExpiryHandled = true;[\s\S]*controller\.abort\(\);[\s\S]*setZones\(\[\]\);[\s\S]*onSessionExpiredRef\.current\?\.\(sessionExpiry\.message\)/);
  });

  it('routes current guest route and corridor expiry without publishing a generic failure', () => {
    const app = source('App.tsx');
    const guestMap = source('src/features/guest-map/GuestMapScreen.tsx');

    assert.match(guestMap, /useViewportRiskAreas\(\{[\s\S]*onSessionExpired/);
    assert.match(app, /fetchSavedRoutes\(accessToken\)[\s\S]*error instanceof ApiSessionExpiredError[\s\S]*handleSessionExpired\(error\.message\)/);
    assert.doesNotMatch(guestMap, /fetchSavedRoutes\(accessToken\)/);
    assert.match(guestMap, /handleRouteSessionExpiry/);
    assert.match(guestMap, /roadRouteRequestIdRef\.current !== requestId/);
    assert.match(guestMap, /catch \(error\) \{[\s\S]*handleRouteSessionExpiry\(error\)/);
    assert.match(guestMap, /\.catch\(\(error\) => \{[\s\S]*handleRouteSessionExpiry\(error\)/);
    assert.match(guestMap, /!acceptedRoadPreview && !sessionExpiryHandled/);
    assert.match(guestMap, /activeRiskAreaRequestRef\.current\?\.abort\(\)/);
    assert.match(guestMap, /createGuestRiskArea\(\{[\s\S]*signal: controller\.signal/);
  });

  it('routes only the current live reroute expiry to the app session boundary', () => {
    const liveMap = source('src/features/live-map/LiveMapScreen.tsx');

    assert.match(liveMap, /onSessionExpired\?: \(message\?: string\) => void/);
    assert.match(liveMap, /useViewportRiskAreas\(\{[\s\S]*onSessionExpired/);
    assert.match(liveMap, /getRequestSessionExpiry/);
    assert.match(liveMap, /currentRerouteState\.status === "pending"/);
    assert.match(liveMap, /currentRerouteState\.request\.requestRevision === request\.requestRevision/);
    assert.match(liveMap, /currentRerouteState\.request\.routeRevision === request\.routeRevision/);
    assert.match(liveMap, /onSessionExpired\?\.\(sessionExpiry\.message\);[\s\S]*return;/);
    assert.match(liveMap, /activeRerouteRequestRef\.current\?\.abort\(\)/);
    assert.match(liveMap, /fetchSafeRouteRoadRoutePreview\(\{[\s\S]*signal: controller\.signal/);
    assert.match(liveMap, /fetchAreaRiskAlongRoute\([\s\S]*signal: controller\.signal/);
    assert.match(liveMap, /useEffect\(\(\) => \(\) => \{[\s\S]*stopLiveRerouteMonitoring/);
  });

  it('deduplicates app-wide expiry cleanup and resets the guard after authentication', () => {
    const app = source('App.tsx');

    assert.match(app, /sessionExpiryHandledRef = useRef\(false\)/);
    assert.match(app, /activeSessionTokenRef = useRef/);
    assert.match(app, /sessionCleanupRef = useRef/);
    assert.match(app, /sessionEpochRef = useRef/);
    assert.match(app, /shouldHandleActiveSessionExpiry/);
    assert.match(app, /sessionExpiryHandledRef\.current = true;[\s\S]*activeSessionTokenRef\.current = null/);
    assert.match(app, /Promise\.allSettled\(\[[\s\S]*stopBackgroundNavigation\(\)[\s\S]*clearActiveNavigationSession\(\)[\s\S]*clearAuthSession\(\)/);
    assert.match(app, /handleAuthenticated[\s\S]*await waitForSessionCleanup\(sessionCleanupRef\.current\);[\s\S]*prepareAuthenticatedSession/);
    assert.match(app, /activeSessionTokenRef\.current = persistedSession\.accessToken;[\s\S]*sessionExpiryHandledRef\.current = false;[\s\S]*setSession\(persistedSession\)/);
    assert.match(app, /<LiveMapScreen[\s\S]*onSessionExpired=\{handleSessionExpired\}/);
    assert.match(app, /screen === 'route-preview' && routePreviewSource === 'saved'[\s\S]*'saved-routes'/);
  });
});
