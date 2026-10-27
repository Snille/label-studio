// Batch printing (decision B8): one row of a sheet becomes one label and one print job with its own request id.
// Pure functions, no browser APIs, so they are tested in Node.

import { requestId } from './model.js';

// label-service's built-in kinds that a sheet can fill, with their fields (the "lines" kind takes a list instead).
export const builtInFields = {
  box: { title: { type: 'text', label: 'Title', multiline: true }, description: { type: 'text', label: 'Description', required: false, multiline: true }, location: { type: 'text', label: 'Location', multiline: true } },
  location: { location: { type: 'text', label: 'Location', multiline: true } }
};

// The text fields a batch can fill. A template with a "lines" field cannot be filled from a sheet.
export const textFields = fields => Object.entries(fields || {}).filter(([, f]) => f.type === 'text').map(([name, f]) => ({ name, ...f }));
export const unsupported = fields => Object.entries(fields || {}).filter(([, f]) => f.type !== 'text').map(([name]) => name);

// Each field takes the column with the same name or label, ignoring case, spaces, hyphens and underscores.
const simple = s => String(s || '').toLowerCase().replace(/[\s_-]+/g, '');
export function autoMap(fields, columns) {
  return Object.fromEntries(textFields(fields).map(f => [f.name, columns.find(c => simple(c) === simple(f.name)) || columns.find(c => f.label && simple(c) === simple(f.label)) || '']));
}

// The field values for one row. An unmapped field is empty; label-service says when a required one is missing.
export function rowFields(row, mapping, fields) {
  return Object.fromEntries(textFields(fields).map(f => {
    let value = mapping[f.name] ? String(row[mapping[f.name]] ?? '') : '';
    if (!f.multiline) value = value.replace(/\s*\r?\n\s*/g, ' ');
    return [f.name, value.trim()];
  }));
}

// A batch is the same template version and the same values in the same order. Its key finds the request ids of an
// earlier, interrupted run of that batch, so a restart skips the rows that were already sent.
export function batchKey(template, values) {
  const text = JSON.stringify([template.id, template.version, values]);
  let a = 0x811c9dc5, b = 0x01000193;
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193); b = Math.imul(b ^ c, 0x5bd1e995); }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}

// Request ids per row, kept from an earlier run when there is one.
export function requestIds(saved, count) {
  return Array.from({ length: count }, (_, i) => typeof saved?.[i] === 'string' && /^[0-9a-f-]{36}$/.test(saved[i]) ? saved[i] : requestId());
}

// What a row shows in the list.
export function rowState(row) {
  if (row.error) return { kind: 'error', text: row.error };
  if (row.job) return { kind: row.job.kind, text: row.job.text };
  if (row.check === undefined) return { kind: 'muted', text: 'Not checked' };
  if (!row.check.printable) return { kind: 'error', text: row.check.warnings.map(w => w.message).join(' ') };
  return { kind: 'ok', text: 'Fits' };
}
