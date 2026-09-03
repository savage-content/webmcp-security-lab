import { describe, expect, it } from 'vitest';

import { ExternalReportActionManager } from '../products/connector/external-report-action';

describe('one-use external report actions', () => {
  it('binds the public origin server-side and creates a closed four-field draft', () => {
    const secrets = [
      'compose-secret-abcdefghijklmnopqrstuvwxyz',
      'submit-secret-abcdefghijklmnopqrstuvwxyz',
    ];
    const manager = new ExternalReportActionManager({
      secret: () =>
        secrets.shift() ?? 'unused-secret-abcdefghijklmnopqrstuvwxyz',
    });
    const composeToken = manager.issueComposition(
      'pairing:session-one',
      'https://shop.example.com',
    );
    const draft = manager.compose(composeToken, 'pairing:session-one', {
      category: 'unexpected-side-effect',
      severity: 'high',
      stage: 'result',
    });
    expect(draft).toMatchObject({
      context: 'public-web',
      siteOrigin: 'https://shop.example.com',
      category: 'unexpected-side-effect',
      severity: 'high',
      stage: 'result',
    });
    expect(() =>
      manager.compose(composeToken, 'pairing:session-one', {
        category: 'unexpected-side-effect',
        severity: 'high',
        stage: 'result',
      }),
    ).toThrow('invalid or expired');

    const submitToken = manager.issueSubmission('pairing:session-one', draft);
    expect(
      manager.consumeSubmission(submitToken, 'pairing:session-one'),
    ).toEqual(draft);
    expect(() =>
      manager.consumeSubmission(submitToken, 'pairing:session-one'),
    ).toThrow('invalid or expired');
  });

  it('rejects local origins, scope substitution, and synthetic drafts', () => {
    const manager = new ExternalReportActionManager({
      secret: () => 'action-secret-abcdefghijklmnopqrstuvwxyz',
    });
    expect(() =>
      manager.issueComposition('pairing:one', 'http://localhost:3001'),
    ).toThrow();
    const token = manager.issueComposition(
      'pairing:one',
      'https://shop.example.com',
    );
    expect(() =>
      manager.compose(token, 'pairing:two', {
        category: 'excess-authority',
        severity: 'medium',
        stage: 'approval',
      }),
    ).toThrow('invalid or expired');
  });

  it('expires and revokes all authority in one pairing scope', () => {
    let now = 1_000;
    let index = 0;
    const manager = new ExternalReportActionManager({
      now: () => now,
      secret: () => `action-secret-${String(index++).padStart(32, 'x')}`,
      ttlMs: 1_000,
    });
    const expired = manager.issueComposition(
      'pairing:one',
      'https://shop.example.com',
    );
    now += 1_001;
    expect(() =>
      manager.compose(expired, 'pairing:one', {
        category: 'excess-authority',
        severity: 'medium',
        stage: 'approval',
      }),
    ).toThrow('invalid or expired');
    const revoked = manager.issueComposition(
      'pairing:one',
      'https://shop.example.com',
    );
    manager.revokeScope('pairing:one');
    expect(() =>
      manager.compose(revoked, 'pairing:one', {
        category: 'excess-authority',
        severity: 'medium',
        stage: 'approval',
      }),
    ).toThrow('invalid or expired');
  });
});
