import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { createGuestMapHomeCopy } from '../src/features/guest-map/guestRoutePlanner';

describe('default Expo Go session', () => {
  it('starts without preview authentication and presents Login while signed out', () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };

    assert.match(
      packageJson.scripts?.start || '',
      /SAFEROUTE_ENABLE_PREVIEW_MODE=false\s+expo start/,
    );
    assert.deepEqual(createGuestMapHomeCopy(false), {
      primaryActionAccessibilityLabel: 'Sign in to SafeRoute',
      primaryActionLabel: 'Login',
      sheetTitle: 'Where to?',
      sheetSubtitle: 'Map first. Save after sign-in.',
    });
  });
});
