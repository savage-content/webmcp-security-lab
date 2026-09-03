import { endianness } from 'node:os';

import { z } from 'zod';

export const NATIVE_HOST_NAME = 'com.leftout.security.local_guard';
export const NATIVE_MESSAGE_SCHEMA = 'leftout.local-guard-native-message/1';
export const CHROME_NATIVE_OUTBOUND_MAX_BYTES = 1024 * 1024;
export const CHROME_NATIVE_INBOUND_MAX_BYTES = 64 * 1024 * 1024;
export const LOCAL_GUARD_REQUEST_MAX_BYTES = 512 * 1024;

const extensionIdSchema = z.string().regex(/^[a-p]{32}$/u);
const uuidSchema = z.uuid();
const exactPageUrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  return (
    ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
  );
});

const pairRequestSchema = z
  .object({
    origin: z.url().refine((value) => {
      const url = new URL(value);
      return (
        ['http:', 'https:'].includes(url.protocol) &&
        url.origin === value &&
        url.pathname === '/'
      );
    }),
    page_url: exactPageUrlSchema,
    client_label: z.string().min(1).max(80),
  })
  .strict()
  .refine((value) => new URL(value.page_url).origin === value.origin, {
    message: 'Native pair request page URL must match the exact origin.',
    path: ['page_url'],
  });

const sessionRequestSchema = z.object({ session_id: uuidSchema }).strict();

const resultRequestSchema = z
  .object({
    session_id: uuidSchema,
    result: z.unknown(),
  })
  .strict();

const requestSchema = z.discriminatedUnion('action', [
  z
    .object({
      schemaVersion: z.literal(NATIVE_MESSAGE_SCHEMA),
      requestId: uuidSchema,
      action: z.literal('pair'),
      payload: pairRequestSchema,
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(NATIVE_MESSAGE_SCHEMA),
      requestId: uuidSchema,
      action: z.literal('poll'),
      payload: sessionRequestSchema,
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(NATIVE_MESSAGE_SCHEMA),
      requestId: uuidSchema,
      action: z.literal('result'),
      payload: resultRequestSchema,
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(NATIVE_MESSAGE_SCHEMA),
      requestId: uuidSchema,
      action: z.literal('revoke'),
      payload: sessionRequestSchema,
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(NATIVE_MESSAGE_SCHEMA),
      requestId: uuidSchema,
      action: z.literal('report-link'),
      payload: sessionRequestSchema,
    })
    .strict(),
]);

const successResponseSchema = z
  .object({
    schemaVersion: z.literal(NATIVE_MESSAGE_SCHEMA),
    requestId: uuidSchema,
    ok: z.literal(true),
    status: z.union([z.literal(200), z.literal(202), z.literal(204)]),
    body: z.unknown(),
  })
  .strict();

const errorResponseSchema = z
  .object({
    schemaVersion: z.literal(NATIVE_MESSAGE_SCHEMA),
    requestId: uuidSchema,
    ok: z.literal(false),
    status: z.number().int().min(400).max(599),
    error: z.string().min(1).max(300),
  })
  .strict();

export type NativeBridgeRequest = z.infer<typeof requestSchema>;
export type NativeBridgeResponse =
  | z.infer<typeof successResponseSchema>
  | z.infer<typeof errorResponseSchema>;
export type NativeByteOrder = 'BE' | 'LE';

function currentByteOrder(): NativeByteOrder {
  return endianness();
}

function readLength(header: Buffer, byteOrder: NativeByteOrder) {
  return new DataView(
    header.buffer,
    header.byteOffset,
    header.byteLength,
  ).getUint32(0, byteOrder === 'LE');
}

function writeLength(
  header: Buffer,
  length: number,
  byteOrder: NativeByteOrder,
) {
  new DataView(header.buffer, header.byteOffset, header.byteLength).setUint32(
    0,
    length,
    byteOrder === 'LE',
  );
}

function encodedJson(value: unknown, maxBytes: number, label: string) {
  let encoded: Buffer;
  try {
    encoded = Buffer.from(JSON.stringify(value), 'utf8');
  } catch {
    throw new Error(`${label} is not JSON serializable.`);
  }
  if (encoded.byteLength === 0 || encoded.byteLength > maxBytes) {
    throw new Error(`${label} exceeds its byte boundary.`);
  }
  return encoded;
}

function decodedJson(frame: Uint8Array, label: string) {
  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(frame),
    ) as unknown;
  } catch {
    throw new Error(`${label} is not valid UTF-8 JSON.`);
  }
}

export function parseExtensionId(value: string) {
  return extensionIdSchema.parse(value);
}

export function expectedExtensionOrigin(extensionId: string) {
  return `chrome-extension://${parseExtensionId(extensionId)}/`;
}

export function verifyNativeCallerOrigin(
  callerOrigin: string | undefined,
  extensionId: string,
) {
  const expected = expectedExtensionOrigin(extensionId);
  if (callerOrigin !== expected) {
    throw new Error('Native host caller origin does not match the release ID.');
  }
  return expected;
}

export function parseNativeBridgeRequest(value: unknown) {
  const request = requestSchema.parse(value);
  encodedJson(request, LOCAL_GUARD_REQUEST_MAX_BYTES, 'Native request');
  return request;
}

export function parseNativeBridgeResponse(
  value: unknown,
  expectedRequestId?: string,
) {
  const response = z
    .union([successResponseSchema, errorResponseSchema])
    .parse(value);
  if (expectedRequestId && response.requestId !== expectedRequestId) {
    throw new Error('Native response does not match the request identity.');
  }
  encodedJson(response, CHROME_NATIVE_OUTBOUND_MAX_BYTES, 'Native response');
  return response;
}

export function successNativeBridgeResponse(
  requestId: string,
  status: 200 | 202 | 204,
  body: unknown,
) {
  return parseNativeBridgeResponse({
    schemaVersion: NATIVE_MESSAGE_SCHEMA,
    requestId,
    ok: true,
    status,
    body,
  });
}

export function errorNativeBridgeResponse(
  requestId: string,
  status: number,
  error: string,
) {
  return parseNativeBridgeResponse({
    schemaVersion: NATIVE_MESSAGE_SCHEMA,
    requestId,
    ok: false,
    status,
    error,
  });
}

export function encodeNativeMessage(
  value: unknown,
  options: {
    byteOrder?: NativeByteOrder;
    maxBytes?: number;
    label?: string;
  } = {},
) {
  const body = encodedJson(
    value,
    options.maxBytes ?? CHROME_NATIVE_OUTBOUND_MAX_BYTES,
    options.label ?? 'Native message',
  );
  const header = Buffer.alloc(4);
  writeLength(header, body.byteLength, options.byteOrder ?? currentByteOrder());
  return Buffer.concat([header, body]);
}

export class NativeMessageDecoder {
  readonly #byteOrder: NativeByteOrder;
  readonly #maxBytes: number;
  #buffer = Buffer.alloc(0);

  constructor(
    options: {
      byteOrder?: NativeByteOrder;
      maxBytes?: number;
    } = {},
  ) {
    this.#byteOrder = options.byteOrder ?? currentByteOrder();
    this.#maxBytes = options.maxBytes ?? CHROME_NATIVE_INBOUND_MAX_BYTES;
  }

  push(chunk: Uint8Array) {
    if (chunk.byteLength === 0) return [];
    this.#buffer = Buffer.concat([this.#buffer, Buffer.from(chunk)]);
    const frames: Buffer[] = [];
    while (this.#buffer.byteLength >= 4) {
      const length = readLength(this.#buffer.subarray(0, 4), this.#byteOrder);
      if (length === 0 || length > this.#maxBytes) {
        this.#buffer = Buffer.alloc(0);
        throw new Error(
          'Native message length is outside the allowed boundary.',
        );
      }
      if (this.#buffer.byteLength < length + 4) break;
      frames.push(Buffer.from(this.#buffer.subarray(4, length + 4)));
      this.#buffer = Buffer.from(this.#buffer.subarray(length + 4));
    }
    if (this.#buffer.byteLength > this.#maxBytes + 4) {
      this.#buffer = Buffer.alloc(0);
      throw new Error('Buffered native message exceeds the allowed boundary.');
    }
    return frames;
  }

  finish() {
    if (this.#buffer.byteLength !== 0) {
      this.#buffer = Buffer.alloc(0);
      throw new Error('Native message stream ended mid-frame.');
    }
  }
}

export function decodeNativeBridgeRequest(frame: Uint8Array) {
  return parseNativeBridgeRequest(decodedJson(frame, 'Native request'));
}

export function decodeNativeBridgeResponse(
  frame: Uint8Array,
  expectedRequestId?: string,
) {
  return parseNativeBridgeResponse(
    decodedJson(frame, 'Native response'),
    expectedRequestId,
  );
}
