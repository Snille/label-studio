<script>
  import { onDestroy } from 'svelte';
  import { api } from '../lib/api.js';
  import { pictures } from '../lib/pictures.svelte.js';
  import { canvasSize, naturalOrientation, requestId as newRequestId, jobView } from '../lib/model.js';
  import { pdfLabel, wholePage } from '../lib/pdf-print.js';

  // Print a PDF page (a shipping label, for example) without a template: the page, or the part you mark on it, is
  // uploaded as a picture, filled into the loaded label as an unsaved one-picture design, previewed by label-service
  // and printed once. The pictures made for this are deleted again afterwards.
  let { formats, printer } = $props();
  let file = $state(null);
  let page = $state(1);
  let whole = $state(null);       // the uploaded page: { id, width, height, pages }
  let wholeUrl = $state('');
  let area = $state({ ...wholePage });   // shares of the page
  let mode = $state('threshold');
  let threshold = $state(128);
  let result = $state(null);      // { png, warnings, printable, asset, definition }
  let busy = $state('');
  let error = $state('');
  let printing = $state(null);
  let drag = null, frame = $state();
  const made = new Set();         // picture ids made here, deleted when they are no longer needed

  const media = $derived(formats.media);
  const marked = $derived(area.x > 0 || area.y > 0 || area.w < 1 || area.h < 1);
  const canvas = $derived(canvasSize(media, naturalOrientation(media)));

  async function forget(ids) {
    for (const id of ids) { made.delete(id); try { await pictures.remove(id); } catch { /* it may be gone already */ } }
  }
  onDestroy(() => { if (!printing || printing.step !== 'sending') forget([...made]); });

  async function choose(event) {
    const chosen = event.currentTarget.files?.[0]; event.currentTarget.value = '';
    if (!chosen) return;
    await forget([...made]);
    file = chosen; page = 1; whole = null; result = null; printing = null;
    await load();
  }
  async function load() {
    busy = 'Reading the page…'; error = ''; result = null; area = { ...wholePage };
    try {
      const old = whole?.id;
      whole = await pictures.upload(file, { page: file.type === 'application/pdf' || /\.pdf$/i.test(file.name) ? page : undefined, name: `Print PDF: ${file.name} p${page}` });
      made.add(whole.id); wholeUrl = await pictures.url(whole.id);
      if (old) await forget([old]);
    } catch (e) { error = e.message; }
    busy = '';
  }

  // Mark an area by dragging on the page; a click without dragging keeps the whole page.
  const at = event => { const r = frame.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (event.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (event.clientY - r.top) / r.height)) }; };
  function down(event) { if (event.button !== 0) return; drag = at(event); frame.setPointerCapture(event.pointerId); }
  function move(event) {
    if (!drag) return;
    const p = at(event), x = Math.min(drag.x, p.x), y = Math.min(drag.y, p.y), w = Math.abs(p.x - drag.x), h = Math.abs(p.y - drag.y);
    if (w > 0.02 && h > 0.02) { area = { x, y, w, h }; result = null; }
  }
  function up() { drag = null; }

  async function preview() {
    busy = 'Making the preview…'; error = '';
    try {
      const cropped = marked;
      let asset = whole;
      if (cropped) {
        asset = await pictures.upload(file, { page: whole.pages ? page : undefined, crop: area, name: `Print PDF: ${file.name} p${page} (part)` });
        made.add(asset.id);
      }
      if (result?.asset && result.asset !== whole.id && result.asset !== asset.id) await forget([result.asset]);
      const definition = pdfLabel({ asset: asset.id, width: asset.width, height: asset.height, canvas, media, mode, threshold, name: file.name });
      const answer = await api('/previews', { method: 'POST', body: { template: definition, fields: {}, printer, include: ['png'] } });
      result = { ...answer, asset: asset.id, definition };
    } catch (e) { error = e.message; }
    busy = '';
  }

  // A fresh preview and one job with a new request id, as for any single label.
  async function print() {
    printing = { step: 'sending' };
    const id = newRequestId();
    try {
      const fresh = await api('/previews', { method: 'POST', body: { template: result.definition, fields: {}, printer, reference: `Label Studio: Print PDF ${file.name}`.slice(0, 200) } });
      if (!fresh.printable) { printing = { step: 'error', message: 'The label cannot print. Check the warnings.' }; return; }
      let job = { record: await api('/jobs', { method: 'POST', body: { token: fresh.token, requestId: id } }), status: null };
      printing = { step: 'done', view: jobView(job.record, job.status) };
      for (let i = 0; i < 60 && !printing.view.done; i++) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        try { job = await api(`/jobs/${id}`); printing = { step: 'done', view: jobView(job.record, job.status) }; } catch { /* ask again */ }
      }
    } catch (e) { printing = { step: 'error', message: `${e.message} Check the printer before printing again.` }; }
  }
  async function finish() {
    await forget([...made]);
    file = null; whole = null; result = null; printing = null; area = { ...wholePage };
  }
</script>

<main class="pdf">
  <section class="steps">
    <h2>Print PDF</h2>
    <p class="muted">Print a page of a PDF, such as a shipping label, on the loaded roll ({media.name}) without making a template. Mark the part to print on the page, or keep the whole page.</p>
    {#if error}<p class="error">{error}</p>{/if}
    <div class="card">
      <h3>1. File</h3>
      <input type="file" accept=".pdf,application/pdf,.png,.jpg,.jpeg,image/png,image/jpeg" onchange={choose} disabled={Boolean(busy) || printing?.step === 'sending'}>
      <p class="small muted">A PDF, PNG or JPEG of at most 2 MB.</p>
      {#if whole?.pages > 1}
        <label class="inline">Page
          <select value={page} onchange={e => { page = +e.currentTarget.value; load(); }} disabled={Boolean(busy)}>
            {#each Array.from({ length: whole.pages }, (_, i) => i + 1) as n (n)}<option value={n}>{n} of {whole.pages}</option>{/each}
          </select>
        </label>
      {/if}
    </div>
    {#if whole}
      <div class="card">
        <h3>2. Look</h3>
        <label class="inline">Black and white
          <select bind:value={mode} onchange={() => { result = null; }}>
            <option value="threshold">Threshold (text and barcodes)</option>
            <option value="dither">Dithering (photos)</option>
          </select>
        </label>
        {#if mode === 'threshold'}
          <label>Threshold {threshold} (lower prints less black)
            <input type="range" min="1" max="254" bind:value={threshold} onchange={() => { result = null; }}>
          </label>
        {/if}
        <button class="primary" onclick={preview} disabled={Boolean(busy)}>{busy || 'Preview'}</button>
      </div>
    {/if}
  </section>

  {#if whole}
    <section class="view">
      <div class="row">
        <h3 class="grow">The page: drag to mark the part to print</h3>
        <button onclick={() => { area = { ...wholePage }; result = null; }} disabled={!marked}>Whole page</button>
      </div>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="page" bind:this={frame} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}>
        <img src={wholeUrl} alt="Page {page} of {file.name}" draggable="false">
        {#if marked}
          <div class="area" style:left="{area.x * 100}%" style:top="{area.y * 100}%" style:width="{area.w * 100}%" style:height="{area.h * 100}%"></div>
        {/if}
      </div>
    </section>
    {#if result}
      <section class="view">
        <h3>Preview from label-service</h3>
        <img class="label" class:blocked={!result.printable} src="data:image/png;base64,{result.png}" alt="Label preview">
        {#if result.warnings.length}<ul class="error">{#each result.warnings as w (w.object + w.message)}<li>{w.message}</li>{/each}</ul>{/if}
        {#if !printing}
          <button class="primary" disabled={!result.printable} onclick={() => { printing = { step: 'confirm' }; }}>Print one label…</button>
        {:else if printing.step === 'confirm'}
          <div class="card confirm">
            <p><strong>Print this label on paper?</strong></p>
            <p class="small">{file.name}, page {page}, printer {formats.printer.name}, roll {media.name}.</p>
            <div class="row"><button class="primary" onclick={print}>Print</button><button onclick={() => { printing = null; }}>Cancel</button></div>
          </div>
        {:else if printing.step === 'sending'}
          <p class="muted">Sending…</p>
        {:else}
          <div class="card confirm">
            <p class={printing.step === 'error' ? 'error' : printing.view.kind}>{printing.step === 'error' ? printing.message : printing.view.text}</p>
            <div class="row">
              <button onclick={() => { printing = null; }}>Close</button>
              <button onclick={finish}>Done: remove the pictures</button>
            </div>
          </div>
        {/if}
      </section>
    {/if}
  {/if}
</main>

<style>
  .pdf { display: grid; grid-template-columns: 340px 1fr 1fr; gap: 16px; padding: 16px; overflow: auto; align-items: start; }
  @media (max-width: 1100px) { .pdf { grid-template-columns: 1fr; } }
  .steps, .view { display: grid; gap: 12px; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px; display: grid; gap: 8px; }
  .card label { display: grid; gap: 3px; }
  .confirm { border-color: var(--accent); }
  h2, h3, p { margin: 0; }
  .small { font-size: 12px; }
  .page { position: relative; cursor: crosshair; user-select: none; touch-action: none; background: #fff; border-radius: 4px; overflow: hidden; }
  .page img { display: block; width: 100%; height: auto; pointer-events: none; }
  .area { position: absolute; border: 2px solid var(--accent); background: rgba(149, 194, 0, 0.18); pointer-events: none; }
  .label { justify-self: center; max-width: 100%; max-height: 60vh; background: #fff; border-radius: 4px; box-shadow: 0 1px 6px rgba(0, 0, 0, 0.4); }
  .label.blocked { outline: 2px solid var(--danger); }
  .ok { color: var(--accent); }
  .warn { color: var(--warn); }
</style>
