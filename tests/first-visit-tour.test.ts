import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { firstVisitTourSteps } from '../lib/lab/first-visit-tour';

const tourSource = readFileSync(
  resolve('components/lab/first-visit-tour.tsx'),
  'utf8',
);

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

  it('makes the setup step an actual viable choice rather than narration', () => {
    const choose = firstVisitTourSteps.find((step) => step.stage === 'Choose');
    expect(choose?.action).toContain('Confirm the recommended viable path');
    expect(choose?.action).toContain('can never be the default live path');
    expect(tourSource).toContain('experienceOptions.map');
    expect(tourSource).toContain('onConfirmSetup');
    expect(tourSource).toContain('disabled={!selectable}');
    expect(tourSource).toContain("'Use this setup'");
    expect(tourSource).toContain(
      'My separate Local Guard HUD currently says “Connected.”',
    );
  });
});
