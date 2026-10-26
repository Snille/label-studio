<script>
  import { api } from '../lib/api.js';
  import { problems, sampleValues, requestId as newRequestId, jobView } from '../lib/model.js';

  let { editor, formats, printer, onselect } = $props();
  let result = $state(null);
  let error = $state('');
  let loading = $state(false);
  let printing = $state(null);
  let seq = 0;

  const matches = $derived(editor.media?.key === formats.mediaKey);
  const loadedName = $derived(formats.media.name);
  const other = $derived(formats.printers.find(p => p.id !== printer && p.mediaKey === editor.media?.key));
  const request = (definition, values) => ({ template: definition, fields: values, printer, include: ['png'] });

  async function run(json) {
    const id = ++seq; loading = true;
    try {
      const definition = JSON.parse(json);
      const answer = await api('/previews', { method: 'POST', body: request(definition, sampleValues(definition.fields)) });
      if (id === seq) { result = answer; error = ''; editor.warnings = answer.warnings; }
    } catch (e) {
      if (id === seq) { error = e.message; result = null; editor.warnings = []; }
    } finally { if (id === seq) loading = false; }
  }

  // A new preview half a second after the last change.
  $effect(() => {
    const json = JSON.stringify(editor.definition), found = problems(editor.doc);
    void printer;
    if (found.length || !matches) { seq++; result = null; error = found.join(' '); editor.warnings = []; return; }
    error = '';
    const timer = setTimeout(() => run(json), 500);
    return () => clearTimeout(timer);
  });

  // Printing makes a fresh preview (a token lives ten minutes) and sends exactly one job with a new request id.
  async function print() {
    printing = { step: 'sending' };
    let requestId;
    try {
      requestId = newRequestId();
      const definition = editor.definition;
      const fresh = await api('/previews', { method: 'POST', body: { template: definition, fields: sampleValues(definition.fields), printer, reference: `Label Studio: ${definition.id}` } });
      if (!fresh.printable) { printing = { step: 'error', message: 'The label does not fit any more. Check the warnings.' }; return; }
      const record = await api('/jobs', { method: 'POST', body: { token: fresh.token, requestId } });
      printing = { step: 'done', record };
      follow(requestId);
    } catch (e) {
      printing = { step: 'error', message: e.message, requestId };
    }
  }
  // Ask label-service about the job every few seconds until CUPS reports an end state, for at most three minutes.
  // Closing the box stops it. A failed question keeps the last answer and tries again.
  async function follow(requestId) {
    const current = () => printing?.record?.id === requestId;
    for (let i = 0; i < 60 && current() && !jobView(printing.record, printing.status).done; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      if (!current()) return;
      try { const job = await api(`/jobs/${requestId}`); if (current()) printing = { ...printing, record: job.record, status: job.status }; } catch { /* ask again */ }
    }
  }
  const view = $derived(printing?.step === 'done' ? jobView(printing.record, printing.status) : null);
  const objectIndex = name => editor.doc.objects.findIndex((o, i) => (o.id || `${o.type}${i + 1}`) === name);
</script>

<div class="preview">
  <div class="row">
    <h3 class="grow">Preview from label-service</h3>
    {#if loading}<span class="muted small">updating…</span>{/if}
  </div>
  {#if !matches}
    <p class="warn">This template is for {editor.media.name}, but {formats.printer.name} has {loadedName} loaded. The preview needs the matching roll.
      {#if other}Choose the printer {other.name}; it has this roll.{/if}</p>
  {/if}
  {#if error}<p class="error">{error}</p>{/if}
  {#if result}
    <img class="png" class:blocked={!result.printable} src="data:image/png;base64,{result.png}" alt="Label preview">
    {#if result.warnings.length}
      <ul class="warnings">
        {#each result.warnings as w (w.object + w.message)}
          <li><button class="link" disabled={objectIndex(w.object) < 0} onclick={() => onselect(objectIndex(w.object))}>{w.message}</button></li>
        {/each}
      </ul>
    {:else}
      <p class="ok small">Everything fits.</p>
    {/if}
    {#if !printing}
      <button class="print" disabled={!result.printable} onclick={() => { printing = { step: 'confirm' }; }}>Print one label…</button>
    {/if}
  {/if}

  {#if printing?.step === 'confirm'}
    <div class="confirm">
      <p><strong>Print one label on paper?</strong></p>
      <p class="small">Template "{editor.doc.name}" {editor.dirty || !editor.source ? '(unsaved design)' : `v${editor.source.version} (${editor.source.status})`}, printer {formats.printer.name}, roll {loadedName}, with the test values.</p>
      <div class="row"><button class="primary" onclick={print}>Print</button><button onclick={() => { printing = null; }}>Cancel</button></div>
    </div>
  {:else if printing?.step === 'sending'}
    <p class="muted">Sending…</p>
  {:else if printing?.step === 'done'}
    <div class="confirm">
      <p class={view.kind}>{view.text}</p>
      <button onclick={() => { printing = null; }}>Close</button>
    </div>
  {:else if printing?.step === 'error'}
    <div class="confirm">
      <p class="error">{printing.message}</p>
      <button onclick={() => { printing = null; }}>Close</button>
    </div>
  {/if}
</div>

<style>
  .preview { display: grid; gap: 8px; }
  .png { width: 100%; max-height: 46vh; object-fit: contain; background: #fff; border-radius: 4px; box-shadow: 0 1px 6px rgba(0, 0, 0, 0.4); image-rendering: auto; }
  .png.blocked { outline: 2px solid var(--danger); }
  .warnings { margin: 0; padding-left: 18px; color: var(--danger); }
  .link { background: none; border: none; padding: 0; color: inherit; text-align: left; cursor: pointer; text-decoration: underline dotted; }
  .ok { color: var(--accent); }
  .small { font-size: 12px; }
  .print { justify-self: start; }
  .confirm { border: 1px solid var(--accent); border-radius: 8px; padding: 10px; display: grid; gap: 6px; background: var(--panel-2); }
  p { margin: 0; }
</style>
