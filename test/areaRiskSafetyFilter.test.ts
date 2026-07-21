import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  SAFE_ROUTE_RISK_SAFETY_FILTER_CAPABILITY,
  aggregateAreaRiskSafetyFilters,
  readAreaRiskSafetyFilter
} from '../src/features/live-map/areaRiskSafetyFilter';

describe('area risk safety-filter authority', () => {
  it('accepts only the exact capability and first-reason count sum', () => {
    const authority = readAreaRiskSafetyFilter({
      safetyFilter: {
        capability: SAFE_ROUTE_RISK_SAFETY_FILTER_CAPABILITY,
        rejectedCount: 4,
        localityRejectedCount: 1,
        cityScaleRejectedCount: 2,
        invalidRecordRejectedCount: 0,
        outOfBoundsRejectedCount: 1
      }
    });

    assert.equal(authority.present, true);
    assert.equal(authority.valid, true);
    assert.equal(authority.rejectedCount, 4);
    assert.match(authority.warning ?? '', /coverage is partial/i);

    for (const safetyFilter of [
      'not-an-object',
      {
        capability: 'wrong-capability',
        rejectedCount: 0,
        localityRejectedCount: 0,
        cityScaleRejectedCount: 0,
        invalidRecordRejectedCount: 0,
        outOfBoundsRejectedCount: 0
      },
      {
        capability: SAFE_ROUTE_RISK_SAFETY_FILTER_CAPABILITY,
        rejectedCount: 3,
        localityRejectedCount: 1,
        cityScaleRejectedCount: 1,
        invalidRecordRejectedCount: 0,
        outOfBoundsRejectedCount: 0
      }
    ]) {
      const invalid = readAreaRiskSafetyFilter({ safetyFilter });
      assert.equal(invalid.present, true);
      assert.equal(invalid.valid, false);
    }
  });

  it('keeps legacy absence compatible but rejects mixed partition authority', () => {
    const absent = readAreaRiskSafetyFilter({});
    const present = readAreaRiskSafetyFilter({
      safety_filter: {
        capability: SAFE_ROUTE_RISK_SAFETY_FILTER_CAPABILITY,
        rejected_count: 1,
        localityRejectedCount: 0,
        cityScaleRejectedCount: 1,
        invalidRecordRejectedCount: 0,
        outOfBoundsRejectedCount: 0
      }
    });

    assert.equal(absent.present, false);
    assert.equal(absent.valid, true);
    assert.equal(present.valid, true);
    assert.equal(aggregateAreaRiskSafetyFilters([absent, present]).valid, false);
    const aggregated = aggregateAreaRiskSafetyFilters([present, present]);
    assert.equal(aggregated.valid, true);
    assert.equal(aggregated.rejectedCount, 2);
    assert.equal(aggregated.cityScaleRejectedCount, 2);
  });
});
