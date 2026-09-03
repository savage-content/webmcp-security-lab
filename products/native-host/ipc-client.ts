import { createConnection, type Socket } from 'node:net';

import {
  createLocalGuardIpcRequest,
  decodeLocalGuardIpcFrame,
  encodeLocalGuardIpcFrame,
  LOCAL_GUARD_IPC_MAX_BYTES,
  LocalGuardIpcFrameDecoder,
  verifyLocalGuardIpcResponse,
} from './ipc-protocol';
import {
  type NativeBridgeRequest,
  type NativeBridgeResponse,
} from './native-messaging';

export interface NativeHostIpcClientOptions {
  pipePath: string;
  secret: Uint8Array;
  timeoutMs?: number;
  now?: () => number;
  nonce?: () => string;
  roundTrip?: (frame: Uint8Array) => Promise<Uint8Array>;
}

function parseTimeout(value: number | undefined) {
  const timeout = value ?? 3000;
  if (!Number.isSafeInteger(timeout) || timeout < 100 || timeout > 10_000) {
    throw new Error('Local Guard IPC timeout must be 100 to 10000 ms.');
  }
  return timeout;
}

function roundTripNamedPipe(
  pipePath: string,
  frame: Uint8Array,
  timeoutMs: number,
) {
  return new Promise<Uint8Array>((resolve, reject) => {
    let settled = false;
    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    const socket: Socket = createConnection(pipePath);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(Buffer.concat(chunks));
    };
    socket.setTimeout(timeoutMs, () =>
      finish(new Error('Local Guard IPC response timed out.')),
    );
    socket.once('error', () =>
      finish(new Error('Local Guard connector IPC is unavailable.')),
    );
    socket.once('connect', () => {
      socket.write(frame);
    });
    socket.on('data', (chunk) => {
      receivedBytes += chunk.byteLength;
      if (receivedBytes > LOCAL_GUARD_IPC_MAX_BYTES + 4) {
        finish(
          new Error('Local Guard IPC response exceeds its byte boundary.'),
        );
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    socket.once('end', () => finish());
    socket.once('close', () => {
      if (!settled)
        finish(new Error('Local Guard IPC closed without a response.'));
    });
  });
}

export function createNativeHostIpcClient(options: NativeHostIpcClientOptions) {
  const timeoutMs = parseTimeout(options.timeoutMs);
  const now = options.now ?? Date.now;

  return Object.freeze({
    async request(request: NativeBridgeRequest): Promise<NativeBridgeResponse> {
      const issuedAt = now();
      const envelope = createLocalGuardIpcRequest(request, options.secret, {
        now: issuedAt,
        ...(options.nonce ? { nonce: options.nonce() } : {}),
      });
      const frame = encodeLocalGuardIpcFrame(envelope);
      const raw = options.roundTrip
        ? await options.roundTrip(frame)
        : await roundTripNamedPipe(options.pipePath, frame, timeoutMs);
      const decoder = new LocalGuardIpcFrameDecoder();
      const frames = decoder.push(raw);
      decoder.finish();
      if (frames.length !== 1) {
        throw new Error('Local Guard IPC returned an ambiguous response.');
      }
      const verified = verifyLocalGuardIpcResponse(
        decodeLocalGuardIpcFrame(frames[0]),
        envelope,
        options.secret,
        { now: now() },
      );
      return verified.message;
    },

    async handle(request: NativeBridgeRequest) {
      const response = await this.request(request);
      if (!response.ok) {
        throw new Error(
          `Connector rejected the native request: ${response.error}`,
        );
      }
      return { status: response.status, body: response.body };
    },
  });
}
