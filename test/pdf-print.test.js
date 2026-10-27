import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pdfLabel } from '../src/lib/pdf-print.js';
import { canvasSize, naturalOrientation, bounds } from '../src/lib/model.js';

const shipping = { key: 'custom_102x210mm_102x210mm', widthPt: 289.13, heightPt: 595.28 };
const tag = { key: 'w72h154', widthPt: 72, heightPt: 154 };
const place = (media, width, height) => {
  const canvas = canvasSize(media, naturalOrientation(media));
  return { canvas, label: pdfLabel({ asset: 'aaaaaaaaaaaa', width, height, canvas, media, name: 'post.pdf' }) };
};

test('a page fills the loaded label less a margin, turned a quarter when that makes it larger', () => {
  // A tall A4 page on the tall shipping label stays upright.
  let { canvas, label } = place(shipping, 2480, 3508), [image] = label.objects;
  assert.deepEqual([label.media, label.orientation, image.rotate, image.fit, image.mode, image.threshold], [[shipping.key], 'portrait', undefined, 'contain', 'threshold', 128]);
  assert.deepEqual([image.x, image.y], [1, 1]); assert.ok(Math.abs(image.w - (canvas.w - 2)) < 0.01);
  // A wide label cut from a page is turned to stand on the tall label, and its turned corners stay on the label.
  ({ canvas, label } = place(shipping, 1800, 1200)); [image] = label.objects;
  assert.equal(image.rotate, 90);
  const b = bounds([image]);
  assert.ok(b.x >= 0.99 && b.y >= 0.99 && b.x + b.w <= canvas.w - 0.99 && b.y + b.h <= canvas.h - 0.99, JSON.stringify(b));
  // The tag roll is tall too; a tall picture keeps upright, and the name is kept short.
  ({ label } = place(tag, 100, 300)); assert.equal(label.objects[0].rotate, undefined); assert.equal(label.name, 'Print PDF: post.pdf');
  assert.equal(pdfLabel({ asset: 'a', width: 1, height: 1, canvas: { w: 10, h: 10 }, media: tag, mode: 'dither' }).objects[0].threshold, undefined);
});
