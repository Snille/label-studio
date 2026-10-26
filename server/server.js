// Label Studio server: serves the built web app and forwards the allowed API calls to label-service.
// The browser holds the Studio key; this server holds no key and never talks to a printer.
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const version = readFileSync(new URL('../VERSION', import.meta.url), 'utf8').trim();
const maxBody = 256 * 1024;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8' };
// Svelte writes static style attributes, so inline styles are allowed; scripts are not.
const security = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" };

// The calls Studio needs. Settings and roll reading stay on the label-service admin page.
const allowed = [
  ['GET', /^\/api\/v1\/(formats|status|templates|jobs)$/],
  ['GET', /^\/api\/v1\/templates\/[a-z0-9-]{2,64}(\/versions)?$/],
  ['GET', /^\/api\/v1\/jobs\/[a-f0-9-]{36}$/],
  ['POST', /^\/api\/v1\/(templates|previews|jobs)$/],
  ['POST', /^\/api\/v1\/templates\/[a-z0-9-]{2,64}\/versions\/\d{1,6}\/(publish|archive)$/],
  ['DELETE', /^\/api\/v1\/templates\/[a-z0-9-]{2,64}$/],
  ['GET', /^\/api\/v1\/assets(\/[a-f0-9]{12}\/content)?$/],
  ['POST', /^\/api\/v1\/assets$/],
  ['DELETE', /^\/api\/v1\/assets\/[a-f0-9]{12}$/]
];
// A picture upload is up to 2 MB, about 2.7 MB as base64 in JSON.
const bodyLimit = path => path === '/api/v1/assets' ? 3 * 1024 * 1024 : maxBody;

async function readBody(req, limit) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function createApp({ env = process.env, dist = fileURLToPath(new URL('../dist', import.meta.url)), fetchImpl = fetch } = {}) {
  const upstream = (env.LABEL_SERVICE_URL || '').replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+$/.test(upstream)) throw new Error('Set LABEL_SERVICE_URL to the label-service origin, for example http://api:3230.');
  const timeoutMs = Number(env.LABEL_SERVICE_TIMEOUT_MS || 150000);
  const json = (res, value, status = 200) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...security }); res.end(JSON.stringify(value)); };

  async function forward(req, res, path, search) {
    let body;
    if (req.method === 'POST') {
      body = await readBody(req, bodyLimit(path));
      if (body === null) return json(res, { error: 'Request body is too large.' }, 413);
    }
    // Only the key and the content type go on; the browser origin stays here, so label-service sees a server call.
    const headers = {};
    for (const name of ['x-api-key', 'authorization', 'content-type']) if (req.headers[name]) headers[name] = req.headers[name];
    let response;
    try {
      response = await fetchImpl(`${upstream}${path}${search}`, { method: req.method, headers, body, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      // A print request may have reached the printer even when the answer is lost; the client must check the job.
      return json(res, { error: 'label-service did not answer. If you sent a print, check the job list before printing again.' }, 502);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    res.writeHead(response.status, { 'content-type': response.headers.get('content-type') || 'application/json', 'cache-control': 'no-store', ...security });
    res.end(bytes);
  }

  function serveFile(res, path) {
    const file = normalize(join(dist, path === '/' ? 'index.html' : decodeURIComponent(path)));
    let target = file;
    if (!file.startsWith(dist + sep) || !statSync(file, { throwIfNoEntry: false })?.isFile()) {
      // Unknown paths without an extension are app routes; give them the app.
      if (extname(path)) return json(res, { error: 'Not found.' }, 404);
      target = join(dist, 'index.html');
    }
    const immutable = target.includes(`${sep}assets${sep}`);
    res.writeHead(200, { 'content-type': types[extname(target)] || 'application/octet-stream', 'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache', ...security });
    res.end(readFileSync(target));
  }

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost'), path = url.pathname;
      if (path === '/healthz' && req.method === 'GET') {
        let service = null;
        try { service = await (await fetchImpl(`${upstream}/healthz`, { signal: AbortSignal.timeout(3000) })).json(); } catch { /* reported as unreachable */ }
        return json(res, { ok: true, version, labelService: service?.ok ? { ok: true, version: service.version } : { ok: false } });
      }
      if (path.startsWith('/api/')) {
        if (!allowed.some(([method, pattern]) => method === req.method && pattern.test(path))) {
          return json(res, { error: 'Label Studio does not forward this call. Use the label-service admin page.' }, path.startsWith('/api/v1/') ? 403 : 404);
        }
        return await forward(req, res, path, url.search);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, { error: 'Not found.' }, 404);
      return serveFile(res, path);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) json(res, { error: 'Internal error.' }, 500); else res.end();
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const app = createApp();
  const port = Number(process.env.PORT || 3231), host = process.env.HOST || '127.0.0.1';
  app.listen(port, host, () => console.log(`Label Studio ${version} listening on ${host}:${port}.`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => app.close(() => process.exit(0)));
}
