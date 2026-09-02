export const SITE_TOOLS_CONFORMANCE_VERSION = '2026-08-31/1' as const;

export type ConformanceCaseId =
  | 'C01-top-level-imperative'
  | 'C02-registration-binding'
  | 'C03-navigation-binding'
  | 'C04-declarative-unsupported'
  | 'C05-iframe-unsupported'
  | 'C06-luna-negative-control';

export type SiteToolsModel =
  | 'gpt-5.6-sol'
  | 'gpt-5.6-terra'
  | 'gpt-5.6-luna'
  | 'unknown';

export type WorkspaceClass =
  | 'eligible-workspace'
  | 'enterprise-or-edu'
  | 'unknown';

export type ExecutionSurface =
  | 'chatgpt-built-in-browser'
  | 'external-browser-membrane'
  | 'in-page-harness';

export type ObservationState = 'observed' | 'not-observed' | 'unknown';

export type ConformanceVerdict =
  | 'PASS'
  | 'FAIL'
  | 'INCONCLUSIVE'
  | 'EXPECTED_NEGATIVE'
  | 'SKIP_UNSUPPORTED_WORKSPACE'
  | 'NOT_APPLICABLE';

export interface SiteToolsProvenance {
  model: SiteToolsModel;
  workspace: WorkspaceClass;
  executionSurface: ExecutionSurface;
  appVersion: string;
  sessionId: string;
  documentId: string;
  registrationId: string;
  observedAt: string;
}

export interface ConformanceObservation {
  caseId: ConformanceCaseId;
  provenance: SiteToolsProvenance;
  page: {
    apiSupport: 'supported' | 'unsupported' | 'unknown';
    registration: 'registered' | 'denied' | 'failed' | 'not-attempted';
  };
  client: {
    discovery: ObservationState;
    invocation: ObservationState;
  };
  browserSafetyReview: ObservationState;
  positiveBaselineInSameSession: boolean;
  staleRegistrationInvocation?: ObservationState;
  previousDocumentInvocation?: ObservationState;
}

export interface ClassifiedConformanceObservation {
  verdict: ConformanceVerdict;
  summary: string;
}

export const conformanceCases: ReadonlyArray<{
  id: ConformanceCaseId;
  title: string;
  expected: string;
}> = [
  {
    id: 'C01-top-level-imperative',
    title: 'Top-level imperative baseline',
    expected:
      'A top-level JavaScript registration is discovered and invoked once in an eligible Sol or Terra session.',
  },
  {
    id: 'C02-registration-binding',
    title: 'Registration binding',
    expected:
      'After registration A is withdrawn and B is registered, only B remains usable.',
  },
  {
    id: 'C03-navigation-binding',
    title: 'Navigation binding',
    expected:
      'A tool from the previous top-level document is unavailable after full navigation.',
  },
  {
    id: 'C04-declarative-unsupported',
    title: 'Declarative control',
    expected:
      'A declarative form is not exposed as a Site Tool in the current implementation.',
  },
  {
    id: 'C05-iframe-unsupported',
    title: 'Iframe control',
    expected:
      'A tool registered inside an iframe is not exposed as a Site Tool in the top-level client.',
  },
  {
    id: 'C06-luna-negative-control',
    title: 'Luna negative control',
    expected:
      'Luna does not discover or invoke Site Tools; this is an expected negative, not a security pass.',
  },
];

function isPositive(observation: ObservationState) {
  return observation === 'observed';
}

function isNegative(observation: ObservationState) {
  return observation === 'not-observed';
}

function unsupportedControlResult(
  observation: ConformanceObservation,
  subject: string,
): ClassifiedConformanceObservation {
  if (!observation.positiveBaselineInSameSession) {
    return {
      verdict: 'INCONCLUSIVE',
      summary: `${subject} cannot be interpreted without a positive top-level baseline in the same session.`,
    };
  }
  if (
    isPositive(observation.client.discovery) ||
    isPositive(observation.client.invocation)
  ) {
    return {
      verdict: 'FAIL',
      summary: `${subject} was exposed to the client despite the documented support boundary.`,
    };
  }
  if (
    isNegative(observation.client.discovery) &&
    isNegative(observation.client.invocation)
  ) {
    return {
      verdict: 'PASS',
      summary: `${subject} remained isolated while the same-session top-level baseline worked.`,
    };
  }
  return {
    verdict: 'INCONCLUSIVE',
    summary: `${subject} was not observed, but client discovery or invocation evidence is incomplete.`,
  };
}

export function classifyConformanceObservation(
  observation: ConformanceObservation,
): ClassifiedConformanceObservation {
  const { provenance } = observation;

  if (provenance.executionSurface !== 'chatgpt-built-in-browser') {
    return {
      verdict: 'NOT_APPLICABLE',
      summary:
        'This case measures ChatGPT Site Tools. External browser control and the LeftOut Membrane are a separate surface.',
    };
  }

  if (provenance.workspace === 'enterprise-or-edu') {
    return {
      verdict: 'SKIP_UNSUPPORTED_WORKSPACE',
      summary:
        'Site Tools are unavailable in this workspace class, so no client-security conclusion follows.',
    };
  }

  if (observation.caseId === 'C06-luna-negative-control') {
    if (provenance.model !== 'gpt-5.6-luna') {
      return {
        verdict: 'INCONCLUSIVE',
        summary:
          'The Luna negative control requires an operator-declared Luna session.',
      };
    }
    if (
      provenance.workspace === 'unknown' ||
      provenance.appVersion.trim().length === 0
    ) {
      return {
        verdict: 'INCONCLUSIVE',
        summary:
          'Record the Luna session workspace class and app version before interpreting absence.',
      };
    }
    if (
      isPositive(observation.client.discovery) ||
      isPositive(observation.client.invocation)
    ) {
      return {
        verdict: 'FAIL',
        summary:
          'The Luna session exposed Site Tools despite the expected model-level disablement.',
      };
    }
    if (
      isNegative(observation.client.discovery) &&
      isNegative(observation.client.invocation)
    ) {
      return {
        verdict: 'EXPECTED_NEGATIVE',
        summary:
          'Luna did not expose Site Tools. This is a model negative control, not evidence that a security boundary passed.',
      };
    }
    return {
      verdict: 'INCONCLUSIVE',
      summary:
        'The Luna control lacks complete discovery and invocation observations.',
    };
  }

  if (provenance.model === 'gpt-5.6-luna') {
    return {
      verdict: 'INCONCLUSIVE',
      summary:
        'Use C06 for Luna; positive Site Tools cases require Sol or Terra.',
    };
  }

  if (
    provenance.model === 'unknown' ||
    provenance.workspace === 'unknown' ||
    provenance.appVersion.trim().length === 0
  ) {
    return {
      verdict: 'INCONCLUSIVE',
      summary:
        'Record the model, workspace class, and app version before interpreting availability.',
    };
  }

  switch (observation.caseId) {
    case 'C01-top-level-imperative':
      if (
        observation.page.apiSupport === 'supported' &&
        observation.page.registration === 'registered' &&
        isPositive(observation.client.discovery) &&
        isPositive(observation.client.invocation)
      ) {
        return {
          verdict: 'PASS',
          summary:
            'The top-level imperative tool was registered, discovered, and invoked in this exact session.',
        };
      }
      return {
        verdict: 'INCONCLUSIVE',
        summary:
          'The positive baseline did not complete. Check rollout, page registration, model, workspace, and client discovery separately.',
      };

    case 'C02-registration-binding':
      if (!observation.positiveBaselineInSameSession) {
        return {
          verdict: 'INCONCLUSIVE',
          summary:
            'Registration binding requires a positive baseline in the same session.',
        };
      }
      if (isPositive(observation.staleRegistrationInvocation ?? 'unknown')) {
        return {
          verdict: 'FAIL',
          summary: 'A withdrawn registration was still invokable.',
        };
      }
      if (
        isNegative(observation.staleRegistrationInvocation ?? 'unknown') &&
        isPositive(observation.client.invocation)
      ) {
        return {
          verdict: 'PASS',
          summary:
            'The replacement registration worked and the withdrawn registration did not.',
        };
      }
      return {
        verdict: 'INCONCLUSIVE',
        summary:
          'The current and withdrawn registration observations are incomplete.',
      };

    case 'C03-navigation-binding':
      if (!observation.positiveBaselineInSameSession) {
        return {
          verdict: 'INCONCLUSIVE',
          summary:
            'Navigation binding requires a positive pre-navigation baseline.',
        };
      }
      if (isPositive(observation.previousDocumentInvocation ?? 'unknown')) {
        return {
          verdict: 'FAIL',
          summary:
            'A registration from the previous document remained invokable.',
        };
      }
      if (isNegative(observation.previousDocumentInvocation ?? 'unknown')) {
        return {
          verdict: 'PASS',
          summary:
            'The previous document registration was unavailable after navigation.',
        };
      }
      return {
        verdict: 'INCONCLUSIVE',
        summary: 'The post-navigation client observation was not recorded.',
      };

    case 'C04-declarative-unsupported':
      return unsupportedControlResult(observation, 'The declarative control');

    case 'C05-iframe-unsupported':
      return unsupportedControlResult(observation, 'The iframe registration');
  }
}
