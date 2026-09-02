import { describe, expect, it } from 'vitest';

import {
  ISSUE_MODERATION_STATES,
  projectPublicIssueFeed,
  projectPublicIssueRecord,
} from '../products/connector/issue-publication';
import { ISSUE_DRAFT_ASSURANCE_LIMITATION } from '../products/connector/issue-draft';

const baseCandidate = {
  context: 'public-web',
  category: 'unexpected-tool-change',
  severity: 'high',
  stage: 'registration',
} as const;

const withheldPublication = {
  hostnameVisibility: 'withheld',
  hostnameConsent: 'not_granted',
  evidenceBasis: 'not_established',
} as const;

const namedPublication = {
  hostnameVisibility: 'named',
  hostnameConsent: 'explicit',
  evidenceBasis: 'human_reproduced',
  hostname: 'shop.example.com',
} as const;

describe('moderated public issue projection', () => {
  it.each(ISSUE_MODERATION_STATES.filter((state) => state !== 'published'))(
    'keeps %s records out of the public feed',
    (moderationState) => {
      expect(
        projectPublicIssueRecord({ ...baseCandidate, moderationState }),
      ).toBeUndefined();
    },
  );

  it('projects only a published record into a small JSON/NDJSON-ready shape', () => {
    const projection = projectPublicIssueRecord({
      ...baseCandidate,
      moderationState: 'published',
      publication: withheldPublication,
    });

    expect(projection).toEqual({
      schemaVersion: 'leftout.public-issue-feed/1',
      moderationState: 'published',
      category: 'unexpected-tool-change',
      severity: 'high',
      stage: 'registration',
      hostnameVisibility: 'withheld',
      evidenceBasis: 'not_established',
      assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
    });
    expect(Object.isFrozen(projection)).toBe(true);
    const feed = projectPublicIssueFeed([
      { ...baseCandidate, moderationState: 'under_review' },
      {
        ...baseCandidate,
        moderationState: 'published',
        publication: withheldPublication,
      },
    ]);
    expect(feed).toHaveLength(1);
    expect(Object.isFrozen(feed)).toBe(true);
    const ndjson = feed.map((record) => JSON.stringify(record)).join('\n');
    expect(JSON.parse(ndjson)).toEqual(projection);
  });

  it.each(['human_reproduced', 'equivalent_evidence'] as const)(
    'allows a named public hostname with explicit consent and %s',
    (evidenceBasis) => {
      expect(
        projectPublicIssueRecord({
          ...baseCandidate,
          moderationState: 'published',
          publication: { ...namedPublication, evidenceBasis },
        }),
      ).toMatchObject({
        hostnameVisibility: 'named',
        hostname: 'shop.example.com',
        evidenceBasis,
      });
    },
  );

  it('requires explicit consent and reproduction-grade evidence before naming a host', () => {
    expect(() =>
      projectPublicIssueRecord({
        ...baseCandidate,
        moderationState: 'published',
        publication: { ...namedPublication, hostnameConsent: 'not_granted' },
      }),
    ).toThrow('explicit hostname-publication consent');
    expect(() =>
      projectPublicIssueRecord({
        ...baseCandidate,
        moderationState: 'published',
        publication: { ...namedPublication, evidenceBasis: 'not_established' },
      }),
    ).toThrow('human reproduction or equivalent evidence');
  });

  it.each([
    'localhost',
    'service.local',
    'service.internal',
    '127.0.0.1',
    '203.0.113.8',
    '[::1]',
    'https://shop.example.com',
    'shop.example.com/path',
    'shop.example.com?account=123',
    'shop.example.com#tool',
    'shop.example.com:8443',
  ])('rejects non-public or identifying hostname input %s', (hostname) => {
    expect(() =>
      projectPublicIssueRecord({
        ...baseCandidate,
        moderationState: 'published',
        publication: { ...namedPublication, hostname },
      }),
    ).toThrow();
  });

  it.each(['synthetic-lab', 'local-exercise'] as const)(
    'never publishes a %s record',
    (context) => {
      expect(() =>
        projectPublicIssueRecord({
          ...baseCandidate,
          context,
          moderationState: 'published',
          publication: withheldPublication,
        }),
      ).toThrow('cannot be published');
    },
  );

  it.each([
    ['reporterId', 'reporter-123'],
    ['rawEvidence', { page: 'captured' }],
    ['receiptId', '123e4567-e89b-12d3-a456-426614174000'],
    ['exactTimestamp', '2026-09-01T20:00:00.000Z'],
    ['description', 'Free-form report text'],
    ['pagePath', '/private/account'],
    ['localHash', 'a'.repeat(64)],
  ])('rejects forbidden field %s before projection', (field, value) => {
    expect(() =>
      projectPublicIssueRecord({
        ...baseCandidate,
        moderationState: 'published',
        publication: withheldPublication,
        [field]: value,
      }),
    ).toThrow(`unknown field: ${field}`);
  });

  it('never emits identifiers, evidence, exact time, free text, paths, or hashes', () => {
    const projection = projectPublicIssueRecord({
      ...baseCandidate,
      moderationState: 'published',
      publication: namedPublication,
    });
    const serialized = JSON.stringify(projection);
    for (const forbidden of [
      'reporterId',
      'rawEvidence',
      'receiptId',
      'timestamp',
      'description',
      'pagePath',
      'localHash',
      '/private',
      'sha256',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
