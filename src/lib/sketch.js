// Stand-in drawings of barcodes for the editor canvas. They follow the data and the box so the label reads right, but
// they are not real codes: the label-service preview shows the real ones. Rectangles are in millimetres.

// A small deterministic random sequence from the data, so the drawing only changes when the data does.
function random(seed) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}

// Linear: bars across the box width, above the space for the text.
export function sketchLinear(box, data, barsHeight) {
  const next = random(data || 'x'), widths = [2, 1, 1];
  for (let i = 0; i < Math.max(8, data.length) * 6; i++) widths.push(1 + Math.floor(next() * 3));
  widths.push(2, 1, 1);
  const total = widths.reduce((a, b) => a + b, 0), unit = box.w / total, rects = [];
  let x = box.x;
  widths.forEach((w, i) => { if (i % 2 === 0) rects.push({ x, y: box.y, w: w * unit, h: barsHeight }); x += w * unit; });
  return rects;
}

// 2D: a square grid in the middle of the box, with QR finder squares or the Data Matrix L-shaped border.
export function sketchMatrix(box, data, symbology) {
  const n = symbology === 'qrcode' ? 25 : 18, side = Math.min(box.w, box.h), cell = side / n;
  const x0 = box.x + (box.w - side) / 2, y0 = box.y + (box.h - side) / 2, next = random(data || 'x'), rects = [];
  const add = (c, r, w = 1, h = 1) => rects.push({ x: x0 + c * cell, y: y0 + r * cell, w: w * cell, h: h * cell });
  const finder = (c, r) => { add(c, r, 7, 1); add(c, r + 6, 7, 1); add(c, r + 1, 1, 5); add(c + 6, r + 1, 1, 5); add(c + 2, r + 2, 3, 3); };
  const reserved = (c, r) => symbology === 'qrcode'
    ? (c < 8 && r < 8) || (c >= n - 8 && r < 8) || (c < 8 && r >= n - 8)
    : c === 0 || r === n - 1 || r === 0 || c === n - 1;
  if (symbology === 'qrcode') { finder(0, 0); finder(n - 7, 0); finder(0, n - 7); }
  else {
    add(0, 0, 1, n); add(0, n - 1, n, 1);
    for (let i = 0; i < n; i += 2) { add(i, 0); add(n - 1, n - 1 - i); }
  }
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!reserved(c, r) && next() < 0.5) add(c, r);
  return rects;
}
