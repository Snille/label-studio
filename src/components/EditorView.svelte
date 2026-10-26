<script>
  import { api } from '../lib/api.js';
  import { problems } from '../lib/model.js';
  import Canvas from './Canvas.svelte';
  import Properties from './Properties.svelte';
  import Fields from './Fields.svelte';
  import TemplatePanel from './TemplatePanel.svelte';
  import Preview from './Preview.svelte';

  let { editor, formats, printer, onrefresh } = $props();
  let tab = $state('object');
  let focusText = $state(0);
  let message = $state(null);
  let saving = $state(false);
  let areaW = $state(800), areaH = $state(600);

  const tools = [['select', 'Select', '↖'], ['text', 'Text', 'T'], ['line', 'Line', '╱'], ['rect', 'Rectangle', '▭'], ['ellipse', 'Ellipse', '◯'], ['barcode', 'Barcode', '|||'], ['qr', 'QR or Data Matrix code', '▦'], ['date', 'Date and time', '◷']];
  const saveProblems = $derived(problems(editor.doc));
  const one = $derived(editor.selected.length > 0);

  function fit() {
    // The stage has a 6 mm margin on each side; the ruler and padding take about 60 px.
    const zoom = Math.min((areaW - 60) / (editor.canvas.w + 12), (areaH - 60) / (editor.canvas.h + 12));
    editor.zoom = Math.max(1, Math.min(40, +zoom.toFixed(2)));
  }
  let fitted = null, fittedSize = '';
  $effect(() => {
    // Fit each newly opened template, and again when the format or direction changes the canvas.
    const size = `${editor.canvas.w}x${editor.canvas.h}`;
    if (editor.doc && (fitted !== editor.history || fittedSize !== size) && areaW > 100) { fitted = editor.history; fittedSize = size; fit(); }
  });
  const zoomBy = factor => { editor.zoom = Math.min(40, Math.max(1, +(editor.zoom * factor).toFixed(2))); };

  async function save() {
    if (saveProblems.length) { message = { kind: 'error', text: saveProblems.join(' ') }; return null; }
    saving = true; message = null;
    try {
      const record = await api('/templates', { method: 'POST', body: { definition: editor.definition } });
      editor.markSaved({ id: record.id, version: record.version, status: record.status });
      message = { kind: 'ok', text: `Saved as draft version ${record.version}.` };
      return record;
    } catch (e) { message = { kind: 'error', text: e.message }; return null; }
    finally { saving = false; }
  }
  async function publish() {
    let source = editor.source;
    if (editor.dirty || !source) {
      if (!confirm('Save the changes as a new version and publish it? Other systems will print with it.')) return;
      source = await save(); if (!source) return;
    } else if (!confirm(`Publish version ${source.version}? Other systems will print with it.`)) return;
    try {
      const record = await api(`/templates/${source.id}/versions/${source.version}/publish`, { method: 'POST' });
      editor.markSaved({ id: record.id, version: record.version, status: record.status });
      message = { kind: 'ok', text: `Version ${record.version} is published.` };
    } catch (e) { message = { kind: 'error', text: e.message }; }
  }

  function selectObject(index) { editor.selected = [editor.doc.objects[index].uid]; tab = 'object'; }

  const keys = { v: 'select', t: 'text', l: 'line', r: 'rect', e: 'ellipse', b: 'barcode', q: 'qr', d: 'date' };
  function keydown(event) {
    const target = event.target;
    if (target.closest?.('input, textarea, select, [contenteditable]')) return;
    const ctrl = event.ctrlKey || event.metaKey, key = event.key;
    const step = event.shiftKey ? 0.1 : editor.grid || 1;
    const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    let handled = true;
    if (ctrl && key.toLowerCase() === 'z' && !event.shiftKey) editor.undo();
    else if (ctrl && (key.toLowerCase() === 'y' || (key.toLowerCase() === 'z' && event.shiftKey))) editor.redo();
    else if (ctrl && key.toLowerCase() === 'c') editor.copy();
    else if (ctrl && key.toLowerCase() === 'x') editor.cut();
    else if (ctrl && key.toLowerCase() === 'v') editor.paste();
    else if (ctrl && key.toLowerCase() === 'd') editor.duplicate();
    else if (ctrl && key.toLowerCase() === 'a') editor.selectAll();
    else if (ctrl && key.toLowerCase() === 's') save();
    else if (key === 'Delete' || key === 'Backspace') editor.remove();
    else if (key === 'Escape') { editor.selected = []; editor.tool = 'select'; }
    else if (arrows[key] && one) { editor.nudge(...arrows[key], ctrl); editor.commit(); }
    else if (!ctrl && !event.altKey && keys[key.toLowerCase()]) editor.tool = keys[key.toLowerCase()];
    else handled = false;
    if (handled) event.preventDefault();
  }
</script>

<svelte:window onkeydown={keydown} />

<div class="editor">
  <div class="toolbar row">
    <button onclick={() => editor.undo()} disabled={!editor.canUndo} title="Undo (Ctrl+Z)">↶</button>
    <button onclick={() => editor.redo()} disabled={!editor.canRedo} title="Redo (Ctrl+Y)">↷</button>
    <span class="sep"></span>
    <button onclick={() => editor.copy()} disabled={!one} title="Copy (Ctrl+C)">Copy</button>
    <button onclick={() => editor.paste()} title="Paste (Ctrl+V)">Paste</button>
    <button onclick={() => editor.duplicate()} disabled={!one} title="Duplicate (Ctrl+D)">Duplicate</button>
    <button class="danger" onclick={() => editor.remove()} disabled={!one} title="Delete">Delete</button>
    <span class="sep"></span>
    <select aria-label="Layer order" disabled={!one} value="" onchange={e => { editor.order(e.currentTarget.value); e.currentTarget.value = ''; }}>
      <option value="" disabled>Order…</option>
      <option value="front">Bring to front</option><option value="forward">Bring forward</option>
      <option value="backward">Send backward</option><option value="back">Send to back</option>
    </select>
    <select aria-label="Align" disabled={!one} value="" onchange={e => { editor.align(e.currentTarget.value); e.currentTarget.value = ''; }}>
      <option value="" disabled>Align{editor.selected.length === 1 ? ' to label' : ''}…</option>
      <option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option>
      <option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option>
    </select>
    <span class="sep"></span>
    <label class="inline"><input type="checkbox" bind:checked={editor.snap}> Snap</label>
    <label class="inline"><input type="checkbox" bind:checked={editor.showGrid}> Grid</label>
    <select aria-label="Grid size" bind:value={editor.grid}>
      {#each [0.5, 1, 2, 5] as g (g)}<option value={g}>{g} mm</option>{/each}
    </select>
    <label class="inline"><input type="checkbox" bind:checked={editor.showFieldNames}> Show {'{{fields}}'}</label>
    <span class="sep"></span>
    <button onclick={() => zoomBy(1 / 1.25)} title="Zoom out">−</button>
    <span class="zoom">{Math.round(editor.zoom / 3.78 * 100)}%</span>
    <button onclick={() => zoomBy(1.25)} title="Zoom in">+</button>
    <button onclick={fit}>Fit</button>
    <span class="grow"></span>
    {#if message}<span class="message {message.kind === 'ok' ? 'ok' : 'error'}" title={message.text}>{message.text}</span>{/if}
    <button onclick={save} disabled={saving || !editor.dirty} title="Save a new draft version (Ctrl+S)">Save draft</button>
    <button class="primary" onclick={publish} disabled={saving || (!editor.dirty && editor.source?.status === 'published')}>Publish</button>
  </div>

  <div class="tools">
    {#each tools as [id, name, icon] (id)}
      <button class:active={editor.tool === id} title="{name} ({id === 'select' ? 'V' : id[0].toUpperCase()})" aria-label={name} onclick={() => { editor.tool = id; }}>{icon}</button>
    {/each}
  </div>

  <div class="area" bind:clientWidth={areaW} bind:clientHeight={areaH}>
    <Canvas {editor} warnings={editor.warnings} ontextedit={() => { tab = 'object'; focusText++; }} />
  </div>

  <aside>
    <Preview {editor} {formats} {printer} onselect={selectObject} />
    <div class="tabs row">
      <button class:active={tab === 'object'} onclick={() => { tab = 'object'; }}>Object</button>
      <button class:active={tab === 'fields'} onclick={() => { tab = 'fields'; }}>Fields and test data</button>
      <button class:active={tab === 'template'} onclick={() => { tab = 'template'; }}>Template</button>
    </div>
    <div class="panel">
      {#if tab === 'object'}<Properties {editor} {focusText} />
      {:else if tab === 'fields'}<Fields {editor} />
      {:else}<TemplatePanel {editor} {formats} />{/if}
    </div>
    <button class="refresh" onclick={onrefresh} title="Read the printer's loaded roll setting again">Reload printer settings</button>
  </aside>
</div>

<style>
  /* minmax(0, 1fr): a wide label scrolls inside the canvas area instead of widening the column. */
  .editor { display: grid; grid-template-columns: 46px minmax(0, 1fr) 370px; grid-template-rows: auto minmax(0, 1fr); min-height: 0; }
  .toolbar { grid-column: 1 / -1; padding: 6px 10px; border-bottom: 1px solid var(--line); background: var(--panel); gap: 6px; flex-wrap: nowrap; overflow-x: auto; }
  .toolbar > * { flex-shrink: 0; }
  .toolbar .message { flex-shrink: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sep { width: 1px; height: 22px; background: var(--line); }
  .inline { display: flex; gap: 4px; align-items: center; color: var(--text); font-size: 13px; }
  .zoom { min-width: 44px; text-align: center; font-size: 12px; color: var(--muted); }
  .tools { display: flex; flex-direction: column; gap: 6px; padding: 8px 5px; border-right: 1px solid var(--line); background: var(--panel); }
  .tools button { width: 36px; height: 36px; padding: 0; font-size: 16px; }
  .area { min-width: 0; min-height: 0; overflow: hidden; }
  aside { border-left: 1px solid var(--line); background: var(--panel); padding: 12px; overflow: auto; display: grid; gap: 12px; align-content: start; min-height: 0; }
  .tabs { gap: 4px; border-bottom: 1px solid var(--line); padding-bottom: 8px; }
  .tabs button { font-size: 12px; padding: 4px 8px; }
  .ok { color: var(--accent); }
  .refresh { justify-self: start; font-size: 12px; }
  @media (max-width: 1000px) { .editor { grid-template-columns: 46px minmax(0, 1fr); } aside { grid-column: 1 / -1; border-left: none; border-top: 1px solid var(--line); } }
</style>
