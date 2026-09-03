import { randomBytes, randomUUID } from 'node:crypto';
import {
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
  type FileHandle,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createServer as createViteServer, type ViteDevServer } from 'vite';

import {
  startCapabilityConnector,
  type CapabilityConnectorOptions,
} from '../products/connector/server';

export const DESKTOP_ALPHA_HOST = '127.0.0.1';
export const DESKTOP_ALPHA_SITE_PORT = 3001;
export const DESKTOP_ALPHA_MCP_PORT = 8787;
export const DESKTOP_ALPHA_BRIDGE_PORTS = [8788, 48_788] as const;
export const DESKTOP_ALPHA_STOP_POLL_MS = 250;

type AlphaState = 'starting' | 'ready' | 'stopping' | 'stopped' | 'failed';

export interface DesktopAlphaStatus {
  schemaVersion: 'leftout.desktop-alpha-status/1';
  state: AlphaState;
  runId: string;
  pid: number;
  startedAt: string;
  updatedAt: string;
  site: { url: string };
  connector: {
    healthUrl: string;
    mcpEndpoint: string;
    reportEndpoint: string;
    setupEndpoint: string;
    bridgeEndpoint: string;
    authentication: 'required';
  };
  extension: { unpackedPath: string };
  operator: { mode: 'foreground' | 'persistent' };
  error?: string;
}

export interface DesktopAlphaStopRequest {
  schemaVersion: 'leftout.desktop-alpha-stop/1';
  runId: string;
  requestedAt: string;
}

function freshSecret() {
  return Buffer.from(randomBytes(32)).toString('base64url');
}

function eightDigitPairCode() {
  const value = Buffer.from(randomBytes(4)).readUInt32BE(0);
  return (10_000_000 + (value % 90_000_000)).toString();
}

export function defaultDesktopAlphaRuntimeDirectory() {
  const base = process.env.LOCALAPPDATA ?? join(homedir(), '.local', 'share');
  return join(base, 'LeftOut Security', 'WebMCP Alpha');
}

function safeFailureMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/[\r\n\t]+/gu, ' ')
    .slice(0, 300);
}

function isAddressInUse(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'EADDRINUSE'
  );
}

export function desktopAlphaProcessIsRunning(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'EPERM'
    );
  }
}

export function createDesktopAlphaStatus(input: {
  state: AlphaState;
  runId: string;
  pid: number;
  startedAt: string;
  updatedAt: string;
  siteUrl: string;
  mcpPort: number;
  bridgePort: number;
  extensionPath: string;
  operatorMode?: 'foreground' | 'persistent';
  error?: string;
}): DesktopAlphaStatus {
  const connectorBase = `http://${DESKTOP_ALPHA_HOST}:${input.mcpPort}`;
  return {
    schemaVersion: 'leftout.desktop-alpha-status/1',
    state: input.state,
    runId: input.runId,
    pid: input.pid,
    startedAt: input.startedAt,
    updatedAt: input.updatedAt,
    site: { url: input.siteUrl },
    connector: {
      healthUrl: `${connectorBase}/`,
      mcpEndpoint: `${connectorBase}/mcp`,
      reportEndpoint: `${connectorBase}/receipts`,
      setupEndpoint: `${connectorBase}/setup`,
      bridgeEndpoint: `http://${DESKTOP_ALPHA_HOST}:${input.bridgePort}`,
      authentication: 'required',
    },
    extension: { unpackedPath: input.extensionPath },
    operator: { mode: input.operatorMode ?? 'foreground' },
    ...(input.error ? { error: input.error } : {}),
  };
}

async function writeStatus(path: string, status: DesktopAlphaStatus) {
  const temporary = `${path}.${status.runId}.tmp`;
  await writeFile(temporary, `${JSON.stringify(status, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(temporary, path);
}

export interface DesktopAlphaOwnedLock {
  handle: FileHandle;
  path: string;
  runId: string;
  pid: number;
}

async function createDesktopAlphaOwnedLock(path: string, runId: string) {
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify({ runId, pid: process.pid })}\n`);
    return { handle, path, runId, pid: process.pid };
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(path).catch(() => undefined);
    throw error;
  }
}

export async function acquireDesktopAlphaOwnedLock(
  path: string,
  runId: string,
  description = 'Desktop alpha',
): Promise<DesktopAlphaOwnedLock> {
  await mkdir(dirname(path), { recursive: true });
  try {
    return await createDesktopAlphaOwnedLock(path, runId);
  } catch (error) {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('code' in error) ||
      error.code !== 'EEXIST'
    ) {
      throw error;
    }
  }

  let stalePid = 0;
  try {
    const current = JSON.parse(await readFile(path, 'utf8')) as {
      pid?: unknown;
    };
    stalePid = typeof current.pid === 'number' ? current.pid : 0;
  } catch {
    stalePid = 0;
  }
  if (desktopAlphaProcessIsRunning(stalePid)) {
    throw new Error(`${description} is already active as process ${stalePid}.`);
  }
  await unlink(path);
  return createDesktopAlphaOwnedLock(path, runId);
}

export async function releaseDesktopAlphaOwnedLock(
  lock: DesktopAlphaOwnedLock | undefined,
) {
  if (!lock) return false;
  let owned = false;
  let heldStat: Awaited<ReturnType<FileHandle['stat']>> | undefined;
  try {
    heldStat = await lock.handle.stat();
  } finally {
    await lock.handle.close().catch(() => undefined);
  }
  try {
    const [record, pathStat] = await Promise.all([
      readFile(lock.path, 'utf8').then(
        (value) => JSON.parse(value) as { runId?: unknown; pid?: unknown },
      ),
      stat(lock.path),
    ]);
    owned =
      record.runId === lock.runId &&
      record.pid === lock.pid &&
      heldStat !== undefined &&
      heldStat.dev === pathStat.dev &&
      heldStat.ino === pathStat.ino;
    if (owned) await unlink(lock.path);
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      owned = false;
    } else {
      throw error;
    }
  }
  return owned;
}

type StartedConnector = Awaited<ReturnType<typeof startCapabilityConnector>>;

export async function startConnectorWithFallback(
  options: Omit<CapabilityConnectorOptions, 'bridgePort'>,
  starter: typeof startCapabilityConnector = startCapabilityConnector,
) {
  try {
    return await starter({
      ...options,
      bridgePort: DESKTOP_ALPHA_BRIDGE_PORTS[0],
    });
  } catch (error) {
    if (!isAddressInUse(error)) throw error;
    return starter({ ...options, bridgePort: DESKTOP_ALPHA_BRIDGE_PORTS[1] });
  }
}

export async function startDesktopAlpha(
  options: {
    runtimeDirectory?: string;
    runId?: string;
    operatorMode?: 'foreground' | 'persistent';
    allowBridgeFallback?: boolean;
    log?: (message: string) => void;
    startSite?: () => Promise<ViteDevServer>;
    startConnector?: (
      options: Omit<CapabilityConnectorOptions, 'bridgePort'>,
    ) => Promise<StartedConnector>;
  } = {},
) {
  const log = options.log ?? console.log;
  const runId = options.runId ?? randomUUID();
  const startedAt = new Date().toISOString();
  const runtimeDirectory =
    options.runtimeDirectory ?? defaultDesktopAlphaRuntimeDirectory();
  const lockPath = join(runtimeDirectory, 'desktop-alpha.lock');
  const statusPath = join(runtimeDirectory, 'status.json');
  const ledgerPath = join(runtimeDirectory, 'connector-receipts.jsonl');
  const extensionPath = resolve('products/extension');
  const siteUrl = `http://${DESKTOP_ALPHA_HOST}:${DESKTOP_ALPHA_SITE_PORT}`;
  let runLock: DesktopAlphaOwnedLock | undefined;
  let site: ViteDevServer | undefined;
  let connector: StartedConnector | undefined;
  let closed = false;

  const status = (state: AlphaState, error?: string) =>
    createDesktopAlphaStatus({
      state,
      runId,
      pid: process.pid,
      startedAt,
      updatedAt: new Date().toISOString(),
      siteUrl,
      mcpPort: connector?.mcpPort ?? DESKTOP_ALPHA_MCP_PORT,
      bridgePort: connector?.bridgePort ?? DESKTOP_ALPHA_BRIDGE_PORTS[0],
      extensionPath,
      operatorMode: options.operatorMode,
      error,
    });

  const shutdown = async (
    state: 'stopped' | 'failed' = 'stopped',
    error?: unknown,
  ) => {
    if (closed || !runLock) return;
    closed = true;
    await writeStatus(statusPath, status('stopping')).catch(() => undefined);
    await connector?.close().catch(() => undefined);
    await site?.close().catch(() => undefined);
    await writeStatus(
      statusPath,
      status(
        state,
        error === undefined ? undefined : safeFailureMessage(error),
      ),
    ).catch(() => undefined);
    await releaseDesktopAlphaOwnedLock(runLock).catch(() => undefined);
  };

  try {
    runLock = await acquireDesktopAlphaOwnedLock(lockPath, runId);
    await writeStatus(statusPath, status('starting'));
    site = options.startSite
      ? await options.startSite()
      : await createViteServer({
          clearScreen: false,
          server: {
            host: DESKTOP_ALPHA_HOST,
            port: DESKTOP_ALPHA_SITE_PORT,
            strictPort: true,
          },
        });
    if (!options.startSite) await site.listen();

    const connectorOptions: Omit<CapabilityConnectorOptions, 'bridgePort'> = {
      instanceId: runId,
      mcpPort: DESKTOP_ALPHA_MCP_PORT,
      publicHost: DESKTOP_ALPHA_HOST,
      bridgeHost: DESKTOP_ALPHA_HOST,
      allowedOrigins: [siteUrl],
      accessToken: freshSecret(),
      pairCode: eightDigitPairCode(),
      ledgerPath,
      setup: { siteUrl, extensionPath },
      log: (message) => {
        if (message.startsWith('Next one-time browser pairing code:'))
          log(message);
      },
    };
    connector = options.startConnector
      ? await options.startConnector(connectorOptions)
      : options.allowBridgeFallback === false
        ? await startCapabilityConnector({
            ...connectorOptions,
            bridgePort: DESKTOP_ALPHA_BRIDGE_PORTS[0],
          })
        : await startConnectorWithFallback(connectorOptions);

    await writeStatus(statusPath, status('ready'));
    const reportLaunch = connector.issueReportLaunchTicket();
    const setupLaunch = connector.issueSetupLaunchTicket();
    log('Left Out WebMCP desktop alpha is ready.');
    log(`Learning range: ${siteUrl}`);
    log(`Unpacked extension: ${extensionPath}`);
    log(`One-time browser pairing code: ${connector.pairCode}`);
    log(
      `MCP connector: http://${DESKTOP_ALPHA_HOST}:${connector.mcpPort}/mcp?access_token=${connector.accessToken}`,
    );
    log(`Local setup center (one use): ${setupLaunch.url}`);
    log(`Verified receipts (one use): ${reportLaunch.url}`);
    log(`Non-secret runtime status: ${statusPath}`);

    return {
      connector,
      site,
      statusPath,
      shutdown,
    };
  } catch (error) {
    if (runLock) await shutdown('failed', error);
    throw error;
  }
}

export function isDesktopAlphaStopRequest(
  value: unknown,
): value is DesktopAlphaStopRequest {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.schemaVersion === 'leftout.desktop-alpha-stop/1' &&
    typeof candidate.runId === 'string' &&
    candidate.runId.length > 0 &&
    typeof candidate.requestedAt === 'string' &&
    Number.isFinite(Date.parse(candidate.requestedAt))
  );
}

export function watchForDesktopAlphaStop(input: {
  path: string;
  runId: string;
  stop: () => Promise<void>;
  pollIntervalMs?: number;
  onError?: (error: unknown) => void;
}) {
  let checking = false;
  let closed = false;

  const check = async () => {
    if (checking || closed) return;
    checking = true;
    try {
      const request = JSON.parse(await readFile(input.path, 'utf8')) as unknown;
      if (!isDesktopAlphaStopRequest(request) || request.runId !== input.runId)
        return;
      closed = true;
      clearInterval(timer);
      await input.stop();
    } catch (error) {
      if (
        typeof error !== 'object' ||
        error === null ||
        !('code' in error) ||
        error.code !== 'ENOENT'
      ) {
        input.onError?.(error);
      }
    } finally {
      checking = false;
    }
  };

  const timer = setInterval(
    () => void check(),
    input.pollIntervalMs ?? DESKTOP_ALPHA_STOP_POLL_MS,
  );

  return {
    close() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
    },
    check,
  };
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  const persistent = process.env.LEFTOUT_ALPHA_PERSISTENT === '1';
  const runtimeDirectory =
    process.env.LEFTOUT_ALPHA_RUNTIME_DIRECTORY ??
    defaultDesktopAlphaRuntimeDirectory();
  const desktop = await startDesktopAlpha({
    runtimeDirectory,
    runId: process.env.LEFTOUT_ALPHA_RUN_ID,
    operatorMode: persistent ? 'persistent' : 'foreground',
    allowBridgeFallback: !persistent,
  });
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await desktop.shutdown();
    process.exit(0);
  };
  const stopWatcher = persistent
    ? watchForDesktopAlphaStop({
        path: join(runtimeDirectory, 'stop-request.json'),
        runId: process.env.LEFTOUT_ALPHA_RUN_ID ?? '',
        stop,
        onError: (error) =>
          console.error(
            `Desktop alpha stop watcher failed: ${safeFailureMessage(error)}`,
          ),
      })
    : undefined;
  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());
  process.once('exit', () => stopWatcher?.close());
}
