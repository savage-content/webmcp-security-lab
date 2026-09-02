import { randomUUID } from 'node:crypto';

import {
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
    projectPublicIssueRecord(candidate);
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
