import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSheet, parseText, excelDate, decodeXml } from '../src/lib/sheet.js';
import { autoMap, rowFields, batchKey, requestIds, rowState, textFields, builtInFields } from '../src/lib/batch.js';

// A small zip writer for the tests: deflated entries, or stored ones with store: true. The reader does not check CRCs.
async function zip(files, { store = false } = {}) {
  const enc = new TextEncoder(), locals = [], central = []; let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = enc.encode(text), nameBytes = enc.encode(name);
    const data = store ? raw : new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    const local = new Uint8Array(30 + nameBytes.length), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(8, store ? 0 : 8, true); lv.setUint32(18, data.length, true); lv.setUint32(22, raw.length, true); lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    const entry = new Uint8Array(46 + nameBytes.length), cv = new DataView(entry.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(10, store ? 0 : 8, true); cv.setUint32(20, data.length, true); cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true); cv.setUint32(42, offset, true); entry.set(nameBytes, 46);
    locals.push(local, data); central.push(entry); offset += local.length + data.length;
  }
  const size = central.reduce((s, c) => s + c.length, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, central.length, true); ev.setUint16(10, central.length, true); ev.setUint32(12, size, true); ev.setUint32(16, offset, true);
  return new Blob([...locals, ...central, end]).arrayBuffer();
}

test('pasted cells and text files: tab, semicolon or comma, quotes, BOM and Windows-1252', async () => {
  assert.deepEqual(parseText('name\tnote\r\nUSB-C\t2 m\r\n\r\nHDMI\t\n'), { columns: ['name', 'note'], rows: [{ name: 'USB-C', note: '2 m' }, { name: 'HDMI', note: '' }], lines: [2, 4] });
  const csv = parseText('﻿Namn;Plats;Namn\n"Kabel; röd";"Hylla ""A""\nrad 2";x\n');
  assert.deepEqual(csv.columns, ['Namn', 'Plats', 'Namn (2)']);
  assert.deepEqual(csv.rows[0], { Namn: 'Kabel; röd', Plats: 'Hylla "A"\nrad 2', 'Namn (2)': 'x' });
  assert.deepEqual(parseText('a,b\n1,2').rows, [{ a: '1', b: '2' }]);
  const latin = await readSheet('old.csv', new Uint8Array([0x4e, 0x61, 0x6d, 0x6e, 0x0a, 0xc5, 0x73, 0x74, 0x6f, 0x72, 0x70]));
  assert.deepEqual(latin.rows, [{ Namn: 'Åstorp' }]);
  assert.throws(() => parseText('\n\n'), /empty/);
  // An empty first row is skipped; a column without a name is left out.
  assert.deepEqual(parseText(';;\nName;;Place\nA;x;B'), { columns: ['Name', 'Place'], rows: [{ Name: 'A', Place: 'B' }], lines: [3] });
  await assert.rejects(readSheet('a.xls', new Uint8Array(4)), /Save the file as .xlsx/);
  await assert.rejects(readSheet('a.pdf', new Uint8Array(4)), /Choose a/);
});

test('xlsx: shared and inline strings, numbers, dates, booleans, gaps and the first sheet only', async () => {
  const files = {
    'xl/workbook.xml': '<workbook><sheets><sheet name="Data" sheetId="1" r:id="rId3"/><sheet name="Other" sheetId="2" r:id="rId4"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId4" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>Item</t></si><si><t>Packed</t></si><si><r><t>6S </t></r><r><rPr><b/></rPr><t>1300 &amp; more</t></r></si><si><t>Cell</t></si></sst>',
    'xl/styles.xml': '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd;@"/><numFmt numFmtId="165" formatCode="0.00&quot;V&quot;"/></numFmts>'
      + '<cellXfs><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="22"/><xf numFmtId="165"/></cellXfs></styleSheet>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData>'
      + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>Volt</t></is></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="str"><v>OK?</v></c></row>'
      + '<row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3" s="1"><v>46322</v></c><c r="C3" s="3"><v>3.8500000000000001</v></c><c r="E3" t="b"><v>1</v></c></row>'
      + '<row r="4"><c r="A4"><v>0.30000000000000004</v></c><c r="B4" s="2"><v>46322.5729166667</v></c></row>'
      + '</sheetData></worksheet>',
    'xl/worksheets/sheet2.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Wrong</t></is></c></row></sheetData></worksheet>'
  };
  for (const store of [false, true]) {
    const sheet = await readSheet('Batteries.XLSX', await zip(files, { store }));
    assert.deepEqual(sheet.columns, ['Item', 'Packed', 'Volt', 'Cell', 'OK?']);
    assert.deepEqual(sheet.rows, [
      { Item: '6S 1300 & more', Packed: '2026-10-27', Volt: '3.85', Cell: '', 'OK?': 'TRUE' },
      { Item: '0.3', Packed: '2026-10-27 13:45', Volt: '', Cell: '', 'OK?': '' }]);
    assert.deepEqual(sheet.lines, [3, 4]);
  }
  await assert.rejects(readSheet('x.xlsx', new Uint8Array([1, 2, 3])), /not a valid/);
  assert.equal(excelDate(45658), '2025-01-01');
  assert.equal(decodeXml('&lt;a&gt; &#229;&#x00E4;'), '<a> åä');
});

test('ods: value types, paragraphs, spaces, repeated cells and rows, covered cells', async () => {
  const content = '<office:document-content><office:body><office:spreadsheet><table:table table:name="Blad1">'
    + '<table:table-column table:number-columns-repeated="3"/>'
    + '<table:table-row><table:table-cell office:value-type="string"><text:p>Item</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>Note</text:p></table:table-cell>'
    + '<table:table-cell office:value-type="string"><text:p>Date</text:p></table:table-cell><table:table-cell table:number-columns-repeated="16381"/></table:table-row>'
    + '<table:table-row table:number-rows-repeated="2"><table:table-cell office:value-type="float" office:value="3.85"><text:p>3,85</text:p></table:table-cell>'
    + '<table:table-cell office:value-type="string"><text:p>two<text:s text:c="2"/>spaces</text:p><text:p>and <text:span text:style-name="T1">a line</text:span></text:p></table:table-cell>'
    + '<table:table-cell office:value-type="date" office:date-value="2026-10-27"><text:p>27.10.26</text:p></table:table-cell></table:table-row>'
    + '<table:table-row><table:table-cell table:number-columns-spanned="2" office:value-type="string"><text:p>wide</text:p></table:table-cell><table:covered-table-cell/>'
    + '<table:table-cell office:value-type="date" office:date-value="2026-10-27T13:45:00"><text:p/></table:table-cell></table:table-row>'
    + '<table:table-row table:number-rows-repeated="1048570"><table:table-cell table:number-columns-repeated="16384"/></table:table-row>'
    + '</table:table><table:table table:name="Blad2"><table:table-row><table:table-cell><text:p>Wrong</text:p></table:table-cell></table:table-row></table:table>'
    + '</office:spreadsheet></office:body></office:document-content>';
  const sheet = await readSheet('list.ods', await zip({ mimetype: 'application/vnd.oasis.opendocument.spreadsheet', 'content.xml': content }));
  assert.deepEqual(sheet.columns, ['Item', 'Note', 'Date']);
  assert.deepEqual(sheet.rows, [
    { Item: '3.85', Note: 'two  spaces\nand a line', Date: '2026-10-27' },
    { Item: '3.85', Note: 'two  spaces\nand a line', Date: '2026-10-27' },
    { Item: 'wide', Note: '', Date: '2026-10-27 13:45' }]);
});

test('a batch maps columns to fields, keeps row values stable and reuses request ids', () => {
  const fields = { item: { type: 'text', label: 'Item name' }, note: { type: 'text', required: false }, address: { type: 'text', multiline: true }, list: { type: 'lines' } };
  assert.deepEqual(textFields(fields).map(f => f.name), ['item', 'note', 'address']);
  assert.deepEqual(autoMap(fields, ['ITEM NAME', 'Note', 'Other']), { item: 'ITEM NAME', note: 'Note', address: '' });
  assert.deepEqual(autoMap(builtInFields.box, ['title', 'Location']), { title: 'title', description: '', location: 'Location' });
  const mapping = { item: 'A', note: '', address: 'B' };
  assert.deepEqual(rowFields({ A: ' 6S\n1300 ', B: 'Storgatan 1\n123 45 Åstorp' }, mapping, fields), { item: '6S 1300', note: '', address: 'Storgatan 1\n123 45 Åstorp' });
  const values = [{ item: 'a' }, { item: 'b' }];
  assert.equal(batchKey({ id: 't', version: 1 }, values), batchKey({ id: 't', version: 1 }, structuredClone(values)));
  assert.notEqual(batchKey({ id: 't', version: 1 }, values), batchKey({ id: 't', version: 2 }, values));
  assert.notEqual(batchKey({ id: 't', version: 1 }, values), batchKey({ id: 't', version: 1 }, values.toReversed()));
  const ids = requestIds(null, 3);
  assert.equal(new Set(ids).size, 3); assert.deepEqual(requestIds(ids, 3), ids);
  assert.deepEqual(requestIds(['bad', ids[1]], 2).slice(1), [ids[1]]);
  assert.equal(rowState({}).text, 'Not checked');
  assert.equal(rowState({ check: { printable: false, warnings: [{ message: 'Too long.' }] } }).text, 'Too long.');
  assert.equal(rowState({ check: { printable: true }, job: { kind: 'ok', text: 'Printed.' } }).text, 'Printed.');
  assert.equal(rowState({ error: 'item must be a non-empty string.' }).kind, 'error');
});
