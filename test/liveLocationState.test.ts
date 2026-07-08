import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  LIVE_LOCATION_UNAVAILABLE_MESSAGE,
  LOCATION_PERMISSION_DENIED_MESSAGE,
  permissionStatusFromForegroundPermission,
  trackingLabelForPermissionStatus
} from '../src/features/live-map/liveLocationState';

describe('live location state helpers', () => {
  it('keeps permission status decisions explicit for foreground tracking', () => {
    assert.equal(permissionStatusFromForegroundPermission(true), 'granted');
    assert.equal(permissionStatusFromForegroundPermission(false), 'denied');
  });

  it('uses short production copy for iOS location states', () => {
    assert.equal(trackingLabelForPermissionStatus('checking'), 'Checking');
    assert.equal(trackingLabelForPermissionStatus('granted'), 'Live');
    assert.equal(trackingLabelForPermissionStatus('denied'), 'Location off');
    assert.equal(
      LOCATION_PERMISSION_DENIED_MESSAGE,
      'Location permission is off. Live route guidance needs foreground location access.'
    );
    assert.equal(LIVE_LOCATION_UNAVAILABLE_MESSAGE, 'Live location is unavailable right now.');
  });
});
