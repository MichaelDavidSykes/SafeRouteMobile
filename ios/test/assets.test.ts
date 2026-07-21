import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const PNG_SIGNATURE = '89504e470d0a1a0a';

type PngMetadata = {
  bitDepth: number;
  colorType: number;
  height: number;
  width: number;
};

function readPngMetadata(path: string): PngMetadata {
  const buffer = readFileSync(path);
  assert.equal(buffer.subarray(0, 8).toString('hex'), PNG_SIGNATURE, `${path} must be a PNG image`);
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR', `${path} must start with a PNG IHDR chunk`);

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer.readUInt8(24),
    colorType: buffer.readUInt8(25)
  };
}

describe('iOS app artwork assets', () => {
  it('keeps the App Store icon at the expected opaque PNG size', () => {
    assert.deepEqual(readPngMetadata('assets/icon.png'), {
      width: 1024,
      height: 1024,
      bitDepth: 8,
      colorType: 6
    });
  });

  it('keeps the adaptive icon source at the expected high-resolution PNG size', () => {
    assert.deepEqual(readPngMetadata('assets/adaptive-icon.png'), {
      width: 1024,
      height: 1024,
      bitDepth: 8,
      colorType: 6
    });
  });

  it('keeps the iOS launch splash artwork at the expected tall-phone PNG size', () => {
    assert.deepEqual(readPngMetadata('assets/splash.png'), {
      width: 1242,
      height: 2436,
      bitDepth: 8,
      colorType: 6
    });
  });

  it('keeps the in-app SafeRoute logo mark square for rounded UI containers', () => {
    assert.deepEqual(readPngMetadata('assets/logo-mark.png'), {
      width: 512,
      height: 512,
      bitDepth: 8,
      colorType: 6
    });
  });
});
