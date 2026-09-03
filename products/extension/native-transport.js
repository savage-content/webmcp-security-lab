/* global chrome */

export const NATIVE_HOST_NAME = 'com.leftout.security.local_guard';
export const NATIVE_MESSAGE_SCHEMA = 'leftout.local-guard-native-message/1';
export const NATIVE_REQUEST_MAX_BYTES = 512 * 1024;
export const NATIVE_RESPONSE_MAX_BYTES = 1024 * 1024;

const REQUEST_ACTIONS = new Set([
  'pair',
  'poll',
  'result',
  'revoke',
  'report-link',
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function isPlainRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  if (!isPlainRecord(value)) return false;
  const compareKeys = (left, right) => left.localeCompare(right, 'en');
  const keys = Object.keys(value).toSorted(compareKeys);
  const sorted = [...expected].toSorted(compareKeys);
  return (
    keys.length === sorted.length &&
    keys.every((key, index) => key === sorted[index])
  );
}

function encodedSize(value) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error('Native message is not JSON serializable.');
  }
  if (!serialized) throw new Error('Native message is empty.');
  return new TextEncoder().encode(serialized).byteLength;
}

function pageIdentity(value, requireOriginOnly = false) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      return false;
    }
    if (requireOriginOnly) return url.origin === value && url.pathname === '/';
    return true;
  } catch {
    return false;
  }
}

function validatePayload(action, payload) {
  if (action === 'pair') {
    if (
      !hasExactKeys(payload, ['client_label', 'origin', 'page_url']) ||
      !pageIdentity(payload.origin, true) ||
      !pageIdentity(payload.page_url) ||
      new URL(payload.page_url).origin !== payload.origin ||
      typeof payload.client_label !== 'string' ||
      payload.client_label.length < 1 ||
      payload.client_label.length > 80
    ) {
      throw new Error(
        'Native pair request is outside the exact page boundary.',
      );
    }
    return;
  }
  if (action === 'result') {
    if (
      !hasExactKeys(payload, ['result', 'session_id']) ||
      !UUID_PATTERN.test(payload.session_id)
    ) {
      throw new Error(
        'Native result request is outside the exact session boundary.',
      );
    }
    return;
  }
  if (
    !hasExactKeys(payload, ['session_id']) ||
    !UUID_PATTERN.test(payload.session_id)
  ) {
    throw new Error('Native request is outside the exact session boundary.');
  }
}

function parseResponse(value, requestId) {
  if (!isPlainRecord(value) || value.requestId !== requestId) {
    throw new Error('Native host returned a mismatched response.');
  }
  if (encodedSize(value) > NATIVE_RESPONSE_MAX_BYTES) {
    throw new Error('Native host response exceeds one MiB.');
  }
  if (
    value.schemaVersion !== NATIVE_MESSAGE_SCHEMA ||
    typeof value.ok !== 'boolean' ||
    !Number.isInteger(value.status)
  ) {
    throw new Error('Native host returned an invalid response.');
  }
  if (value.ok === true) {
    if (
      !hasExactKeys(value, [
        'body',
        'ok',
        'requestId',
        'schemaVersion',
        'status',
      ]) ||
      ![200, 202, 204].includes(value.status)
    ) {
      throw new Error('Native host returned an invalid success response.');
    }
    return Object.freeze({ status: value.status, body: value.body });
  }
  if (
    !hasExactKeys(value, [
      'error',
      'ok',
      'requestId',
      'schemaVersion',
      'status',
    ]) ||
    value.status < 400 ||
    value.status > 599 ||
    typeof value.error !== 'string' ||
    value.error.length < 1 ||
    value.error.length > 300
  ) {
    throw new Error('Native host returned an invalid error response.');
  }
  throw new Error(`Native host rejected the request: ${value.error}`);
}

export function nativeTransportDeclared(runtime = chrome.runtime) {
  const permissions = runtime.getManifest?.().permissions;
  return Array.isArray(permissions) && permissions.includes('nativeMessaging');
}

export function createNativeBridgeClient({
  runtime = chrome.runtime,
  cryptoApi = crypto,
} = {}) {
  if (typeof runtime.sendNativeMessage !== 'function') {
    throw new Error('Chrome native messaging is unavailable.');
  }
  if (typeof cryptoApi.randomUUID !== 'function') {
    throw new Error('A secure native request identity source is unavailable.');
  }

  return Object.freeze({
    async request(action, payload) {
      if (!REQUEST_ACTIONS.has(action)) {
        throw new Error('Native bridge action is outside the closed policy.');
      }
      validatePayload(action, payload);
      const requestId = cryptoApi.randomUUID();
      const request = {
        schemaVersion: NATIVE_MESSAGE_SCHEMA,
        requestId,
        action,
        payload,
      };
      if (encodedSize(request) > NATIVE_REQUEST_MAX_BYTES) {
        throw new Error(
          'Native request exceeds the Local Guard byte boundary.',
        );
      }

      return new Promise((resolve, reject) => {
        runtime.sendNativeMessage(NATIVE_HOST_NAME, request, (response) => {
          const lastError = runtime.lastError;
          if (lastError) {
            reject(
              new Error('The identity-bound Local Guard host is unavailable.'),
            );
            return;
          }
          try {
            resolve(parseResponse(response, requestId));
          } catch (error) {
            reject(error);
          }
        });
      });
    },
  });
}
