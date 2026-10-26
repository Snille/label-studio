import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/server.js';
import { tools } from '../server/mcp.js';

const key = 'mcp-test-key-0123456789';
const formats = { printer: { id: 'dymo-5xl', name: 'DYMO LabelWriter 5XL' }, mediaKey: 'w162h90',
  media: { key: 'w162h90', sku: 'S0722540', widthMm: 57, heightMm: 32, name: 'S0722540 · 57 × 32 mm' },
  mediaPresets: [{ key: 'w162h90', sku: 'S0722540', widthMm: 57, heightMm: 32 }], printers: [{ id: 'dymo-5xl' }], fonts: [{ family: 'Liberation Sans' }] };

// A label-service stand-in: answers by path and records every call.
async function start() {
  const dist = mkdtempSync(join(tmpdir(), 'label-studio-mcp-'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html>');
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const path = new URL(url).pathname, body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init.method || 'GET', path, body, key: init.headers?.['x-api-key'] });
    const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    if (path === '/api/v1/formats') return reply(formats);
    if (path === '/api/v1/previews') return body.template === 'broken' ? reply({ error: 'Template not found.' }, 404)
      : reply({ token: 't-1', expiresAt: '2026-10-27T10:00:00Z', printable: true, warnings: [], png: 'UE5H', printer: 'dymo-5xl', kind: 'template', fields: body.fields ?? null }, 201);
    if (path === '/api/v1/templates' && init.method === 'POST') return reply({ id: body.definition.id, version: 3, status: 'draft' }, 201);
    if (path === '/api/v1/jobs') return reply({ id: body.requestId, state: 'submitted', jobId: 12 }, 201);
    return reply({ error: 'Not found.' }, 404);
  };
  const app = createApp({ env: { LABEL_SERVICE_URL: 'http://service.test:3230' }, dist, fetchImpl });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.address().port}`;
  let id = 0;
  const rpc = async (method, params, headers = { authorization: `Bearer ${key}` }) => {
    const res = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
    return { status: res.status, body: res.status === 200 ? await res.json() : null };
  };
  const tool = async (name, args = {}) => (await rpc('tools/call', { name, arguments: args })).body.result;
  return { base, calls, rpc, tool, close: () => { app.close(); rmSync(dist, { recursive: true, force: true }); } };
}

test('the MCP endpoint needs a key, takes POST only and refuses other sites', async () => {
  const s = await start();
  try {
    assert.equal((await s.rpc('ping', {}, {})).status, 401);
    assert.equal((await fetch(`${s.base}/mcp`)).status, 405);
    assert.equal((await s.rpc('ping', {}, { authorization: `Bearer ${key}`, origin: 'http://evil.test' })).status, 403);
    assert.deepEqual((await s.rpc('ping')).body.result, {});
    const note = await fetch(`${s.base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: '{"jsonrpc":"2.0","method":"notifications/initialized"}' });
    assert.equal(note.status, 202);
    assert.equal((await (await fetch(`${s.base}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: '{' })).json()).error.code, -32700);
  } finally { s.close(); }
});

test('initialize, tool list and the design guide follow the MCP shapes', async () => {
  const s = await start();
  try {
    const init = (await s.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })).body.result;
    assert.equal(init.protocolVersion, '2025-06-18'); assert.equal(init.serverInfo.name, 'label-studio'); assert.ok(init.capabilities.tools);
    assert.equal((await s.rpc('initialize', { protocolVersion: '1999-01-01' })).body.result.protocolVersion, '2025-06-18');
    const list = (await s.rpc('tools/list')).body.result.tools;
    assert.deepEqual(list.map(t => t.name), tools.map(t => t.name));
    assert.ok(list.every(t => t.inputSchema.type === 'object' && t.description));
    assert.equal(list.find(t => t.name === 'print_label').annotations.destructiveHint, true);
    assert.match(list.find(t => t.name === 'print_label').description, /clear yes/);
    const guide = (await s.rpc('resources/read', { uri: 'label-studio://design-guide' })).body.result.contents[0];
    assert.match(guide.text, /## Objects/);
    assert.equal((await s.tool('get_design_guide')).content[0].text, guide.text);
    assert.equal((await s.rpc('no/such')).body.error.code, -32601);
    assert.equal((await s.rpc('tools/call', { name: 'nope' })).body.error.code, -32602);
  } finally { s.close(); }
});

test('tools call label-service with the client key and return images and readable errors', async () => {
  const s = await start();
  try {
    const media = JSON.parse((await s.tool('list_media')).content[0].text);
    assert.deepEqual(media.loaded, { mediaKey: 'w162h90', sku: 'S0722540', widthMm: 57, heightMm: 32, name: 'S0722540 · 57 × 32 mm' });
    assert.equal(s.calls[0].key, key);

    const definition = { id: 'cable-tag', name: 'Cable', media: ['w162h90'], fields: { name: { type: 'text', sample: 'USB-C' }, port: { type: 'text' } }, objects: [] };
    const preview = await s.tool('preview_label', { definition });
    assert.deepEqual(preview.content[0], { type: 'image', data: 'UE5H', mimeType: 'image/png' });
    assert.equal(JSON.parse(preview.content[1].text).token, 't-1'); assert.equal(JSON.parse(preview.content[1].text).fits, true);
    assert.deepEqual(s.calls.at(-1).body.fields, { name: 'USB-C', port: 'port' });
    await s.tool('preview_label', { template: 'cable-tag', version: 2 });
    assert.deepEqual([s.calls.at(-1).body.template, s.calls.at(-1).body.version, s.calls.at(-1).body.test], ['cable-tag', 2, true]);

    const broken = await s.tool('preview_label', { template: 'broken' });
    assert.equal(broken.isError, true); assert.equal(broken.content[0].text, 'Template not found.');
    assert.equal((await s.tool('preview_label', {})).isError, true);

    assert.equal(JSON.parse((await s.tool('save_template_draft', { definition })).content[0].text).version, 3);
    const printed = JSON.parse((await s.tool('print_label', { token: 't-1' })).content[0].text);
    assert.match(printed.requestId, /^[0-9a-f-]{36}$/); assert.equal(printed.jobId, 12);
    assert.equal(s.calls.at(-1).body.requestId, printed.requestId);
  } finally { s.close(); }
});
