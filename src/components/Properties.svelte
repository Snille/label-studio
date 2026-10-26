<script>
  import { fontFamilies, italicFamilies, fieldName, symbologies, twoDimensional, dateFormats, formatDate, pictureDefaults } from '../lib/model.js';
  import { pictures } from '../lib/pictures.svelte.js';

  let { editor, focusText = 0 } = $props();
  let textArea = $state();
  let dataInput = $state();
  const item = $derived(editor.selection.length === 1 ? editor.selection[0] : null);
  const formatSizes = [['$titleSize', 'Title size'], ['$descriptionSize', 'Description size'], ['$locationSize', 'Location size'], ['$locationLabelSize', 'Location label size']];
  const fieldNames = $derived(Object.keys(editor.definition.fields));
  const commit = () => editor.commit();
  const set = (key, value) => { editor.update(item.uid, { [key]: value }); commit(); };
  const num = (value, fallback) => Number.isFinite(value) ? value : fallback;
  const optional = value => Number.isFinite(value) ? value : undefined;

  $effect(() => { if (focusText && textArea) { textArea.focus(); textArea.select(); } });

  let uploading = $state(false), uploadError = $state('');
  $effect(() => { if (item?.type === 'image' && !pictures.loaded) pictures.load(); });
  async function upload(event) {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
    if (!file) return;
    uploading = true; uploadError = '';
    try { const record = await pictures.upload(file); set('asset', record.id); } catch (e) { uploadError = e.message; }
    uploading = false;
  }

  // Puts {{name}} where the cursor is in the text or data box.
  function insertField(event, key, element) {
    const name = event.currentTarget.value; event.currentTarget.value = '';
    if (!name) return;
    const value = item[key] || '', start = element?.selectionStart ?? value.length, end = element?.selectionEnd ?? start;
    set(key, `${value.slice(0, start)}{{${name}}}${value.slice(end)}`);
  }
  const dashText = $derived(item?.dash?.join(' ') || '');
  function setDash(value) {
    const parts = value.trim() ? value.trim().split(/[\s,]+/).map(Number) : [];
    if (parts.every(n => Number.isFinite(n) && n >= 0.1 && n <= 50) && parts.length <= 8) set('dash', parts.length ? parts : undefined);
  }
  function setSymbology(value) {
    const changes = { symbology: value };
    if (twoDimensional(value)) { changes.humanReadable = undefined; const side = Math.min(item.w, item.h); changes.w = side; changes.h = side; }
    if (value !== 'qrcode') changes.ecLevel = undefined;
    editor.update(item.uid, changes); commit();
  }
</script>

{#snippet fieldPicker(key, element)}
  {#if fieldNames.length}
    <label class="wide">Insert field
      <select onchange={e => insertField(e, key, element)}>
        <option value="">Choose a field…</option>
        {#each fieldNames as name (name)}<option value={name}>{name}</option>{/each}
      </select>
    </label>
  {/if}
{/snippet}

{#snippet fontAndSize(fallback)}
  <label class="wide">Font
    <select value={item.font || 'Liberation Sans'} onchange={e => { set('font', e.currentTarget.value); if (!italicFamilies.includes(e.currentTarget.value) && item.italic) set('italic', undefined); }}>
      {#each fontFamilies as f (f)}<option value={f}>{f}</option>{/each}
    </select>
  </label>
  <label>Size
    <select value={typeof item.size === 'string' ? item.size : 'pt'} onchange={e => set('size', e.currentTarget.value === 'pt' ? fallback : e.currentTarget.value)}>
      <option value="pt">Points</option>
      {#each formatSizes as [k, name] (k)}<option value={k}>{name} ({editor.style?.[k.slice(1)]} pt)</option>{/each}
    </select>
  </label>
  {#if typeof item.size !== 'string'}
    <label>Points<input type="number" min="4" max="200" step="0.5" value={item.size ?? fallback} onchange={e => set('size', num(e.currentTarget.valueAsNumber, fallback))}></label>
  {:else}<span></span>{/if}
{/snippet}

{#snippet placement(valignDefault)}
  <label>Horizontal
    <select value={item.align || 'center'} onchange={e => set('align', e.currentTarget.value)}>
      <option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option>
    </select>
  </label>
  <label>Vertical
    <select value={item.valign || valignDefault} onchange={e => set('valign', e.currentTarget.value)}>
      <option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option>
    </select>
  </label>
{/snippet}

{#snippet shrink()}
  <label>Shrink to (pt)
    <input type="number" min="4" max="200" step="0.5" value={item.minSize ?? ''} placeholder="no" onchange={e => set('minSize', optional(e.currentTarget.valueAsNumber))}>
  </label>
{/snippet}

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
      {@render fieldPicker('text', textArea)}
      {@render fontAndSize(10)}
      {@render shrink()}
      <label>Line height
        <input type="number" min="0.8" max="3" step="0.05" value={item.lineHeight ?? ''} placeholder="1.2" onchange={e => set('lineHeight', optional(e.currentTarget.valueAsNumber))}>
      </label>
      {@render placement('top')}
      <div class="wide checks">
        <label><input type="checkbox" checked={Boolean(item.bold)} onchange={e => set('bold', e.currentTarget.checked || undefined)}> Bold</label>
        <label><input type="checkbox" checked={Boolean(item.italic)} disabled={!italicFamilies.includes(item.font || 'Liberation Sans')} onchange={e => set('italic', e.currentTarget.checked || undefined)}> Italic</label>
        <label><input type="checkbox" checked={item.wrap !== false} onchange={e => set('wrap', e.currentTarget.checked ? undefined : false)}> Wrap</label>
        <label><input type="checkbox" checked={Boolean(item.breakHyphens)} onchange={e => set('breakHyphens', e.currentTarget.checked || undefined)}> Break at hyphens</label>
        <label><input type="checkbox" checked={item.color === 'white'} onchange={e => set('color', e.currentTarget.checked ? 'white' : undefined)}> White text</label>
      </div>
    {:else if item.type === 'date'}
      <label class="wide">Format — yyyy, yy, MM, dd, HH, mm
        <input list="date-formats" value={item.format || 'yyyy-MM-dd'} onchange={e => set('format', e.currentTarget.value.trim() || undefined)}>
        <datalist id="date-formats">{#each dateFormats as f (f)}<option value={f}></option>{/each}</datalist>
      </label>
      <label>Text before<input value={item.prefix || ''} onchange={e => set('prefix', e.currentTarget.value || undefined)}></label>
      <label>Text after<input value={item.suffix || ''} onchange={e => set('suffix', e.currentTarget.value || undefined)}></label>
      <p class="wide muted small">Now: {item.prefix || ''}{formatDate(new Date(), item.format)}{item.suffix || ''}. The label gets the time of its preview.</p>
      {@render fontAndSize(8)}
      {@render shrink()}
      <span></span>
      {@render placement('top')}
      <div class="wide checks">
        <label><input type="checkbox" checked={Boolean(item.bold)} onchange={e => set('bold', e.currentTarget.checked || undefined)}> Bold</label>
        <label><input type="checkbox" checked={Boolean(item.italic)} disabled={!italicFamilies.includes(item.font || 'Liberation Sans')} onchange={e => set('italic', e.currentTarget.checked || undefined)}> Italic</label>
        <label><input type="checkbox" checked={item.color === 'white'} onchange={e => set('color', e.currentTarget.checked ? 'white' : undefined)}> White text</label>
      </div>
    {:else if item.type === 'barcode'}
      <label class="wide">Type
        <select value={item.symbology} onchange={e => setSymbology(e.currentTarget.value)}>
          {#each symbologies as [key, name] (key)}<option value={key}>{name}</option>{/each}
        </select>
      </label>
      <label class="wide">Data — use {'{{field}}'} for values from other systems
        <input bind:this={dataInput} bind:value={item.data} onchange={commit}>
      </label>
      {#if item.symbology === 'ean13'}<p class="wide muted small">12 digits; label-service adds the check digit. 13 digits must have the right check digit.</p>{/if}
      {@render fieldPicker('data', dataInput)}
      {#if twoDimensional(item.symbology)}
        {#if item.symbology === 'qrcode'}
          <label>Error correction
            <select value={item.ecLevel || 'M'} onchange={e => set('ecLevel', e.currentTarget.value === 'M' ? undefined : e.currentTarget.value)}>
              <option value="L">L (7 %)</option><option value="M">M (15 %)</option><option value="Q">Q (25 %)</option><option value="H">H (30 %)</option>
            </select>
          </label><span></span>
        {/if}
        {@render placement('middle')}
        <p class="wide muted small">The code is square and as large as the box allows in whole printer dots (at least 3 per module).</p>
      {:else}
        <label class="wide">Text under the bars
          <select value={item.humanReadable || 'below'} onchange={e => set('humanReadable', e.currentTarget.value === 'below' ? undefined : e.currentTarget.value)}>
            <option value="below">Show</option><option value="none">Hide</option>
          </select>
        </label>
        {#if item.humanReadable !== 'none'}{@render fontAndSize(8)}{/if}
        <label>Horizontal
          <select value={item.align || 'center'} onchange={e => set('align', e.currentTarget.value)}>
            <option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option>
          </select>
        </label>
        <p class="wide muted small">The bars fill the box width in whole printer dots (at least 2 per bar). Leave some space on each side for scanning.</p>
      {/if}
    {:else if item.type === 'image'}
      <label class="wide">Picture
        <select value={item.asset || ''} onchange={e => set('asset', e.currentTarget.value)}>
          <option value="" disabled>Choose a picture…</option>
          {#each pictures.list as p (p.id)}<option value={p.id}>{p.name} ({p.width} × {p.height})</option>{/each}
        </select>
      </label>
      <label class="wide upload">Upload a picture (PNG, JPEG or SVG, at most 2 MB)
        <input type="file" accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml" disabled={uploading} onchange={upload}>
      </label>
      {#if uploading}<p class="wide muted small">Uploading…</p>{/if}
      {#if uploadError}<p class="wide error">{uploadError}</p>{/if}
      {#if pictures.error}<p class="wide error">{pictures.error}</p>{/if}
      <label>Fit
        <select value={item.fit || 'contain'} onchange={e => set('fit', e.currentTarget.value === 'contain' ? undefined : e.currentTarget.value)}>
          <option value="contain">Keep proportions</option><option value="stretch">Stretch to the box</option>
        </select>
      </label>
      <label>Black and white
        <select value={item.mode || 'threshold'} onchange={e => set('mode', e.currentTarget.value === 'threshold' ? undefined : e.currentTarget.value)}>
          <option value="threshold">Threshold (logos)</option><option value="dither">Dither (photos, shades)</option>
        </select>
      </label>
      <label class="wide">Threshold: {item.threshold ?? pictureDefaults(item.mode).threshold} — higher makes more black
        <input type="range" min="1" max="254" value={item.threshold ?? pictureDefaults(item.mode).threshold}
          onchange={e => set('threshold', e.currentTarget.valueAsNumber === pictureDefaults(item.mode).threshold ? undefined : e.currentTarget.valueAsNumber)}>
      </label>
      <label class="wide">Lighten for thermal paper: {item.lighten ?? pictureDefaults(item.mode).lighten} — dots print larger than on screen
        <input type="range" min="0" max="100" value={item.lighten ?? pictureDefaults(item.mode).lighten}
          onchange={e => set('lighten', e.currentTarget.valueAsNumber === pictureDefaults(item.mode).lighten ? undefined : e.currentTarget.valueAsNumber)}>
      </label>
      <div class="wide checks">
        <label><input type="checkbox" checked={Boolean(item.invert)} onchange={e => set('invert', e.currentTarget.checked || undefined)}> Invert (white on black)</label>
      </div>
      {@render placement('middle')}
      <p class="wide muted small">The editor shows the picture in grey. The preview shows the black and white dots that print.</p>
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
  .small { font-size: 12px; }
  p { margin: 0; }
</style>
