import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  ReviewerAccessManager,
  ReviewerActionManager,
  REVIEWER_SESSION_COOKIE,
  reviewerCookieValue,
} from '../products/reporting-operator/reviewer-access';

function secretSequence(...values: string[]) {
  let index = 0;
  return () => values[index++] ?? `fallback-secret-${index}`.padEnd(32, 'x');
}

function scope(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

describe('private reporting reviewer access', () => {
  it('exchanges one short-lived launch ticket for one bounded local session', () => {
    let now = Date.parse('2026-09-03T02:00:00.000Z');
    const access = new ReviewerAccessManager({
      now: () => now,
      secret: secretSequence(
        'launch-secret-with-at-least-32-characters',
        'session-secret-with-at-least-32-characters',
      ),
      ticketTtlMs: 1_000,
      sessionTtlMs: 60_000,
    });
    const launch = access.issueLaunchTicket();
    const session = access.consumeLaunchTicket(launch.token);
    expect(access.authorize(session.sessionToken)).toEqual({
      scope: scope(session.sessionToken),
    });
    expect(() => access.consumeLaunchTicket(launch.token)).toThrow(
      'invalid or expired',
    );
    now += 60_001;
    expect(access.authorize(session.sessionToken)).toBeUndefined();
  });

  it('binds opaque page and view actions to one session and consumes them once', () => {
    const actions = new ReviewerActionManager({
      secret: secretSequence(
        'page-action-secret-with-at-least-32-characters',
        'view-action-secret-with-at-least-32-characters',
      ),
    });
    const firstScope = scope('session-one');
    const secondScope = scope('session-two');
    const pageToken = actions.issuePage(
      firstScope,
      Buffer.from('{"cursor":1}', 'utf8').toString('base64url'),
    );
    expect(() => actions.consume(pageToken, secondScope, 'page')).toThrow(
      'invalid or expired',
    );
    expect(() => actions.consume(pageToken, firstScope, 'page')).toThrow(
      'invalid or expired',
    );

    const viewToken = actions.issueView(
      firstScope,
      '028753de-0cba-4643-806a-4d0dcd5033a8',
    );
    expect(actions.consume(viewToken, firstScope, 'view')).toEqual({
      kind: 'view',
      reportId: '028753de-0cba-4643-806a-4d0dcd5033a8',
    });
    expect(() => actions.consume(viewToken, firstScope, 'view')).toThrow(
      'invalid or expired',
    );
  });

  it('offers only valid reviewer transitions and never publication', () => {
    const actions = new ReviewerActionManager({
      secret: secretSequence(
        'review-action-one-with-at-least-32-characters',
        'review-action-two-with-at-least-32-characters',
        'review-action-three-with-at-least-32-chars',
        'review-action-four-with-at-least-32-characters',
      ),
    });
    const actionScope = scope('reviewer-session');
    const issued = actions.issueTransitions({
      scope: actionScope,
      reportId: '028753de-0cba-4643-806a-4d0dcd5033a8',
      expectedRevision: 2,
      state: 'under_review',
    });
    expect(issued.map((item) => item.to)).toEqual([
      'needs_evidence',
      'accepted_private',
      'duplicate',
      'rejected',
    ]);
    expect(issued.map((item) => item.to)).not.toContain('published');
    const selected = issued[1];
    expect(actions.consume(selected.token, actionScope, 'transition')).toEqual({
      kind: 'transition',
      reportId: '028753de-0cba-4643-806a-4d0dcd5033a8',
      expectedRevision: 2,
      to: 'accepted_private',
    });
  });

  it('reads only the exact HttpOnly session cookie name', () => {
    expect(
      reviewerCookieValue(
        `other=x; ${REVIEWER_SESSION_COOKIE}=session%2Dtoken; ignored=y`,
      ),
    ).toBe('session-token');
    expect(reviewerCookieValue(`${REVIEWER_SESSION_COOKIE}=%ZZ`)).toBe('');
  });
});
