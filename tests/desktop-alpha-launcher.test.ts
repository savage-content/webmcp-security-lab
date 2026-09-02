import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { startCapabilityConnector } from '../products/connector/server';
import {
  acquireDesktopAlphaOwnedLock,
  createDesktopAlphaStatus,
  DESKTOP_ALPHA_BRIDGE_PORTS,
  DESKTOP_ALPHA_HOST,
  DESKTOP_ALPHA_SITE_PORT,
  isDesktopAlphaStopRequest,
  releaseDesktopAlphaOwnedLock,
  startDesktopAlpha,
  startConnectorWithFallback,
  watchForDesktopAlphaStop,
} from '../scripts/desktop-alpha.mts';
import {
  cleanupFailedPersistentLaunch,
  createDesktopAlphaWorkerLaunch,
  DESKTOP_ALPHA_START_TIMEOUT_MS,
  desktopAlphaOperatorPaths,
  handoffDesktopAlphaOperatorPid,
  probeDesktopAlphaHealth,
  startPersistentDesktopAlpha,
  writeDesktopAlphaStopRequest,
} from '../scripts/desktop-alpha-operator.mts';

describe('desktop alpha launcher contract', () => {
  it('allows the observed slow local Sites startup window', () => {
    expect(DESKTOP_ALPHA_START_TIMEOUT_MS).toBeGreaterThanOrEqual(120_000);
  });

  it('emits a useful descriptor with no credential-bearing values', () => {
    const status = createDesktopAlphaStatus({
      state: 'ready',
      runId: 'run-id',
      pid: 42,
      startedAt: '2026-09-01T12:00:00.000Z',
      updatedAt: '2026-09-01T12:00:01.000Z',
      siteUrl: `http://${DESKTOP_ALPHA_HOST}:${DESKTOP_ALPHA_SITE_PORT}`,
      mcpPort: 8787,
      bridgePort: 8788,
      extensionPath: 'C:\\safe\\products\\extension',
    });
    expect(status).toMatchObject({
      schemaVersion: 'leftout.desktop-alpha-status/1',
      state: 'ready',
      site: { url: 'http://127.0.0.1:3001' },
      connector: {
        mcpEndpoint: 'http://127.0.0.1:8787/mcp',
        reportEndpoint: 'http://127.0.0.1:8787/receipts',
        bridgeEndpoint: 'http://127.0.0.1:8788',
        authentication: 'required',
      },
    });
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain('access_token');
    expect(serialized).not.toContain('pairCode');
    expect(serialized).not.toContain('bridgeToken');
    expect(serialized).not.toContain('?');
  });

  it('builds a detached hidden worker with exact persistent-mode inputs', () => {
    const launch = createDesktopAlphaWorkerLaunch({
      nodePath: 'C:\\node\\node.exe',
      tsxImportSpecifier: 'file:///C:/project/node_modules/tsx/dist/loader.mjs',
      workerPath: 'C:\\project\\scripts\\desktop-alpha.mts',
      projectDirectory: 'C:\\project',
      runtimeDirectory: 'C:\\runtime',
      runId: 'run-id',
      logFileDescriptor: 17,
      inheritedEnvironment: { SAFE_PARENT_VALUE: 'preserved' },
    });

    expect(launch).toMatchObject({
      command: 'C:\\node\\node.exe',
      args: [
        '--import',
        'file:///C:/project/node_modules/tsx/dist/loader.mjs',
        'C:\\project\\scripts\\desktop-alpha.mts',
      ],
      options: {
        cwd: 'C:\\project',
        detached: true,
        windowsHide: true,
        shell: false,
        stdio: ['ignore', 17, 17],
        env: {
          SAFE_PARENT_VALUE: 'preserved',
          NODE_ENV: 'development',
          LEFTOUT_ALPHA_PERSISTENT: '1',
          LEFTOUT_ALPHA_RUN_ID: 'run-id',
          LEFTOUT_ALPHA_RUNTIME_DIRECTORY: 'C:\\runtime',
        },
      },
    });
  });

  it('fails closed unless all fixed persistent endpoints identify themselves', async () => {
    const status = createDesktopAlphaStatus({
      state: 'ready',
      runId: 'run-id',
      pid: 42,
      startedAt: '2026-09-01T12:00:00.000Z',
      updatedAt: '2026-09-01T12:00:01.000Z',
      siteUrl: 'http://127.0.0.1:3001',
      mcpPort: 8787,
      bridgePort: 8788,
      extensionPath: 'C:\\safe\\products\\extension',
      operatorMode: 'persistent',
    });
    const healthyFetch = vi.fn(async (url: string | URL | Request) => {
      const target =
        typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      if (target === 'http://127.0.0.1:3001') {
        return new Response('<title>WebMCP Security Lab</title>');
      }
      if (target === 'http://127.0.0.1:8787/') {
        return Response.json({
          service: 'leftout-webmcp-capability-connector',
          status: 'ok',
          instance_id: 'run-id',
        });
      }
      return Response.json({
        service: 'leftout-local-browser-bridge',
        status: 'ok',
        instance_id: 'run-id',
      });
    }) as unknown as typeof fetch;
    await expect(
      probeDesktopAlphaHealth(status, healthyFetch),
    ).resolves.toEqual({
      ok: true,
      site: true,
      connector: true,
      bridge: true,
    });

    const stale = structuredClone(status);
    stale.connector.bridgeEndpoint = 'http://127.0.0.1:48788';
    await expect(
      probeDesktopAlphaHealth(stale, healthyFetch),
    ).resolves.toMatchObject({ ok: false, bridge: false });
    expect(healthyFetch).toHaveBeenCalledTimes(3);

    const wrongRun = structuredClone(status);
    wrongRun.runId = 'stale-run-id';
    await expect(
      probeDesktopAlphaHealth(wrongRun, healthyFetch),
    ).resolves.toMatchObject({
      ok: false,
      site: true,
      connector: false,
      bridge: false,
    });
    expect(healthyFetch).toHaveBeenCalledTimes(6);
  });

  it('uses fixed private operator paths and accepts only well-formed stop requests', () => {
    expect(desktopAlphaOperatorPaths('C:\\runtime')).toEqual({
      runtimeDirectory: 'C:\\runtime',
      statusPath: join('C:\\runtime', 'status.json'),
      recordPath: join('C:\\runtime', 'operator.json'),
      launchLockPath: join('C:\\runtime', 'operator-start.lock'),
      logPath: join('C:\\runtime', 'operator.log'),
      stopRequestPath: join('C:\\runtime', 'stop-request.json'),
    });
    expect(
      isDesktopAlphaStopRequest({
        schemaVersion: 'leftout.desktop-alpha-stop/1',
        runId: 'run-id',
        requestedAt: '2026-09-01T12:00:00.000Z',
      }),
    ).toBe(true);
    expect(
      isDesktopAlphaStopRequest({
        schemaVersion: 'leftout.desktop-alpha-stop/1',
        runId: '',
        requestedAt: 'not-a-date',
      }),
    ).toBe(false);
  });

  it('honors only a stop request bound to the current run', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'leftout-alpha-stop-'));
    const requestPath = join(directory, 'stop-request.json');
    const stop = vi.fn(async () => undefined);
    const watcher = watchForDesktopAlphaStop({
      path: requestPath,
      runId: 'current-run',
      stop,
      pollIntervalMs: 60_000,
    });
    try {
      await writeDesktopAlphaStopRequest(
        requestPath,
        'different-run',
        '2026-09-01T12:00:00.000Z',
      );
      await watcher.check();
      expect(stop).not.toHaveBeenCalled();

      await writeDesktopAlphaStopRequest(
        requestPath,
        'current-run',
        '2026-09-01T12:00:01.000Z',
      );
      await watcher.check();
      expect(stop).toHaveBeenCalledOnce();
    } finally {
      watcher.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('serializes persistent launches before any operator record can race', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'leftout-alpha-launch-'));
    const paths = desktopAlphaOperatorPaths(directory);
    const held = await acquireDesktopAlphaOwnedLock(
      paths.launchLockPath,
      'held-launch',
      'Desktop alpha persistent launch',
    );
    try {
      await expect(
        startPersistentDesktopAlpha({
          runtimeDirectory: directory,
          timeoutMs: 1,
        }),
      ).rejects.toThrow('persistent launch is already active');
      await expect(readFile(paths.recordPath, 'utf8')).rejects.toMatchObject({
        code: 'ENOENT',
      });
      expect(JSON.parse(await readFile(paths.launchLockPath, 'utf8'))).toEqual({
        runId: 'held-launch',
        pid: process.pid,
      });
    } finally {
      await releaseDesktopAlphaOwnedLock(held);
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('cleans failed-launch metadata after requesting a run-bound stop', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'leftout-alpha-orphan-'));
    const paths = desktopAlphaOperatorPaths(directory);
    const record = {
      schemaVersion: 'leftout.desktop-alpha-operator/1',
      runId: 'failed-run',
      pid: 2_147_483_647,
      launchedAt: '2026-09-01T12:00:00.000Z',
      mode: 'persistent',
      logPath: paths.logPath,
    };
    try {
      await writeFile(paths.recordPath, JSON.stringify(record), 'utf8');
      await writeFile(`${paths.recordPath}.failed-run.tmp`, 'partial', 'utf8');
      await cleanupFailedPersistentLaunch({
        paths,
        runId: 'failed-run',
        pid: record.pid,
      });
      await expect(readFile(paths.recordPath, 'utf8')).rejects.toMatchObject({
        code: 'ENOENT',
      });
      await expect(
        readFile(paths.stopRequestPath, 'utf8'),
      ).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(
        readFile(`${paths.recordPath}.failed-run.tmp`, 'utf8'),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('atomically hands a same-run bootstrap PID to the actual worker PID', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'leftout-alpha-pid-'));
    const paths = desktopAlphaOperatorPaths(directory);
    const record = {
      schemaVersion: 'leftout.desktop-alpha-operator/1',
      runId: 'same-run',
      pid: 23_224,
      launchedAt: '2026-09-01T12:00:00.000Z',
      mode: 'persistent',
      logPath: paths.logPath,
    };
    try {
      await writeFile(paths.recordPath, JSON.stringify(record), 'utf8');
      await expect(
        handoffDesktopAlphaOperatorPid({
          recordPath: paths.recordPath,
          runId: 'same-run',
          expectedPid: 23_224,
          workerPid: 20_316,
        }),
      ).resolves.toBe(20_316);
      expect(
        JSON.parse(await readFile(paths.recordPath, 'utf8')),
      ).toMatchObject({ runId: 'same-run', pid: 20_316 });

      await expect(
        handoffDesktopAlphaOperatorPid({
          recordPath: paths.recordPath,
          runId: 'different-run',
          expectedPid: 20_316,
          workerPid: 20_317,
        }),
      ).rejects.toThrow('did not match');
      expect(
        JSON.parse(await readFile(paths.recordPath, 'utf8')),
      ).toMatchObject({ runId: 'same-run', pid: 20_316 });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('uses the one manifest-approved fallback only for EADDRINUSE', async () => {
    const connector = { bridgePort: DESKTOP_ALPHA_BRIDGE_PORTS[1] } as Awaited<
      ReturnType<typeof startCapabilityConnector>
    >;
    const starter = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('busy'), { code: 'EADDRINUSE' }),
      )
      .mockResolvedValueOnce(
        connector,
      ) as unknown as typeof startCapabilityConnector;

    await expect(
      startConnectorWithFallback({ log: () => undefined }, starter),
    ).resolves.toBe(connector);
    expect(starter).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ bridgePort: DESKTOP_ALPHA_BRIDGE_PORTS[0] }),
    );
    expect(starter).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ bridgePort: DESKTOP_ALPHA_BRIDGE_PORTS[1] }),
    );

    const fatal = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('denied'), { code: 'EACCES' }),
      ) as unknown as typeof startCapabilityConnector;
    await expect(
      startConnectorWithFallback({ log: () => undefined }, fatal),
    ).rejects.toThrow('denied');
    expect(fatal).toHaveBeenCalledOnce();
  });

  it('drives ready-to-stopped lifecycle with exact local scope and a redacted status file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'leftout-desktop-alpha-'));
    const siteClose = vi.fn(async () => undefined);
    const connectorClose = vi.fn(async () => undefined);
    let capturedOptions: Record<string, unknown> | undefined;
    try {
      const desktop = await startDesktopAlpha({
        runtimeDirectory: directory,
        log: () => undefined,
        startSite: async () => ({ close: siteClose }) as never,
        startConnector: async (options) => {
          capturedOptions = options as Record<string, unknown>;
          return {
            accessToken: 'terminal-only-access-token',
            pairCode: '12345678',
            mcpPort: 8787,
            bridgePort: 8788,
            bridgeHost: '127.0.0.1',
            coordinator: {},
            receipts: {},
            issueReportLaunchTicket: () => ({
              url: 'http://127.0.0.1:8787/reports/open?ticket=report-secret',
              expiresAt: '2026-09-01T12:01:00.000Z',
            }),
            issueSetupLaunchTicket: () => ({
              url: 'http://127.0.0.1:8787/reports/open?ticket=setup-secret',
              expiresAt: '2026-09-01T12:01:00.000Z',
            }),
            close: connectorClose,
          } as unknown as Awaited<ReturnType<typeof startCapabilityConnector>>;
        },
      });
      expect(capturedOptions).toMatchObject({
        mcpPort: 8787,
        publicHost: '127.0.0.1',
        bridgeHost: '127.0.0.1',
        allowedOrigins: ['http://127.0.0.1:3001'],
      });
      const readyText = await readFile(desktop.statusPath, 'utf8');
      expect(JSON.parse(readyText)).toMatchObject({ state: 'ready' });
      expect(readyText).not.toContain('terminal-only-access-token');
      expect(readyText).not.toContain('12345678');
      expect(readyText).not.toContain('report-secret');
      expect(readyText).not.toContain('setup-secret');

      await desktop.shutdown();
      expect(connectorClose).toHaveBeenCalledOnce();
      expect(siteClose).toHaveBeenCalledOnce();
      expect(
        JSON.parse(await readFile(desktop.statusPath, 'utf8')),
      ).toMatchObject({
        state: 'stopped',
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('does not let a losing launcher overwrite status or release the owner lock', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'leftout-alpha-owner-'));
    const ownerSiteClose = vi.fn(async () => undefined);
    const ownerConnectorClose = vi.fn(async () => undefined);
    try {
      const owner = await startDesktopAlpha({
        runtimeDirectory: directory,
        runId: 'owner-run',
        log: () => undefined,
        startSite: async () => ({ close: ownerSiteClose }) as never,
        startConnector: async () =>
          ({
            accessToken: 'owner-token',
            pairCode: '12345678',
            mcpPort: 8787,
            bridgePort: 8788,
            bridgeHost: '127.0.0.1',
            coordinator: {},
            receipts: {},
            issueReportLaunchTicket: () => ({
              url: 'http://127.0.0.1:8787/reports/open?ticket=owner-report',
              expiresAt: '2026-09-01T12:01:00.000Z',
            }),
            issueSetupLaunchTicket: () => ({
              url: 'http://127.0.0.1:8787/reports/open?ticket=owner-setup',
              expiresAt: '2026-09-01T12:01:00.000Z',
            }),
            close: ownerConnectorClose,
          }) as unknown as Awaited<ReturnType<typeof startCapabilityConnector>>,
      });

      await expect(
        startDesktopAlpha({
          runtimeDirectory: directory,
          runId: 'loser-run',
          log: () => undefined,
          startSite: async () => {
            throw new Error('loser must not start the site');
          },
          startConnector: async () => {
            throw new Error('loser must not start the connector');
          },
        }),
      ).rejects.toThrow('already active');

      expect(
        JSON.parse(await readFile(owner.statusPath, 'utf8')),
      ).toMatchObject({ state: 'ready', runId: 'owner-run' });
      expect(
        JSON.parse(
          await readFile(join(directory, 'desktop-alpha.lock'), 'utf8'),
        ),
      ).toEqual({ runId: 'owner-run', pid: process.pid });
      expect(ownerConnectorClose).not.toHaveBeenCalled();
      expect(ownerSiteClose).not.toHaveBeenCalled();

      await owner.shutdown();
      expect(ownerConnectorClose).toHaveBeenCalledOnce();
      expect(ownerSiteClose).toHaveBeenCalledOnce();
      await expect(
        readFile(join(directory, 'desktop-alpha.lock'), 'utf8'),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
