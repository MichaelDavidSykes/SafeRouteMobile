import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createDeviceHeadingAccessibilityLabel,
  resolveDeviceHeadingScreenRotation,
  resolveDeviceHeadingDegrees,
  smoothDeviceHeadingDegrees
} from '../src/features/maps/deviceHeading';

describe('device heading', () => {
  it('prefers a calibrated true-north heading and normalizes it', () => {
    assert.equal(resolveDeviceHeadingDegrees({
      accuracy: 3,
      magHeading: 40,
      trueHeading: 361
    }), 1);
  });

  it('falls back to magnetic north when true north is unavailable', () => {
    assert.equal(resolveDeviceHeadingDegrees({
      accuracy: 2,
      magHeading: 275,
      trueHeading: -1
    }), 275);
  });

  it('continues following a finite heading while calibration accuracy is unavailable', () => {
    assert.equal(resolveDeviceHeadingDegrees({
      accuracy: 0,
      magHeading: 90,
      trueHeading: 90
    }), 90);
    assert.equal(resolveDeviceHeadingDegrees({
      accuracy: 0,
      magHeading: 275,
      trueHeading: -1
    }), 275);
  });

  it('rejects invalid compass samples instead of preserving a stale direction', () => {
    assert.equal(resolveDeviceHeadingDegrees({
      accuracy: 3,
      magHeading: Number.NaN,
      trueHeading: -1
    }), null);
    assert.equal(resolveDeviceHeadingDegrees({
      accuracy: -1,
      magHeading: 90,
      trueHeading: 90
    }), null);
  });

  it('smooths across north without rotating the long way around', () => {
    const heading = smoothDeviceHeadingDegrees(358, 2);
    assert.ok(heading > 358 && heading < 360);
  });

  it('keeps tiny sensor changes inside the visual deadband', () => {
    assert.equal(smoothDeviceHeadingDegrees(45, 46), 45);
  });

  it('keeps the arrow geographic when the user rotates the map', () => {
    assert.equal(resolveDeviceHeadingScreenRotation(90, 30), 60);
    assert.equal(resolveDeviceHeadingScreenRotation(10, 350), 20);
    assert.equal(resolveDeviceHeadingScreenRotation(null, 45), null);
  });

  it('describes the facing direction without inventing one', () => {
    assert.equal(createDeviceHeadingAccessibilityLabel(null), 'Current location');
    assert.equal(
      createDeviceHeadingAccessibilityLabel(92),
      'Current location, facing east'
    );
  });
});
