// MCP server (Streamable HTTP, stateless JSON responses) on /mcp. An LLM client designs templates with the same
// label-service API as the editor: it sends its own key (the drafter role), which this server passes on. LLMs
// propose and preview; people publish in Label Studio; printing needs a published template and the user's yes.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

export const protocolVersions = ['2025-06-18', '2025-03-26', '2024-11-05'];
const guide = readFileSync(new URL('./design-guide.md', import.meta.url), 'utf8');
const guideUri = 'label-studio://design-guide';

const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const printer = { type: 'string', description: 'A printer id from list_media; the default printer when left out.' };
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export const tools = [
  { name: 'list_media', title: 'Printers and loaded roll', annotations: readOnly,
    description: 'The printers, the roll loaded in the chosen printer (mediaKey and size in mm) and the formats it supports. Templates preview only on the loaded roll.',
    inputSchema: object({ printer }) },
  { name: 'get_design_guide', title: 'Template design guide', annotations: readOnly,
    description: 'How to write a label template: workflow, definition format, fields, every object type and good practice. Read it before designing.',
    inputSchema: object({}) },
  { name: 'list_templates', title: 'List templates', annotations: readOnly,
    description: 'Built-in and saved templates with their latest version, status and fields.',
    inputSchema: object({}) },
  { name: 'get_template', title: 'Get a template', annotations: readOnly,
    description: 'One template with its full definition; the latest version unless a version is given.',
    inputSchema: object({ id: { type: 'string' }, version: { type: 'integer', minimum: 1 } }, ['id']) },
  { name: 'preview_label', title: 'Preview a label', annotations: readOnly,
    description: 'Renders a label exactly as it would print and returns a PNG, whether it is printable, warnings per object and a preview token (valid ten minutes, for print_label). Give either template (a saved id, optionally with version) or definition (an unsaved template to test). Fields are the values; without fields each field\'s sample is used.',
    inputSchema: object({ template: { type: 'string' }, version: { type: 'integer', minimum: 1 }, definition: { type: 'object' }, fields: { type: 'object' }, printer }) },
  { name: 'save_template_draft', title: 'Save a draft', annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    description: 'Saves the definition as a new draft version. A person reviews and publishes drafts in Label Studio; other systems do not use a draft.',
    inputSchema: object({ definition: { type: 'object' } }, ['definition']) },
  { name: 'list_assets', title: 'List pictures', annotations: readOnly,
    description: 'Uploaded pictures (id, name, size in pixels) for image objects.',
    inputSchema: object({}) },
  { name: 'upload_asset', title: 'Upload a picture', annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    description: 'Uploads a PNG, JPEG or SVG picture (base64, at most 2 MB) and returns its id for an image object.',
    inputSchema: object({ name: { type: 'string' }, data: { type: 'string', description: 'The picture file as base64.' } }, ['name', 'data']) },
  { name: 'print_label', title: 'Print one label', annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    description: 'Prints ONE physical label from a preview token. Before every call, show the user the preview and get a clear yes in the conversation. Only published templates print with this key. Keep the returned requestId: repeating it never prints twice, and job_status checks it.',
    inputSchema: object({ token: { type: 'string' }, requestId: { type: 'string', description: 'A UUID; one is made when left out.' } }, ['token']) },
  { name: 'job_status', title: 'Print job status', annotations: readOnly,
    description: 'The journal record of a print request and the printer queue\'s state for it.',
    inputSchema: object({ requestId: { type: 'string' } }, ['requestId']) }
];

const text = value => ({ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) });
const query = (name, value) => value === undefined ? '' : `?${name}=${encodeURIComponent(value)}`;

// call(method, path, body) answers { status, data } from label-service with the client's key.
async function runTool(name, args, call) {
  const ok = ({ status, data }) => { if (status >= 400) throw new Error(data?.error || `label-service answered ${status}.`); return data; };
  switch (name) {
    case 'list_media': {
      const f = ok(await call('GET', `/formats${query('printer', args.printer)}`));
      return [text({ printer: f.printer, loaded: { mediaKey: f.mediaKey, sku: f.media.sku, widthMm: f.media.widthMm, heightMm: f.media.heightMm, name: f.media.name },
        formats: f.mediaPresets.map(p => ({ mediaKey: p.key, sku: p.sku, widthMm: p.widthMm, heightMm: p.heightMm })), printers: f.printers, fonts: f.fonts.map(x => x.family) })];
    }
    case 'get_design_guide': return [text(guide)];
    case 'list_templates': return [text(ok(await call('GET', '/templates')).templates)];
    case 'get_template': return [text(ok(await call('GET', `/templates/${encodeURIComponent(args.id)}${query('version', args.version)}`)))];
    case 'preview_label': {
      if (Boolean(args.template) === Boolean(args.definition)) throw new Error('Give either template (a saved id) or definition (an unsaved template).');
      const body = { template: args.definition || args.template, ...(args.version ? { version: args.version } : {}), ...(args.printer ? { printer: args.printer } : {}), include: ['png'],
        ...(args.fields ? { fields: args.fields } : args.definition ? { fields: samples(args.definition) } : { test: true }), reference: 'Label Studio MCP' };
      const p = ok(await call('POST', '/previews', body));
      // Design problems name objects; "only published templates print" is about the key, not the design.
      const warnings = p.warnings.filter(w => w.object !== 'template'), publishNote = p.warnings.find(w => w.object === 'template')?.message;
      return [{ type: 'image', data: p.png, mimeType: 'image/png' },
        text({ fits: warnings.length === 0, warnings, printable: p.printable, ...(publishNote ? { publishNote } : {}), token: p.token, expiresAt: p.expiresAt,
          template: p.template ?? p.kind, printer: p.printer, fields: p.fields })];
    }
    case 'save_template_draft': {
      const r = ok(await call('POST', '/templates', { definition: args.definition }));
      return [text({ id: r.id, version: r.version, status: r.status, note: 'Saved as a draft. A person publishes it in Label Studio.' })];
    }
    case 'list_assets': return [text(ok(await call('GET', '/assets')).assets)];
    case 'upload_asset': return [text(ok(await call('POST', '/assets', { name: args.name, data: args.data })))];
    case 'print_label': {
      const requestId = args.requestId || randomUUID();
      const r = ok(await call('POST', '/jobs', { token: args.token, requestId }));
      return [text({ requestId, state: r.state, jobId: r.jobId, note: r.state === 'unknown' ? 'The answer was lost: the label may have printed. Check with job_status and the user before printing again.' : undefined })];
    }
    case 'job_status': return [text(ok(await call('GET', `/jobs/${encodeURIComponent(args.requestId)}`)))];
    default: throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
  }
}

// An unsaved definition previews with each field's sample (or its name), like the editor.
function samples(definition) {
  return Object.fromEntries(Object.entries(definition?.fields || {}).map(([key, field]) =>
    [key, field?.type === 'lines' ? [{ text: String(field.sample ?? key) }] : String(field?.sample ?? field?.label ?? key)]));
}

// Handles one JSON-RPC message. Returns the response object, or null for a notification.
export async function handleMessage(message, call, version) {
  const reply = result => ({ jsonrpc: '2.0', id: message.id, result });
  const error = (code, text) => ({ jsonrpc: '2.0', id: message.id ?? null, error: { code, message: text } });
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return error(-32600, 'Invalid request.');
  if (message.id === undefined) return null; // notifications/initialized and others need no answer
  const params = message.params || {};
  switch (message.method) {
    case 'initialize':
      return reply({ protocolVersion: protocolVersions.includes(params.protocolVersion) ? params.protocolVersion : protocolVersions[0],
        capabilities: { tools: { listChanged: false }, resources: { listChanged: false } }, serverInfo: { name: 'label-studio', title: 'Label Studio', version },
        instructions: 'Design DYMO label templates: read get_design_guide, check list_media, preview with preview_label until there are no warnings, then save_template_draft. Never call print_label without the user\'s explicit yes for that label.' });
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools });
    case 'tools/call': {
      if (!tools.some(t => t.name === params.name)) return error(-32602, `Unknown tool: ${params.name}`);
      try { return reply({ content: await runTool(params.name, params.arguments || {}, call) }); }
      catch (e) { return reply({ content: [text(e.message)], isError: true }); }
    }
    case 'resources/list': return reply({ resources: [{ uri: guideUri, name: 'design-guide', title: 'Template design guide', mimeType: 'text/markdown' }] });
    case 'resources/read':
      if (params.uri !== guideUri) return error(-32602, 'Unknown resource.');
      return reply({ contents: [{ uri: guideUri, mimeType: 'text/markdown', text: guide }] });
    default: return error(-32601, `Method not found: ${message.method}`);
  }
}
