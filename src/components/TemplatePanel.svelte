<script>
  import { templateId, builtInIds } from '../lib/model.js';

  let { editor, formats } = $props();
  const commit = () => editor.commit();
  const idValid = $derived(templateId.test(editor.doc.id));
  const builtIn = $derived(builtInIds.includes(editor.doc.id));
</script>

<div class="form">
  <label>Name<input bind:value={editor.doc.name} maxlength="120" onchange={commit}></label>
  <label>Id (other systems print with this)
    <input bind:value={editor.doc.id} onchange={commit}>
  </label>
  {#if !idValid}<p class="error">2-64 lower-case letters, digits or hyphens.</p>{/if}
  {#if builtIn}<p class="warn">This is the built-in label "{editor.doc.id}". Other systems print it on every roll, so it keeps its fields and stays for any roll. A published version replaces the original; archive every version to bring the original back.</p>{/if}
  {#if editor.source && editor.source.id !== editor.doc.id}<p class="warn">Saving now creates or extends the template "{editor.doc.id}", not "{editor.source.id}".</p>{/if}
  <label>Description<textarea rows="2" bind:value={editor.doc.description} maxlength="1000" onchange={commit}></textarea></label>
  <label class="check"><input type="checkbox" checked={Boolean(editor.doc.anyRoll)} onchange={e => { editor.doc.anyRoll = e.currentTarget.checked; commit(); }}> Any roll</label>
  {#if editor.doc.anyRoll}
    <p class="muted">Positions and sizes are saved as a share of the label (%), so the objects follow the size of every roll. Font sizes, line widths and corners stay as they are: give text a "shrink to" size so it fits on small rolls. Draw on the roll below; previews use the loaded roll.</p>
  {/if}
  <label>{editor.doc.anyRoll ? 'Draw on' : 'Label format'}
    <select value={editor.media.key} onchange={e => editor.setMedia(formats.mediaPresets.find(p => p.key === e.currentTarget.value))}>
      {#each formats.mediaPresets as p (p.key)}<option value={p.key}>{p.name}{p.key === formats.mediaKey ? ' (loaded)' : ''}</option>{/each}
    </select>
  </label>
  <label>Text direction
    <select bind:value={editor.doc.orientation} onchange={commit}>
      <option value="">Follow the roll (its own direction)</option>
      <option value="portrait">Portrait (across the label)</option>
      <option value="landscape">Landscape (along the label)</option>
    </select>
  </label>
  <label>Print density (DYMO driver)
    <select value={editor.doc.printDensity || ''} onchange={e => { editor.doc.printDensity = e.currentTarget.value; commit(); }}>
      <option value="">Printer default</option>
      <option value="light">Light</option><option value="medium">Medium</option><option value="normal">Normal</option><option value="dark">Dark</option>
    </select>
  </label>
  <p class="muted">Labels with a picture or a barcode print in the driver's graphics quality. Light helps when pictures print too dark.</p>
  <p class="muted">The canvas is {editor.canvas.w.toFixed(1)} × {editor.canvas.h.toFixed(1)} mm. Objects keep their millimetre positions when the format or direction changes{editor.doc.anyRoll ? '; the shares are taken from the format you draw on when you save' : ''}.</p>
  {#if editor.source}
    <p class="muted">Opened from version {editor.source.version} ({editor.source.status}). Saving adds a new draft version.</p>
  {/if}
</div>

<style>
  .form { display: grid; gap: 9px; }
  .form label { display: grid; gap: 3px; }
  .form label.check { display: flex; gap: 6px; align-items: center; color: var(--text); }
  p { margin: 0; }
</style>
