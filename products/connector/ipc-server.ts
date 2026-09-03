import { createServer, type Server, type Socket } from 'node:net';

import {
  createLocalGuardIpcResponse,
  decodeLocalGuardIpcFrame,
  encodeLocalGuardIpcFrame,
  LocalGuardIpcFrameDecoder,
  LocalGuardIpcReplayWindow,
  validateLocalGuardIpcSecret,
  verifyLocalGuardIpcRequest,
} from '../native-host/ipc-protocol';
import {
  errorNativeBridgeResponse,
  type NativeBridgeRequest,
  type NativeBridgeResponse,
} from '../native-host/native-messaging';

export const LOCAL_GUARD_WINDOWS_PIPE_PREFIX =
  '\\\\.\\pipe\\leftout-local-guard-';

export interface ConnectorIpcServerOptions {
  pipePath: string;
  secret: Uint8Array;
  handle(request: NativeBridgeRequest): Promise<NativeBridgeResponse>;
  now?: () => number;
  replayWindow?: LocalGuardIpcReplayWindow;
  serverFactory?: (handler: (socket: Socket) => void) => Server;
}

export function parseLocalGuardWindowsPipePath(value: string) {
  const escaped = LOCAL_GUARD_WINDOWS_PIPE_PREFIX.replaceAll('\\', '\\\\');
  const pattern = new RegExp(`^${escaped}[a-z0-9][a-z0-9-]{7,63}$`, 'u');
  if (!pattern.test(value)) {
    throw new Error(
      'Local Guard IPC path is outside the install-owned namespace.',
    );
  }
  return value;
}

function boundedError(error: unknown) {
  const message =
    error instanceof Error ? error.message : 'Connector IPC error.';
  return (
    message.replaceAll(/[\r\n\t]+/gu, ' ').slice(0, 300) ||
    'Connector IPC error.'
  );
}

function listen(server: Server, pipePath: string) {
  return new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(pipePath);
  });
}

function close(server: Server) {
  if (!server.listening) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

export async function startConnectorIpcServer(
  options: ConnectorIpcServerOptions,
) {
  const pipePath = parseLocalGuardWindowsPipePath(options.pipePath);
  validateLocalGuardIpcSecret(options.secret);
  const now = options.now ?? Date.now;
  const replayWindow = options.replayWindow ?? new LocalGuardIpcReplayWindow();
  const serverFactory = options.serverFactory ?? createServer;
  const sockets = new Set<Socket>();

  const server = serverFactory((socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    const decoder = new LocalGuardIpcFrameDecoder();
    let handled = false;

    socket.on('data', (chunk) => {
      if (handled) {
        socket.destroy();
        return;
      }
      let frames: Buffer[];
      try {
        frames = decoder.push(chunk);
      } catch {
        socket.destroy();
        return;
      }
      if (frames.length === 0) return;
      if (frames.length !== 1) {
        socket.destroy();
        return;
      }
      handled = true;
      let verified;
      try {
        verified = verifyLocalGuardIpcRequest(
          decodeLocalGuardIpcFrame(frames[0]),
          options.secret,
          replayWindow,
          { now: now() },
        );
      } catch {
        socket.destroy();
        return;
      }
      void Promise.resolve(options.handle(verified.message))
        .catch((error: unknown) =>
          errorNativeBridgeResponse(
            verified.message.requestId,
            500,
            boundedError(error),
          ),
        )
        .then((response) => {
          const envelope = createLocalGuardIpcResponse(
            verified,
            response,
            options.secret,
            { now: now() },
          );
          socket.end(encodeLocalGuardIpcFrame(envelope));
        })
        .catch(() => socket.destroy());
    });
    socket.once('end', () => {
      try {
        decoder.finish();
      } catch {
        socket.destroy();
      }
    });
  });

  await listen(server, pipePath);
  return Object.freeze({
    pipePath,
    async close() {
      for (const socket of sockets) socket.destroy();
      await close(server);
    },
  });
}
