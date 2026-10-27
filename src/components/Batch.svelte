<script>
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { jobView } from '../lib/model.js';
  import { readSheet, parseText, sheetTypes, SheetError } from '../lib/sheet.js';
  import { builtInFields, textFields, unsupported, autoMap, rowFields, batchKey, requestIds, rowState } from '../lib/batch.js';

  let { formats, printer } = $props();
  let templates = $state([]);
  let chosenId = $state('');
  let template = $state(null);   // { id, version?, kind?, name, fields }
  let sheet = $state(null);      // { source, columns, rows }
  let mapping = $state({});
  let rows = $state([]);         // { values, selected, check?, error?, job?, open?, png? }
  let pasted = $state('');
  let error = $state('');
  let checking = $state(false);
  let run = $state(null);        // { step: 'confirm' | 'printing' | 'done', ... }

  const limit = $derived(formats.batchLimit || 50);
  // Published templates for the loaded roll, and the built-in kinds that a sheet can fill.
  const choices = $derived([
    ...templates.filter(x => !x.builtIn && !x.archived && x.status === 'published' && ((x.media || []).includes('*') || (x.media || []).includes(formats.mediaKey)))
      .map(x => ({ id: x.id, name: `${x.name} (v${x.version})` })),
    ...Object.keys(builtInFields).map(kind => ({ id: `builtin:${kind}`, name: `${templates.find(x => x.id === kind)?.name || kind} (built-in)` }))
  ]);
  const fields = $derived(template ? textFields(template.fields) : []);
  const selected = $derived(rows.filter(r => r.selected));
  const checked = $derived(selected.length > 0 && selected.every(r => r.check || r.error));
  const blocked = $derived(selected.filter(r => r.error || (r.check && !r.check.printable)));

  onMount(async () => {
    try { templates = (await api('/templates')).templates; } catch (e) { error = e.message; }
  });

  async function chooseTemplate(id) {
    chosenId = id; template = null; error = ''; run = null;
    if (!id) return;
    try {
      if (id.startsWith('builtin:')) {
        const kind = id.slice(8);
        template = { kind, name: templates.find(x => x.id === kind)?.name || kind, fields: builtInFields[kind] };
      } else {
        const record = await api(`/templates/${id}`);
        if (record.status !== 'published') throw new Error('Only published templates print in a batch. Publish the template first.');
        template = { id, version: record.version, name: record.definition.name, fields: record.definition.fields };
        const other = unsupported(record.definition.fields);
        if (other.length) error = `The fields ${other.join(', ')} are lists and cannot come from a sheet; they stay empty.`;
      }
      remap();
    } catch (e) { error = e.message; }
  }

  async function loadFile(event) {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
    if (!file) return;
    try { use(file.name, await readSheet(file.name, await file.arrayBuffer())); }
    catch (e) { error = e instanceof SheetError ? e.message : `The file could not be read: ${e.message}`; }
  }
  function usePasted() {
    try { use('Pasted cells', parseText(pasted)); pasted = ''; } catch (e) { error = e.message; }
  }
  function use(source, data) {
    sheet = { source, ...data }; error = ''; run = null;
    remap();
  }
  function remap() {
    if (!template || !sheet) { rows = []; return; }
    mapping = autoMap(template.fields, sheet.columns);
    build();
  }
  // New values make every earlier check and job answer stale.
  function build() {
    rows = sheet.rows.map((row, i) => ({ line: sheet.lines[i], values: rowFields(row, mapping, template.fields), selected: true }));
    run = null;
  }

  const request = (values, extra = {}) => ({ ...(template.kind ? { kind: template.kind } : { template: template.id, version: template.version }), fields: values, printer, ...extra });

  // Every row is checked by label-service without a token, a few at a time.
  async function checkAll() {
    checking = true; error = '';
    const queue = rows.map((row, index) => index);
    const worker = async () => {
      for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
        try { rows[i].check = await api('/previews', { method: 'POST', body: request(rows[i].values, { check: true }) }); rows[i].error = undefined; }
        catch (e) { rows[i].check = undefined; rows[i].error = e.message; }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    checking = false;
  }
  async function toggle(row) {
    row.open = !row.open;
    if (row.open && !row.png) {
      try { row.png = (await api('/previews', { method: 'POST', body: request(row.values, { check: true, include: ['png'] }) })).png; } catch (e) { row.error = e.message; }
    }
  }

  // The chosen rows print as one job with one label per row (decision B8 as changed on 2026-10-27): the printer runs
  // them in one go, as DYMO Connect does. The job's request id is kept per batch (same template version, same rows),
  // so pressing Print twice or reloading never sends the same batch twice without asking.
  const storeKey = key => `label-studio.batch.${key}`;
  function savedId(key) { try { return requestIds(JSON.parse(localStorage.getItem(storeKey(key)) || 'null'), 1)[0]; } catch { return requestIds(null, 1)[0]; } }
  function saveId(key, id) { try { localStorage.setItem(storeKey(key), JSON.stringify([id])); } catch { /* the id lasts for this page */ } }
  const currentKey = () => batchKey(template.kind ? { id: `builtin:${template.kind}` } : template, selected.map(r => r.values));

  async function confirm() {
    const key = currentKey(), id = savedId(key);
    let earlier = null;
    try { const job = await api(`/jobs/${id}`); earlier = jobView(job.record, job.status).text; } catch (e) { if (e.status !== 404) { error = e.message; return; } }
    run = { step: 'confirm', key, id, earlier };
  }
  async function print() {
    const { key, earlier } = run, batch = [...selected];
    // A batch that was sent before needs a new request id to print again.
    const id = earlier ? requestIds(null, 1)[0] : run.id; saveId(key, id);
    run = { step: 'printing', text: `Preparing ${batch.length} labels…` };
    const mark = view => { for (const row of batch) row.job = view; };
    try {
      const fresh = await api('/previews', { method: 'POST', body: request(undefined, {
        fields: undefined, rows: batch.map(r => r.values), reference: `Label Studio batch: ${template.id || template.kind}, ${batch.length} labels` }) });
      if (!fresh.printable) {
        for (const w of fresh.warnings) if (w.row) batch[w.row - 1].error = w.message;
        run = { step: 'done', kind: 'error', message: 'Some labels do not fit any more. Nothing was printed. Check the rows again.' }; return;
      }
      let job = { record: await api('/jobs', { method: 'POST', body: { token: fresh.token, requestId: id } }), status: null };
      let view = jobView(job.record, job.status); mark(view); run = { step: 'printing', text: view.text };
      for (let i = 0; i < 200 && !view.done; i++) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        try { job = await api(`/jobs/${id}`); view = jobView(job.record, job.status); mark(view); run = { step: 'printing', text: view.text }; } catch { /* ask again */ }
      }
      run = view.kind === 'ok' && view.done ? { step: 'done', kind: 'ok', message: `${batch.length} labels printed (CUPS job ${job.record.jobId}).` }
        : { step: 'done', kind: view.kind, message: `${view.text} Some labels may have printed: check the roll, then leave out the rows that came out and print again.` };
    } catch (e) {
      run = { step: 'done', kind: 'error', message: `${e.message} Check the roll before printing again.` };
    }
  }
  const summary = values => fields.map(f => values[f.name]).filter(Boolean).join(' · ');
</script>

<main class="batch">
  <section class="steps">
    <h2>Batch print</h2>
    <p class="muted">One row becomes one label. The chosen rows print as one job and come out in one run. At most {limit} labels per batch.</p>
    {#if error}<p class="error">{error}</p>{/if}

    <div class="card">
      <h3>1. Template</h3>
      <select value={chosenId} onchange={e => chooseTemplate(e.currentTarget.value)} disabled={run?.step === 'printing'}>
        <option value="">Choose a published template for {formats.media.name}</option>
        {#each choices as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
      </select>
    </div>

    <div class="card">
      <h3>2. Rows</h3>
      <label class="file">Open a file ({sheetTypes.join(', ')})
        <input type="file" accept={sheetTypes.join(',')} onchange={loadFile} disabled={run?.step === 'printing'}>
      </label>
      <label>Or paste cells from a spreadsheet, with the column names in the first row
        <textarea rows="3" bind:value={pasted} placeholder="name&#9;note"></textarea>
      </label>
      <button onclick={usePasted} disabled={!pasted.trim() || run?.step === 'printing'}>Use pasted cells</button>
      {#if sheet}<p class="small muted">{sheet.source}: {sheet.rows.length} rows, columns {sheet.columns.join(', ')}.</p>{/if}
    </div>

    {#if template && sheet}
      <div class="card">
        <h3>3. Columns for the fields</h3>
        {#each fields as f (f.name)}
          <label class="map"><span>{f.label || f.name}{f.required === false ? '' : ' *'}</span>
            <select value={mapping[f.name]} onchange={e => { mapping[f.name] = e.currentTarget.value; build(); }} disabled={run?.step === 'printing'}>
              <option value="">(empty)</option>
              {#each sheet.columns as c (c)}<option value={c}>{c}</option>{/each}
            </select>
          </label>
        {/each}
      </div>
    {/if}
  </section>

  {#if template && rows.length}
    <section class="rows">
      <div class="row">
        <h3 class="grow">{selected.length} of {rows.length} rows chosen</h3>
        <button onclick={() => { for (const r of rows) r.selected = true; }} disabled={run?.step === 'printing'}>All</button>
        <button onclick={() => { for (const r of rows) r.selected = false; }} disabled={run?.step === 'printing'}>None</button>
        <button onclick={checkAll} disabled={checking || run?.step === 'printing'}>{checking ? 'Checking…' : 'Check rows'}</button>
      </div>
      <table>
        <thead><tr><th></th><th>Row</th><th>Values</th><th>State</th><th></th></tr></thead>
        <tbody>
          {#each rows as row, i (i)}
            {@const state = rowState(row)}
            <tr class:off={!row.selected}>
              <td><input type="checkbox" bind:checked={row.selected} disabled={run?.step === 'printing'} aria-label="Print row {row.line}"></td>
              <td class="mono">{row.line}</td>
              <td>{summary(row.values)}</td>
              <td class={state.kind}>{state.text}</td>
              <td><button onclick={() => toggle(row)}>{row.open ? 'Hide' : 'Show'}</button></td>
            </tr>
            {#if row.open}
              <tr><td colspan="5">{#if row.png}<img class="png" src="data:image/png;base64,{row.png}" alt="Label for row {row.line}">{:else}<span class="muted">Loading…</span>{/if}</td></tr>
            {/if}
          {/each}
        </tbody>
      </table>

      <div class="card print">
        {#if selected.length > limit}
          <p class="error">{selected.length} rows are chosen, but a batch takes at most {limit} labels. Choose fewer rows.</p>
        {:else if !checked}
          <p class="muted">Check the rows before printing.</p>
        {:else if blocked.length}
          <p class="error">{blocked.length} chosen {blocked.length === 1 ? 'row does' : 'rows do'} not fit or {blocked.length === 1 ? 'has' : 'have'} errors. Fix them in the sheet or leave them out.</p>
        {:else if !run}
          <button class="primary" onclick={confirm}>Print {selected.length} labels…</button>
        {/if}
        {#if run?.step === 'confirm'}
          <p><strong>Print {selected.length} labels on paper?</strong></p>
          {#if run.earlier}<p class="warn">This batch was sent before: {run.earlier} Printing again makes the labels once more.</p>{/if}
          <p class="small">Template "{template.name}"{template.version ? ` v${template.version}` : ''}, printer {formats.printer.name}, roll {formats.media.name}. All labels go in one print job and come out in one run.</p>
          <div class="row"><button class="primary" onclick={print}>{run.earlier ? 'Print again' : 'Print'}</button><button onclick={() => { run = null; }}>Cancel</button></div>
        {:else if run?.step === 'printing'}
          <p>{run.text}</p>
        {:else if run?.step === 'done'}
          <p class={run.kind}>{run.message}</p>
          <button onclick={() => { run = null; }}>Close</button>
        {/if}
      </div>
    </section>
  {/if}
</main>

<style>
  .batch { display: grid; grid-template-columns: 360px 1fr; gap: 16px; padding: 16px; overflow: auto; align-items: start; }
  @media (max-width: 900px) { .batch { grid-template-columns: 1fr; } }
  .steps, .rows { display: grid; gap: 12px; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px; display: grid; gap: 8px; }
  .card label { display: grid; gap: 3px; }
  .map { grid-template-columns: 1fr 1fr; align-items: center; }
  h2, h3, p { margin: 0; }
  table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
  th, td { text-align: left; padding: 6px 9px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-size: 12px; color: var(--muted); font-weight: 500; }
  tr.off td { color: var(--muted); }
  .ok { color: var(--accent); }
  .warn { color: var(--warn); }
  .error { color: var(--danger); }
  .mono { font-family: 'Liberation Mono', monospace; font-size: 12px; }
  .small { font-size: 12px; }
  .png { max-width: 100%; max-height: 30vh; background: #fff; border-radius: 4px; }
  .print { border-color: var(--accent); }
</style>
