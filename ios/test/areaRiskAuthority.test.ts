import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  classifyAreaRiskFeedAuthority
} from '../src/features/live-map/areaRiskAuthority';

describe('area-risk feed authority', () => {
  it('accepts only exact workspace and public privacy authority', () => {
    assert.equal(classifyAreaRiskFeedAuthority(standardFeed(), {
      clientId: 'tenant-1'
    }).state, 'current');
    assert.equal(classifyAreaRiskFeedAuthority(standardFeed({
      privacy: {
        tenantScopedSeed: false,
        sharedOutput: 'sanitized-global'
      },
      seedStatus: 'not-requested'
    }), {}).state, 'current');

    for (const payload of [
      standardFeed({ privacy: undefined }),
      standardFeed({
        privacy: {
          tenantScopedSeed: false,
          sharedOutput: 'sanitized-global'
        }
      }),
      standardFeed({
        privacy: {
          tenantScopedSeed: true,
          sharedOutput: 'external-provider'
        }
      })
    ]) {
      const result = classifyAreaRiskFeedAuthority(payload, {
        clientId: 'tenant-1'
      });
      assert.equal(result.state, 'failed');
      assert.match(result.error ?? '', /workspace authority/i);
    }

    const publicTenantSeed = classifyAreaRiskFeedAuthority(standardFeed(), {});
    assert.equal(publicTenantSeed.state, 'failed');
    assert.match(publicTenantSeed.error ?? '', /workspace authority/i);
  });

  it('fails closed for failed or unknown provider and seed states even with items', () => {
    for (const payload of [
      standardFeed({ providerStatus: 'failed' }),
      standardFeed({ seedStatus: 'failed' }),
      standardFeed({ providerStatus: 'invented' }),
      standardFeed({ seedStatus: 'invented' })
    ]) {
      assert.equal(classifyAreaRiskFeedAuthority(payload, {
        clientId: 'tenant-1'
      }).state, 'failed');
    }
  });

  it('preserves exact pending and bounded partial truth', () => {
    assert.equal(classifyAreaRiskFeedAuthority(standardFeed({
      providerStatus: 'queued',
      seedStatus: 'researching'
    }), { clientId: 'tenant-1' }).state, 'pending');

    const safetyPartial = classifyAreaRiskFeedAuthority(standardFeed({
      providerStatus: 'partial',
      safetyFilter: {
        capability: 'safe-route-risk-rejection-v1',
        rejectedCount: 1,
        localityRejectedCount: 1,
        cityScaleRejectedCount: 0,
        invalidRecordRejectedCount: 0,
        outOfBoundsRejectedCount: 0
      }
    }), { clientId: 'tenant-1' });
    assert.equal(safetyPartial.state, 'partial');
    assert.match(safetyPartial.error ?? '', /excluded 1/i);

    assert.equal(classifyAreaRiskFeedAuthority(standardFeed({
      providerErrors: ['Provider continuation was incomplete.']
    }), { clientId: 'tenant-1' }).state, 'partial');
  });

  it('accepts external fallback only with exact non-tenant external privacy', () => {
    const valid = classifyAreaRiskFeedAuthority(standardFeed({
      privacy: {
        tenantScopedSeed: false,
        sharedOutput: 'external-provider'
      },
      providerStatus: 'external-fallback'
    }), { clientId: 'tenant-1' });
    assert.equal(valid.state, 'partial');

    const invalid = classifyAreaRiskFeedAuthority(standardFeed({
      providerStatus: 'external-fallback'
    }), { clientId: 'tenant-1' });
    assert.equal(invalid.state, 'failed');
    assert.match(invalid.error ?? '', /fallback.*privacy authority/i);
  });

  it('keeps old-Backend fallback visibly partial but rejects empty unverifiable output', () => {
    assert.equal(classifyAreaRiskFeedAuthority({ data: {
      items: [{ id: 'legacy-risk' }]
    } }, {
      clientId: 'tenant-1',
      legacyFallback: true
    }).state, 'partial');
    assert.equal(classifyAreaRiskFeedAuthority({ data: { items: [] } }, {
      clientId: 'tenant-1',
      legacyFallback: true
    }).state, 'failed');
  });

  it('binds continuation authority to provider, seed, privacy, warnings, and seed identity', () => {
    const first = classifyAreaRiskFeedAuthority(standardFeed(), {
      clientId: 'tenant-1'
    });
    for (const changed of [
      standardFeed({ providerStatus: 'queued', seedStatus: 'researching' }),
      standardFeed({ seedId: 'seed-other' }),
      standardFeed({ providerErrors: ['degraded'] }),
      standardFeed({
        privacy: {
          tenantScopedSeed: false,
          sharedOutput: 'sanitized-global'
        }
      })
    ]) {
      assert.notEqual(
        classifyAreaRiskFeedAuthority(changed, {
          clientId: 'tenant-1'
        }).paginationSignature,
        first.paginationSignature
      );
    }
  });
});

function standardFeed(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      items: [{ id: 'risk-1' }],
      privacy: {
        tenantScopedSeed: true,
        sharedOutput: 'sanitized-global'
      },
      providerStatus: 'primary',
      seedId: 'seed-tenant-1',
      seedStatus: 'covered',
      ...overrides
    }
  };
}
