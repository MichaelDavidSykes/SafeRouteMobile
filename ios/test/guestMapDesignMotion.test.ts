import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const guestMapSource = readFileSync(
  new URL('../src/features/guest-map/GuestMapScreen.tsx', import.meta.url),
  'utf8',
);
const motionSource = readFileSync(
  new URL('../src/motion/SafeRouteMotion.tsx', import.meta.url),
  'utf8',
);

describe('guest map design motion', () => {
  it('renders all four travel modes with a moving selection plate', () => {
    assert.match(guestMapSource, /GUEST_TRAVEL_MODE_OPTIONS/);
    assert.match(guestMapSource, /guestMapTravelModeSelector/);
    assert.match(guestMapSource, /useMotionValue\(Math\.max\(0, selectedIndex\)/);
    assert.match(guestMapSource, /translateX: selectionProgress\.interpolate/);
    assert.match(guestMapSource, /<CarFront/);
    assert.match(guestMapSource, /<PersonStanding/);
    assert.match(guestMapSource, /<Bike/);
    assert.match(guestMapSource, /<TrainFront/);
  });

  it('preserves the selected mode through planning and risk-aware retries', () => {
    assert.match(guestMapSource, /travelMode,\s*\n\s*\}\);/);
    assert.equal(
      (guestMapSource.match(/travelMode: localRoutePlan\.travelMode \?\? 'drive'/g) || []).length,
      3,
    );
  });

  it('matches the design entrances and pulse while respecting Reduce Motion', () => {
    assert.match(guestMapSource, /variant="chrome"/);
    assert.match(guestMapSource, /variant="sheet"/);
    assert.match(guestMapSource, /variant="disclosure"/);
    assert.match(guestMapSource, /outputRange: \[1, 2\.8\]/);
    assert.match(motionSource, /AccessibilityInfo\.isReduceMotionEnabled/);
    assert.match(motionSource, /duration = 2600/);
  });
});
