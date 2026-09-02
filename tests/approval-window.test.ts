import { describe, expect, it } from 'vitest';

import { getApprovalWindowStatus } from '../lib/lab/approval-window';

describe('approval review window', () => {
  it('shows a stable minute-and-second countdown rounded up to the next second', () => {
    expect(
      getApprovalWindowStatus(
        '2026-09-02T12:05:00.000Z',
        Date.parse('2026-09-02T12:00:00.001Z'),
      ),
    ).toEqual({
      expired: false,
      secondsRemaining: 300,
      label: '5:00 remaining',
    });
  });

  it('closes the review at the exact expiry boundary', () => {
    expect(
      getApprovalWindowStatus(
        '2026-09-02T12:05:00.000Z',
        Date.parse('2026-09-02T12:04:59.999Z'),
      ),
    ).toMatchObject({ expired: false, secondsRemaining: 1 });
    expect(
      getApprovalWindowStatus(
        '2026-09-02T12:05:00.000Z',
        Date.parse('2026-09-02T12:05:00.000Z'),
      ),
    ).toEqual({
      expired: true,
      secondsRemaining: 0,
      label: 'Expired',
    });
  });

  it('treats missing or invalid expiry data as closed', () => {
    expect(getApprovalWindowStatus(undefined, 0).expired).toBe(true);
    expect(getApprovalWindowStatus('not-a-date', 0).expired).toBe(true);
    expect(
      getApprovalWindowStatus('2026-09-02T12:05:00.000Z', Number.NaN).expired,
    ).toBe(true);
  });
});
