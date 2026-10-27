// Reads the first sheet of a spreadsheet into column names and rows of text, for batch printing. Formats: .xlsx (Excel
// 2007+), .ods (OpenDocument), .csv, .tsv and .txt, and cells pasted from a spreadsheet (tab-separated text). No
// packages: .xlsx and .ods are zip files of XML, and the browser (and Node) inflate zip entries with DecompressionStream.
// The first row holds the column names. Every value becomes text: numbers as written, dates as yyyy-MM-dd (HH:mm).

export const sheetTypes = ['.xlsx', '.ods', '.csv', '.tsv', '.txt'];
export const maxFileBytes = 5 * 1024 * 1024;
const maxUnzipped = 50 * 1024 * 1024, maxRows = 2000, maxColumns = 200;

export class SheetError extends Error {}

export async function readSheet(name, bytes) {
  const type = (/\.[^.]+$/.exec(name.toLowerCase()) || [''])[0];
  if (bytes.byteLength > maxFileBytes) throw new SheetError('The file is larger than 5 MB.');
  if (type === '.xls') throw new SheetError('Old .xls files are not supported. Save the file as .xlsx in Excel and try again.');
  if (type === '.xlsx') return table(await xlsxRows(await unzip(bytes)));
  if (type === '.ods') return table(await odsRows(await unzip(bytes)));
  if (['.csv', '.tsv', '.txt'].includes(type)) return parseText(decodeText(bytes));
  throw new SheetError(`Choose a ${sheetTypes.join(', ')} file.`);
}

// Pasted cells and text files: the separator is the one of tab, semicolon and comma that the first line uses most
// (Swedish Excel saves CSV with semicolons). Quotes follow RFC 4180.
export function parseText(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const counts = ['\t', ';', ','].map(s => [s, first.replace(/"[^"]*"/g, '').split(s).length - 1]);
  const separator = counts.reduce((best, c) => c[1] > best[1] ? c : best, ['\t', 0])[0];
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === separator) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return table(rows);
}

// Text files are UTF-8, or Windows-1252 when they are not valid UTF-8 (older Excel versions save CSV that way).
function decodeText(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return new TextDecoder('windows-1252').decode(bytes); }
}

// Rows of cells become column names and row objects. Empty rows and columns without a name are left out; a repeated
// name gets a number. lines[i] is the sheet's own row number of rows[i], as the spreadsheet shows it.
function table(cells) {
  const numbered = Array.from(cells, (r, i) => [Array.from(r || [], v => String(v ?? '').trim()), i + 1]).filter(([r]) => r.some(Boolean));
  const rows = numbered.map(([r]) => r);
  if (!rows.length) throw new SheetError('The sheet is empty.');
  if (rows.length - 1 > maxRows) throw new SheetError(`The sheet has more than ${maxRows} rows.`);
  const columns = [], seen = new Map();
  rows[0].slice(0, maxColumns).forEach((raw, index) => {
    if (!raw) return;
    const count = (seen.get(raw) || 0) + 1; seen.set(raw, count);
    columns.push({ name: count > 1 ? `${raw} (${count})` : raw, index });
  });
  if (!columns.length) throw new SheetError('The first row must hold the column names.');
  return { columns: columns.map(c => c.name), rows: rows.slice(1).map(r => Object.fromEntries(columns.map(c => [c.name, r[c.index] ?? '']))),
    lines: numbered.slice(1).map(([, line]) => line) };
}

// --- zip ---

export async function unzip(bytes) {
  const data = new Uint8Array(bytes), view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new SheetError('The file is not a valid .xlsx or .ods file.');
  const count = view.getUint16(end + 10, true), files = new Map();
  let at = view.getUint32(end + 16, true), total = 0;
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new SheetError('The file is damaged.');
    const method = view.getUint16(at + 10, true), size = view.getUint32(at + 20, true), unzipped = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true), extra = view.getUint16(at + 30, true), comment = view.getUint16(at + 32, true), local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(data.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extra + comment;
    total += unzipped; if (total > maxUnzipped) throw new SheetError('The file unpacks to more than 50 MB.');
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    files.set(name, { method, raw: data.subarray(start, start + size) });
  }
  return {
    async text(name) {
      const file = files.get(name);
      if (!file) return null;
      if (file.method === 0) return new TextDecoder().decode(file.raw);
      if (file.method !== 8) throw new SheetError('The file uses a compression this reader does not know.');
      const stream = new Blob([file.raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Response(stream).text();
    }
  };
}

// --- XML helpers for the few, well-known shapes these formats use ---

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export const decodeXml = s => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : entities[e] ?? m);
const attributes = text => Object.fromEntries([...text.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)].map(m => [m[1], decodeXml(m[2])]));
// Elements by name with their attributes and inner XML; self-closing ones have an empty body.
const elements = (xml, name) => [...xml.matchAll(new RegExp(`<${name}(\\s[^>]*?)?(?:/>|>([\\s\\S]*?)</${name}>)`, 'g'))]
  .map(m => ({ attrs: attributes(m[1] || ''), body: m[2] || '' }));
const textOf = xml => decodeXml(elements(xml, 't').map(t => t.body).join(''));

// --- numbers and dates ---

// A number as people write it: no binary noise such as 0.30000000000000004.
const numberText = value => String(+(+value).toPrecision(15));
const two = n => String(n).padStart(2, '0');
function dateText(date, withTime) {
  const day = `${date.getUTCFullYear()}-${two(date.getUTCMonth() + 1)}-${two(date.getUTCDate())}`;
  return withTime ? `${day} ${two(date.getUTCHours())}:${two(date.getUTCMinutes())}` : day;
}
// Excel counts days from 1899-12-30 (with its 1900 leap-year quirk folded in).
export function excelDate(serial) {
  const ms = Math.round((serial - 25569) * 86400000);
  return dateText(new Date(ms), Math.abs(serial % 1) > 1e-9);
}
const builtInDates = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
const isDateFormat = code => /[dmyhs]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, ''));

// --- xlsx ---

async function xlsxRows(zip) {
  const workbook = await zip.text('xl/workbook.xml');
  if (!workbook) throw new SheetError('The file is not a valid .xlsx file.');
  const sheet = elements(workbook, 'sheet')[0];
  if (!sheet) throw new SheetError('The workbook has no sheets.');
  const rels = elements(await zip.text('xl/_rels/workbook.xml.rels') || '', 'Relationship');
  const target = rels.find(r => r.attrs.Id === sheet.attrs['r:id'])?.attrs.Target || 'worksheets/sheet1.xml';
  const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  const xml = await zip.text(path);
  if (!xml) throw new SheetError('The first sheet is missing from the file.');
  const shared = elements(await zip.text('xl/sharedStrings.xml') || '', 'si').map(si => textOf(si.body));
  // Which cell styles show dates: a style points at a number format, built-in or declared in styles.xml.
  const styles = await zip.text('xl/styles.xml') || '';
  const formats = new Map(elements(styles, 'numFmt').map(f => [+f.attrs.numFmtId, f.attrs.formatCode || '']));
  const xfs = elements(elements(styles, 'cellXfs')[0]?.body || '', 'xf');
  const dateStyle = xfs.map(xf => { const id = +xf.attrs.numFmtId; return builtInDates.has(id) || (formats.has(id) && isDateFormat(formats.get(id))); });
  const rows = [];
  for (const row of elements(xml, 'row')) {
    const r = +row.attrs.r - 1; if (r >= maxRows + 1) throw new SheetError(`The sheet has more than ${maxRows} rows.`);
    const cells = [];
    for (const c of elements(row.body, 'c')) {
      const col = column(c.attrs.r || ''); if (col < 0 || col >= maxColumns) continue;
      const value = (elements(c.body, 'v')[0]?.body ?? ''), type = c.attrs.t;
      cells[col] = type === 's' ? shared[+value] ?? ''
        : type === 'inlineStr' ? textOf(c.body)
        : type === 'str' || type === 'e' ? decodeXml(value)
        : type === 'b' ? (value === '1' ? 'TRUE' : 'FALSE')
        : value === '' ? ''
        : dateStyle[+c.attrs.s || 0] ? excelDate(+value) : numberText(value);
    }
    rows[Number.isNaN(r) ? rows.length : r] = cells;
  }
  return Array.from(rows, r => r || []);
}
// "AB12" → 27
function column(ref) {
  const letters = /^[A-Z]+/.exec(ref)?.[0]; if (!letters) return -1;
  let n = 0; for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

// --- ods ---

// Repeated rows and cells are written once with a count; long empty runs at the end of a sheet are not expanded.
async function odsRows(zip) {
  const content = await zip.text('content.xml');
  if (!content) throw new SheetError('The file is not a valid .ods file.');
  const sheet = elements(content, 'table:table')[0];
  if (!sheet) throw new SheetError('The file has no sheets.');
  const rows = [];
  for (const row of elements(sheet.body, 'table:table-row')) {
    const cells = [];
    for (const m of row.body.matchAll(/<table:(table-cell|covered-table-cell)(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/table:\1>)/g)) {
      const attrs = attributes(m[2] || ''), value = m[1] === 'covered-table-cell' ? '' : odsValue(attrs, m[3] || '');
      const repeat = Math.min(+attrs['table:number-columns-repeated'] || 1, maxColumns - cells.length);
      if (value === '' && cells.length + repeat >= maxColumns) break;
      for (let i = 0; i < repeat; i++) cells.push(value);
    }
    const repeat = cells.some(Boolean) ? +row.attrs['table:number-rows-repeated'] || 1 : 1;
    for (let i = 0; i < repeat; i++) {
      rows.push(cells);
      if (rows.length > maxRows + 1) throw new SheetError(`The sheet has more than ${maxRows} rows.`);
    }
  }
  return rows;
}
function odsValue(attrs, body) {
  const type = attrs['office:value-type'];
  if (['float', 'percentage', 'currency'].includes(type) && attrs['office:value'] !== undefined) return numberText(attrs['office:value']);
  if (type === 'date' && attrs['office:date-value']) {
    const [day, time = ''] = attrs['office:date-value'].split('T');
    return time && !/^00:00(:00)?/.test(time) ? `${day} ${time.slice(0, 5)}` : day;
  }
  if (type === 'boolean') return attrs['office:boolean-value'] === 'true' ? 'TRUE' : 'FALSE';
  return elements(body, 'text:p').map(p => decodeXml(p.body
    .replace(/<text:s(?:\s+text:c="(\d+)")?\s*\/>/g, (m, n) => ' '.repeat(+n || 1))
    .replace(/<text:tab\s*\/>/g, '\t').replace(/<text:line-break\s*\/>/g, '\n')
    .replace(/<[^>]+>/g, ''))).join('\n');
}
