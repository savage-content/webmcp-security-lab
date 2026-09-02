import { describe, expect, it } from 'vitest';

import {
  createReportingLedgerIntake,
  parseReportingLedgerBundle,
  transitionReportingLedger,
  verifyReportingLedgerChain,
} from '../products/reporting-service/ledger';

const publicDraft = {
  context: 'public-web',
  category: 'unexpected-tool-change',
  severity: 'high',
  stage: 'registration',
  siteOrigin: 'https://shop.example.com',
} as const;

const ids = {
  report: '123e4567-e89b-42d3-a456-426614174000',
  intakeEvent: '223e4567-e89b-42d3-a456-426614174001',
  intakeRequest: '323e4567-e89b-42d3-a456-426614174002',
  reviewEvent: '423e4567-e89b-42d3-a456-426614174003',
  reviewRequest: '523e4567-e89b-42d3-a456-426614174004',
  acceptEvent: '623e4567-e89b-42d3-a456-426614174005',
  acceptRequest: '723e4567-e89b-42d3-a456-426614174006',
  publishEvent: '823e4567-e89b-42d3-a456-426614174007',
  publishRequest: '923e4567-e89b-42d3-a456-426614174008',
} as const;

function intake() {
  return createReportingLedgerIntake(
    publicDraft,
    {
      actor: { id: 'invitation.a1b2c3d4', role: 'intake' },
      requestId: ids.intakeRequest,
    },
    {
      id: () => ids.report,
      eventId: () => ids.intakeEvent,
      now: () => Date.parse('2026-09-02T18:00:00.000Z'),
    },
  );
}

describe('reporting moderation ledger', () => {
  it('starts every accepted public report in revisioned quarantine', () => {
    const created = intake();
    expect(created.record).toMatchObject({
      schemaVersion: 'leftout.reporting-ledger-record/1',
      revision: 1,
      moderation: {
        id: ids.report,
        state: 'quarantined',
      },
    });
    expect(created.event).toMatchObject({
      schemaVersion: 'leftout.reporting-ledger-event/1',
      eventId: ids.intakeEvent,
      reportId: ids.report,
      sequence: 1,
      revision: 1,
      actor: { id: 'invitation.a1b2c3d4', role: 'intake' },
      from: 'received',
      to: 'quarantined',
      previousEventSha256: null,
    });
    expect(created.event.eventSha256).toHaveLength(64);
    expect(verifyReportingLedgerChain(created.record, [created.event])).toBe(
      true,
    );
    expect(Object.isFrozen(created.record)).toBe(true);
    expect(Object.isFrozen(created.event)).toBe(true);
  });

  it('requires exact revision and reviewer authority for review transitions', () => {
    const created = intake();
    expect(() =>
      transitionReportingLedger(
        created.record,
        { at: '2026-09-02T18:01:00.000Z', to: 'under_review' },
        {
          actor: { id: 'reviewer-alpha', role: 'reviewer' },
          expectedRevision: 0,
          requestId: ids.reviewRequest,
        },
      ),
    ).toThrow('revision is stale');
    expect(() =>
      transitionReportingLedger(
        created.record,
        { at: '2026-09-02T18:01:00.000Z', to: 'under_review' },
        {
          actor: { id: 'publisher-alpha', role: 'publisher' },
          expectedRevision: 1,
          requestId: ids.reviewRequest,
        },
      ),
    ).toThrow('requires reviewer authority');

    const reviewing = transitionReportingLedger(
      created.record,
      { at: '2026-09-02T18:01:00.000Z', to: 'under_review' },
      {
        actor: { id: 'reviewer-alpha', role: 'reviewer' },
        expectedRevision: 1,
        requestId: ids.reviewRequest,
      },
      { eventId: () => ids.reviewEvent },
    );
    expect(reviewing.record.revision).toBe(2);
    expect(reviewing.event.previousEventSha256).toBe(created.event.eventSha256);
    expect(
      verifyReportingLedgerChain(reviewing.record, [
        created.event,
        reviewing.event,
      ]),
    ).toBe(true);
  });

  it('requires a separate publisher only after private acceptance', () => {
    const created = intake();
    const reviewing = transitionReportingLedger(
      created.record,
      { at: '2026-09-02T18:01:00.000Z', to: 'under_review' },
      {
        actor: { id: 'reviewer-alpha', role: 'reviewer' },
        expectedRevision: 1,
        requestId: ids.reviewRequest,
      },
      { eventId: () => ids.reviewEvent },
    );
    const accepted = transitionReportingLedger(
      reviewing.record,
      { at: '2026-09-02T18:02:00.000Z', to: 'accepted_private' },
      {
        actor: { id: 'reviewer-alpha', role: 'reviewer' },
        expectedRevision: 2,
        requestId: ids.acceptRequest,
      },
      { eventId: () => ids.acceptEvent },
    );
    const publication = {
      hostnameVisibility: 'withheld',
      hostnameConsent: 'not_granted',
      evidenceBasis: 'human_reproduced',
    } as const;
    expect(() =>
      transitionReportingLedger(
        accepted.record,
        {
          at: '2026-09-02T18:03:00.000Z',
          to: 'published',
          publication,
        },
        {
          actor: { id: 'reviewer-alpha', role: 'reviewer' },
          expectedRevision: 3,
          requestId: ids.publishRequest,
        },
      ),
    ).toThrow('requires publisher authority');

    const published = transitionReportingLedger(
      accepted.record,
      {
        at: '2026-09-02T18:03:00.000Z',
        to: 'published',
        publication,
      },
      {
        actor: { id: 'publisher-alpha', role: 'publisher' },
        expectedRevision: 3,
        requestId: ids.publishRequest,
      },
      { eventId: () => ids.publishEvent },
    );
    expect(published.record.moderation.state).toBe('published');
    expect(published.record.revision).toBe(4);
  });

  it('detects reordered or changed audit events', () => {
    const created = intake();
    const reviewing = transitionReportingLedger(
      created.record,
      { at: '2026-09-02T18:01:00.000Z', to: 'under_review' },
      {
        actor: { id: 'reviewer-alpha', role: 'reviewer' },
        expectedRevision: 1,
        requestId: ids.reviewRequest,
      },
      { eventId: () => ids.reviewEvent },
    );
    expect(
      verifyReportingLedgerChain(reviewing.record, [
        reviewing.event,
        created.event,
      ]),
    ).toBe(false);
    expect(
      verifyReportingLedgerChain(
        {
          ...created.record,
          moderation: {
            ...created.record.moderation,
            draft: {
              ...created.record.moderation.draft,
              siteOrigin: 'https://substituted.example.com',
            },
          },
        },
        [created.event],
      ),
    ).toBe(false);
    expect(
      verifyReportingLedgerChain(reviewing.record, [
        created.event,
        {
          ...reviewing.event,
          actor: { ...reviewing.event.actor, id: 'other' },
        },
      ]),
    ).toBe(false);
  });

  it('keeps private draft data out of the audit-event envelope', () => {
    const created = intake();
    const serialized = JSON.stringify(created.event);
    expect(serialized).not.toContain('shop.example.com');
    expect(serialized).not.toContain('unexpected-tool-change');
    expect(serialized).not.toContain('high');
    expect(serialized).not.toContain('registration');
    expect(serialized).toContain('payloadSha256');
  });

  it('rejects synthetic/local intake and caller-shaped actor identities', () => {
    expect(() =>
      createReportingLedgerIntake(
        {
          context: 'synthetic-lab',
          category: publicDraft.category,
          severity: publicDraft.severity,
          stage: publicDraft.stage,
        },
        {
          actor: { id: 'invitation.a1b2c3d4', role: 'intake' },
          requestId: ids.intakeRequest,
        },
      ),
    ).toThrow('cannot enter the moderation pipeline');
    expect(() =>
      createReportingLedgerIntake(publicDraft, {
        actor: { id: 'Jane Doe <jane@example.com>', role: 'intake' },
        requestId: ids.intakeRequest,
      }),
    ).toThrow('normalized and opaque');
  });

  it('rehydrates only a valid record and event chain', () => {
    const created = intake();
    const reviewing = transitionReportingLedger(
      created.record,
      { at: '2026-09-02T18:01:00.000Z', to: 'under_review' },
      {
        actor: { id: 'reviewer-alpha', role: 'reviewer' },
        expectedRevision: 1,
        requestId: ids.reviewRequest,
      },
      { eventId: () => ids.reviewEvent },
    );
    const serializedRecord = JSON.parse(JSON.stringify(reviewing.record));
    const serializedEvents = JSON.parse(
      JSON.stringify([created.event, reviewing.event]),
    );
    expect(
      parseReportingLedgerBundle(serializedRecord, serializedEvents),
    ).toEqual({
      record: reviewing.record,
      events: [created.event, reviewing.event],
    });
    serializedEvents[1].actor.id = 'substituted';
    expect(() =>
      parseReportingLedgerBundle(serializedRecord, serializedEvents),
    ).toThrow('event hash is invalid');
  });
});
