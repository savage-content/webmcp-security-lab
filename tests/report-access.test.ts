import { describe, expect, it } from 'vitest';

import {
  cookieValue,
  ReportAccessManager,
} from '../products/connector/report-access';

describe('local report launch access', () => {
  it('turns one short-lived ticket into one cookie session', () => {
    let now = Date.parse('2026-09-01T12:00:00.000Z');
    const secrets = [
      'ticket-secret-abcdefghijklmnopqrstuvwxyz',
      'session-secret-abcdefghijklmnopqrstuvwxyz',
    ];
    const manager = new ReportAccessManager({
      now: () => now,
      secret: () =>
        secrets.shift() ?? 'unused-secret-abcdefghijklmnopqrstuvwxyz',
      ticketTtlMs: 2_000,
      sessionTtlMs: 60_000,
    });
    const issued = manager.issue('/receipts', 'paired-session');
    const consumed = manager.consume(issued.ticket);
    expect(consumed.target).toBe('/receipts');
    expect(manager.authorize(consumed.sessionToken, '/receipts')).toEqual({
      binding: 'paired-session',
    });
    expect(manager.authorize(consumed.sessionToken, '/issues/preview')).toEqual(
      {
        binding: 'paired-session',
      },
    );
    expect(manager.authorize(consumed.sessionToken, '/setup')).toBeUndefined();
    expect(() => manager.consume(issued.ticket)).toThrow('invalid or expired');
    manager.revokeBinding('paired-session');
    expect(
      manager.authorize(consumed.sessionToken, '/receipts'),
    ).toBeUndefined();
    now += 60_001;
    expect(
      manager.authorize(consumed.sessionToken, '/receipts'),
    ).toBeUndefined();
  });

  it('expires unused tickets and parses only the exact cookie name', () => {
    let now = 1_000_000;
    const manager = new ReportAccessManager({
      now: () => now,
      secret: () => 'ticket-secret-abcdefghijklmnopqrstuvwxyz',
      ticketTtlMs: 1_000,
      sessionTtlMs: 60_000,
    });
    const issued = manager.issue('/setup');
    now += 1_001;
    expect(() => manager.consume(issued.ticket)).toThrow('invalid or expired');
    expect(
      cookieValue(
        'other=x; leftout_report_session=abc%20123',
        'leftout_report_session',
      ),
    ).toBe('abc 123');
    expect(
      cookieValue('notleftout_report_session=bad', 'leftout_report_session'),
    ).toBe('');
  });
});
