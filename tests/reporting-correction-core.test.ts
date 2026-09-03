import { describe, expect, it } from 'vitest';

import {
  createReportingPublicCorrection,
  parseReportingPublicCorrection,
} from '../products/reporting-service/correction-core';

const correctionId = '6e2c19fa-0b21-4a55-8e52-3b294e90d9ca';
const publicId = '0d4307f3-f1a1-45b6-8a8a-1c846a8bcc7b';

function correction() {
  return createReportingPublicCorrection(
    {
      publicId,
      correctedAt: '2026-09-02T22:00:00.000Z',
      action: 'withdraw',
      reason: 'erroneous_publication',
      publicationRecordSha256: 'a'.repeat(64),
    },
    { correctionId: () => correctionId },
  );
}

describe('public reporting correction contract', () => {
  it('creates one closed immutable correction bound to exact public bytes', () => {
    const value = correction();
    expect(value).toMatchObject({
      schemaVersion: 'leftout.public-issue-correction/1',
      correctionId,
      publicId,
      action: 'withdraw',
      reason: 'erroneous_publication',
      publicationRecordSha256: 'a'.repeat(64),
      correctionSha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
    expect(Object.isFrozen(value)).toBe(true);
    expect(JSON.stringify(value)).not.toContain('reportId');
    expect(JSON.stringify(value)).not.toContain('hostname');
  });

  it('round-trips only the exact canonical correction', () => {
    const value = correction();
    expect(parseReportingPublicCorrection(value)).toEqual(value);
    expect(() =>
      parseReportingPublicCorrection({ ...value, note: 'hidden authority' }),
    ).toThrow('invalid');
    expect(() =>
      parseReportingPublicCorrection({
        ...value,
        reason: 'erroneous_publication',
        correctionSha256: '0'.repeat(64),
      }),
    ).toThrow('hash');
  });

  it('rejects open-ended actions, reasons, IDs, timestamps, and digests', () => {
    const base = {
      publicId,
      correctedAt: '2026-09-02T22:00:00.000Z',
      action: 'withdraw',
      reason: 'erroneous_publication',
      publicationRecordSha256: 'a'.repeat(64),
    } as const;
    for (const changed of [
      { ...base, action: 'rewrite' },
      { ...base, reason: 'free text' },
      { ...base, publicId: 'not-a-uuid' },
      { ...base, correctedAt: 'tomorrow' },
      { ...base, publicationRecordSha256: 'short' },
    ]) {
      expect(() =>
        createReportingPublicCorrection(changed as never, {
          correctionId: () => correctionId,
        }),
      ).toThrow();
    }
  });
});
