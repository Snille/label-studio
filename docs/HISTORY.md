# History

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
