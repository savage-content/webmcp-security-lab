import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const HOST = '127.0.0.1';
const DEFAULT_PORT = 48_990;
const extensionDirectory = resolve('products/extension');
const allowedFiles = new Set([
  'hud-model.js',
  'lesson-policy.js',
  'popup.css',
  'popup.html',
  'popup.js',
  'validation.js',
]);

const mock = `globalThis.chrome = Object.freeze({
  storage: Object.freeze({
    local: Object.freeze({
      get: async () => Object.freeze({
        local_guard_data_handling_consent: 'leftout.local-guard-data-handling/1',
      }),
    }),
  }),
  tabs: Object.freeze({
    query: async () => [Object.freeze({
      id: 1,
      url: 'https://left-out-webmcp-security-lab.taitfor.chatgpt.site/',
    })],
  }),
  runtime: Object.freeze({
    sendMessage: async (message) => {
      if (message?.type !== 'get-active-status') {
        return Object.freeze({ ok: false, error: 'Capture fixture is read-only.' });
      }
      return Object.freeze({
        ok: true,
        result: Object.freeze({
          paired: true,
          origin: 'https://left-out-webmcp-security-lab.taitfor.chatgpt.site',
          sessionId: 'controlled-store-capture',
          lastCommand: 'inspect-tools',
          capabilityPermit: Object.freeze({ imported: false }),
          hud: Object.freeze({
            schemaVersion: 'leftout.webmcp-hud/1',
            state: 'protected',
            headline: 'Lesson 1 eligibility read is guarded',
            detail: 'The extension rejects a different action. Pairing is not approval, and nothing has run.',
            nextAction: 'Return to the lesson',
            observedCount: 1,
            observedAt: '2026-09-02T00:00:00.000Z',
            protection: 'one-exact-action',
            run: 'not-run',
            lessonId: 'read-only-claim',
          }),
        }),
      });
    },
  }),
});`;

function contentType(path: string) {
  if (extname(path) === '.css') return 'text/css; charset=utf-8';
  if (extname(path) === '.js') return 'text/javascript; charset=utf-8';
  return 'text/html; charset=utf-8';
}

const requestedPort = Number.parseInt(
  process.env.LOCAL_GUARD_CAPTURE_PORT ?? '',
  10,
);
const port =
  Number.isInteger(requestedPort) && requestedPort > 0
    ? requestedPort
    : DEFAULT_PORT;

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', `http://${HOST}:${port}`)
    .pathname;
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; connect-src 'none'; img-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'",
  );
  if (pathname === '/capture-chrome-mock.js') {
    response.writeHead(200, { 'Content-Type': contentType(pathname) });
    response.end(mock);
    return;
  }
  const file = pathname === '/' ? 'popup.html' : pathname.slice(1);
  if (!allowedFiles.has(file)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  try {
    let contents = await readFile(resolve(extensionDirectory, file), 'utf8');
    if (file === 'popup.html') {
      contents = contents.replace(
        '<script type="module" src="popup.js"></script>',
        '<script src="capture-chrome-mock.js"></script>\n    <script type="module" src="popup.js"></script>',
      );
    }
    response.writeHead(200, { 'Content-Type': contentType(file) });
    response.end(contents);
  } catch {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Capture fixture failed.');
  }
});

server.listen(port, HOST, () => {
  console.log(`Local Guard controlled capture: http://${HOST}:${port}/`);
  console.log(
    'This fixture renders current extension code and cannot invoke a site tool.',
  );
});
