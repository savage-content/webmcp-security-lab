import { randomUUID } from 'node:crypto';

import {
  ISSUE_DRAFT_ASSURANCE_LIMITATION,
  ISSUE_DRAFT_SCHEMA_VERSION,
  createPrivacySafeIssueDraft,
  type PrivacySafeIssueDraft,
} from './issue-draft';
import {
  ISSUE_MODERATION_STATES,
  projectPublicIssueFeed,
  projectPublicIssueRecord,
  type IssueModerationState,
  type IssuePublicationGate,
  type PublicIssueFeedRecord,
} from './issue-publication';

export const ISSUE_MODERATION_RECORD_SCHEMA_VERSION =
  'leftout.issue-moderation-record/1' as const;

export interface IssueModerationEvent {
  at: string;
  from: IssueModerationState;
  to: IssueModerationState;
}

export interface IssueModerationRecord {
  schemaVersion: typeof ISSUE_MODERATION_RECORD_SCHEMA_VERSION;
  id: string;
  receivedAt: string;
  updatedAt: string;
  state: IssueModerationState;
  draft: Readonly<PrivacySafeIssueDraft>;
  history: readonly Readonly<IssueModerationEvent>[];
  publication?: Readonly<IssuePublicationGate>;
}

const TRANSITIONS = Object.freeze({
  received: ['quarantined'],
  quarantined: ['under_review', 'duplicate', 'rejected'],
  under_review: ['needs_evidence', 'accepted_private', 'duplicate', 'rejected'],
  needs_evidence: ['under_review', 'rejected'],
  accepted_private: ['published', 'rejected'],
  duplicate: [],
  rejected: [],
  published: [],
} satisfies Record<IssueModerationState, readonly IssueModerationState[]>);

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

function exactIsoTime(value: unknown, label: string) {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error(`${label} must be an exact ISO-8601 UTC timestamp.`);
  }
  return value;
}

function issueId(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      value,
    )
  ) {
    throw new Error('Moderation record ID must be a lowercase UUID.');
  }
  return value;
}

function moderationState(value: unknown) {
  if (
    typeof value !== 'string' ||
    !ISSUE_MODERATION_STATES.includes(value as IssueModerationState)
  ) {
    throw new Error('The requested moderation state is unsupported.');
  }
  return value as IssueModerationState;
}

function parseStoredDraft(value: unknown) {
  if (!isRecord(value)) {
    throw new Error('Stored issue draft must be an object.');
  }
  rejectUnknownFields(
    value,
    new Set([
      'assuranceLimitation',
      'category',
      'context',
      'schemaVersion',
      'severity',
      'siteOrigin',
      'stage',
      'submission',
    ]),
    'Stored issue draft',
  );
  if (
    value.schemaVersion !== ISSUE_DRAFT_SCHEMA_VERSION ||
    value.assuranceLimitation !== ISSUE_DRAFT_ASSURANCE_LIMITATION ||
    !isRecord(value.submission)
  ) {
    throw new Error('Stored issue draft contract is invalid.');
  }
  rejectUnknownFields(
    value.submission,
    new Set(['disposition', 'submittable']),
    'Stored issue submission',
  );

  const canonical = createPrivacySafeIssueDraft({
    context: value.context,
    category: value.category,
    severity: value.severity,
    stage: value.stage,
    ...(Object.hasOwn(value, 'siteOrigin')
      ? { siteOrigin: value.siteOrigin }
      : {}),
  });
  if (
    value.submission.submittable !== canonical.submission.submittable ||
    value.submission.disposition !== canonical.submission.disposition
  ) {
    throw new Error('Stored issue submission disposition is invalid.');
  }
  return canonical;
}

function freezeRecord(record: IssueModerationRecord) {
  return Object.freeze({
    ...record,
    history: Object.freeze(record.history.map((event) => Object.freeze(event))),
    ...(record.publication
      ? { publication: Object.freeze(structuredClone(record.publication)) }
      : {}),
  });
}

export function createQuarantinedIssueRecord(
  draftInput: unknown,
  options: { id?: () => string; now?: () => number } = {},
) {
  const draft = createPrivacySafeIssueDraft(draftInput);
  if (draft.context !== 'public-web') {
    throw new Error(
      'Synthetic and local exercise reports cannot enter the moderation pipeline.',
    );
  }
  const at = new Date((options.now ?? Date.now)()).toISOString();
  const id = issueId((options.id ?? randomUUID)());
  return freezeRecord({
    schemaVersion: ISSUE_MODERATION_RECORD_SCHEMA_VERSION,
    id,
    receivedAt: at,
    updatedAt: at,
    state: 'quarantined',
    draft,
    history: [{ at, from: 'received', to: 'quarantined' }],
  });
}

export function transitionIssueModeration(
  current: Readonly<IssueModerationRecord>,
  transitionInput: unknown,
) {
  if (!isRecord(transitionInput)) {
    throw new Error('A moderation transition object is required.');
  }
  const allowedFields = new Set(['at', 'publication', 'to']);
  for (const key of Reflect.ownKeys(transitionInput)) {
    if (typeof key !== 'string' || !allowedFields.has(key)) {
      throw new Error(
        `Moderation transition contains an unknown field: ${String(key)}.`,
      );
    }
  }
  const to = moderationState(transitionInput.to);
  const allowedTransitions = TRANSITIONS[
    current.state
  ] as readonly IssueModerationState[];
  if (!allowedTransitions.includes(to)) {
    throw new Error(
      `Moderation transition from ${current.state} to ${to} is not allowed.`,
    );
  }
  const at = exactIsoTime(transitionInput.at, 'Moderation transition time');
  if (Date.parse(at) < Date.parse(current.updatedAt)) {
    throw new Error('Moderation transition time cannot move backward.');
  }
  if (to !== 'published' && Object.hasOwn(transitionInput, 'publication')) {
    throw new Error('Publication authority is accepted only at publication.');
  }

  let publication: IssuePublicationGate | undefined;
  if (to === 'published') {
    const candidate = {
      context: current.draft.context,
      category: current.draft.category,
      severity: current.draft.severity,
      stage: current.draft.stage,
      moderationState: to,
      publication: transitionInput.publication,
    };
    const projected = projectPublicIssueRecord(candidate);
    if (
      projected?.hostname &&
      new URL(current.draft.siteOrigin ?? '').hostname !== projected.hostname
    ) {
      throw new Error(
        'Named publication hostname must match the reviewed report origin.',
      );
    }
    publication = structuredClone(
      transitionInput.publication,
    ) as IssuePublicationGate;
  }

  return freezeRecord({
    ...current,
    updatedAt: at,
    state: to,
    history: [...current.history, { at, from: current.state, to }],
    ...(publication ? { publication } : {}),
  });
}

export function projectModeratedIssueFeed(
  records: readonly Readonly<IssueModerationRecord>[],
): readonly Readonly<PublicIssueFeedRecord>[] {
  return projectPublicIssueFeed(
    records.map((record) => ({
      context: record.draft.context,
      category: record.draft.category,
      severity: record.draft.severity,
      stage: record.draft.stage,
      moderationState: record.state,
      ...(record.publication ? { publication: record.publication } : {}),
    })),
  );
}

export function parseIssueModerationRecord(
  value: unknown,
): Readonly<IssueModerationRecord> {
  if (!isRecord(value)) {
    throw new Error('Stored moderation record must be an object.');
  }
  rejectUnknownFields(
    value,
    new Set([
      'schemaVersion',
      'id',
      'receivedAt',
      'updatedAt',
      'state',
      'draft',
      'history',
      'publication',
    ]),
    'Stored moderation record',
  );
  if (value.schemaVersion !== ISSUE_MODERATION_RECORD_SCHEMA_VERSION) {
    throw new Error('Stored moderation record schema is unsupported.');
  }
  const id = issueId(value.id);
  const receivedAt = exactIsoTime(
    value.receivedAt,
    'Stored moderation received time',
  );
  const updatedAt = exactIsoTime(
    value.updatedAt,
    'Stored moderation update time',
  );
  const state = moderationState(value.state);
  const draft = parseStoredDraft(value.draft);
  if (!Array.isArray(value.history) || value.history.length < 1) {
    throw new Error('Stored moderation history is required.');
  }
  if (value.history.length > ISSUE_MODERATION_STATES.length) {
    throw new Error('Stored moderation history exceeds the transition bound.');
  }

  const history = value.history.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Stored moderation event ${index} must be an object.`);
    }
    rejectUnknownFields(
      entry,
      new Set(['at', 'from', 'to']),
      `Stored moderation event ${index}`,
    );
    const from =
      entry.from === 'received' ? 'received' : moderationState(entry.from);
    return Object.freeze({
      at: exactIsoTime(entry.at, `Stored moderation event ${index} time`),
      from,
      to: moderationState(entry.to),
    });
  });

  let replayed = createQuarantinedIssueRecord(
    {
      context: draft.context,
      category: draft.category,
      severity: draft.severity,
      stage: draft.stage,
      ...(draft.siteOrigin ? { siteOrigin: draft.siteOrigin } : {}),
    },
    {
      id: () => id,
      now: () => Date.parse(receivedAt),
    },
  );
  const first = history[0];
  if (
    !first ||
    first.from !== 'received' ||
    first.to !== 'quarantined' ||
    first.at !== receivedAt
  ) {
    throw new Error('Stored moderation intake event is invalid.');
  }
  for (const [index, event] of history.slice(1).entries()) {
    if (event.from !== replayed.state) {
      throw new Error(
        `Stored moderation event ${index + 1} has a broken state chain.`,
      );
    }
    replayed = transitionIssueModeration(replayed, {
      at: event.at,
      to: event.to,
      ...(event.to === 'published' && Object.hasOwn(value, 'publication')
        ? { publication: value.publication }
        : {}),
    });
  }
  if (
    replayed.state !== state ||
    replayed.updatedAt !== updatedAt ||
    replayed.history.length !== history.length ||
    (state === 'published') !== Object.hasOwn(value, 'publication')
  ) {
    throw new Error('Stored moderation snapshot does not match its history.');
  }
  return replayed;
}
