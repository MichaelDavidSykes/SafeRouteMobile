import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

describe('guest location search UI contract', () => {
  const screen = readFileSync(
    join(process.cwd(), 'src/features/guest-map/GuestMapScreen.tsx'),
    'utf8'
  );

  it('biases custom place search to the visible map instead of the device', () => {
    const biasStart = screen.indexOf('const locationSearchBiasRef = useRef');
    const biasEnd = screen.indexOf('const currentLocationVisible', biasStart);
    const locationSearchBias = screen.slice(biasStart, biasEnd);

    assert.notEqual(biasStart, -1);
    assert.notEqual(biasEnd, -1);
    assert.match(locationSearchBias, /latitude: mapRegion\.latitude/);
    assert.match(locationSearchBias, /longitude: mapRegion\.longitude/);
    assert.doesNotMatch(locationSearchBias, /liveCoordinate/);
  });

  it('disables native address autofill on both custom route search inputs', () => {
    assert.equal(screen.match(/autoComplete="off"/g)?.length, 2);
    assert.equal(screen.match(/importantForAutofill="no"/g)?.length, 2);
    assert.equal(screen.match(/textContentType="none"/g)?.length, 2);
  });
});
