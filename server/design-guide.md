# Label template design guide

Templates are JSON for label-service, which renders and prints labels on DYMO LabelWriter printers (300 dpi, black only, thermal paper). Read this before writing a template.

## Workflow

1. `list_media`: the loaded roll (`mediaKey`), its size in millimetres and the printers. A template can only be previewed on the roll that is loaded.
2. Write a definition (below). Test it with `preview_label` and a `definition`: you get a PNG of the real label, `fits` and `warnings` for every object that does not fit. Look at the PNG, fix the definition and preview again until `fits` is true and the label looks right. `publishNote` only says that your key cannot print drafts; it is not a design problem.
3. `save_template_draft` saves a new draft version. A person reviews and publishes it in Label Studio; you cannot publish.
4. Printing (`print_label`) needs a preview `token` of a published template, and the user's explicit yes in this conversation every time. It prints one physical label.

## The definition

```json
{
  "id": "cable-tag", "name": "Cable tag", "description": "Shelf cable tags",
  "media": ["w162h90"], "orientation": "landscape",
  "fields": {
    "name": { "type": "text", "label": "Cable name", "maxLength": 40, "sample": "USB-C 2 m" },
    "port": { "type": "text", "required": false, "sample": "4" }
  },
  "objects": [
    { "id": "name", "type": "text", "x": 3, "y": 3, "w": 51, "h": 14, "text": "{{name}}", "size": 16, "minSize": 9, "bold": true, "align": "left", "valign": "middle" },
    { "type": "line", "x": 3, "y": 18, "w": 51, "h": 0, "stroke": 0.3 },
    { "id": "code", "type": "barcode", "x": 3, "y": 20, "w": 35, "h": 9, "symbology": "code128", "data": "{{name}}", "humanReadable": "none" },
    { "type": "date", "x": 40, "y": 24, "w": 14, "h": 5, "format": "yyyy-MM-dd", "size": 6, "align": "right" }
  ]
}
```

- `id`: 2-64 lower-case letters, digits or hyphens; not `box`, `location` or `lines`. Saving the same id adds a version.
- `media`: the `key` of each roll the template is made for (from `list_media`), or `["*"]` for any roll with positions in percentages.
- `orientation`: `portrait` or `landscape`, the direction the text reads. The canvas is the roll's width × height, turned a quarter when the orientation differs from the roll's own (landscape when the label is wider than tall).
- Coordinates are millimetres from the top left of the readable canvas, or a share of the side such as `"25%"`. Each axis takes exactly two of start, end and size: `x`/`right`/`w` and `y`/`bottom`/`h`. Every object must stay inside the canvas; one that reaches outside is a warning.
- `rotate` (optional, any object): degrees clockwise about the centre of the object's box, -360 to 360. Lay the object out as it reads, then turn it: vertical text along a 25 mm edge is a box about 21 mm wide and a few mm high with `rotate: -90` (reads bottom to top) or `90` (top to bottom). The turned corners must stay on the canvas. Text fits and shrinks inside the box before it is turned. Keep barcodes at 0, 90, 180 or -90; a slanted code prints with jagged bars and may not scan.
- `printDensity` (optional): `light`, `medium`, `normal` or `dark`.

## Fields

`{{name}}` in a text or in barcode data is filled from a field. Declare each field: `text` fields take `required` (default true), `maxLength` (default 240, at most 2000), `multiline`, `pattern` (a regular expression), `label` and `sample` (the test value used by previews without fields). Field names start with a letter and use letters, digits and `_`.

## Objects

- `text`: `text` (with placeholders), `font` (`Liberation Sans` default, `Liberation Serif`, `Liberation Mono`, `DejaVu Sans Condensed`; only Liberation Sans has italic), `size` in points (default 10), `minSize` (shrinks to fit down to this size), `bold`, `italic`, `align` (`left`, `center` default, `right`), `valign` (`top` default, `middle`, `bottom`), `wrap` (default true), `breakHyphens`, `lineHeight` (default 1.2), `color` (`black` or `white` on a black fill). A line break in the value starts a new row; an empty line is kept.
- `line`: from (`x`, `y`) to (`x + w`, `y + h`); `stroke` in mm (default 0.3), `dash` (lengths in mm).
- `rect`, `ellipse`: `stroke` in mm (0 for none), `fill` (`none`, `black`, `white`), `radius` (rect corners), `dash`.
- `barcode`: `symbology` `code128`, `code39` (digits, capital letters, spaces and `-.$/+%`), `ean13` (12 digits), `ean8` (7 digits), `upca` (11 digits), `itf14` (13 digits; the check digit of these four is added, or give it and it is checked), `qrcode` (`ecLevel` L, M, Q, H) or `datamatrix`; `data` with placeholders; `humanReadable` (`below` default or `none`, linear codes only) with `font` and `size` for that text; `align`, `valign`. Bars are at least 2 printer dots (0.17 mm) and 2D modules at least 3 dots, so a box that is too small is a warning that names the size needed. Leave about 2 mm empty on each side of a linear code.
- `date`: the date and time of the preview, `format` with `yyyy`, `yy`, `MM`, `dd`, `HH`, `mm`; `prefix` and `suffix`; the text properties.
- `image`: `asset` is the id of an uploaded picture (`list_assets`, `upload_asset`, which also takes one page of a PDF with `page` and keeps part of a picture with `crop`); `fit` (`contain` default, or `stretch`), `mode` (`threshold` for logos, `dither` for photos), `threshold`, `lighten`, `invert`, `align`, `valign`.

Give important objects an `id`: warnings name objects by it. An object `id` starts with a letter and uses letters, digits and `_` (no hyphens, unlike the template `id`), and each one is used once.

## Good labels

- Keep about 1.5-2 mm from the label edge; thermal printers can lose the outermost dots.
- Text below 6 pt is hard to read. Use `minSize` so long values shrink instead of failing, and give text boxes room for their longest expected value.
- Prefer one clear title, then details. Black fills with white text work for short headings.
- Check `fits` and `warnings` in every preview; a label with warnings cannot print.
