import { describe, expect, it } from 'vitest';

import { firstVisitTourSteps } from '../lib/lab/first-visit-tour';

describe('first-visit Site Tools walkthrough', () => {
  it('teaches the complete safe action loop in order', () => {
    expect(firstVisitTourSteps.map((step) => step.stage)).toEqual([
      'Welcome',
      'Choose',
      'Observe',
      'Inspect',
      'Run',
      'Verify',
    ]);
  });

  it('distinguishes offered, approved, invoked, and verified state', () => {
    const copy = firstVisitTourSteps
      .flatMap((step) => [step.title, step.description, step.action])
      .join(' ');
    expect(copy).toContain('does not approve or run anything');
    expect(copy).toContain('Approval prepares one action');
    expect(copy).toContain('Run it once');
    expect(copy).toContain('before and after state');
  });

  it('keeps publication and unsupported client claims out of the tour', () => {
    const copy = firstVisitTourSteps
      .flatMap((step) => [step.title, step.description, step.action])
      .join(' ');
    expect(copy).toContain('nothing is published automatically');
    expect(copy).not.toMatch(/works (?:everywhere|in every browser)/iu);
  });
});

