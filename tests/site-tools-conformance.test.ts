import { describe, expect, it } from 'vitest';

import {
  classifyConformanceObservation,
  type ConformanceObservation,
  type ConformanceCaseId,
} from '../lib/site-tools/conformance';

function observation(
  caseId: ConformanceCaseId,
  overrides: Partial<ConformanceObservation> = {},
): ConformanceObservation {
  return {
    caseId,
    provenance: {
      model: 'gpt-5.6-sol',
      workspace: 'eligible-workspace',
      executionSurface: 'chatgpt-built-in-browser',
      appVersion: '2026.08.31',
      sessionId: 'session-1',
      documentId: 'document-1',
      registrationId: 'registration-1',
      observedAt: '2026-09-02T12:00:00.000Z',
    },
    page: { apiSupport: 'supported', registration: 'registered' },
    client: { discovery: 'observed', invocation: 'observed' },
    browserSafetyReview: 'unknown',
    positiveBaselineInSameSession: true,
    ...overrides,
  };
}

describe('Site Tools conformance classifier', () => {
  it('passes a scoped Sol or Terra top-level imperative baseline', () => {
    expect(
      classifyConformanceObservation(observation('C01-top-level-imperative'))
        .verdict,
    ).toBe('PASS');
    expect(
      classifyConformanceObservation(
        observation('C01-top-level-imperative', {
          provenance: {
            ...observation('C01-top-level-imperative').provenance,
            model: 'gpt-5.6-terra',
          },
        }),
      ).verdict,
    ).toBe('PASS');
  });

  it('keeps an incomplete positive baseline inconclusive', () => {
    const result = classifyConformanceObservation(
      observation('C01-top-level-imperative', {
        client: { discovery: 'not-observed', invocation: 'not-observed' },
      }),
    );
    expect(result.verdict).toBe('INCONCLUSIVE');
  });

  it('requires a positive same-session baseline for unsupported controls', () => {
    for (const caseId of [
      'C04-declarative-unsupported',
      'C05-iframe-unsupported',
    ] as const) {
      const result = classifyConformanceObservation(
        observation(caseId, {
          positiveBaselineInSameSession: false,
          client: { discovery: 'not-observed', invocation: 'not-observed' },
        }),
      );
      expect(result.verdict).toBe('INCONCLUSIVE');
    }
  });

  it('passes documented unsupported controls only after a positive baseline', () => {
    for (const caseId of [
      'C04-declarative-unsupported',
      'C05-iframe-unsupported',
    ] as const) {
      expect(
        classifyConformanceObservation(
          observation(caseId, {
            client: {
              discovery: 'not-observed',
              invocation: 'not-observed',
            },
          }),
        ).verdict,
      ).toBe('PASS');
    }
  });

  it('fails when a declarative or iframe control is exposed', () => {
    expect(
      classifyConformanceObservation(observation('C04-declarative-unsupported'))
        .verdict,
    ).toBe('FAIL');
    expect(
      classifyConformanceObservation(observation('C05-iframe-unsupported'))
        .verdict,
    ).toBe('FAIL');
  });

  it('treats Luna absence as an expected negative rather than a security pass', () => {
    const base = observation('C06-luna-negative-control');
    const result = classifyConformanceObservation({
      ...base,
      provenance: { ...base.provenance, model: 'gpt-5.6-luna' },
      client: { discovery: 'not-observed', invocation: 'not-observed' },
    });
    expect(result.verdict).toBe('EXPECTED_NEGATIVE');
  });

  it('fails the Luna control if Site Tools are exposed', () => {
    const base = observation('C06-luna-negative-control');
    const result = classifyConformanceObservation({
      ...base,
      provenance: { ...base.provenance, model: 'gpt-5.6-luna' },
    });
    expect(result.verdict).toBe('FAIL');
  });

  it('does not interpret a Luna absence without workspace provenance', () => {
    const base = observation('C06-luna-negative-control');
    const result = classifyConformanceObservation({
      ...base,
      provenance: {
        ...base.provenance,
        model: 'gpt-5.6-luna',
        workspace: 'unknown',
      },
      client: { discovery: 'not-observed', invocation: 'not-observed' },
    });
    expect(result.verdict).toBe('INCONCLUSIVE');
  });

  it('skips Enterprise and Edu without making a model claim', () => {
    const base = observation('C01-top-level-imperative');
    const result = classifyConformanceObservation({
      ...base,
      provenance: {
        ...base.provenance,
        workspace: 'enterprise-or-edu',
      },
    });
    expect(result.verdict).toBe('SKIP_UNSUPPORTED_WORKSPACE');
  });

  it('keeps legacy non-native observations outside the native suite', () => {
    const base = observation('C01-top-level-imperative');
    const result = classifyConformanceObservation({
      ...base,
      provenance: {
        ...base.provenance,
        executionSurface: 'external-browser-membrane',
      },
    });
    expect(result.verdict).toBe('NOT_APPLICABLE');
  });

  it('fails stale registration and prior-document invocation', () => {
    expect(
      classifyConformanceObservation(
        observation('C02-registration-binding', {
          staleRegistrationInvocation: 'observed',
        }),
      ).verdict,
    ).toBe('FAIL');
    expect(
      classifyConformanceObservation(
        observation('C03-navigation-binding', {
          previousDocumentInvocation: 'observed',
        }),
      ).verdict,
    ).toBe('FAIL');
  });

  it('passes replacement and navigation isolation with a positive baseline', () => {
    expect(
      classifyConformanceObservation(
        observation('C02-registration-binding', {
          staleRegistrationInvocation: 'not-observed',
        }),
      ).verdict,
    ).toBe('PASS');
    expect(
      classifyConformanceObservation(
        observation('C03-navigation-binding', {
          previousDocumentInvocation: 'not-observed',
        }),
      ).verdict,
    ).toBe('PASS');
  });
});
