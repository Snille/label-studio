// Print PDF: one picture filled into the loaded label as an unsaved design. Pure functions, tested in Node.

export const wholePage = Object.freeze({ x: 0, y: 0, w: 1, h: 1 });
const margin = 1; // mm around the picture: thermal printers can lose the outermost dots
const mm = value => +value.toFixed(2);

// The picture is turned a quarter when that makes it larger on the label (a tall page on a wide label), and kept
// in proportion inside the label less the margin.
export function pdfLabel({ asset, width, height, canvas, media, mode = 'threshold', threshold = 128, name = 'PDF' }) {
  const wide = width >= height, labelWide = canvas.w >= canvas.h, turn = wide !== labelWide;
  const boxW = (turn ? canvas.h : canvas.w) - 2 * margin, boxH = (turn ? canvas.w : canvas.h) - 2 * margin;
  const image = { id: 'page', type: 'image', x: mm((canvas.w - boxW) / 2), y: mm((canvas.h - boxH) / 2), w: mm(boxW), h: mm(boxH),
    asset, fit: 'contain', mode, ...(mode === 'threshold' ? { threshold } : {}), ...(turn ? { rotate: 90 } : {}) };
  return { id: 'print-pdf', name: `Print PDF: ${name}`.slice(0, 120), media: [media.key], orientation: labelWide ? 'landscape' : 'portrait', fields: {}, objects: [image] };
}
