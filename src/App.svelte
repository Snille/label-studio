<script>
  import { onMount } from 'svelte';
  import { api, hasKey, setKey, clearKey, checkKey } from './lib/api.js';
  import { Editor } from './lib/editor.svelte.js';
  import { fonts } from './lib/fonts.svelte.js';
  import Library from './components/Library.svelte';
  import EditorView from './components/EditorView.svelte';
  import Batch from './components/Batch.svelte';
  import PrintPdf from './components/PrintPdf.svelte';

  const version = __APP_VERSION__;
  const editor = new Editor();
  let formats = $state(null);
  let printer = $state('');
  let view = $state('library');
  let starting = $state(true);
  let keyInput = $state('');
  let loginError = $state('');
  let busy = $state(false);
  let reading = $state(false);

  onMount(async () => {
    if (hasKey()) {
      try { formats = await api('/formats'); printer = formats.printer.id; }
      catch (error) { if (error.status === 401) clearKey(); else loginError = error.message; }
    }
    starting = false;
  });

  async function signIn(event) {
    event.preventDefault();
    busy = true; loginError = '';
    try {
      const key = keyInput.trim();
      formats = await checkKey(key); printer = formats.printer.id;
      setKey(key); keyInput = '';
    } catch (error) { loginError = error.status === 401 ? 'This key is not valid.' : error.message; }
    busy = false;
  }
  function signOut() {
    if (editor.dirty && !confirm('Sign out and lose the unsaved changes?')) return;
    clearKey(); formats = null; view = 'library';
  }
  async function choosePrinter(id) {
    try { formats = await api(`/formats?printer=${encodeURIComponent(id)}`); printer = id; } catch (error) { alert(error.message); }
  }
  // label-service reads the roll's chip and selects a known roll as the printer's format. It never polls on its own,
  // so this button is the way to tell it about a roll change.
  async function readRoll() {
    if (editor.dirty && !confirm('Reading the roll may change the loaded format. Keep editing afterwards?')) return;
    reading = true;
    try {
      const { roll, selected, fits } = await api('/roll', { method: 'POST', body: { printer } });
      await refreshFormats();
      alert(selected ? `Loaded roll: ${roll.media.name}. It is now the printer's format.`
        : !roll.media ? `The printer has roll ${roll.sku}, which label-service does not know yet. Add it on the label-service admin page.`
        : !fits ? `The printer does not take roll ${roll.media.name}.` : `Loaded roll: ${roll.media.name}. No change.`);
    } catch (error) { alert(error.message); }
    reading = false;
  }
  async function refreshFormats() { try { formats = await api(`/formats?printer=${encodeURIComponent(printer)}`); } catch { /* keep the last answer */ } }
  function open(doc, media, source) {
    if (editor.doc && editor.dirty && !confirm('Open another template and lose the unsaved changes?')) return;
    editor.style = formats.style; editor.load(doc, media, source); view = 'editor';
  }

  // Uploaded fonts come with the formats; the editor and the font menu use them from there.
  $effect(() => { if (formats) fonts.use(formats.fonts); });
  $effect(() => {
    const warn = event => { if (editor.dirty) event.preventDefault(); };
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  });
</script>

{#if starting}
  <main class="center muted">Loading…</main>
{:else if !formats}
  <main class="center">
    <form class="login" onsubmit={signIn}>
      <img src="/icon-192.png" alt="" width="96" height="96">
      <h1>Label Studio</h1>
      <p class="muted">Design label templates for label-service. Enter the Studio key (a client key with the designer role). It is kept in this browser.</p>
      <input type="password" autocomplete="current-password" placeholder="Studio key" bind:value={keyInput} required minlength="16">
      <button class="primary" disabled={busy || keyInput.trim().length < 16}>Sign in</button>
      {#if loginError}<p class="error">{loginError}</p>{/if}
      <p class="muted small">Version {version}</p>
    </form>
  </main>
{:else}
  <div class="shell">
    <header>
      <img src="/favicon-32.png" alt="" width="24" height="24">
      <strong>Label Studio</strong>
      <span class="version" title="Label Studio version">v{version}</span>
      <nav>
        <button class:active={view === 'library'} onclick={() => { view = 'library'; }}>Templates</button>
        <button class:active={view === 'editor'} disabled={!editor.doc} onclick={() => { view = 'editor'; }}>
          Editor{#if editor.doc}: {editor.doc.name}{editor.dirty ? ' •' : ''}{/if}
        </button>
        <button class:active={view === 'batch'} onclick={() => { view = 'batch'; }}>Batch print</button>
        <button class:active={view === 'pdf'} onclick={() => { view = 'pdf'; }}>Print PDF</button>
      </nav>
      <span class="grow"></span>
      {#if formats.printers.length > 1}
        <select aria-label="Printer" value={printer} onchange={e => choosePrinter(e.currentTarget.value)}>
          {#each formats.printers as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
        </select>
      {:else}
        <span class="muted">{formats.printer.name}</span>
      {/if}
      <span class="roll" title="The roll loaded in the printer">Roll: {formats.media.sku} · {formats.media.widthMm} × {formats.media.heightMm} mm</span>
      <button onclick={readRoll} disabled={reading} title="Ask label-service to read the roll in the printer and select it. Do it after a roll change, while nothing prints.">{reading ? 'Reading…' : 'Read roll'}</button>
      <button onclick={signOut}>Sign out</button>
    </header>
    {#if view === 'library'}
      <Library {formats} onopen={open} />
    {:else if view === 'batch'}
      <Batch {formats} {printer} />
    {:else if view === 'pdf'}
      <PrintPdf {formats} {printer} />
    {:else}
      <EditorView {editor} {formats} {printer} onrefresh={refreshFormats} />
    {/if}
  </div>
{/if}

<style>
  .center { display: grid; place-items: center; height: 100%; }
  .login { width: min(380px, 92vw); display: grid; gap: 12px; text-align: center; justify-items: center; }
  .login input, .login button { width: 100%; }
  .small { font-size: 12px; }
  .shell { display: grid; grid-template-rows: auto 1fr; height: 100%; }
  header { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-bottom: 1px solid var(--line); background: var(--panel); flex-wrap: wrap; }
  nav { display: flex; gap: 6px; margin-left: 12px; }
  .version { font-size: 12px; color: var(--muted); }
  .roll { font-size: 12px; color: var(--muted); border: 1px solid var(--line); border-radius: 99px; padding: 2px 9px; }
</style>
