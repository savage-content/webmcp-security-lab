import { createHash, generateKeyPairSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  authenticateReportingActor,
  authenticateReportingFeed,
  authenticateReportingInvitation,
} from '../products/reporting-service/auth';
import { loadReportingServiceConfiguration } from '../products/reporting-service/config';

function digest(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

const invitationToken = 'invitation-token-with-at-least-32-characters';
const reviewerToken = 'reviewer-token-with-at-least-32-characters-long';
const publisherToken = 'publisher-token-with-at-least-32-characters';
const custodianToken = 'custodian-token-with-at-least-32-characters';
const feedToken = 'feed-reader-token-with-at-least-32-characters-long';
const feedKeyPair = generateKeyPairSync('ed25519');
const feedPrivateKey = Buffer.from(
  feedKeyPair.privateKey.export({ format: 'der', type: 'pkcs8' }),
);
const feedPublicKey = Buffer.from(
  feedKeyPair.publicKey.export({ format: 'der', type: 'spki' }),
);

function invitedEnvironment(overrides: Readonly<Record<string, string>> = {}) {
  return {
    LEFTOUT_REPORTING_MODE: 'invited',
    LEFTOUT_REPORTING_INTAKE: 'true',
    LEFTOUT_REPORTING_MODERATION: 'true',
    LEFTOUT_REPORTING_PUBLICATION: 'true',
    LEFTOUT_REPORTING_FEED: 'false',
    LEFTOUT_REPORTING_LIFECYCLE: 'false',
    LEFTOUT_REPORTING_INVITATION_ID: 'invitation.cohort-alpha',
    LEFTOUT_REPORTING_INTAKE_TOKEN_SHA256: digest(invitationToken),
    LEFTOUT_REPORTING_INVITATION_HOURLY_LIMIT: '20',
    LEFTOUT_REPORTING_GLOBAL_HOURLY_LIMIT: '100',
    LEFTOUT_REPORTING_ACTORS_JSON: JSON.stringify([
      {
        id: 'reviewer-alpha',
        role: 'reviewer',
        tokenSha256: digest(reviewerToken),
      },
      {
        id: 'publisher-alpha',
        role: 'publisher',
        tokenSha256: digest(publisherToken),
      },
    ]),
    ...overrides,
  };
}

function feedEnvironment(
  overrides: Readonly<Record<string, string>> = {},
): Record<string, string> {
  return invitedEnvironment({
    LEFTOUT_REPORTING_FEED: 'true',
    LEFTOUT_REPORTING_FEED_TOKEN_SHA256: digest(feedToken),
    LEFTOUT_REPORTING_FEED_SIGNING_KEY_ID: 'feed.alpha',
    LEFTOUT_REPORTING_FEED_SIGNING_PRIVATE_KEY_PKCS8_BASE64:
      feedPrivateKey.toString('base64'),
    LEFTOUT_REPORTING_FEED_SIGNING_PUBLIC_KEY_SPKI_BASE64:
      feedPublicKey.toString('base64'),
    LEFTOUT_REPORTING_FEED_SIGNING_PUBLIC_KEY_SHA256: createHash('sha256')
      .update(feedPublicKey)
      .digest('hex'),
    ...overrides,
  });
}

function lifecycleEnvironment(
  overrides: Readonly<Record<string, string>> = {},
): Record<string, string> {
  return invitedEnvironment({
    LEFTOUT_REPORTING_LIFECYCLE: 'true',
    LEFTOUT_REPORTING_RETENTION_DAYS: '90',
    LEFTOUT_REPORTING_RETENTION_POLICY_VERSION: 'retention.private-v1',
    LEFTOUT_REPORTING_ACTORS_JSON: JSON.stringify([
      {
        id: 'reviewer-alpha',
        role: 'reviewer',
        tokenSha256: digest(reviewerToken),
      },
      {
        id: 'publisher-alpha',
        role: 'publisher',
        tokenSha256: digest(publisherToken),
      },
      {
        id: 'custodian-alpha',
        role: 'custodian',
        tokenSha256: digest(custodianToken),
      },
    ]),
    ...overrides,
  });
}

function correctionEnvironment(
  overrides: Readonly<Record<string, string>> = {},
): Record<string, string> {
  return invitedEnvironment({
    LEFTOUT_REPORTING_CORRECTION: 'true',
    LEFTOUT_REPORTING_ACTORS_JSON: JSON.stringify([
      {
        id: 'reviewer-alpha',
        role: 'reviewer',
        tokenSha256: digest(reviewerToken),
      },
      {
        id: 'publisher-alpha',
        role: 'publisher',
        tokenSha256: digest(publisherToken),
      },
      {
        id: 'custodian-alpha',
        role: 'custodian',
        tokenSha256: digest(custodianToken),
      },
    ]),
    ...overrides,
  });
}

function request(token?: string) {
  return new Request('https://reports.example.test/action', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe('reporting service configuration', () => {
  it('is fully disabled when reporting configuration is absent', () => {
    const configuration = loadReportingServiceConfiguration({});
    expect(configuration).toEqual({
      schemaVersion: 'leftout.reporting-service-config/5',
      mode: 'disabled',
      gates: {
        intake: false,
        moderation: false,
        publication: false,
        feed: false,
        lifecycle: false,
        correction: false,
      },
      actors: [],
    });
    expect(Object.isFrozen(configuration)).toBe(true);
    expect(Object.isFrozen(configuration.gates)).toBe(true);
  });

  it('requires an explicit mode and rejects credentials in disabled mode', () => {
    expect(() =>
      loadReportingServiceConfiguration({
        LEFTOUT_REPORTING_INTAKE: 'true',
      }),
    ).toThrow('must be explicitly disabled or invited');
    expect(() =>
      loadReportingServiceConfiguration({
        LEFTOUT_REPORTING_MODE: 'disabled',
        LEFTOUT_REPORTING_INTAKE: 'false',
      }),
    ).toThrow('must not retain gates or credentials');
  });

  it('loads distinct invitation, reviewer, and publisher authority', () => {
    const configuration =
      loadReportingServiceConfiguration(invitedEnvironment());
    expect(configuration.mode).toBe('invited');
    expect(configuration.gates).toEqual({
      intake: true,
      moderation: true,
      publication: true,
      feed: false,
      lifecycle: false,
      correction: false,
    });
    expect(configuration.intakeInvitationId).toBe('invitation.cohort-alpha');
    expect(configuration.intakeHourlyLimit).toBe(20);
    expect(configuration.globalHourlyLimit).toBe(100);
    expect(configuration.actors.map(({ id, role }) => ({ id, role }))).toEqual([
      { id: 'reviewer-alpha', role: 'reviewer' },
      { id: 'publisher-alpha', role: 'publisher' },
    ]);
  });

  it('requires dependency gates and role-specific operators', () => {
    expect(() =>
      loadReportingServiceConfiguration(
        invitedEnvironment({ LEFTOUT_REPORTING_MODERATION: 'false' }),
      ),
    ).toThrow('publication requires moderation');
    expect(() =>
      loadReportingServiceConfiguration(
        invitedEnvironment({
          LEFTOUT_REPORTING_ACTORS_JSON: JSON.stringify([
            {
              id: 'reviewer-alpha',
              role: 'reviewer',
              tokenSha256: digest(reviewerToken),
            },
          ]),
        }),
      ),
    ).toThrow('separate publisher');
    expect(() =>
      loadReportingServiceConfiguration(
        feedEnvironment({ LEFTOUT_REPORTING_PUBLICATION: 'false' }),
      ),
    ).toThrow('feed requires publication');
    expect(() =>
      loadReportingServiceConfiguration(
        lifecycleEnvironment({
          LEFTOUT_REPORTING_ACTORS_JSON:
            invitedEnvironment().LEFTOUT_REPORTING_ACTORS_JSON,
        }),
      ),
    ).toThrow('separate custodian');
  });

  it('loads bounded retention under separate custodian authority', () => {
    const configuration = loadReportingServiceConfiguration(
      lifecycleEnvironment(),
    );
    expect(configuration.gates.lifecycle).toBe(true);
    expect(configuration.retentionDays).toBe(90);
    expect(configuration.retentionPolicyVersion).toBe('retention.private-v1');
    expect(
      configuration.actors.find((actor) => actor.role === 'custodian'),
    ).toMatchObject({ id: 'custodian-alpha', role: 'custodian' });
  });

  it('loads correction as a separate, custodian-only publication gate', () => {
    const configuration = loadReportingServiceConfiguration(
      correctionEnvironment(),
    );
    expect(configuration.gates).toMatchObject({
      publication: true,
      correction: true,
      lifecycle: false,
    });
    expect(
      configuration.actors.find((actor) => actor.role === 'custodian'),
    ).toMatchObject({ id: 'custodian-alpha', role: 'custodian' });
    expect(() =>
      loadReportingServiceConfiguration(
        invitedEnvironment({ LEFTOUT_REPORTING_CORRECTION: 'true' }),
      ),
    ).toThrow('separate custodian');
    expect(() =>
      loadReportingServiceConfiguration(
        correctionEnvironment({ LEFTOUT_REPORTING_PUBLICATION: 'false' }),
      ),
    ).toThrow('correction requires publication');
  });

  it('rejects retention settings without lifecycle and invalid policy bounds', () => {
    expect(() =>
      loadReportingServiceConfiguration(
        invitedEnvironment({ LEFTOUT_REPORTING_RETENTION_DAYS: '90' }),
      ),
    ).toThrow('require lifecycle authority');
    expect(() =>
      loadReportingServiceConfiguration(
        lifecycleEnvironment({ LEFTOUT_REPORTING_RETENTION_DAYS: '3651' }),
      ),
    ).toThrow('supported maximum');
    expect(() =>
      loadReportingServiceConfiguration(
        lifecycleEnvironment({
          LEFTOUT_REPORTING_RETENTION_POLICY_VERSION: 'private-v1',
        }),
      ),
    ).toThrow('retention.* identifier');
  });

  it('requires a bounded invitation identity and explicit intake quotas', () => {
    expect(() =>
      loadReportingServiceConfiguration(
        invitedEnvironment({
          LEFTOUT_REPORTING_INVITATION_ID: 'reviewer-alpha',
        }),
      ),
    ).toThrow('invitation.* identifier');
    expect(() =>
      loadReportingServiceConfiguration(
        invitedEnvironment({
          LEFTOUT_REPORTING_INVITATION_HOURLY_LIMIT: '0',
        }),
      ),
    ).toThrow('positive integer');
    expect(() =>
      loadReportingServiceConfiguration(
        invitedEnvironment({
          LEFTOUT_REPORTING_INVITATION_HOURLY_LIMIT: '101',
          LEFTOUT_REPORTING_GLOBAL_HOURLY_LIMIT: '100',
        }),
      ),
    ).toThrow('cannot exceed');
  });

  it('rejects unknown actor fields, duplicate identities, and reused credentials', () => {
    expect(() =>
      loadReportingServiceConfiguration(
        invitedEnvironment({
          LEFTOUT_REPORTING_ACTORS_JSON: JSON.stringify([
            {
              id: 'reviewer-alpha',
              role: 'reviewer',
              tokenSha256: digest(reviewerToken),
              displayName: 'A human name',
            },
          ]),
        }),
      ),
    ).toThrow('unknown field');
    expect(() =>
      loadReportingServiceConfiguration(
        invitedEnvironment({
          LEFTOUT_REPORTING_ACTORS_JSON: JSON.stringify([
            {
              id: 'reviewer-alpha',
              role: 'reviewer',
              tokenSha256: digest(reviewerToken),
            },
            {
              id: 'reviewer-alpha',
              role: 'publisher',
              tokenSha256: digest(publisherToken),
            },
          ]),
        }),
      ),
    ).toThrow('identifiers must be unique');
    expect(() =>
      loadReportingServiceConfiguration(
        invitedEnvironment({
          LEFTOUT_REPORTING_INTAKE_TOKEN_SHA256: digest(reviewerToken),
        }),
      ),
    ).toThrow('must be distinct');
  });

  it('loads a separately authenticated, externally configured feed signer', () => {
    const configuration = loadReportingServiceConfiguration(feedEnvironment());
    expect(configuration.gates.feed).toBe(true);
    expect(configuration.feedSigning).toMatchObject({
      keyId: 'feed.alpha',
      publicKeySpkiBase64: feedPublicKey.toString('base64'),
    });
    expect(configuration.feedSigning).not.toHaveProperty('privateKey');
    expect(authenticateReportingFeed(request(feedToken), configuration)).toBe(
      true,
    );
    expect(
      authenticateReportingFeed(request(publisherToken), configuration),
    ).toBe(false);
  });

  it('fails closed on incomplete, mismatched, disabled, or reused feed authority', () => {
    expect(() =>
      loadReportingServiceConfiguration(
        invitedEnvironment({
          LEFTOUT_REPORTING_FEED_TOKEN_SHA256: digest(feedToken),
        }),
      ),
    ).toThrow('require the feed gate');
    expect(() =>
      loadReportingServiceConfiguration(
        feedEnvironment({
          LEFTOUT_REPORTING_FEED_SIGNING_PUBLIC_KEY_SHA256: '0'.repeat(64),
        }),
      ),
    ).toThrow('does not match');
    expect(() =>
      loadReportingServiceConfiguration(
        feedEnvironment({
          LEFTOUT_REPORTING_FEED_TOKEN_SHA256: digest(reviewerToken),
        }),
      ),
    ).toThrow('must be distinct');
    const {
      LEFTOUT_REPORTING_FEED_SIGNING_PRIVATE_KEY_PKCS8_BASE64: _omitted,
      ...incomplete
    } = feedEnvironment();
    expect(() => loadReportingServiceConfiguration(incomplete)).toThrow(
      'private key',
    );
  });
});

describe('reporting service authentication', () => {
  const configuration = loadReportingServiceConfiguration(invitedEnvironment());

  it('authenticates only the exact invited-intake bearer', () => {
    expect(
      authenticateReportingInvitation(request(invitationToken), configuration),
    ).toBe(true);
    expect(
      authenticateReportingInvitation(request(reviewerToken), configuration),
    ).toBe(false);
    expect(authenticateReportingInvitation(request(), configuration)).toBe(
      false,
    );
  });

  it('keeps reviewer and publisher authority separate', () => {
    expect(
      authenticateReportingActor(
        request(reviewerToken),
        configuration,
        'reviewer',
      ),
    ).toMatchObject({ id: 'reviewer-alpha', role: 'reviewer' });
    expect(
      authenticateReportingActor(
        request(reviewerToken),
        configuration,
        'publisher',
      ),
    ).toBeNull();
    expect(
      authenticateReportingActor(
        request(publisherToken),
        configuration,
        'publisher',
      ),
    ).toMatchObject({ id: 'publisher-alpha', role: 'publisher' });
  });

  it('keeps lifecycle authority separate from review and publication', () => {
    const lifecycleConfiguration = loadReportingServiceConfiguration(
      lifecycleEnvironment(),
    );
    expect(
      authenticateReportingActor(
        request(custodianToken),
        lifecycleConfiguration,
        'custodian',
      ),
    ).toMatchObject({ id: 'custodian-alpha', role: 'custodian' });
    expect(
      authenticateReportingActor(
        request(reviewerToken),
        lifecycleConfiguration,
        'custodian',
      ),
    ).toBeNull();
    expect(
      authenticateReportingActor(
        request(custodianToken),
        lifecycleConfiguration,
        'publisher',
      ),
    ).toBeNull();
  });

  it('grants custodian authority for correction without enabling lifecycle', () => {
    const correctionConfiguration = loadReportingServiceConfiguration(
      correctionEnvironment(),
    );
    expect(
      authenticateReportingActor(
        request(custodianToken),
        correctionConfiguration,
        'custodian',
      ),
    ).toMatchObject({ id: 'custodian-alpha', role: 'custodian' });
    expect(correctionConfiguration.gates.lifecycle).toBe(false);
  });

  it('rejects malformed, short, whitespace-bearing, and unknown credentials', () => {
    for (const candidate of [
      request('short'),
      request(`${reviewerToken} ignored`),
      request('unknown-token-with-at-least-32-characters'),
      new Request('https://reports.example.test/action', {
        headers: { Authorization: `Basic ${reviewerToken}` },
      }),
    ]) {
      expect(
        authenticateReportingActor(candidate, configuration, 'reviewer'),
      ).toBeNull();
    }
  });

  it('grants nothing when the service is disabled', () => {
    const disabled = loadReportingServiceConfiguration({});
    expect(
      authenticateReportingInvitation(request(invitationToken), disabled),
    ).toBe(false);
    expect(
      authenticateReportingActor(request(reviewerToken), disabled, 'reviewer'),
    ).toBeNull();
    expect(authenticateReportingFeed(request(feedToken), disabled)).toBe(false);
  });
});
