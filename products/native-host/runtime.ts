import type { Readable, Writable } from 'node:stream';

import {
  decodeNativeBridgeRequest,
  encodeNativeMessage,
  errorNativeBridgeResponse,
  NativeMessageDecoder,
  type NativeBridgeRequest,
  type NativeBridgeResponse,
  successNativeBridgeResponse,
  verifyNativeCallerOrigin,
} from './native-messaging';

export interface NativeHostRuntimeOptions {
  callerOrigin: string | undefined;
  extensionId: string;
  input: Readable;
  output: Writable;
  handle(request: NativeBridgeRequest): Promise<{
    status: 200 | 202 | 204;
    body: unknown;
  }>;
}

function boundedError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Native host error.';
  return (
    message.replaceAll(/[\r\n\t]+/gu, ' ').slice(0, 300) || 'Native host error.'
  );
}

async function writeFrame(output: Writable, response: NativeBridgeResponse) {
  const frame = encodeNativeMessage(response);
  await new Promise<void>((resolve, reject) => {
    output.write(frame, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export async function runNativeHostRuntime(options: NativeHostRuntimeOptions) {
  verifyNativeCallerOrigin(options.callerOrigin, options.extensionId);
  const decoder = new NativeMessageDecoder();
  let chain = Promise.resolve();
  let firstFailure: unknown;

  for await (const chunk of options.input) {
    const frames = decoder.push(chunk as Uint8Array);
    for (const frame of frames) {
      chain = chain.then(async () => {
        let request: NativeBridgeRequest;
        try {
          request = decodeNativeBridgeRequest(frame);
        } catch (error) {
          firstFailure ??= error;
          throw error;
        }
        try {
          const result = await options.handle(request);
          await writeFrame(
            options.output,
            successNativeBridgeResponse(
              request.requestId,
              result.status,
              result.body,
            ),
          );
        } catch (error) {
          await writeFrame(
            options.output,
            errorNativeBridgeResponse(
              request.requestId,
              500,
              boundedError(error),
            ),
          );
        }
      });
    }
  }
  decoder.finish();
  await chain;
  if (firstFailure) throw firstFailure;
}
