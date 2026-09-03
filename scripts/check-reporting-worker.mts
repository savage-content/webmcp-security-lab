import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDirectory = resolve('outputs/reporting-worker');
const logDirectory = resolve('.wrangler/logs');
await Promise.all([
  mkdir(outputDirectory, { recursive: true }),
  mkdir(logDirectory, { recursive: true }),
]);

const arguments_ = [
  resolve('node_modules/wrangler/bin/wrangler.js'),
  'deploy',
  '--dry-run',
  '--config',
  resolve('products/reporting-worker/wrangler.disabled.example.json'),
  '--outdir',
  outputDirectory,
];

const status = await new Promise<number>((resolveStatus, reject) => {
  const child = spawn(process.execPath, arguments_, {
    stdio: 'inherit',
    windowsHide: true,
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: resolve(logDirectory, 'reporting-worker-check.log'),
      WRANGLER_WRITE_LOGS: 'false',
    },
  });
  child.once('error', reject);
  child.once('exit', (code, signal) => {
    if (signal) {
      reject(new Error(`Wrangler dry run ended with signal ${signal}.`));
      return;
    }
    resolveStatus(code ?? 1);
  });
});

if (status !== 0) {
  throw new Error(`Wrangler reporting Worker dry run failed with ${status}.`);
}
