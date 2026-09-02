import { describe, expect, it } from 'vitest';

import {
  createReportingRetention,
  parseReportingRetentionEvent,
  parseReportingRetentionState,
  transitionReportingLegalHold,
} from '../products/reporting-service/retention-core';

const reportId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const eventId = '33333333-3333-4333-8333-333333333333';

describe('reporting retention core', () => {
  it('creates a deterministic, hash-chained retention assignment', () => {
    const bundle = createReportingRetention(
      {
        reportId,
        receivedAt: '2026-09-02T12:00:00.000Z',
        retentionDays: 90,
        policyVersion: 'retention.private-v1',
        requestId,
      },
      { eventId: () => eventId },
    );

    expect(bundle.event).toMatchObject({
      eventId,
      reportId,
      revision: 1,
      action: 'policy_assigned',
      legalHold: false,
      retainUntil: '2026-12-01T12:00:00.000Z',
      policyVersion: 'retention.private-v1',
      previousEventSha256: null,
    });
    expect(bundle.state.lastEventSha256).toBe(bundle.event.eventSha256);
    expect(parseReportingRetentionEvent(bundle.event)).toEqual(bundle.event);
    expect(parseReportingRetentionState(bundle.state)).toEqual(bundle.state);
  });

  it('permits only a custodian to change legal hold state', () => {
    const initial = createReportingRetention(
      {
        reportId,
        receivedAt: '2026-09-02T12:00:00.000Z',
        retentionDays: 90,
        policyVersion: 'retention.private-v1',
        requestId,
      },
      { eventId: () => eventId },
    );
    const held = transitionReportingLegalHold(initial.state, {
      actor: { id: 'custodian-alpha', role: 'custodian' },
      at: '2026-09-03T12:00:00.000Z',
      eventId: () => '44444444-4444-4444-8444-444444444444',
      held: true,
      requestId: '55555555-5555-4555-8555-555555555555',
    });

    expect(held.state.legalHold).toBe(true);
    expect(held.event.previousEventSha256).toBe(initial.event.eventSha256);
    expect(() =>
      transitionReportingLegalHold(initial.state, {
        actor: { id: 'system.retention-policy', role: 'system' },
        at: '2026-09-03T12:00:00.000Z',
        held: true,
        requestId: '66666666-6666-4666-8666-666666666666',
      }),
    ).toThrow('custodian authority');
    expect(() =>
      transitionReportingLegalHold(held.state, {
        actor: { id: 'custodian-alpha', role: 'custodian' },
        at: '2026-09-04T12:00:00.000Z',
        held: true,
        requestId: '77777777-7777-4777-8777-777777777777',
      }),
    ).toThrow('already has');
  });

  it('rejects tampering and hidden stored fields', () => {
    const bundle = createReportingRetention(
      {
        reportId,
        receivedAt: '2026-09-02T12:00:00.000Z',
        retentionDays: 90,
        policyVersion: 'retention.private-v1',
        requestId,
      },
      { eventId: () => eventId },
    );

    expect(() =>
      parseReportingRetentionEvent({
        ...bundle.event,
        actor: { ...bundle.event.actor, hiddenAuthority: true },
      }),
    ).toThrow('invalid');
    expect(() =>
      parseReportingRetentionEvent({
        ...bundle.event,
        retainUntil: '2027-12-01T12:00:00.000Z',
      }),
    ).toThrow('hash');
    expect(() =>
      parseReportingRetentionState({ ...bundle.state, secret: true }),
    ).toThrow('invalid');
  });
});
