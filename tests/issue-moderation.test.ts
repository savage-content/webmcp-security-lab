import { describe, expect, it } from 'vitest';

import {
  createQuarantinedIssueRecord,
  parseIssueModerationRecord,
  projectModeratedIssueFeed,
  transitionIssueModeration,
} from '../products/connector/issue-moderation';

const publicDraft = {
  context: 'public-web',
  category: 'unexpected-tool-change',
  severity: 'high',
  stage: 'registration',
  siteOrigin: 'https://shop.example.com',
} as const;

const createRecord = () =>
  createQuarantinedIssueRecord(publicDraft, {
    id: () => '123e4567-e89b-42d3-a456-426614174000',
    now: () => Date.parse('2026-09-02T12:00:00.000Z'),
  });

describe('quarantined issue moderation', () => {
  it('places a strict public-web draft directly into quarantine', () => {
    const record = createRecord();
    expect(record.state).toBe('quarantined');
    expect(record.history).toEqual([
      {
        at: '2026-09-02T12:00:00.000Z',
        from: 'received',
        to: 'quarantined',
      },
    ]);
    expect(record.draft.submission).toEqual({
      submittable: false,
      disposition: 'human-review-required',
    });
    expect(Object.isFrozen(record)).toBe(true);
  });

  it.each(['synthetic-lab', 'local-exercise'] as const)(
    'keeps %s reports out of intake',
    (context) => {
      expect(() =>
        createQuarantinedIssueRecord({
          ...publicDraft,
          context,
          siteOrigin: undefined,
        }),
      ).toThrow();
    },
  );

  it('rejects publication before human-review states are complete', () => {
    expect(() =>
      transitionIssueModeration(createRecord(), {
        at: '2026-09-02T12:01:00.000Z',
        to: 'published',
        publication: {
          hostnameVisibility: 'withheld',
          hostnameConsent: 'not_granted',
          evidenceBasis: 'not_established',
        },
      }),
    ).toThrow('not allowed');
  });

  it('projects only a record that passed review and the publication gate', () => {
    const reviewing = transitionIssueModeration(createRecord(), {
      at: '2026-09-02T12:01:00.000Z',
      to: 'under_review',
    });
    const accepted = transitionIssueModeration(reviewing, {
      at: '2026-09-02T12:02:00.000Z',
      to: 'accepted_private',
    });
    const published = transitionIssueModeration(accepted, {
      at: '2026-09-02T12:03:00.000Z',
      to: 'published',
      publication: {
        hostnameVisibility: 'withheld',
        hostnameConsent: 'not_granted',
        evidenceBasis: 'human_reproduced',
      },
    });

    expect(projectModeratedIssueFeed([reviewing, accepted])).toEqual([]);
    expect(projectModeratedIssueFeed([published])).toEqual([
      expect.objectContaining({
        schemaVersion: 'leftout.public-issue-feed/1',
        moderationState: 'published',
        hostnameVisibility: 'withheld',
        evidenceBasis: 'human_reproduced',
      }),
    ]);
    const serialized = JSON.stringify(projectModeratedIssueFeed([published]));
    expect(serialized).not.toContain('shop.example.com');
    expect(serialized).not.toContain('123e4567');
  });

  it('requires the named-host consent and evidence gate at publication', () => {
    const reviewing = transitionIssueModeration(createRecord(), {
      at: '2026-09-02T12:01:00.000Z',
      to: 'under_review',
    });
    const accepted = transitionIssueModeration(reviewing, {
      at: '2026-09-02T12:02:00.000Z',
      to: 'accepted_private',
    });
    expect(() =>
      transitionIssueModeration(accepted, {
        at: '2026-09-02T12:03:00.000Z',
        to: 'published',
        publication: {
          hostnameVisibility: 'named',
          hostnameConsent: 'not_granted',
          evidenceBasis: 'not_established',
          hostname: 'shop.example.com',
        },
      }),
    ).toThrow('explicit hostname-publication consent');
    expect(() =>
      transitionIssueModeration(accepted, {
        at: '2026-09-02T12:03:00.000Z',
        to: 'published',
        publication: {
          hostnameVisibility: 'named',
          hostnameConsent: 'explicit',
          evidenceBasis: 'human_reproduced',
          hostname: 'other.example.com',
        },
      }),
    ).toThrow('must match the reviewed report origin');
  });

  it('rehydrates only a canonical moderation snapshot by replaying history', () => {
    const reviewing = transitionIssueModeration(createRecord(), {
      at: '2026-09-02T12:01:00.000Z',
      to: 'under_review',
    });
    expect(
      parseIssueModerationRecord(JSON.parse(JSON.stringify(reviewing))),
    ).toEqual(reviewing);
  });

  it('rejects snapshot, history, and stored-draft substitution', () => {
    const record = createRecord();
    expect(() =>
      parseIssueModerationRecord({ ...record, state: 'accepted_private' }),
    ).toThrow('does not match its history');
    expect(() =>
      parseIssueModerationRecord({
        ...record,
        history: [
          ...record.history,
          {
            at: '2026-09-02T12:01:00.000Z',
            from: 'under_review',
            to: 'accepted_private',
          },
        ],
      }),
    ).toThrow('broken state chain');
    expect(() =>
      parseIssueModerationRecord({
        ...record,
        draft: {
          ...record.draft,
          submission: {
            submittable: true,
            disposition: 'human-review-required',
          },
        },
      }),
    ).toThrow('submission disposition is invalid');
  });
});
