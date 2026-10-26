<script>
  import { fontFamilies, italicFamilies, fieldName } from '../lib/model.js';

  let { editor, focusText = 0 } = $props();
  let textArea = $state();
  const item = $derived(editor.selection.length === 1 ? editor.selection[0] : null);
  const formatSizes = [['$titleSize', 'Title size'], ['$descriptionSize', 'Description size'], ['$locationSize', 'Location size'], ['$locationLabelSize', 'Location label size']];
  const commit = () => editor.commit();
  const set = (key, value) => { editor.update(item.uid, { [key]: value }); commit(); };
  const num = (value, fallback) => Number.isFinite(value) ? value : fallback;

  $effect(() => { if (focusText && textArea) { textArea.focus(); textArea.select(); } });

  function insertField(event) {
    const name = event.currentTarget.value; event.currentTarget.value = '';
    if (!name) return;
    const start = textArea?.selectionStart ?? item.text.length, end = textArea?.selectionEnd ?? start;
    set('text', `${item.text.slice(0, start)}{{${name}}}${item.text.slice(end)}`);
  }
  const dashText = $derived(item?.dash?.join(' ') || '');
  function setDash(value) {
    const parts = value.trim() ? value.trim().split(/[\s,]+/).map(Number) : [];
    if (parts.every(n => Number.isFinite(n) && n >= 0.1 && n <= 50) && parts.length <= 8) set('dash', parts.length ? parts : undefined);
  }
</script>

{#if !item}
  {#if editor.selected.length > 1}
    <p>{editor.selected.length} objects selected.</p>
    <p class="muted">Use the align buttons in the toolbar to line them up, or the arrow keys to move them together.</p>
  {:else}
    <p class="muted">Choose an object on the label, or pick a tool on the left and click the label to add one.</p>
    <ul class="muted help">
      <li>Ctrl+click: select more objects.</li>
      <li>Arrows: move one grid step; Shift+arrows: 0.1 mm; Ctrl+arrows: resize.</li>
      <li>Alt while dragging: no snapping. Shift on a corner: keep proportions.</li>
      <li>Ctrl+C, Ctrl+V, Ctrl+D, Delete, Ctrl+Z, Ctrl+Y.</li>
      <li>Ctrl+wheel: zoom.</li>
    </ul>
  {/if}
{:else}
  <div class="form">
    <label class="wide">Name (shown in warnings; optional)
      <input value={item.id || ''} placeholder="{item.type}" onchange={e => { const v = e.currentTarget.value.trim(); set('id', v || undefined); }}>
    </label>
    {#if item.id && !fieldName.test(item.id)}<p class="error wide">Start with a letter; use letters, digits or _.</p>{/if}

    <label>X mm<input type="number" step="0.1" bind:value={item.x} onchange={commit}></label>
    <label>Y mm<input type="number" step="0.1" bind:value={item.y} onchange={commit}></label>
    <label>{item.type === 'line' ? 'Δx' : 'Width'} mm<input type="number" step="0.1" bind:value={item.w} onchange={commit}></label>
    <label>{item.type === 'line' ? 'Δy' : 'Height'} mm<input type="number" step="0.1" bind:value={item.h} onchange={commit}></label>

    {#if item.type === 'text'}
      <label class="wide">Text — use {'{{field}}'} for values from other systems
        <textarea bind:this={textArea} rows="3" bind:value={item.text} onchange={commit}></textarea>
      </label>
      {#if Object.keys(editor.definition.fields).length}
        <label class="wide">Insert field
          <select onchange={insertField}>
            <option value="">Choose a field…</option>
            {#each Object.keys(editor.definition.fields) as name (name)}<option value={name}>{name}</option>{/each}
          </select>
        </label>
      {/if}
      <label class="wide">Font
        <select value={item.font || 'Liberation Sans'} onchange={e => { set('font', e.currentTarget.value); if (!italicFamilies.includes(e.currentTarget.value) && item.italic) set('italic', undefined); }}>
          {#each fontFamilies as f (f)}<option value={f}>{f}</option>{/each}
        </select>
      </label>
      <label>Size
        <select value={typeof item.size === 'string' ? item.size : 'pt'} onchange={e => set('size', e.currentTarget.value === 'pt' ? 10 : e.currentTarget.value)}>
          <option value="pt">Points</option>
          {#each formatSizes as [k, name] (k)}<option value={k}>{name} ({editor.style?.[k.slice(1)]} pt)</option>{/each}
        </select>
      </label>
      {#if typeof item.size !== 'string'}
        <label>Points<input type="number" min="4" max="200" step="0.5" value={item.size ?? 10} onchange={e => set('size', num(e.currentTarget.valueAsNumber, 10))}></label>
      {:else}<span></span>{/if}
      <label>Shrink to (pt)
        <input type="number" min="4" max="200" step="0.5" value={item.minSize ?? ''} placeholder="no" onchange={e => set('minSize', Number.isFinite(e.currentTarget.valueAsNumber) ? e.currentTarget.valueAsNumber : undefined)}>
      </label>
      <label>Line height
        <input type="number" min="0.8" max="3" step="0.05" value={item.lineHeight ?? ''} placeholder="1.2" onchange={e => set('lineHeight', Number.isFinite(e.currentTarget.valueAsNumber) ? e.currentTarget.valueAsNumber : undefined)}>
      </label>
      <label>Horizontal
        <select value={item.align || 'center'} onchange={e => set('align', e.currentTarget.value)}>
          <option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option>
        </select>
      </label>
      <label>Vertical
        <select value={item.valign || 'top'} onchange={e => set('valign', e.currentTarget.value)}>
          <option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option>
        </select>
      </label>
      <div class="wide checks">
        <label><input type="checkbox" checked={Boolean(item.bold)} onchange={e => set('bold', e.currentTarget.checked || undefined)}> Bold</label>
        <label><input type="checkbox" checked={Boolean(item.italic)} disabled={!italicFamilies.includes(item.font || 'Liberation Sans')} onchange={e => set('italic', e.currentTarget.checked || undefined)}> Italic</label>
        <label><input type="checkbox" checked={item.wrap !== false} onchange={e => set('wrap', e.currentTarget.checked ? undefined : false)}> Wrap</label>
        <label><input type="checkbox" checked={Boolean(item.breakHyphens)} onchange={e => set('breakHyphens', e.currentTarget.checked || undefined)}> Break at hyphens</label>
        <label><input type="checkbox" checked={item.color === 'white'} onchange={e => set('color', e.currentTarget.checked ? 'white' : undefined)}> White text</label>
      </div>
    {:else if item.type === 'stack'}
      <p class="wide muted">Free lines from the field {item.items}. Edit the lines as test data in the Fields tab.</p>
    {:else}
      <label>Line width mm
        <input type="number" min="0" max="20" step="0.05" value={item.stroke ?? 0.3} onchange={e => set('stroke', num(e.currentTarget.valueAsNumber, 0.3))}>
      </label>
      <label>Dashes mm
        <input value={dashText} placeholder="solid, or 1 0.5" onchange={e => setDash(e.currentTarget.value)}>
      </label>
      {#if item.type !== 'line'}
        <label>Fill
          <select value={item.fill || 'none'} onchange={e => set('fill', e.currentTarget.value)}>
            <option value="none">None</option><option value="black">Black</option><option value="white">White</option>
          </select>
        </label>
      {/if}
      {#if item.type === 'rect'}
        <label>Corner radius mm
          <input type="number" min="0" max="100" step="0.5" value={item.radius ?? 0} onchange={e => set('radius', e.currentTarget.valueAsNumber > 0 ? e.currentTarget.valueAsNumber : undefined)}>
        </label>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .form { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .form label { display: grid; gap: 3px; }
  .wide { grid-column: 1 / -1; }
  .checks { display: flex; flex-wrap: wrap; gap: 6px 14px; }
  .checks label { display: flex; align-items: center; gap: 5px; color: var(--text); font-size: 13px; }
  .help { padding-left: 18px; font-size: 12px; }
  p { margin: 0; }
</style>
