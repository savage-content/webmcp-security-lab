import {
  parseReportingFeedSigningMaterial,
  type ReportingFeedSigningMaterial,
} from './feed-signing';

export const REPORTING_CONFIG_SCHEMA_VERSION =
  'leftout.reporting-service-config/3' as const;

export const REPORTING_ACTOR_ROLES = ['reviewer', 'publisher'] as const;

export type ReportingActorRole = (typeof REPORTING_ACTOR_ROLES)[number];

export interface ReportingActorConfiguration {
  id: string;
  role: ReportingActorRole;
  tokenSha256: string;
}

export interface ReportingServiceConfiguration {
  schemaVersion: typeof REPORTING_CONFIG_SCHEMA_VERSION;
  mode: 'disabled' | 'invited';
  gates: Readonly<{
    intake: boolean;
    moderation: boolean;
    publication: boolean;
    feed: boolean;
  }>;
  intakeInvitationId?: string;
  intakeTokenSha256?: string;
  intakeHourlyLimit?: number;
  globalHourlyLimit?: number;
  feedTokenSha256?: string;
  feedSigning?: Readonly<ReportingFeedSigningMaterial>;
  actors: readonly Readonly<ReportingActorConfiguration>[];
}

const ENVIRONMENT_FIELDS = Object.freeze({
  mode: 'LEFTOUT_REPORTING_MODE',
  intake: 'LEFTOUT_REPORTING_INTAKE',
  moderation: 'LEFTOUT_REPORTING_MODERATION',
  publication: 'LEFTOUT_REPORTING_PUBLICATION',
  feed: 'LEFTOUT_REPORTING_FEED',
  intakeInvitationId: 'LEFTOUT_REPORTING_INVITATION_ID',
  intakeTokenSha256: 'LEFTOUT_REPORTING_INTAKE_TOKEN_SHA256',
  intakeHourlyLimit: 'LEFTOUT_REPORTING_INVITATION_HOURLY_LIMIT',
  globalHourlyLimit: 'LEFTOUT_REPORTING_GLOBAL_HOURLY_LIMIT',
  actors: 'LEFTOUT_REPORTING_ACTORS_JSON',
  feedTokenSha256: 'LEFTOUT_REPORTING_FEED_TOKEN_SHA256',
  feedSigningKeyId: 'LEFTOUT_REPORTING_FEED_SIGNING_KEY_ID',
  feedSigningPrivateKey:
    'LEFTOUT_REPORTING_FEED_SIGNING_PRIVATE_KEY_PKCS8_BASE64',
  feedSigningPublicKey:
    'LEFTOUT_REPORTING_FEED_SIGNING_PUBLIC_KEY_SPKI_BASE64',
  feedSigningPublicKeySha256:
    'LEFTOUT_REPORTING_FEED_SIGNING_PUBLIC_KEY_SHA256',
});

const ALL_ENVIRONMENT_FIELDS = Object.freeze(Object.values(ENVIRONMENT_FIELDS));
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const ACTOR_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,62}[a-z0-9])?$/u;
const MAX_ACTORS = 32;

function definedString(
  environment: Readonly<Record<string, unknown>>,
  key: string,
) {
  const value = environment[key];
  return typeof value === 'string' ? value : undefined;
}

function exactBoolean(
  environment: Readonly<Record<string, unknown>>,
  key: string,
) {
  const value = definedString(environment, key);
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${key} must be explicitly true or false.`);
}

function digest(value: unknown, label: string) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

function boundedInteger(
  environment: Readonly<Record<string, unknown>>,
  key: string,
  maximum: number,
) {
  const value = definedString(environment, key);
  if (!value || !/^[1-9][0-9]{0,5}$/u.test(value)) {
    throw new Error(`${key} must be an explicit positive integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new Error(`${key} exceeds the supported maximum of ${maximum}.`);
  }
  return parsed;
}

function invitationId(value: string | undefined) {
  if (
    !value ||
    value.length < 3 ||
    value.length > 64 ||
    !ACTOR_ID_PATTERN.test(value) ||
    !value.startsWith('invitation.')
  ) {
    throw new Error(
      'Reporting invitation ID must be a normalized opaque invitation.* identifier.',
    );
  }
  return value;
}

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

function parseActors(value: string | undefined) {
  if (value === undefined) return Object.freeze([]);
  if (new TextEncoder().encode(value).byteLength > 16 * 1024) {
    throw new Error('Reporting actor configuration is too large.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error('Reporting actor configuration must be valid JSON.');
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_ACTORS) {
    throw new Error(
      `Reporting actor configuration must be an array of at most ${MAX_ACTORS} actors.`,
    );
  }

  const ids = new Set<string>();
  const digests = new Set<string>();
  const actors = parsed.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Reporting actor ${index} must be an object.`);
    }
    rejectUnknownFields(
      entry,
      new Set(['id', 'role', 'tokenSha256']),
      `Reporting actor ${index}`,
    );
    if (
      typeof entry.id !== 'string' ||
      entry.id.length < 3 ||
      entry.id.length > 64 ||
      !ACTOR_ID_PATTERN.test(entry.id)
    ) {
      throw new Error(
        `Reporting actor ${index} must have a normalized opaque identifier.`,
      );
    }
    if (
      typeof entry.role !== 'string' ||
      !REPORTING_ACTOR_ROLES.includes(entry.role as ReportingActorRole)
    ) {
      throw new Error(`Reporting actor ${index} has an unsupported role.`);
    }
    const tokenSha256 = digest(
      entry.tokenSha256,
      `Reporting actor ${index} token digest`,
    );
    if (ids.has(entry.id)) {
      throw new Error('Reporting actor identifiers must be unique.');
    }
    if (digests.has(tokenSha256)) {
      throw new Error('Reporting actor credentials must be unique.');
    }
    ids.add(entry.id);
    digests.add(tokenSha256);
    return Object.freeze({
      id: entry.id,
      role: entry.role as ReportingActorRole,
      tokenSha256,
    });
  });

  return Object.freeze(actors);
}

function disabledConfiguration(): Readonly<ReportingServiceConfiguration> {
  return Object.freeze({
    schemaVersion: REPORTING_CONFIG_SCHEMA_VERSION,
    mode: 'disabled' as const,
    gates: Object.freeze({
      intake: false,
      moderation: false,
      publication: false,
      feed: false,
    }),
    actors: Object.freeze([]),
  });
}

export function loadReportingServiceConfiguration(
  environment: Readonly<Record<string, unknown>>,
): Readonly<ReportingServiceConfiguration> {
  const configuredFields = ALL_ENVIRONMENT_FIELDS.filter(
    (key) => environment[key] !== undefined,
  );
  if (configuredFields.length === 0) return disabledConfiguration();

  const mode = definedString(environment, ENVIRONMENT_FIELDS.mode);
  if (mode !== 'disabled' && mode !== 'invited') {
    throw new Error(
      `${ENVIRONMENT_FIELDS.mode} must be explicitly disabled or invited.`,
    );
  }
  if (mode === 'disabled') {
    if (configuredFields.length !== 1) {
      throw new Error(
        'Disabled reporting configuration must not retain gates or credentials.',
      );
    }
    return disabledConfiguration();
  }

  const gates = Object.freeze({
    intake: exactBoolean(environment, ENVIRONMENT_FIELDS.intake),
    moderation: exactBoolean(environment, ENVIRONMENT_FIELDS.moderation),
    publication: exactBoolean(environment, ENVIRONMENT_FIELDS.publication),
    feed: exactBoolean(environment, ENVIRONMENT_FIELDS.feed),
  });
  if (gates.publication && !gates.moderation) {
    throw new Error('Reporting publication requires moderation to be enabled.');
  }
  if (gates.feed && !gates.publication) {
    throw new Error('Reporting feed requires publication to be enabled.');
  }

  const intakeTokenValue = definedString(
    environment,
    ENVIRONMENT_FIELDS.intakeTokenSha256,
  );
  const invitationIdValue = definedString(
    environment,
    ENVIRONMENT_FIELDS.intakeInvitationId,
  );
  const intakeHourlyLimitValue = definedString(
    environment,
    ENVIRONMENT_FIELDS.intakeHourlyLimit,
  );
  const globalHourlyLimitValue = definedString(
    environment,
    ENVIRONMENT_FIELDS.globalHourlyLimit,
  );
  const intakeInvitationId = gates.intake
    ? invitationId(invitationIdValue)
    : undefined;
  const intakeTokenSha256 = gates.intake
    ? digest(intakeTokenValue, 'Reporting invitation token digest')
    : undefined;
  const intakeHourlyLimit = gates.intake
    ? boundedInteger(environment, ENVIRONMENT_FIELDS.intakeHourlyLimit, 1_000)
    : undefined;
  const globalHourlyLimit = gates.intake
    ? boundedInteger(environment, ENVIRONMENT_FIELDS.globalHourlyLimit, 10_000)
    : undefined;
  if (
    intakeHourlyLimit !== undefined &&
    globalHourlyLimit !== undefined &&
    intakeHourlyLimit > globalHourlyLimit
  ) {
    throw new Error(
      'Reporting invitation quota cannot exceed the global quota.',
    );
  }
  if (
    !gates.intake &&
    [
      intakeTokenValue,
      invitationIdValue,
      intakeHourlyLimitValue,
      globalHourlyLimitValue,
    ].some((value) => value !== undefined)
  ) {
    throw new Error(
      'Reporting invitation settings require the intake gate to be enabled.',
    );
  }

  const actorsValue = definedString(environment, ENVIRONMENT_FIELDS.actors);
  const actors = parseActors(actorsValue);
  if (!gates.moderation && actors.length > 0) {
    throw new Error(
      'Reporting actor credentials require the moderation gate to be enabled.',
    );
  }
  if (gates.moderation && !actors.some((actor) => actor.role === 'reviewer')) {
    throw new Error(
      'Enabled reporting moderation requires at least one reviewer.',
    );
  }
  if (
    gates.publication &&
    !actors.some((actor) => actor.role === 'publisher')
  ) {
    throw new Error(
      'Enabled reporting publication requires at least one separate publisher.',
    );
  }
  if (
    intakeTokenSha256 &&
    actors.some((actor) => actor.tokenSha256 === intakeTokenSha256)
  ) {
    throw new Error(
      'Reporting invitation and operator credentials must be distinct.',
    );
  }

  const feedTokenValue = definedString(
    environment,
    ENVIRONMENT_FIELDS.feedTokenSha256,
  );
  const feedSigningValues = {
    keyId: definedString(environment, ENVIRONMENT_FIELDS.feedSigningKeyId),
    privateKeyPkcs8Base64: definedString(
      environment,
      ENVIRONMENT_FIELDS.feedSigningPrivateKey,
    ),
    publicKeySpkiBase64: definedString(
      environment,
      ENVIRONMENT_FIELDS.feedSigningPublicKey,
    ),
    publicKeySpkiSha256: definedString(
      environment,
      ENVIRONMENT_FIELDS.feedSigningPublicKeySha256,
    ),
  };
  const hasFeedSettings =
    feedTokenValue !== undefined ||
    Object.values(feedSigningValues).some((value) => value !== undefined);
  if (!gates.feed && hasFeedSettings) {
    throw new Error(
      'Reporting feed credentials and signing material require the feed gate.',
    );
  }
  const feedTokenSha256 = gates.feed
    ? digest(feedTokenValue, 'Reporting feed token digest')
    : undefined;
  const feedSigning = gates.feed
    ? parseReportingFeedSigningMaterial(feedSigningValues)
    : undefined;
  if (
    feedTokenSha256 &&
    (feedTokenSha256 === intakeTokenSha256 ||
      actors.some((actor) => actor.tokenSha256 === feedTokenSha256))
  ) {
    throw new Error(
      'Reporting feed, invitation, and operator credentials must be distinct.',
    );
  }

  return Object.freeze({
    schemaVersion: REPORTING_CONFIG_SCHEMA_VERSION,
    mode,
    gates,
    ...(intakeInvitationId ? { intakeInvitationId } : {}),
    ...(intakeTokenSha256 ? { intakeTokenSha256 } : {}),
    ...(intakeHourlyLimit ? { intakeHourlyLimit } : {}),
    ...(globalHourlyLimit ? { globalHourlyLimit } : {}),
    ...(feedTokenSha256 ? { feedTokenSha256 } : {}),
    ...(feedSigning ? { feedSigning } : {}),
    actors,
  });
}
