import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, version } from '../server/server.js';

const key = 'studio-test-key-0123456789';

async function start(fetchImpl) {
  const dist = mkdtempSync(join(tmpdir(), 'label-studio-'));
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Label Studio</title>');
  writeFileSync(join(dist, 'assets', 'app-1234.js'), 'console.log(1)');
  const app = createApp({ env: { LABEL_SERVICE_URL: 'http://service.test:3230' }, dist, fetchImpl });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.address().port}`;
  return { base, close: () => { app.close(); rmSync(dist, { recursive: true, force: true }); } };
}

function recorder(status = 200, body = { ok: true }) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, ...init });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  return { calls, fetchImpl };
}

test('requires the label-service origin', () => {
  assert.throws(() => createApp({ env: {} }), /LABEL_SERVICE_URL/);
  assert.throws(() => createApp({ env: { LABEL_SERVICE_URL: 'http://api:3230/path' } }), /LABEL_SERVICE_URL/);
});

test('forwards allowed calls with the key and without the browser origin', async () => {
  const { calls, fetchImpl } = recorder(201, { token: 'x' });
  const app = await start(fetchImpl);
  try {
    const res = await fetch(`${app.base}/api/v1/previews`, { method: 'POST', headers: { 'x-api-key': key, 'content-type': 'application/json', origin: 'http://evil.test', cookie: 'a=b' }, body: '{"test":true}' });
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { token: 'x' });
    assert.equal(calls[0].url, 'http://service.test:3230/api/v1/previews');
    assert.deepEqual(calls[0].headers, { 'x-api-key': key, 'content-type': 'application/json' });
    assert.equal(Buffer.from(calls[0].body).toString(), '{"test":true}');

    await fetch(`${app.base}/api/v1/templates/shipping-small?version=2`, { headers: { 'x-api-key': key } });
    assert.equal(calls[1].url, 'http://service.test:3230/api/v1/templates/shipping-small?version=2');
    await fetch(`${app.base}/api/v1/templates/shipping-small/versions/3/publish`, { method: 'POST', headers: { 'x-api-key': key } });
    assert.equal(calls[2].url, 'http://service.test:3230/api/v1/templates/shipping-small/versions/3/publish');
    await fetch(`${app.base}/api/v1/templates/shipping-small`, { method: 'DELETE', headers: { 'x-api-key': key } });
    assert.deepEqual([calls[3].method, calls[3].url], ['DELETE', 'http://service.test:3230/api/v1/templates/shipping-small']);
  } finally { app.close(); }
});

test('passes label-service errors through unchanged', async () => {
  const { fetchImpl } = recorder(409, { error: 'Load a matching roll first.' });
  const app = await start(fetchImpl);
  try {
    const res = await fetch(`${app.base}/api/v1/formats`, { headers: { 'x-api-key': key } });
    assert.equal(res.status, 409);
    assert.deepEqual(await res.json(), { error: 'Load a matching roll first.' });
  } finally { app.close(); }
});

test('refuses admin calls and unknown API paths', async () => {
  const { calls, fetchImpl } = recorder();
  const app = await start(fetchImpl);
  try {
    for (const [method, path] of [['GET', '/api/v1/settings'], ['PUT', '/api/v1/settings'], ['GET', '/api/v1/roll/readings'], ['DELETE', '/api/v1/templates/abc/versions/1'], ['DELETE', '/api/v1/jobs'], ['GET', '/api/v1/templates/../settings']]) {
      const res = await fetch(`${app.base}${path}`, { method, headers: { 'x-api-key': key } });
      assert.ok([403, 404].includes(res.status), `${method} ${path} gave ${res.status}`);
    }
    assert.equal(calls.length, 0);
  } finally { app.close(); }
});

test('refuses large bodies without forwarding them', async () => {
  const { calls, fetchImpl } = recorder();
  const app = await start(fetchImpl);
  try {
    const res = await fetch(`${app.base}/api/v1/templates`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(300 * 1024) });
    assert.equal(res.status, 413);
    assert.equal(calls.length, 0);
  } finally { app.close(); }
});

test('forwards picture uploads up to 3 MB and picture bytes unchanged', async () => {
  const calls = [], png = Buffer.from([137, 80, 78, 71, 1, 2, 3, 255]);
  const app = await start(async (url, init = {}) => {
    calls.push({ url, ...init });
    return url.endsWith('/content') ? new Response(png, { headers: { 'content-type': 'image/png' } }) : new Response('{"id":"abcdefabcdef"}', { status: 201 });
  });
  try {
    const upload = await fetch(`${app.base}/api/v1/assets`, { method: 'POST', headers: { 'x-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'logo', data: 'A'.repeat(2.5 * 1024 * 1024) }) });
    assert.equal(upload.status, 201); assert.ok(Buffer.from(calls[0].body).length > 2.5 * 1024 * 1024);
    const content = await fetch(`${app.base}/api/v1/assets/abcdefabcdef/content`, { headers: { 'x-api-key': key } });
    assert.equal(content.headers.get('content-type'), 'image/png'); assert.ok(Buffer.from(await content.arrayBuffer()).equals(png));
    assert.equal((await fetch(`${app.base}/api/v1/assets/abcdefabcdef`, { method: 'DELETE', headers: { 'x-api-key': key } })).status, 201);
    assert.equal((await fetch(`${app.base}/api/v1/assets/abc`, { method: 'DELETE', headers: { 'x-api-key': key } })).status, 403);
  } finally { app.close(); }
});

test('reports a lost answer as 502 with a job-check hint', async () => {
  const app = await start(async () => { throw new Error('socket hang up'); });
  try {
    const res = await fetch(`${app.base}/api/v1/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 502);
    assert.match((await res.json()).error, /check the job list/);
  } finally { app.close(); }
});

test('serves the app, its assets and app routes, and refuses path escapes', async () => {
  const app = await start(recorder().fetchImpl);
  try {
    const index = await fetch(`${app.base}/`);
    assert.equal(index.status, 200);
    assert.match(index.headers.get('content-security-policy'), /script-src 'self'/);
    assert.match(await index.text(), /Label Studio/);
    const asset = await fetch(`${app.base}/assets/app-1234.js`);
    assert.match(asset.headers.get('cache-control'), /immutable/);
    assert.equal((await fetch(`${app.base}/templates/shipping`)).status, 200);
    assert.equal((await fetch(`${app.base}/missing.png`)).status, 404);
    assert.equal((await fetch(`${app.base}/%2e%2e/%2e%2e/VERSION.txt`)).status, 404);
  } finally { app.close(); }
});

test('health reports its version and the label-service state', async () => {
  const app = await start(async () => new Response(JSON.stringify({ ok: true, version: '0.5.0' })));
  try {
    assert.deepEqual(await (await fetch(`${app.base}/healthz`)).json(), { ok: true, version, labelService: { ok: true, version: '0.5.0' } });
  } finally { app.close(); }
});
