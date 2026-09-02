import { randomUUID } from 'node:crypto';
import { closeSync, openSync } from 'node:fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, type SpawnOptions } from 'node:child_process';

import {
  acquireDesktopAlphaOwnedLock,
  defaultDesktopAlphaRuntimeDirectory,
  desktopAlphaProcessIsRunning,
  releaseDesktopAlphaOwnedLock,
  type DesktopAlphaStatus,
  type DesktopAlphaStopRequest,
} from './desktop-alpha.mts';

export const DESKTOP_ALPHA_START_TIMEOUT_MS = 120_000;
export const DESKTOP_ALPHA_STOP_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 100;
const PROGRESS_INTERVAL_MS = 10_000;
const HEALTH_TIMEOUT_MS = 2_000;

export interface DesktopAlphaOperatorRecord {
  schemaVersion: 'leftout.desktop-alpha-operator/1';
  runId: string;
  pid: number;
  launchedAt: string;
  mode: 'persistent';
  logPath: string;
}

export interface DesktopAlphaOperatorPaths {
  runtimeDirectory: string;
  statusPath: string;
  recordPath: string;
  launchLockPath: string;
  logPath: string;
  stopRequestPath: string;
}

export function desktopAlphaOperatorPaths(
  runtimeDirectory = defaultDesktopAlphaRuntimeDirectory(),
): DesktopAlphaOperatorPaths {
  return {
    runtimeDirectory,
    statusPath: join(runtimeDirectory, 'status.json'),
    recordPath: join(runtimeDirectory, 'operator.json'),
    launchLockPath: join(runtimeDirectory, 'operator-start.lock'),
    logPath: join(runtimeDirectory, 'operator.log'),
    stopRequestPath: join(runtimeDirectory, 'stop-request.json'),
  };
}

function persistentWorkerEnvironment(input: {
  inheritedEnvironment?: Record<string, string | undefined>;
  runtimeDirectory: string;
  runId: string;
}) {
  const inheritedNodeEnvironment = input.inheritedEnvironment?.NODE_ENV;
  const nodeEnvironment =
    inheritedNodeEnvironment === 'production' ||
    inheritedNodeEnvironment === 'test'
      ? inheritedNodeEnvironment
      : 'development';
  const environment: NodeJS.ProcessEnv = {
    ...input.inheritedEnvironment,
    NODE_ENV: nodeEnvironment,
    LEFTOUT_ALPHA_PERSISTENT: '1',
    LEFTOUT_ALPHA_RUN_ID: input.runId,
    LEFTOUT_ALPHA_RUNTIME_DIRECTORY: input.runtimeDirectory,
  };
  return environment;
}

export function createDesktopAlphaWorkerLaunch(input: {
  nodePath: string;
  tsxImportSpecifier: string;
  workerPath: string;
  projectDirectory: string;
  runtimeDirectory: string;
  runId: string;
  logFileDescriptor: number;
  inheritedEnvironment?: Record<string, string | undefined>;
}) {
  const environment = persistentWorkerEnvironment(input);
  const options: SpawnOptions = {
    cwd: input.projectDirectory,
    detached: true,
    windowsHide: true,
    shell: false,
    stdio: ['ignore', input.logFileDescriptor, input.logFileDescriptor],
    env: environment,
  };
  return {
    command: input.nodePath,
    args: ['--import', input.tsxImportSpecifier, input.workerPath],
    options,
  };
}

async function writePrivateJson(path: string, value: unknown, runId: string) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${runId}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(temporary, path);
}

async function readJsonIfPresent<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return undefined;
    }
    return undefined;
  }
}

function delay(milliseconds: number) {
  return new Promise<void>((resolveDelay) =>
    setTimeout(resolveDelay, milliseconds),
  );
}

function isCurrentStatus(
  status: DesktopAlphaStatus | undefined,
  runId: string,
) {
  return status?.runId === runId;
}

export async function handoffDesktopAlphaOperatorPid(input: {
  recordPath: string;
  runId: string;
  expectedPid: number;
  workerPid: number;
}) {
  if (!Number.isInteger(input.workerPid) || input.workerPid <= 0) {
    throw new Error('Desktop alpha status returned an invalid worker PID.');
  }
  if (input.workerPid === input.expectedPid) return input.workerPid;
  const record = await readJsonIfPresent<DesktopAlphaOperatorRecord>(
    input.recordPath,
  );
  if (
    record?.runId !== input.runId ||
    record.pid !== input.expectedPid ||
    record.mode !== 'persistent'
  ) {
    throw new Error('Desktop alpha PID handoff metadata did not match.');
  }
  await writePrivateJson(
    input.recordPath,
    { ...record, pid: input.workerPid },
    input.runId,
  );
  return input.workerPid;
}

export async function writeDesktopAlphaStopRequest(
  path: string,
  runId: string,
  requestedAt = new Date().toISOString(),
) {
  const request: DesktopAlphaStopRequest = {
    schemaVersion: 'leftout.desktop-alpha-stop/1',
    runId,
    requestedAt,
  };
  await writePrivateJson(path, request, runId);
  return request;
}

async function waitForReady(input: {
  paths: DesktopAlphaOperatorPaths;
  runId: string;
  worker: { pid: number };
  timeoutMs: number;
  fetcher?: typeof fetch;
  onProgress?: (message: string) => void;
}) {
  const deadline = Date.now() + input.timeoutMs;
  let nextProgressAt = Date.now() + PROGRESS_INTERVAL_MS;
  while (Date.now() < deadline) {
    const status = await readJsonIfPresent<DesktopAlphaStatus>(
      input.paths.statusPath,
    );
    if (isCurrentStatus(status, input.runId)) {
      if (status && status.pid !== input.worker.pid) {
        input.worker.pid = await handoffDesktopAlphaOperatorPid({
          recordPath: input.paths.recordPath,
          runId: input.runId,
          expectedPid: input.worker.pid,
          workerPid: status.pid,
        });
      }
      if (status?.state === 'ready') {
        const health = await probeDesktopAlphaHealth(
          status,
          input.fetcher ?? fetch,
        );
        if (health.ok) return status;
      }
      if (status?.state === 'failed') {
        throw new Error(
          `Desktop alpha failed to start: ${status.error ?? 'unknown error'}. See ${input.paths.logPath}.`,
        );
      }
    }
    if (!desktopAlphaProcessIsRunning(input.worker.pid)) {
      throw new Error(
        `Desktop alpha exited before becoming ready. See ${input.paths.logPath}.`,
      );
    }
    if (Date.now() >= nextProgressAt) {
      input.onProgress?.(
        `Desktop alpha is still starting; waiting up to ${Math.ceil((deadline - Date.now()) / 1_000)} more seconds.`,
      );
      nextProgressAt = Date.now() + PROGRESS_INTERVAL_MS;
    }
    await delay(POLL_INTERVAL_MS);
  }
  await writeDesktopAlphaStopRequest(input.paths.stopRequestPath, input.runId);
  throw new Error(
    `Desktop alpha did not become ready within ${input.timeoutMs} ms; a clean stop was requested. See ${input.paths.logPath}.`,
  );
}

export async function cleanupFailedPersistentLaunch(input: {
  paths: DesktopAlphaOperatorPaths;
  runId: string;
  pid: number;
}) {
  await writeDesktopAlphaStopRequest(
    input.paths.stopRequestPath,
    input.runId,
  ).catch(() => undefined);
  await unlink(`${input.paths.recordPath}.${input.runId}.tmp`).catch(
    () => undefined,
  );

  const deadline = Date.now() + 2_000;
  while (desktopAlphaProcessIsRunning(input.pid) && Date.now() < deadline) {
    await delay(POLL_INTERVAL_MS);
  }
  if (desktopAlphaProcessIsRunning(input.pid)) return;

  const [record, stopRequest] = await Promise.all([
    readJsonIfPresent<DesktopAlphaOperatorRecord>(input.paths.recordPath),
    readJsonIfPresent<DesktopAlphaStopRequest>(input.paths.stopRequestPath),
  ]);
  await Promise.all([
    record?.runId === input.runId
      ? unlink(input.paths.recordPath).catch(() => undefined)
      : Promise.resolve(),
    stopRequest?.runId === input.runId
      ? unlink(input.paths.stopRequestPath).catch(() => undefined)
      : Promise.resolve(),
  ]);
}

export async function startPersistentDesktopAlpha(input?: {
  runtimeDirectory?: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
  onProgress?: (message: string) => void;
}) {
  const paths = desktopAlphaOperatorPaths(input?.runtimeDirectory);
  const runId = randomUUID();
  const launchLock = await acquireDesktopAlphaOwnedLock(
    paths.launchLockPath,
    runId,
    'Desktop alpha persistent launch',
  );
  try {
    const [current, currentRecord] = await Promise.all([
      readJsonIfPresent<DesktopAlphaStatus>(paths.statusPath),
      readJsonIfPresent<DesktopAlphaOperatorRecord>(paths.recordPath),
    ]);
    if (
      current &&
      ['starting', 'ready', 'stopping'].includes(current.state) &&
      desktopAlphaProcessIsRunning(current.pid)
    ) {
      if (current.operator?.mode === 'persistent') {
        if (
          currentRecord?.runId !== current.runId ||
          currentRecord.pid !== current.pid
        ) {
          throw new Error(
            `Persistent desktop alpha metadata is inconsistent. Stop it cleanly before restarting. See ${paths.statusPath}.`,
          );
        }
        const health = await probeDesktopAlphaHealth(
          current,
          input?.fetcher ?? fetch,
        );
        if (health.ok) {
          return { status: current, paths, alreadyRunning: true };
        }
        throw new Error(
          `A persistent desktop alpha process exists but its exact endpoint health check failed. Stop it cleanly before restarting. See ${paths.statusPath}.`,
        );
      }
      throw new Error(
        `A foreground desktop alpha is already running as process ${current.pid}. Stop it before starting persistent operator mode.`,
      );
    }

    await mkdir(paths.runtimeDirectory, { recursive: true });
    await unlink(paths.stopRequestPath).catch(() => undefined);
    const projectDirectory = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '..',
    );
    const workerPath = join(projectDirectory, 'scripts', 'desktop-alpha.mts');
    const tsxImportSpecifier = import.meta.resolve('tsx');
    const logFileDescriptor = openSync(paths.logPath, 'w', 0o600);
    let child: ReturnType<typeof spawn>;
    try {
      const launch = createDesktopAlphaWorkerLaunch({
        nodePath: process.execPath,
        tsxImportSpecifier,
        workerPath,
        projectDirectory,
        runtimeDirectory: paths.runtimeDirectory,
        runId,
        logFileDescriptor,
        inheritedEnvironment: process.env,
      });
      child = spawn(launch.command, launch.args, launch.options);
    } finally {
      closeSync(logFileDescriptor);
    }
    if (!child.pid)
      throw new Error('Desktop alpha worker did not return a PID.');
    child.unref();
    const childPid = child.pid;

    const record: DesktopAlphaOperatorRecord = {
      schemaVersion: 'leftout.desktop-alpha-operator/1',
      runId,
      pid: childPid,
      launchedAt: new Date().toISOString(),
      mode: 'persistent',
      logPath: paths.logPath,
    };
    const worker = { pid: childPid };
    try {
      await writePrivateJson(paths.recordPath, record, runId);
      const status = await waitForReady({
        paths,
        runId,
        worker,
        timeoutMs: input?.timeoutMs ?? DESKTOP_ALPHA_START_TIMEOUT_MS,
        fetcher: input?.fetcher,
        onProgress: input?.onProgress,
      });
      return { status, paths, alreadyRunning: false };
    } catch (error) {
      await cleanupFailedPersistentLaunch({
        paths,
        runId,
        pid: worker.pid,
      });
      throw error;
    }
  } finally {
    await releaseDesktopAlphaOwnedLock(launchLock);
  }
}

export interface DesktopAlphaHealth {
  ok: boolean;
  site: boolean;
  connector: boolean;
  bridge: boolean;
  error?: string;
}

async function fetchWithinTimeout(
  fetcher: typeof fetch,
  url: string,
): Promise<Response> {
  return fetcher(url, {
    method: 'GET',
    cache: 'no-store',
    signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
  });
}

export async function probeDesktopAlphaHealth(
  status: DesktopAlphaStatus,
  fetcher: typeof fetch = fetch,
): Promise<DesktopAlphaHealth> {
  const expectedSite = 'http://127.0.0.1:3001';
  const expectedConnector = 'http://127.0.0.1:8787/';
  const expectedBridge = 'http://127.0.0.1:8788';
  if (
    status.site.url !== expectedSite ||
    status.connector.healthUrl !== expectedConnector ||
    status.connector.mcpEndpoint !== 'http://127.0.0.1:8787/mcp' ||
    status.connector.reportEndpoint !== 'http://127.0.0.1:8787/receipts' ||
    status.connector.setupEndpoint !== 'http://127.0.0.1:8787/setup' ||
    status.connector.bridgeEndpoint !== expectedBridge
  ) {
    return {
      ok: false,
      site: false,
      connector: false,
      bridge: false,
      error: 'Status endpoints do not match the fixed persistent-mode ports.',
    };
  }

  try {
    const [siteResponse, connectorResponse, bridgeResponse] = await Promise.all(
      [
        fetchWithinTimeout(fetcher, expectedSite),
        fetchWithinTimeout(fetcher, expectedConnector),
        fetchWithinTimeout(fetcher, `${expectedBridge}/`),
      ],
    );
    const [siteText, connectorBody, bridgeBody] = await Promise.all([
      siteResponse.text(),
      connectorResponse.json().catch(() => undefined),
      bridgeResponse.json().catch(() => undefined),
    ]);
    const site = siteResponse.ok && siteText.includes('WebMCP Security Lab');
    const connector =
      connectorResponse.ok &&
      typeof connectorBody === 'object' &&
      connectorBody !== null &&
      'service' in connectorBody &&
      connectorBody.service === 'leftout-webmcp-capability-connector' &&
      'status' in connectorBody &&
      connectorBody.status === 'ok' &&
      'instance_id' in connectorBody &&
      connectorBody.instance_id === status.runId;
    const bridge =
      bridgeResponse.ok &&
      typeof bridgeBody === 'object' &&
      bridgeBody !== null &&
      'service' in bridgeBody &&
      bridgeBody.service === 'leftout-local-browser-bridge' &&
      'status' in bridgeBody &&
      bridgeBody.status === 'ok' &&
      'instance_id' in bridgeBody &&
      bridgeBody.instance_id === status.runId;
    return { ok: site && connector && bridge, site, connector, bridge };
  } catch (error) {
    return {
      ok: false,
      site: false,
      connector: false,
      bridge: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function readPersistentDesktopAlphaStatus(input?: {
  runtimeDirectory?: string;
  fetcher?: typeof fetch;
}) {
  const paths = desktopAlphaOperatorPaths(input?.runtimeDirectory);
  const [status, record] = await Promise.all([
    readJsonIfPresent<DesktopAlphaStatus>(paths.statusPath),
    readJsonIfPresent<DesktopAlphaOperatorRecord>(paths.recordPath),
  ]);
  const processRunning = Boolean(
    status &&
    record &&
    status.runId === record.runId &&
    status.pid === record.pid &&
    status.operator?.mode === 'persistent' &&
    desktopAlphaProcessIsRunning(status.pid),
  );
  const health =
    processRunning && status
      ? await probeDesktopAlphaHealth(status, input?.fetcher ?? fetch)
      : {
          ok: false,
          site: false,
          connector: false,
          bridge: false,
          error: 'No matching persistent worker is running.',
        };
  return {
    paths,
    status,
    record,
    processRunning,
    running: processRunning && health.ok,
    health,
  };
}

export async function stopPersistentDesktopAlpha(input?: {
  runtimeDirectory?: string;
  timeoutMs?: number;
}) {
  const snapshot = await readPersistentDesktopAlphaStatus({
    runtimeDirectory: input?.runtimeDirectory,
  });
  const { paths, status, record } = snapshot;
  if (!snapshot.processRunning || !status || !record) {
    return { stopped: false, alreadyStopped: true, paths, status };
  }

  await writeDesktopAlphaStopRequest(paths.stopRequestPath, record.runId);
  const deadline =
    Date.now() + (input?.timeoutMs ?? DESKTOP_ALPHA_STOP_TIMEOUT_MS);
  while (Date.now() < deadline) {
    const current = await readJsonIfPresent<DesktopAlphaStatus>(
      paths.statusPath,
    );
    if (
      current?.runId === record.runId &&
      current.state === 'stopped' &&
      !desktopAlphaProcessIsRunning(record.pid)
    ) {
      await Promise.all([
        unlink(paths.recordPath).catch(() => undefined),
        unlink(paths.stopRequestPath).catch(() => undefined),
      ]);
      return { stopped: true, alreadyStopped: false, paths, status: current };
    }
    await delay(POLL_INTERVAL_MS);
  }
  throw new Error(
    `Desktop alpha did not stop cleanly within ${input?.timeoutMs ?? DESKTOP_ALPHA_STOP_TIMEOUT_MS} ms. No force kill was attempted; inspect ${paths.statusPath} and ${paths.logPath}.`,
  );
}

function printStatus(
  input: Awaited<ReturnType<typeof readPersistentDesktopAlphaStatus>>,
) {
  if (!input.status) {
    console.log('Desktop alpha status: not started.');
    console.log(`Status file: ${input.paths.statusPath}`);
    return;
  }
  console.log(`Desktop alpha status: ${input.status.state}.`);
  console.log(
    `Persistent worker: ${input.processRunning ? 'running' : 'not running'}.`,
  );
  console.log(
    `Exact endpoint health: ${input.health.ok ? 'healthy' : 'failed'}.`,
  );
  if (input.health.error) console.log(`Health detail: ${input.health.error}`);
  console.log(`PID: ${input.status.pid}`);
  console.log(`Learning range: ${input.status.site.url}`);
  console.log(`Status file: ${input.paths.statusPath}`);
  console.log(`Operator log: ${input.paths.logPath}`);
}

async function main() {
  const command = process.argv[2] ?? 'start';
  if (command === 'start') {
    console.log('Starting persistent desktop alpha...');
    const result = await startPersistentDesktopAlpha({
      onProgress: (message) => console.log(message),
    });
    console.log(
      result.alreadyRunning
        ? 'Persistent desktop alpha is already ready.'
        : 'Persistent desktop alpha started.',
    );
    console.log(`Learning range: ${result.status.site.url}`);
    console.log(`Status file: ${result.paths.statusPath}`);
    console.log(
      `Operator log (contains local one-time credentials): ${result.paths.logPath}`,
    );
    return;
  }
  if (command === 'status') {
    const status = await readPersistentDesktopAlphaStatus();
    printStatus(status);
    if (!status.running) process.exitCode = 1;
    return;
  }
  if (command === 'stop') {
    const result = await stopPersistentDesktopAlpha();
    console.log(
      result.alreadyStopped
        ? 'Persistent desktop alpha is not running.'
        : 'Persistent desktop alpha stopped cleanly.',
    );
    console.log(`Status file: ${result.paths.statusPath}`);
    return;
  }
  throw new Error('Usage: desktop-alpha-operator.mts [start|status|stop]');
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  await main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
