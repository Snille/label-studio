import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canvasSize, resolveBox, toEditor, toDefinition, syncFields, unusedFields, sampleValues, fillText, snapAxis, snapTargets,
  align, reorder, duplicate, History, problems, editMedia, blankTemplate, newObject, requestId, jobView, formatDate, pictureDefaults,
  bounds, normalAngle, snapAngle, unturn, placeTurned } from '../src/lib/model.js';

// The same numbers label-service uses for its formats.
const s0722430 = { key: 'w154h286', widthPt: 154, heightPt: 286, widthMm: 54, heightMm: 101 };
const s0722540 = { key: 'w162h90', widthPt: 162, heightPt: 90, widthMm: 57, heightMm: 32 };
const shipping = { key: 'custom_102x210mm_102x210mm', widthPt: 289.13, heightPt: 595.28, widthMm: 102, heightMm: 210 };
const presets = [s0722540, s0722430, shipping];
const near = (actual, expected, tolerance = 0.02) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not near ${expected}`);

test('the canvas turns when the direction differs from the format', () => {
  const portrait = canvasSize(s0722430, 'portrait');
  near(portrait.w, 54.33); near(portrait.h, 100.89);
  const landscape = canvasSize(s0722430, 'landscape');
  near(landscape.w, 100.89); near(landscape.h, 54.33);
  near(canvasSize(shipping).h, 210);
});

test('boxes resolve millimetres, percentages and end offsets like label-service', () => {
  const canvas = { w: 100, h: 50 };
  assert.deepEqual(resolveBox({ x: 2, y: 3, w: 10, h: 4 }, canvas), { x: 2, y: 3, w: 10, h: 4 });
  assert.deepEqual(resolveBox({ x: 2, right: 3, y: '10%', h: '50%' }, canvas), { x: 2, y: 5, w: 95, h: 25 });
  assert.deepEqual(resolveBox({ right: 5, w: 20, bottom: 0, h: 10 }, canvas), { x: 75, y: 40, w: 20, h: 10 });
});

test('a template survives the round trip through the editor in millimetres', () => {
  const definition = { id: 'shipping-small', name: 'Shipping', media: ['w154h286'], orientation: 'portrait',
    fields: { recipient: { type: 'text', multiline: true, sample: 'Erik' } },
    objects: [
      { id: 'recipient', type: 'text', x: 4, y: 16, right: 4, h: 30, text: '{{recipient}}', font: 'Liberation Serif', size: 12, minSize: 7 },
      { type: 'line', x: 2, y: '50%', w: 50, h: 0, dash: [1, 0.5] }
    ] };
  const doc = toEditor(definition, s0722430);
  assert.ok(doc.objects.every(o => o.uid));
  near(doc.objects[0].w, 54.33 - 8);
  near(doc.objects[1].y, 50.44);
  const back = toDefinition(doc);
  assert.deepEqual(Object.keys(back.objects[0]).sort(), ['font', 'h', 'id', 'minSize', 'size', 'text', 'type', 'w', 'x', 'y']);
  assert.equal(back.objects[1].dash.length, 2);
  assert.ok(back.objects.every(o => o.right === undefined && o.uid === undefined));
  assert.deepEqual(back.fields, definition.fields);
  assert.equal(back.description, undefined);
});

test('templates for every format are edited on the loaded roll', () => {
  const definition = { id: 'any', name: 'Any', media: ['*'], fields: {}, objects: [{ type: 'rect', x: 0, y: 0, w: '100%', h: '100%' }] };
  const media = editMedia(definition, presets, 'w162h90');
  assert.equal(media.key, 'w162h90');
  const doc = toEditor(definition, media);
  assert.deepEqual(doc.media, ['w162h90']);
  near(doc.objects[0].w, 57.15);
  assert.equal(editMedia({ media: ['custom_102x210mm_102x210mm'] }, presets, 'w162h90').key, shipping.key);
});

test('placeholders create missing fields and unused fields are reported', () => {
  const doc = { fields: { old: { type: 'text' } }, objects: [{ type: 'text', text: 'To {{recipient}} / {{ orderNo }}' }, { type: 'rect' }] };
  const fields = syncFields(doc);
  assert.deepEqual(Object.keys(fields), ['old', 'recipient', 'orderNo']);
  assert.equal(fields.recipient.type, 'text');
  assert.deepEqual(unusedFields(doc), ['old']);
});

test('test values come from samples, overrides and field names', () => {
  const fields = { a: { type: 'text', sample: 'A' }, b: { type: 'text' }, rows: { type: 'lines', sample: 'one' } };
  assert.deepEqual(sampleValues(fields, { b: 'B' }), { a: 'A', b: 'B', rows: [{ text: 'one' }] });
  assert.equal(fillText('{{a}}-{{missing}}-{{rows}}', sampleValues(fields)), 'A-{{missing}}-one');
});

test('snapping prefers edges and centres, then the grid', () => {
  const targets = snapTargets([{ x: 10, y: 0, w: 20, h: 5 }], { w: 100, h: 50 }, 'x');
  assert.deepEqual(snapAxis(10.4, 5, targets, { grid: 1, threshold: 0.5 }), { value: 10, guide: 10 });
  assert.deepEqual(snapAxis(44.8, 10, targets, { grid: 1, threshold: 0.5 }), { value: 45, guide: 50 });
  assert.deepEqual(snapAxis(70.3, 5, targets, { grid: 1, threshold: 0.5 }), { value: 70, guide: null });
  assert.deepEqual(snapAxis(70.33, 5, targets, { grid: 0, threshold: 0 }), { value: 70.33, guide: null });
});

test('align uses the label for one object and the selection bounds for several', () => {
  const canvas = { w: 100, h: 50 };
  const objects = [{ uid: 'a', x: 10, y: 10, w: 20, h: 10 }, { uid: 'b', x: 50, y: 30, w: 10, h: 5 }];
  assert.equal(align(objects, ['a'], 'right', canvas)[0].x, 80);
  assert.equal(align(objects, ['a'], 'middle', canvas)[0].y, 20);
  const both = align(objects, ['a', 'b'], 'left', canvas);
  assert.deepEqual(both.map(o => o.x), [10, 10]);
  assert.equal(align([{ uid: 'l', x: 30, y: 5, w: -20, h: 0 }], ['l'], 'left', canvas)[0].x, 20);
});

test('layer order moves the selection one step or to the end', () => {
  const list = ['a', 'b', 'c', 'd'].map(uid => ({ uid }));
  const ids = objects => objects.map(o => o.uid).join('');
  assert.equal(ids(reorder(list, ['a'], 'front')), 'bcda');
  assert.equal(ids(reorder(list, ['d'], 'back')), 'dabc');
  assert.equal(ids(reorder(list, ['b'], 'forward')), 'acbd');
  assert.equal(ids(reorder(list, ['c', 'd'], 'forward')), 'abcd');
  assert.equal(ids(reorder(list, ['b', 'c'], 'backward')), 'bcad');
});

test('copies get new uids, free names and an offset', () => {
  const existing = [{ uid: '1', id: 'title', x: 1, y: 1 }, { uid: '2', id: 'title_2', x: 1, y: 1 }];
  const [copy] = duplicate([existing[0]], existing);
  assert.notEqual(copy.uid, '1');
  assert.equal(copy.id, 'title_3');
  assert.equal(copy.x, 3);
});

test('history undoes and redoes snapshots and drops the future on a new change', () => {
  const history = new History(3);
  history.record({ n: 1 }); history.record({ n: 1 }); history.record({ n: 2 });
  assert.equal(history.canUndo, true);
  assert.deepEqual(history.undo(), { n: 1 });
  assert.equal(history.undo(), null);
  assert.deepEqual(history.redo(), { n: 2 });
  history.undo(); history.record({ n: 3 });
  assert.equal(history.canRedo, false);
  for (let n = 4; n < 10; n++) history.record({ n });
  assert.equal(history.past.length, 3);
});

test('save problems are found before label-service sees them', () => {
  const doc = blankTemplate(s0722540);
  assert.equal(doc.orientation, 'landscape');
  assert.deepEqual(problems(doc), ['Add at least one object.']);
  doc.id = 'box'; doc.objects.push({ ...newObject('text', { x: 1, y: 1 }, canvasSize(s0722540)), id: '1st', text: '{{bad name}}' });
  assert.equal(problems(doc).length, 3);
  const line = newObject('line', { x: 50, y: 10 }, canvasSize(s0722540));
  assert.equal(line.h, 0); near(line.w, 7.15);
});

test('print request ids are version 4 UUIDs that label-service accepts, without crypto.randomUUID', () => {
  // label-service checks /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/; Studio runs on plain http,
  // where browsers do not offer crypto.randomUUID.
  const saved = crypto.randomUUID;
  Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
  try {
    const ids = new Set(Array.from({ length: 200 }, requestId));
    assert.equal(ids.size, 200);
    for (const id of ids) assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  } finally { Object.defineProperty(crypto, 'randomUUID', { value: saved, configurable: true }); }
});

test('a print job is followed until CUPS reports an end state', () => {
  const sent = { state: 'submitted', jobId: 4 };
  assert.deepEqual([jobView(sent, null).done, jobView(sent, { state: 'processing' }).done, jobView(sent, { state: 'pending' }).done], [false, false, false]);
  assert.deepEqual(jobView(sent, { state: 'completed' }), { kind: 'ok', done: true, text: 'Printed (CUPS job 4).' });
  for (const state of ['canceled', 'aborted']) assert.equal(jobView(sent, { state }).kind, 'error');
  assert.match(jobView(sent, { state: 'stopped', reasons: ['media-empty'] }).text, /stopped: media-empty/);
  assert.equal(jobView({ state: 'unknown' }).done, true);
  assert.equal(jobView({ state: 'rejected' }).kind, 'error');
});

test('barcodes take part in fields, and new barcode, QR and date objects have usable defaults', () => {
  const canvas = { w: 57, h: 32 };
  const bar = newObject('barcode', { x: 2, y: 2 }, canvas), qr = newObject('qr', { x: 40, y: 2 }, canvas), date = newObject('date', { x: 2, y: 26 }, canvas);
  assert.deepEqual([bar.type, bar.symbology, qr.type, qr.symbology, qr.w, qr.h], ['barcode', 'code128', 'barcode', 'qrcode', 16, 16]);
  assert.equal(date.format, 'yyyy-MM-dd');
  const doc = { id: 'codes', name: 'Codes', media: ['w162h90'], orientation: 'landscape', fields: { old: { type: 'text' } }, objects: [{ ...bar, data: 'X-{{orderNo}}' }, qr, date] };
  assert.deepEqual(Object.keys(toDefinition(doc).fields), ['old', 'orderNo', 'code']);
  assert.deepEqual(unusedFields({ ...doc, fields: toDefinition(doc).fields }), ['old']);
  assert.deepEqual(problems(doc), []);
  assert.deepEqual(problems({ ...doc, objects: [{ ...bar, data: ' ' }] }), ['Give each barcode its data.']);
  assert.equal(formatDate(new Date(2026, 0, 5, 7, 9), 'dd.MM.yy HH:mm'), '05.01.26 07:09');
});

test('a new image object asks for its picture before saving or previewing', () => {
  const canvas = { w: 57, h: 32 }, image = newObject('image', { x: 2, y: 2 }, canvas);
  assert.deepEqual([image.type, image.asset, image.w, image.h], ['image', '', 25, 15]);
  const doc = { id: 'pic', name: 'Pic', media: ['w162h90'], orientation: 'landscape', fields: {}, objects: [image] };
  assert.deepEqual(problems(doc), ['Choose a picture for each image object.']);
  assert.deepEqual(problems({ ...doc, objects: [{ ...image, asset: 'abcdefabcdef' }] }), []);
  assert.equal(toDefinition({ ...doc, objects: [{ ...image, asset: 'abcdefabcdef', mode: 'dither' }] }).objects[0].asset, 'abcdefabcdef');
});

test('a print density chosen for the template is kept, and an empty one is left out', () => {
  const definition = { id: 'dense', name: 'Dense', media: ['w162h90'], printDensity: 'light', fields: {}, objects: [{ type: 'rect', x: 1, y: 1, w: 5, h: 5 }] };
  const doc = toEditor(definition, { key: 'w162h90', widthPt: 162, heightPt: 90 });
  assert.equal(doc.printDensity, 'light'); assert.equal(toDefinition(doc).printDensity, 'light');
  assert.equal('printDensity' in toDefinition({ ...doc, printDensity: '' }), false);
});

test('the picture defaults shown in the panel match label-service', () => {
  assert.deepEqual(pictureDefaults('dither'), { threshold: 140, lighten: 15 });
  assert.deepEqual(pictureDefaults(undefined), { threshold: 128, lighten: 0 });
});

test('rotation: angles, snapping, turned bounds and resizing in the frame of the object', () => {
  assert.equal(normalAngle(0), undefined); assert.equal(normalAngle(360), undefined); assert.equal(normalAngle(270), -90); assert.equal(normalAngle(-450), -90);
  assert.equal(normalAngle(12.345), 12.35); assert.equal(Math.abs(normalAngle(180)), 180);
  assert.equal(snapAngle(43), 45); assert.equal(snapAngle(41), 41); assert.equal(snapAngle(41, { steps: true }), 45); assert.equal(snapAngle(44, { free: true }), 44);
  // A 20 x 4 box turned a quarter stands 4 wide and 20 tall about the same centre.
  const box = { type: 'text', x: 10, y: 20, w: 20, h: 4, rotate: 90 }, b = bounds([box]);
  near(b.x, 18); near(b.y, 12); near(b.w, 4); near(b.h, 20);
  near(bounds([{ ...box, rotate: undefined }]).w, 20);
  const line = bounds([{ type: 'line', x: 0, y: 5, w: 10, h: 0, rotate: 90 }]);
  near(line.x, 5); near(line.y, 0); near(line.w, 0); near(line.h, 10);
  // Dragging right on the label moves down in the frame of an object turned 90 degrees.
  const [lx, ly] = unturn(3, 0, 90); near(lx, 0); near(ly, -3);
  // Growing the turned box at its east edge (its bottom on the label) keeps the west edge (its top) in place.
  const grown = placeTurned(box, { x: 10, y: 20, w: 26, h: 4 }, 90);
  near(grown.w, 26); const before = bounds([box]), after = bounds([{ ...box, ...grown }]);
  near(after.y, before.y); near(after.h, 26); near(after.x, before.x);
});

test('a template for any roll saves media "*" and positions as shares of the label, and opens again in millimetres', () => {
  const canvas = canvasSize(s0722540, 'landscape'), doc = toEditor({ id: 'tag', name: 'Tag', media: ['w162h90'], orientation: 'landscape', fields: {},
    objects: [{ id: 't', type: 'text', x: 5.7, y: 3.2, w: 45.6, h: 8, text: 'A', rotate: 90 }, { type: 'line', x: 2, y: 20, w: 10, h: 0 }] }, s0722540);
  assert.equal(doc.anyRoll, false); assert.equal(blankTemplate(s0722540, { anyRoll: true }).anyRoll, true); assert.deepEqual(toDefinition(doc, canvas).media, ['w162h90']); assert.equal(toDefinition(doc, canvas).objects[0].x, 5.7);
  doc.anyRoll = true;
  const saved = toDefinition(doc, canvas), [t, line] = saved.objects;
  assert.deepEqual(saved.media, ['*']);
  assert.equal(t.x, `${+(5.7 / canvas.w * 100).toFixed(4)}%`); assert.equal(t.h, `${+(8 / canvas.h * 100).toFixed(4)}%`); assert.equal(t.rotate, 90);
  assert.equal(line.h, '0%');
  // Opened on another roll, the shares become that roll's millimetres.
  const other = toEditor(saved, s0722430), big = canvasSize(s0722430, 'landscape');
  assert.equal(other.anyRoll, true); assert.deepEqual(other.media, ['w154h286']);
  near(other.objects[0].x, 5.7 / canvas.w * big.w); near(other.objects[0].w, 45.6 / canvas.w * big.w);
  // Millimetres are kept to 0.01 mm in the editor, so a round trip moves a share by far less than a printer dot.
  toDefinition(other, big).objects.forEach((o, i) => near(parseFloat(o.x), parseFloat(saved.objects[i].x), 0.01));
});
