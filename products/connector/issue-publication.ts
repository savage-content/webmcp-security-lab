import { isIP } from 'node:net';

import {
  ISSUE_DRAFT_ASSURANCE_LIMITATION,
  ISSUE_DRAFT_CATEGORIES,
  ISSUE_DRAFT_CONTEXTS,
  ISSUE_DRAFT_SEVERITIES,
  ISSUE_DRAFT_STAGES,
  type IssueDraftCategory,
  type IssueDraftContext,
  type IssueDraftSeverity,
  type IssueDraftStage,
} from './issue-draft';

export const ISSUE_PUBLICATION_SCHEMA_VERSION =
  'leftout.public-issue-feed/1' as const;

export const ISSUE_MODERATION_STATES = [
  'received',
  'quarantined',
  'under_review',
  'needs_evidence',
  'accepted_private',
  'duplicate',
  'rejected',
  'published',
] as const;

export const HOSTNAME_VISIBILITIES = ['withheld', 'named'] as const;
export const HOSTNAME_CONSENT_STATES = ['not_granted', 'explicit'] as const;
export const PUBLICATION_EVIDENCE_BASES = [
  'not_established',
  'human_reproduced',
  'equivalent_evidence',
] as const;

export type IssueModerationState = (typeof ISSUE_MODERATION_STATES)[number];
export type HostnameVisibility = (typeof HOSTNAME_VISIBILITIES)[number];
export type HostnameConsentState = (typeof HOSTNAME_CONSENT_STATES)[number];
export type PublicationEvidenceBasis =
  (typeof PUBLICATION_EVIDENCE_BASES)[number];

export interface IssuePublicationGate {
  evidenceBasis: PublicationEvidenceBasis;
  hostname?: string;
  hostnameConsent: HostnameConsentState;
  hostnameVisibility: HostnameVisibility;
}

export interface ModeratedIssueCandidate {
  category: IssueDraftCategory;
  context: IssueDraftContext;
  moderationState: IssueModerationState;
  publication?: IssuePublicationGate;
  severity: IssueDraftSeverity;
  stage: IssueDraftStage;
}

export interface PublicIssueFeedRecord {
  assuranceLimitation: typeof ISSUE_DRAFT_ASSURANCE_LIMITATION;
  category: IssueDraftCategory;
  evidenceBasis: PublicationEvidenceBasis;
  hostname?: string;
  hostnameVisibility: HostnameVisibility;
  moderationState: 'published';
  schemaVersion: typeof ISSUE_PUBLICATION_SCHEMA_VERSION;
  severity: IssueDraftSeverity;
  stage: IssueDraftStage;
}

const CANDIDATE_FIELDS = new Set([
  'category',
  'context',
  'moderationState',
  'publication',
  'severity',
  'stage',
]);

const PUBLICATION_FIELDS = new Set([
  'evidenceBasis',
  'hostname',
  'hostnameConsent',
  'hostnameVisibility',
]);

const PUBLIC_RECORD_FIELDS = new Set([
  'assuranceLimitation',
  'category',
  'evidenceBasis',
  'hostname',
  'hostnameVisibility',
  'moderationState',
  'schemaVersion',
  'severity',
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

function rejectUnknownFields(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
) {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw new Error(`${label} contains an unknown field: ${String(key)}.`);
    }
  }
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

function publicHostname(value: unknown) {
  if (
    typeof value !== 'string' ||
    value.length < 3 ||
    value.length > 253 ||
    value !== value.trim() ||
    value !== value.toLowerCase()
  ) {
    throw new Error('A normalized public hostname is required.');
  }

  let parsed: URL;
  try {
    parsed = new URL(`https://${value}`);
  } catch {
    throw new Error('The publication hostname is invalid.');
  }
  const hostname = parsed.hostname.toLowerCase();
  const address =
    hostname.startsWith('[') && hostname.endsWith(']')
      ? hostname.slice(1, -1)
      : hostname;
  if (
    hostname !== value ||
    parsed.origin !== `https://${value}` ||
    isIP(address) !== 0 ||
    !hostname.includes('.') ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(
      hostname,
    ) ||
    NON_PUBLIC_HOST_SUFFIXES.some(
      (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
    )
  ) {
    throw new Error(
      'Named publication requires a normalized public DNS hostname without a scheme, port, path, query, fragment, local name, or IP literal.',
    );
  }
  return hostname;
}

function publicationGate(value: unknown) {
  if (!isRecord(value)) {
    throw new Error('A publication gate is required for a published issue.');
  }
  rejectUnknownFields(value, PUBLICATION_FIELDS, 'Publication gate');
  const hostnameVisibility = enumValue(
    value.hostnameVisibility,
    HOSTNAME_VISIBILITIES,
    'Hostname visibility',
  );
  const hostnameConsent = enumValue(
    value.hostnameConsent,
    HOSTNAME_CONSENT_STATES,
    'Hostname consent',
  );
  const evidenceBasis = enumValue(
    value.evidenceBasis,
    PUBLICATION_EVIDENCE_BASES,
    'Publication evidence basis',
  );

  if (hostnameVisibility === 'withheld') {
    if (Object.hasOwn(value, 'hostname')) {
      throw new Error('A withheld-host publication cannot include a hostname.');
    }
    if (hostnameConsent !== 'not_granted') {
      throw new Error(
        'Withheld-host publication must not claim hostname-publication consent.',
      );
    }
    return { hostnameVisibility, hostnameConsent, evidenceBasis } as const;
  }

  if (hostnameConsent !== 'explicit') {
    throw new Error(
      'Named-host publication requires explicit hostname-publication consent.',
    );
  }
  if (
    evidenceBasis !== 'human_reproduced' &&
    evidenceBasis !== 'equivalent_evidence'
  ) {
    throw new Error(
      'Named-host publication requires human reproduction or equivalent evidence.',
    );
  }
  return {
    hostnameVisibility,
    hostnameConsent,
    evidenceBasis,
    hostname: publicHostname(value.hostname),
  } as const;
}

export function parseIssuePublicationGate(
  value: unknown,
): Readonly<IssuePublicationGate> {
  return Object.freeze(publicationGate(value));
}

function candidate(value: unknown): ModeratedIssueCandidate {
  if (!isRecord(value)) {
    throw new Error('Moderated issue input must be an object.');
  }
  rejectUnknownFields(value, CANDIDATE_FIELDS, 'Moderated issue');
  return {
    context: enumValue(value.context, ISSUE_DRAFT_CONTEXTS, 'Issue context'),
    category: enumValue(
      value.category,
      ISSUE_DRAFT_CATEGORIES,
      'Issue category',
    ),
    severity: enumValue(
      value.severity,
      ISSUE_DRAFT_SEVERITIES,
      'Issue severity',
    ),
    stage: enumValue(value.stage, ISSUE_DRAFT_STAGES, 'Issue stage'),
    moderationState: enumValue(
      value.moderationState,
      ISSUE_MODERATION_STATES,
      'Moderation state',
    ),
    ...(Object.hasOwn(value, 'publication')
      ? { publication: publicationGate(value.publication) }
      : {}),
  };
}

export function projectPublicIssueRecord(
  input: unknown,
): Readonly<PublicIssueFeedRecord> | undefined {
  const moderated = candidate(input);
  if (moderated.moderationState !== 'published') return undefined;
  if (moderated.context !== 'public-web') {
    throw new Error('Synthetic and local exercise issues cannot be published.');
  }
  const publication = publicationGate(moderated.publication);
  const projection: PublicIssueFeedRecord = {
    schemaVersion: ISSUE_PUBLICATION_SCHEMA_VERSION,
    moderationState: 'published',
    category: moderated.category,
    severity: moderated.severity,
    stage: moderated.stage,
    hostnameVisibility: publication.hostnameVisibility,
    evidenceBasis: publication.evidenceBasis,
    ...('hostname' in publication ? { hostname: publication.hostname } : {}),
    assuranceLimitation: ISSUE_DRAFT_ASSURANCE_LIMITATION,
  };
  return Object.freeze(projection);
}

export function projectPublicIssueFeed(
  inputs: readonly unknown[],
): readonly Readonly<PublicIssueFeedRecord>[] {
  if (!Array.isArray(inputs)) {
    throw new Error('Public issue feed input must be an array.');
  }
  const records: Readonly<PublicIssueFeedRecord>[] = [];
  for (const input of inputs) {
    const projection = projectPublicIssueRecord(input);
    if (projection) records.push(projection);
  }
  return Object.freeze(records);
}

export function parsePublicIssueFeedRecord(
  value: unknown,
): Readonly<PublicIssueFeedRecord> {
  if (!isRecord(value)) {
    throw new Error('Stored public issue record must be an object.');
  }
  rejectUnknownFields(value, PUBLIC_RECORD_FIELDS, 'Stored public issue');
  if (
    value.schemaVersion !== ISSUE_PUBLICATION_SCHEMA_VERSION ||
    value.moderationState !== 'published' ||
    value.assuranceLimitation !== ISSUE_DRAFT_ASSURANCE_LIMITATION
  ) {
    throw new Error('Stored public issue record contract is invalid.');
  }
  const projected = projectPublicIssueRecord({
    context: 'public-web',
    category: value.category,
    severity: value.severity,
    stage: value.stage,
    moderationState: value.moderationState,
    publication: {
      hostnameVisibility: value.hostnameVisibility,
      hostnameConsent:
        value.hostnameVisibility === 'named' ? 'explicit' : 'not_granted',
      evidenceBasis: value.evidenceBasis,
      ...(Object.hasOwn(value, 'hostname') ? { hostname: value.hostname } : {}),
    },
  });
  if (!projected || JSON.stringify(projected) !== JSON.stringify(value)) {
    throw new Error('Stored public issue record is not canonical.');
  }
  return projected;
}
