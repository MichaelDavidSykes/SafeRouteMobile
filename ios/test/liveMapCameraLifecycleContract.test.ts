import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const source = readFileSync(
  new URL('../src/features/live-map/LiveMapScreen.tsx', import.meta.url),
  'utf8',
);

describe('live map camera lifecycle contract', () => {
  it('does not let delayed route framing replace active drive-along guidance', () => {
    assert.match(source, /const driveAlongCameraActiveRef = useRef/);
    assert.match(
      source,
      /const timer = setTimeout[\s\S]*!driveAlongCameraActiveRef\.current[\s\S]*fitToCoordinates/,
    );
    assert.match(
      source,
      /commitNavigationStart[\s\S]*driveAlongCameraActiveRef\.current = true[\s\S]*setNavigationState\("navigating"\)/,
    );
    assert.match(
      source,
      /activeNavigationState === "paused"[\s\S]*driveAlongCameraActiveRef\.current = true[\s\S]*setNavigationState\("navigating"\)/,
    );
  });

  it('restores the drive-along camera when the native map becomes ready during Start', () => {
    assert.match(
      source,
      /const handleMapReady = \(\) => \{[\s\S]*driveAlongCameraActiveRef\.current[\s\S]*resolveDriveAlongCamera[\s\S]*animateCamera/,
    );
    assert.match(source, /onMapReady=\{handleMapReady\}/);
    assert.doesNotMatch(source, /onMapReady=\{fitRoute\}/);
  });
});
