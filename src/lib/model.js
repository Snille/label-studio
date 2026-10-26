// The editor's view of a label-service template (format v1). The editor keeps every object as an absolute box in
// millimetres on the readable label; saving writes x, y, w and h back in millimetres. Pure functions, no browser APIs.

export const ptPerMm = 72 / 25.4;
export const fontFamilies = ['Liberation Sans', 'Liberation Serif', 'Liberation Mono', 'DejaVu Sans Condensed'];
export const italicFamilies = ['Liberation Sans'];
export const objectTypes = ['text', 'line', 'rect', 'ellipse', 'barcode', 'date', 'image'];
export const symbologies = [['code128', 'Code 128'], ['ean13', 'EAN-13'], ['qrcode', 'QR code'], ['datamatrix', 'Data Matrix']];
export const twoDimensional = symbology => symbology === 'qrcode' || symbology === 'datamatrix';
export const dateFormats = ['yyyy-MM-dd', 'yyyy-MM-dd HH:mm', 'dd.MM.yyyy', 'dd/MM/yy', 'HH:mm'];
// The text of an object that may hold {{field}} placeholders: a text's text or a barcode's data.
const placeholderText = item => item.type === 'text' ? item.text : item.type === 'barcode' ? item.data : item.type === 'stack' ? item.items : '';
const geometryKeys = ['x', 'y', 'w', 'h', 'right', 'bottom'];
const round = (value, step = 0.01) => Math.round(value / step) * step;
const clean = value => +round(value).toFixed(2);

export const naturalOrientation = media => media.widthPt > media.heightPt ? 'landscape' : 'portrait';

// The readable canvas: a direction other than the format's natural one turns the label a quarter turn.
export function canvasSize(media, orientation) {
  const rotated = (orientation || naturalOrientation(media)) !== naturalOrientation(media);
  const w = media.widthPt / ptPerMm, h = media.heightPt / ptPerMm;
  return rotated ? { w: h, h: w } : { w, h };
}

// Each axis takes two of start, end and size, in millimetres or a percentage of the side (as label-service does).
export function resolveBox(item, canvas) {
  const length = (value, side) => typeof value === 'string' ? side * parseFloat(value) / 100 : value;
  const axis = (start, end, size, side) => {
    const s = item[start] === undefined ? undefined : length(item[start], side);
    const e = item[end] === undefined ? undefined : length(item[end], side);
    const z = item[size] === undefined ? undefined : length(item[size], side);
    return s !== undefined && z !== undefined ? [s, z] : s !== undefined ? [s, side - e - s] : [side - e - z, z];
  };
  const [x, w] = axis('x', 'right', 'w', canvas.w), [y, h] = axis('y', 'bottom', 'h', canvas.h);
  return { x, y, w, h };
}

export const placeholders = text => [...String(text || '').matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)].map(m => m[1]);
export const fieldName = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;
export const templateId = /^[a-z0-9][a-z0-9-]{1,63}$/;

// A version 4 UUID for a print request. crypto.randomUUID exists only on https and localhost pages, and Studio is
// served over plain http on the LAN; crypto.getRandomValues works everywhere.
export function requestId() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// What a print job looks like to the user: the journal record from label-service and, once CUPS has a job, its state.
// done is true when the state can no longer change, so Studio stops asking.
export function jobView(record, status) {
  if (record.state === 'unknown') return { kind: 'warn', done: true, text: "The printer's answer was lost. The label may have printed. Check the printer before you print again." };
  if (record.state !== 'submitted') return { kind: 'error', done: true, text: `The print was refused (${record.state}). Nothing was printed.` };
  const job = `CUPS job ${record.jobId}`, state = status?.state;
  if (state === 'completed') return { kind: 'ok', done: true, text: `Printed (${job}).` };
  if (state === 'canceled' || state === 'aborted') return { kind: 'error', done: true, text: `The printer did not finish the label (${job} ${state}).` };
  if (state === 'stopped' || state === 'held') return { kind: 'warn', done: false, text: `${job} is ${state}${status.reasons?.length ? `: ${status.reasons.join(', ')}` : ''}. Check the printer.` };
  return { kind: 'ok', done: false, text: `Sent to the printer (${job})${state ? `: ${state}` : ''}…` };
}

let counter = 0;
export const uid = () => `o${Date.now().toString(36)}${(counter++).toString(36)}`;

// The media a template is edited on: its first listed format, or the loaded roll for "*" templates.
export function editMedia(definition, presets, loadedKey) {
  return presets.find(p => definition.media.includes(p.key)) || presets.find(p => p.key === loadedKey) || presets[0];
}

export function toEditor(definition, media) {
  const orientation = definition.orientation || naturalOrientation(media);
  const canvas = canvasSize(media, orientation);
  const objects = definition.objects.map(item => {
    const rest = Object.fromEntries(Object.entries(item).filter(([k]) => !geometryKeys.includes(k)));
    const box = resolveBox(item, canvas);
    return { ...structuredClone(rest), uid: uid(), x: clean(box.x), y: clean(box.y), w: clean(box.w), h: clean(box.h) };
  });
  return { id: definition.id, name: definition.name, description: definition.description || '', media: definition.media.includes('*') ? [media.key] : [...definition.media],
    orientation, fields: structuredClone(definition.fields || {}), objects };
}

// Fields used in text that are not declared yet become plain text fields, so a placeholder always has a field.
export function syncFields(doc) {
  const fields = { ...doc.fields };
  for (const item of doc.objects) {
    if (item.type !== 'text' && item.type !== 'barcode') continue;
    for (const name of placeholders(placeholderText(item))) if (fieldName.test(name) && !fields[name]) fields[name] = { type: 'text', label: name, sample: name };
  }
  return fields;
}

export const unusedFields = doc => Object.keys(doc.fields).filter(name => !doc.objects.some(item => placeholders(placeholderText(item)).includes(name)));

export function toDefinition(doc) {
  const objects = doc.objects.map(({ uid: _, x, y, w, h, ...rest }) => {
    const props = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)));
    return { ...props, x: clean(x), y: clean(y), w: clean(w), h: clean(h) };
  });
  const definition = { id: doc.id, name: doc.name.trim(), media: [...doc.media], orientation: doc.orientation, fields: syncFields(doc), objects };
  if (doc.description?.trim()) definition.description = doc.description.trim();
  return definition;
}

// Test values for a preview: each field's sample, or its name, so a new template previews at once.
export function sampleValues(fields, overrides = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, field]) => {
    const value = overrides[key] ?? field.sample ?? field.label ?? key;
    return [key, field.type === 'lines' ? (Array.isArray(value) ? value : String(value).split('\n').map(text => ({ text }))) : String(value)];
  }));
}

export const fillText = (text, values) => String(text || '').replace(/\{\{\s*([^}]*?)\s*\}\}/g, (match, key) => {
  const value = values[key];
  return value === undefined ? match : Array.isArray(value) ? value.map(l => l.text).join('\n') : value;
});

export function newObject(type, at, canvas) {
  const base = { uid: uid(), type, x: clean(at.x), y: clean(at.y) };
  const fit = (w, h) => ({ w: clean(Math.min(w, canvas.w - at.x)), h: clean(Math.min(h, canvas.h - at.y)) });
  if (type === 'text') return { ...base, ...fit(Math.min(40, canvas.w * 0.6), 8), text: 'Text', font: fontFamilies[0], size: 10, align: 'left', valign: 'top' };
  if (type === 'line') return { ...base, w: clean(Math.min(30, canvas.w - at.x)), h: 0, stroke: 0.3 };
  if (type === 'barcode') return { ...base, ...fit(Math.min(40, canvas.w * 0.7), 12), symbology: 'code128', data: '{{code}}' };
  if (type === 'qr') return { ...base, type: 'barcode', ...fit(16, 16), symbology: 'qrcode', data: '{{code}}' };
  if (type === 'image') return { ...base, ...fit(Math.min(25, canvas.w * 0.5), Math.min(15, canvas.h * 0.5)), asset: '' };
  if (type === 'date') return { ...base, ...fit(Math.min(30, canvas.w * 0.5), 5), format: dateFormats[0], font: fontFamilies[0], size: 8, align: 'left', valign: 'top' };
  return { ...base, ...fit(20, 12), stroke: 0.3, fill: 'none' };
}

// The same date tokens as label-service: yyyy, yy, MM, dd, HH, mm.
export function formatDate(date, format = 'yyyy-MM-dd') {
  const two = n => String(n).padStart(2, '0');
  const parts = { yyyy: String(date.getFullYear()), yy: two(date.getFullYear() % 100), MM: two(date.getMonth() + 1), dd: two(date.getDate()), HH: two(date.getHours()), mm: two(date.getMinutes()) };
  return format.replace(/yyyy|yy|MM|dd|HH|mm/g, token => parts[token]);
}

// Snapping: an edge or centre within the threshold snaps to the label's edges and centre or to other objects;
// otherwise the start snaps to the grid. Returns the snapped value and the guide it used, if any.
export function snapAxis(start, size, targets, { grid = 0, threshold = 0 } = {}) {
  let best = null;
  for (const [offset, edge] of [[0, start], [size / 2, start + size / 2], [size, start + size]]) {
    for (const target of targets) {
      const distance = Math.abs(target - edge);
      if (distance <= threshold && (!best || distance < best.distance)) best = { distance, value: target - offset, guide: target };
    }
  }
  if (best) return { value: clean(best.value), guide: best.guide };
  return { value: clean(grid > 0 ? round(start, grid) : start), guide: null };
}

export function snapTargets(objects, canvas, axis) {
  const [pos, size, side] = axis === 'x' ? ['x', 'w', canvas.w] : ['y', 'h', canvas.h];
  const targets = [0, side / 2, side];
  for (const item of objects) {
    const a = Math.min(item[pos], item[pos] + item[size]), b = Math.max(item[pos], item[pos] + item[size]);
    targets.push(a, (a + b) / 2, b);
  }
  return targets;
}

// The box around one or more objects (lines may have a negative width or height).
export function bounds(objects) {
  const xs = objects.flatMap(o => [o.x, o.x + o.w]), ys = objects.flatMap(o => [o.y, o.y + o.h]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

// Align the selection to its own bounds, or a single object to the label.
export function align(objects, selected, mode, canvas) {
  const chosen = objects.filter(o => selected.includes(o.uid));
  if (!chosen.length) return objects;
  const area = chosen.length === 1 ? { x: 0, y: 0, w: canvas.w, h: canvas.h } : bounds(chosen);
  return objects.map(o => {
    if (!selected.includes(o.uid)) return o;
    const box = bounds([o]), dx = { left: area.x - box.x, center: area.x + area.w / 2 - (box.x + box.w / 2), right: area.x + area.w - (box.x + box.w) }[mode];
    const dy = { top: area.y - box.y, middle: area.y + area.h / 2 - (box.y + box.h / 2), bottom: area.y + area.h - (box.y + box.h) }[mode];
    return { ...o, x: clean(o.x + (dx || 0)), y: clean(o.y + (dy || 0)) };
  });
}

// Layer order: later objects are drawn on top.
export function reorder(objects, selected, op) {
  const picked = objects.filter(o => selected.includes(o.uid)), rest = objects.filter(o => !selected.includes(o.uid));
  if (op === 'front') return [...rest, ...picked];
  if (op === 'back') return [...picked, ...rest];
  const list = [...objects];
  const indices = list.map((o, i) => selected.includes(o.uid) ? i : -1).filter(i => i >= 0);
  if (op === 'forward') for (const i of indices.reverse()) { if (i < list.length - 1 && !selected.includes(list[i + 1].uid)) [list[i], list[i + 1]] = [list[i + 1], list[i]]; }
  if (op === 'backward') for (const i of indices) { if (i > 0 && !selected.includes(list[i - 1].uid)) [list[i], list[i - 1]] = [list[i - 1], list[i]]; }
  return list;
}

// Copies keep their look but get new uids, a free id and a small offset.
export function duplicate(items, existing, offset = 2) {
  const ids = new Set(existing.map(o => o.id).filter(Boolean));
  return items.map(item => {
    const copy = { ...structuredClone(item), uid: uid(), x: clean(item.x + offset), y: clean(item.y + offset) };
    if (copy.id) { let n = 2; while (ids.has(`${item.id}_${n}`)) n++; copy.id = `${item.id}_${n}`; ids.add(copy.id); }
    return copy;
  });
}

// Undo and redo over whole snapshots; small templates make this cheap and always correct.
export class History {
  constructor(limit = 200) { this.limit = limit; this.past = []; this.future = []; }
  record(snapshot) {
    const json = JSON.stringify(snapshot);
    if (this.past.at(-1) === json) return false;
    this.past.push(json); if (this.past.length > this.limit) this.past.shift();
    this.future = []; return true;
  }
  undo() {
    if (this.past.length < 2) return null;
    this.future.push(this.past.pop());
    return JSON.parse(this.past.at(-1));
  }
  redo() {
    if (!this.future.length) return null;
    const json = this.future.pop(); this.past.push(json);
    return JSON.parse(json);
  }
  get canUndo() { return this.past.length > 1; }
  get canRedo() { return this.future.length > 0; }
}

export function blankTemplate(media, { id = 'new-label', name = 'New label', orientation } = {}) {
  return { id, name, description: '', media: [media.key], orientation: orientation || naturalOrientation(media), fields: {}, objects: [] };
}

// A short check before saving, so the user sees the problem next to the field instead of a server error.
export function problems(doc) {
  const list = [];
  if (!templateId.test(doc.id) || ['box', 'location', 'lines'].includes(doc.id)) list.push('The id must be 2-64 lower-case letters, digits or hyphens, and not box, location or lines.');
  if (!doc.name.trim()) list.push('Give the template a name.');
  if (!doc.objects.length) list.push('Add at least one object.');
  const ids = doc.objects.map(o => o.id).filter(Boolean);
  if (ids.some(id => !fieldName.test(id))) list.push('Object names start with a letter and use letters, digits or _.');
  if (new Set(ids).size !== ids.length) list.push('Object names must be unique.');
  for (const name of doc.objects.flatMap(o => placeholders(placeholderText(o)))) if (!fieldName.test(name)) list.push(`{{${name}}} is not a valid field name.`);
  if (doc.objects.some(o => o.type === 'barcode' && !String(o.data || '').trim())) list.push('Give each barcode its data.');
  if (doc.objects.some(o => o.type === 'image' && !o.asset)) list.push('Choose a picture for each image object.');
  return [...new Set(list)];
}
