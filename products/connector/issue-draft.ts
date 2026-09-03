import { isIP } from 'node:net';

export const ISSUE_DRAFT_SCHEMA_VERSION = 'leftout.issue-draft/1' as const;

export const ISSUE_DRAFT_CONTEXTS = [
  'public-web',
  'synthetic-lab',
  'local-exercise',
] as const;

export const ISSUE_DRAFT_CATEGORIES = [
  'annotation-mismatch',
  'excess-authority',
  'untrusted-output',
  'misleading-approval',
  'support-overclaim',
  'unexpected-tool-change',
  'unexpected-side-effect',
] as const;

export const ISSUE_DRAFT_STAGES = [
  'api-support',
  'registration',
  'policy',
  'discovery',
  'approval',
  'invocation',
  'result',
  'retirement',
] as const;

export const ISSUE_DRAFT_SEVERITIES = [
  'informational',
  'low',
  'medium',
  'high',
  'critical',
] as const;

export const ISSUE_DRAFT_ASSURANCE_LIMITATION =
  'This report reflects self-reported evidence readiness. Left Out Security has not inspected, tested, or independently validated the described system.';

export type IssueDraftContext = (typeof ISSUE_DRAFT_CONTEXTS)[number];
export type IssueDraftCategory = (typeof ISSUE_DRAFT_CATEGORIES)[number];
export type IssueDraftStage = (typeof ISSUE_DRAFT_STAGES)[number];
export type IssueDraftSeverity = (typeof ISSUE_DRAFT_SEVERITIES)[number];

export interface IssueDraftInput {
  category: IssueDraftCategory;
  context: IssueDraftContext;
  severity: IssueDraftSeverity;
  siteOrigin?: string;
  stage: IssueDraftStage;
}

export type IssueDraftSubmissionDisposition =
  | 'human-review-required'
  | 'synthetic-not-submittable'
  | 'local-exercise-not-submittable';

export interface PrivacySafeIssueDraft extends IssueDraftInput {
  assuranceLimitation: typeof ISSUE_DRAFT_ASSURANCE_LIMITATION;
  schemaVersion: typeof ISSUE_DRAFT_SCHEMA_VERSION;
  submission: Readonly<{
    disposition: IssueDraftSubmissionDisposition;
    submittable: false;
  }>;
}

const ALLOWED_FIELDS = new Set([
  'category',
  'context',
  'severity',
  'siteOrigin',
  'stage',
]);

const NON_PUBLIC_HOST_SUFFIXES = [
  '.home',
  '.home.arpa',
  '.internal',
  '.invalid',
  '.lan',
  '.local',
  '.localhost',
  '.test',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`${label} must be one of the supported values.`);
  }
  return value as T[number];
}

function publicSiteOrigin(value: unknown) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 512) {
    throw new Error('A bounded public site origin is required.');
  }
  if (value !== value.trim()) {
    throw new Error('The public site origin must not contain whitespace.');
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('The public site origin is invalid.');
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    value !== parsed.origin
  ) {
    throw new Error(
      'The public site origin must be a credential-free HTTPS origin without a port, path, query, or fragment.',
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  const address =
    hostname.startsWith('[') && hostname.endsWith(']')
      ? hostname.slice(1, -1)
      : hostname;
  if (
    hostname === 'localhost' ||
    isIP(address) !== 0 ||
    !hostname.includes('.') ||
    NON_PUBLIC_HOST_SUFFIXES.some(
      (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
    )
  ) {
    throw new Error(
      'Local, private, special-use, and IP-literal origins cannot be included in an issue draft.',
    );
  }

  return parsed.origin;
}

function submissionDisposition(
  context: IssueDraftContext,
): IssueDraftSubmissionDisposition {
  if (context === 'synthetic-lab') return 'synthetic-not-submittable';
  if (context === 'local-exercise') return 'local-exercise-not-submittable';
  return 'human-review-required';
}

export function createPrivacySafeIssueDraft(
  input: unknown,
): Readonly<PrivacySafeIssueDraft> {
  if (!isRecord(input)) {
    throw new Error('Issue draft input must be an object.');
  }

  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || !ALLOWED_FIELDS.has(key)) {
      throw new Error(`Issue draft contains an unknown field: ${String(key)}.`);
    }
  }

  const context = enumValue(
    input.context,
    ISSUE_DRAFT_CONTEXTS,
    'Issue context',
  );
  const category = enumValue(
    input.category,
    ISSUE_DRAFT_CATEGORIES,
    'Issue category',
  );
  const severity = enumValue(
    input.severity,
    ISSUE_DRAFT_SEVERITIES,
    'Issue severity',
  );
  const stage = enumValue(input.stage, ISSUE_DRAFT_STAGES, 'Issue stage');

  if (context !== 'public-web' && Object.hasOwn(input, 'siteOrigin')) {
    throw new Error(
      'Synthetic and local exercise drafts cannot include a site origin.',
    );
  }

  const submission = Object.freeze({
    submittable: false as const,
    disposition: submissionDisposition(context),
  });
  const draft: PrivacySafeIssueDraft = {
    schemaVersion: ISSUE_DRAFT_SCHEMA_VERSION,
    context,
    category,
    severity,
    stage,
    ...(context === 'public-web'
      ? { siteOrigin: publicSiteOrigin(input.siteOrigin) }
      : {}),
    submission,
    assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
  };

  return Object.freeze(draft);
}
