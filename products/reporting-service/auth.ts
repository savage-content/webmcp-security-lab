import { createHash, timingSafeEqual } from 'node:crypto';

import type {
  ReportingActorConfiguration,
  ReportingActorRole,
  ReportingServiceConfiguration,
} from './config';

const MIN_TOKEN_LENGTH = 32;
const MAX_TOKEN_LENGTH = 512;
const SHA256_BYTES = 32;

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest();
}

function expectedDigest(value: string) {
  return Buffer.from(value, 'hex');
}

function containsForbiddenTokenCharacter(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

function bearerToken(request: Request) {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length);
  if (
    token.length < MIN_TOKEN_LENGTH ||
    token.length > MAX_TOKEN_LENGTH ||
    token !== token.trim() ||
    containsForbiddenTokenCharacter(token)
  ) {
    return null;
  }
  return token;
}

function tokenMatches(token: string, expectedSha256: string) {
  const actual = sha256(token);
  const expected = expectedDigest(expectedSha256);
  return expected.length === SHA256_BYTES && timingSafeEqual(actual, expected);
}

export function authenticateReportingInvitation(
  request: Request,
  configuration: Readonly<ReportingServiceConfiguration>,
) {
  if (
    configuration.mode !== 'invited' ||
    !configuration.gates.intake ||
    !configuration.intakeTokenSha256
  ) {
    return false;
  }
  const token = bearerToken(request);
  return token ? tokenMatches(token, configuration.intakeTokenSha256) : false;
}

export function authenticateReportingActor(
  request: Request,
  configuration: Readonly<ReportingServiceConfiguration>,
  requiredRole: ReportingActorRole,
): Readonly<ReportingActorConfiguration> | null {
  if (
    configuration.mode !== 'invited' ||
    !configuration.gates.moderation ||
    (requiredRole === 'publisher' && !configuration.gates.publication)
  ) {
    return null;
  }
  const token = bearerToken(request);
  if (!token) return null;

  let matched: Readonly<ReportingActorConfiguration> | null = null;
  for (const actor of configuration.actors) {
    const equal = tokenMatches(token, actor.tokenSha256);
    if (equal && actor.role === requiredRole) matched = actor;
  }
  return matched;
}

export function authenticateReportingFeed(
  request: Request,
  configuration: Readonly<ReportingServiceConfiguration>,
) {
  if (
    configuration.mode !== 'invited' ||
    !configuration.gates.feed ||
    !configuration.feedTokenSha256
  ) {
    return false;
  }
  const token = bearerToken(request);
  return token ? tokenMatches(token, configuration.feedTokenSha256) : false;
}
