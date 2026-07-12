import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_SIGN_IN_PROMPT,
  createSignInPrompt,
  hasAuthenticatedSession,
  resolveFullAccessNavigation,
  routePreviewReturnCopy,
  screenAfterAuthentication,
  screenAfterRoutePreview
} from '../src/features/navigation/appRouting';

describe('app routing security gates', () => {
  it('keeps private SafeRoute features behind sign-in when unauthenticated', () => {
    assert.equal(DEFAULT_SIGN_IN_PROMPT, 'Sign in to save and sync.');
    const savedPrompt = createSignInPrompt('saved-routes');
    assert.deepEqual(resolveFullAccessNavigation({ authenticated: false, feature: 'saved-routes' }), {
      screen: 'login',
      prompt: savedPrompt
    });
    assert.match(savedPrompt, /^Sign in .+\.$/);
    assert.match(createSignInPrompt('planned-trips'), /^Sign in .+\.$/);
    assert.match(createSignInPrompt('calendar'), /^Sign in .+\.$/);
    assert.match(createSignInPrompt('convoy-management'), /^Sign in .+\.$/);
  });

  it('routes authenticated users to protected saved-route and operations functionality', () => {
    assert.deepEqual(resolveFullAccessNavigation({ authenticated: true, feature: 'saved-routes' }), {
      screen: 'routes',
      prompt: ''
    });
    assert.deepEqual(resolveFullAccessNavigation({ authenticated: true, feature: 'planned-trips' }), {
      screen: 'operations',
      prompt: '',
      tab: 'planned-routes'
    });
    assert.deepEqual(resolveFullAccessNavigation({ authenticated: true, feature: 'calendar' }), {
      screen: 'operations',
      prompt: '',
      tab: 'calendar'
    });
    assert.deepEqual(resolveFullAccessNavigation({ authenticated: true, feature: 'convoy-management' }), {
      screen: 'operations',
      prompt: '',
      tab: 'convoy-management'
    });
  });

  it('returns successful sign-in to the map-first home surface', () => {
    assert.equal(screenAfterAuthentication(), 'guest-map');
  });

  it('treats only sessions with a non-empty access token as authenticated', () => {
    assert.equal(hasAuthenticatedSession(null), false);
    assert.equal(hasAuthenticatedSession({ accessToken: '' }), false);
    assert.equal(hasAuthenticatedSession({ accessToken: '   ' }), false);
    assert.equal(hasAuthenticatedSession({ accessToken: 'token-123' }), true);
  });

  it('returns route previews to the correct safe surface', () => {
    assert.deepEqual(routePreviewReturnCopy('guest'), {
      accessibilityLabel: 'Return to map',
      label: 'Map'
    });
    assert.deepEqual(routePreviewReturnCopy('saved'), {
      accessibilityLabel: 'Return to saved routes',
      label: 'All routes'
    });
    assert.equal(screenAfterRoutePreview('guest', true), 'guest-map');
    assert.equal(screenAfterRoutePreview('saved', true), 'routes');
    assert.equal(screenAfterRoutePreview('saved', false), 'guest-map');
  });
});
