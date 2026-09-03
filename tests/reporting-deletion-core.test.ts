import { describe, expect, it } from 'vitest';

import {
  createReportingDeletionTombstone,
  parseReportingDeletionTombstone,
} from '../products/reporting-service/deletion-core';

function tombstone() {
  return createReportingDeletionTombstone(
    {
      deletedAt: '2026-12-01T12:00:00.000Z',
      reason: 'retention_expired',
      policyVersion: 'retention.private-v1',
      publicId: '11111111-1111-4111-8111-111111111111',
      publicationSurvives: true,
      moderationEventCount: 4,
      retentionEventCount: 1,
      lastModerationEventSha256: 'a'.repeat(64),
      lastRetentionEventSha256: 'b'.repeat(64),
      custodianId: 'custodian-alpha',
      requestId: '22222222-2222-4222-8222-222222222222',
      requestSha256: 'c'.repeat(64),
    },
    {
      tombstoneId: () => '33333333-3333-4333-8333-333333333333',
    },
  );
}

describe('reporting deletion tombstones', () => {
  it('retains only non-content lifecycle evidence', () => {
    const value = tombstone();
    expect(parseReportingDeletionTombstone(value)).toEqual(value);
    expect(value).not.toHaveProperty('reportId');
    expect(value).not.toHaveProperty('siteOrigin');
    expect(value).not.toHaveProperty('draft');
  });

  it('requires surviving-publication metadata to agree', () => {
    expect(() =>
      createReportingDeletionTombstone({
        ...tombstone(),
        publicId: null,
      }),
    ).toThrow('invalid');
  });

  it('rejects content substitution and hidden stored fields', () => {
    const value = tombstone();
    expect(() =>
      parseReportingDeletionTombstone({
        ...value,
        custodianId: 'custodian-substituted',
      }),
    ).toThrow('hash');
    expect(() =>
      parseReportingDeletionTombstone({ ...value, reportId: 'private' }),
    ).toThrow('invalid');
  });
});
