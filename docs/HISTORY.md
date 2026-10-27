# History

## 0.11.0 - 2026-10-27

Needs label-service 0.13.0 for rolls added on its admin page.

- The editor shades the edges a roll does not print in red, from the margins label-service measured with the roll's test print (decision B12). They turn with the canvas as label-service turns them. The preview warns about an object that reaches into them.
- New rolls need no change in Studio: they appear in the label formats when an admin has approved their test print. A roll still being tested is named as the loaded roll, and the preview says why nothing prints.
- `list_media` gives each roll's `marginsMm`, and the loaded roll's `status` while it is being tested; the design guide explains the margins.
- Checked in Docker Desktop against label-service 0.13.0 with a made-up 40 × 30 mm roll and printer: the shaded edges and the warning for a rectangle at the left edge.

## 0.10.0 - 2026-10-27

Phase 3: counters, PDF pages and more barcodes.

- The barcode list has Code 39, EAN-8, UPC-A and ITF-14 (label-service 0.12.0), with a short note on the data each one takes; the design guide lists them for MCP clients.

- Print PDF view: a PDF page (or a PNG or JPEG) prints on the loaded roll without a template. The page is uploaded as a picture through label-service 0.12.0, shown so a part can be marked by dragging, then cropped by label-service and placed in an unsaved one-picture design that fills the label (turned a quarter when that makes it larger, 1 mm margin), previewed and printed once with the usual fresh preview and request id. The pictures made for it are deleted afterwards. Checked in a browser against label-service 0.12.0 with poppler and no printer: a test A4 page with a shipping label drawn, the label marked and cropped, the preview filled the 102 x 210 mm label, the print stopped with the service's error, and Done left no pictures behind.
- The picture upload in the library and the editor takes PDF files (first page). The MCP tool `upload_asset` takes `page` and `crop`, and the design guide mentions them.

- Batch print has a counter: a field can take Counter instead of a sheet column, and the rows are numbered in their order from a chosen start, with a step, zero-padded digits and text before and after (`SNI-0098`). Fields named counter, serial, number or nr take it by themselves. Only numbers makes a run of 1-2000 empty rows, for labels that need nothing but a number.
- The owner chose a start that is set for each batch over a counter remembered in label-service, so numbers can repeat if the same start is used again; nothing in label-service changes.
- Checked in a browser against label-service 0.11.0 without a printer: five labels numbered SNI-0098 to SNI-0102, the field mapped by itself, all rows fit, and a Code 128 of the number renders.

## 0.9.1 - 2026-10-27

- The New template form offers Any roll as the first label format (drawn on the loaded roll); before, only the template panel of an open template had the choice.
- The top bar shows the Studio version next to the name.
- The owner's paper test of 0.8.0 / label-service 0.11.0: a batch prints as one job and all labels come out in one run; vertical text prints right, also in a batch.

## 0.9.0 - 2026-10-27

- Any roll: a checkbox in the template panel saves the template with `media: ["*"]` and every position and size as a share of the label it is drawn on, so it prints on every roll (the built-in templates work the same way). Opening it again gives millimetres on the roll chosen to draw on; the panel says that font sizes, line widths and corners do not scale. Before, Studio always saved for one roll, and an any-roll template opened in the editor became a one-roll template.
- The design guide is unchanged: it already describes `["*"]` with percentages for MCP clients.

## 0.8.0 - 2026-10-27

- Batch print sends the chosen rows as one job (label-service 0.11.0 `rows`), so the labels come out in one run as with DYMO Connect, instead of one job per label 10 seconds apart. Decision B8 in the design report is changed.
- The owner's paper test of 0.7.0: five box labels from an .xlsx file, columns matched by themselves, all rows checked and shown, all printed right.
- Objects can be rotated freely in the editor: a round handle above the selection turns it about its centre, snapping near every 15° (Shift keeps to 15° steps, Alt turns freely); the properties take the angle and have buttons for 0°, 90°, 180° and -90°. A rotated object is resized in its own frame, so the edge that is not dragged stays put. Bounds, snapping targets and alignment use the turned corners. A slanted barcode gets a warning. The design guide explains `rotate` for MCP clients.
- The batch's request id is kept per batch; sending the same batch again asks first and names the earlier job. If the printer stops in the middle, the message says to check the roll and leave out the rows that came out.

## 0.7.0 - 2026-10-27

Phase 3 starts: batch printing.

- Batch print view: a published template, or the built-in box and location labels, filled from a sheet. One row becomes one label and one print job with its own request id (decision B8); at most `batchLimit` labels per batch (B16).
- An own spreadsheet reader, without packages (the owner chose it over SheetJS): `.xlsx` and `.ods` (zip files inflated with `DecompressionStream`), `.csv`, `.tsv` and `.txt` (tab, semicolon or comma; UTF-8 or Windows-1252), and cells pasted from a spreadsheet. The first sheet only; numbers as written, dates as `yyyy-MM-dd` (`HH:mm`). Old `.xls` is refused with a hint to save as `.xlsx`.
- Columns are matched to fields by name or label. Check rows uses label-service 0.10.0's check without a token; rows that do not fit are listed and can be left out, and any row can be shown as label-service renders it.
- Printing makes a fresh preview per row, sends one label at a time and waits until it has printed; a refused, lost or unfinished label stops the batch. Request ids are kept in the browser per batch, so running a stopped batch again skips rows already sent.
- Checked in a browser against a local label-service without a printer: pasted rows, automatic column matching, too-long and too-wide rows named, rows left out, the confirmation, and a batch that stops with the service's error on the first row. 34 unit tests, including xlsx (stored and deflated), ods and text files built in the tests.

## 0.6.1 - 2026-10-27

First MCP design test with the owner: a 25 × 54 mm cable tag (name, detail, QR code, date) was designed, previewed with short and long values, saved as a draft, published by the owner and printed once through `print_label` with the owner's approval.

- The design guide says that objects must stay inside the canvas (label-service 0.9.2 warns about it) and that object ids take letters, digits and `_`, without hyphens.

## 0.6.0 - 2026-10-26

Phase 2 of the design report: an MCP server, so an LLM can design labels.

- `/mcp` speaks MCP over Streamable HTTP (stateless: one JSON-RPC message per POST, answered as JSON; protocol versions 2025-06-18, 2025-03-26 and 2024-11-05), with no new packages. Tools: `list_media`, `get_design_guide`, `list_templates`, `get_template`, `preview_label` (PNG image plus `fits`, warnings per object and a token), `save_template_draft`, `list_assets`, `upload_asset`, `print_label` and `job_status`; the design guide is also a resource.
- The client sends its own label-service key as a bearer token (the `drafter` role is meant for MCP); Label Studio passes it on and keeps none. Drafters cannot publish, and print only published templates; `print_label` is marked destructive and tells the client to ask the user before each label. Requests without a key are refused with 401, from another site's page with 403.
- `server/design-guide.md` teaches the template format, the workflow (look at the PNG, fix, preview until it fits, save a draft) and good practice.
- Verified end to end against a printer-less label-service 0.9.1 with a drafter key: initialize, tool list, loaded roll, picture upload, a preview naming an object that does not fit, a fixed preview with logo, name and Code 128, a saved draft, and a refused print of that draft. 30 unit tests, including the MCP shapes and errors.

## 0.5.1 - 2026-10-26

- The picture panel shows label-service 0.9.1's defaults: threshold 140 and lighten 15 for dithered pictures (best in the owner's paper tests), 128 and 0 for threshold pictures.

## 0.5.0 - 2026-10-26

Needs label-service 0.9.0.

- Image objects get "Lighten for thermal paper" (0-100; 40 by default for dithered pictures), because a dithered photo printed much darker on paper than in the preview.
- The template panel sets the print density (printer default, light, medium, normal, dark). Labels with a picture or a barcode now print in the DYMO driver's graphics quality (set by label-service).
- Verified against a printer-less label-service 0.9.0: the slider shows its default, and the preview answer carries `Graphics` quality and `Light` density. 26 unit tests.

## 0.4.0 - 2026-10-26

Needs label-service 0.8.0.

- Pictures: the image tool (`I`) places an uploaded picture. Its properties choose the picture or upload a new one (PNG, JPEG or SVG, at most 2 MB), keep proportions or stretch, threshold for logos or dithering for photos, the threshold level, invert and placement. The canvas shows the picture in grey; the label-service preview shows the black and white dots that print.
- The library lists the pictures with thumbnails, uploads new ones and deletes a picture that no saved template uses (label-service names the templates that still use it).
- The Studio server forwards the picture calls, with a 3 MB body limit for uploads only; picture bytes pass through unchanged.
- Verified against a printer-less label-service 0.8.0 in Docker Desktop: upload from the library, an image object with a picture in the editor and its black and white preview, a used picture refused for deletion, an unused one deleted. 25 unit tests.

## 0.3.0 - 2026-10-26

Needs label-service 0.7.0.

- The library hides templates whose every version is archived; Show archived (with the number hidden) brings them back, greyed, so a version can be published again.
- Delete template, for templates that were never published: it removes every version after a confirmation. A published template shows why it can only be archived. The Studio server forwards `DELETE /api/v1/templates/<id>` and no other delete.
- Verified against a printer-less label-service 0.7.0 in Docker Desktop: an archived published template is hidden and shown, has no delete button, and a never-published draft is deleted. 23 unit tests.

## 0.2.0 - 2026-10-26

Needs label-service 0.6.0.

- New objects and tools: barcode (`B`, Code 128 or EAN-13), QR or Data Matrix code (`Q`) and date (`D`). Barcode data takes `{{field}}` placeholders, which create fields like text does. The properties panel sets the type, data, text under the bars and its font and size, QR error correction, placement, and the date format with text before and after.
- The canvas draws barcodes as stand-ins that follow the data and the box (finder squares for QR, the L border for Data Matrix); the label-service preview shows the real code, sized in whole printer dots, and names a box that is too small or data that cannot be encoded.
- Fixed: Fit made a wide label (such as 57 x 32 mm) larger than the canvas area, because it ignored the margin around the label and the grid column grew with the drawing.
- Fixed: the numbers on the left ruler were cut off; turned a quarter, they grew outside the ruler.
- Fixed: the preview's white area was as wide as the panel, not the label. The image now keeps its own proportions.
- Verified against a printer-less label-service 0.6.0 in Docker Desktop: barcode, QR and date added with the tools, preview of all three, EAN-13 with a wrong check digit named in the warnings, 12 digits accepted with the check digit added. 23 unit tests.

## 0.1.2 - 2026-10-26

- Fixed: after a print the status box kept saying "processing". Studio asked label-service about the job only once, four seconds after sending. It now asks every three seconds until CUPS reports an end state (completed, canceled or aborted), for at most three minutes, and shows "Printed" when the label is done. A stopped or held job is shown with its reasons. Closing the box stops the questions. A test covers the job states.
- Paper tests on the live 5XL (2026-10-26, checked by the owner): a name label on 57 x 32 mm and a text-heavy label on 102 x 210 mm, the phase 1 goal. Empty lines between paragraphs were lost on paper; that is fixed in label-service 0.5.1.

## 0.1.1 - 2026-10-26

- Fixed: printing stopped at "Sending…" on the live LAN address. The request id came from `crypto.randomUUID`, which browsers offer only on https and localhost pages; on plain http the call threw before anything was sent, outside the error handling. Studio now makes the version 4 UUID with `crypto.getRandomValues`, and every step of a print, including the id, is inside the error handling. Nothing reached label-service; no label was printed. A test makes ids with `crypto.randomUUID` removed.
- Verified on a plain-http LAN address (not a secure context) against a printer-less label-service: the job request arrives and label-service's answer is shown.

## 0.1.0 - 2026-10-26

Phase 1 of the design report: the first Label Studio, on top of label-service 0.5.0.

- Project start: README, this history, `VERSION` as the single version source, `npm run check`, `.gitignore`, Dockerfile, a local test stack (`compose.yaml`) and the Studio service for the label-service Portainer stack (`compose.portainer.yaml`, port 3231). No addresses or keys in the repository, so it can become public.
- Svelte 5 and Vite 8 web app, dark by default with the green `#95C200`, light mode from the system setting. The icons are the favicon set made for the report.
- Editor that draws the label in SVG to scale: rulers, millimetre grid, snapping to the grid, the label's edges and centre and other objects (Alt turns it off), text, line, rectangle and ellipse objects, handles to resize (Shift keeps proportions or straight lines), keyboard moves, copy, paste, duplicate, undo and redo, layer order and align.
- Property panel for every property of template format v1 objects, a field panel where `{{name}}` placeholders become fields with saved test values, and a template panel for id, name, description, label format and text direction.
- Live preview: label-service renders the unsaved design as a PNG with the test values half a second after each change. Fit warnings name the object, outline it on the canvas and select it on a click.
- Template library: built-in and saved templates, versions with status, open, duplicate (also built-in templates), publish and archive. Saving adds a draft version; publishing an unsaved design saves it first.
- Print one label with the test values after a confirmation that names the template, printer and roll. Each print makes a fresh preview and a new request id; a lost answer is shown as "may have printed", never retried.
- Sign-in with a Studio key kept in the browser; a key without the designer role is refused with a clear message.
- Studio server without packages: serves the built app with a strict content security policy and forwards only template, preview and job calls to label-service (no settings or roll reading), without the browser origin, with the 256 KB body limit. `/healthz` reports the label-service version.
- Verified against a printer-less label-service 0.5.0 in Docker Desktop: sign-in (designer key accepted, plain key refused), new template on the 102 × 210 mm format, objects added, moved, resized, undone and redone, field test value, overflow warning, save, publish, reopen, duplicate of the built-in box label, roll mismatch notice, print path up to label-service's "printing disabled" answer. The same checks through the production image. 20 unit tests.
