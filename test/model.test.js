import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canvasSize, resolveBox, toEditor, toDefinition, syncFields, unusedFields, sampleValues, fillText, snapAxis, snapTargets,
  align, reorder, duplicate, History, problems, editMedia, blankTemplate, newObject } from '../src/lib/model.js';

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
