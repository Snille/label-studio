<script>
  import { onMount } from 'svelte';
  import { fonts } from '../lib/fonts.svelte.js';

  let error = $state('');
  let note = $state('');
  let uploading = $state(false);
  const styleName = { regular: 'Regular', bold: 'Bold', italic: 'Italic', boldItalic: 'Bold italic' };
  const order = Object.keys(styleName);
  const sorted = $derived([...fonts.list].sort((a, b) => a.family.localeCompare(b.family) || order.indexOf(a.style) - order.indexOf(b.style)));
  onMount(() => fonts.load());

  async function upload(event) {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
    if (!file) return;
    uploading = true; error = ''; note = '';
    try {
      const result = await fonts.upload(file);
      note = [result.fonts.length ? `Added ${result.fonts.map(f => `${f.family} ${styleName[f.style].toLowerCase()}`).join(', ')}.` : '',
        ...result.skipped.map(s => `Skipped ${s.name}: ${s.reason}.`)].filter(Boolean).join(' ');
    } catch (e) { error = e.message; }
    uploading = false;
  }
  async function remove(font) {
    if (!confirm(`Delete ${font.family} ${styleName[font.style].toLowerCase()}? This cannot be undone.`)) return;
    error = ''; note = '';
    try { await fonts.remove(font.id); } catch (e) { error = e.message; }
  }
</script>

<section class="fonts">
  <div class="row">
    <h2 class="grow">Fonts</h2>
    <label class="button">{uploading ? 'Uploading…' : 'Upload font'}
      <input type="file" accept=".ttf,.otf,.woff,.zip,font/ttf,font/otf,font/woff,application/zip" disabled={uploading} onchange={upload}>
    </label>
  </div>
  <p class="muted small">A .ttf, .otf or .woff file, or a .zip with a whole family. Each file is one style: regular, bold, italic or bold italic. Upload only fonts you may use.</p>
  {#if error || fonts.error}<p class="error">{error || fonts.error}</p>{/if}
  {#if note}<p class="small">{note}</p>{/if}
  {#if fonts.loaded && !fonts.list.length}<p class="muted">No uploaded fonts. The four built-in families are always there.</p>{/if}
  <ul>
    {#each sorted as f (f.id)}
      <li>
        <span class="sample" style:font-family="'{f.family}'" style:font-weight={f.style.startsWith('bold') ? 'bold' : 'normal'} style:font-style={f.style.endsWith('talic') ? 'italic' : 'normal'}>Aa</span>
        <div class="grow">
          <strong>{f.family} · {styleName[f.style]}</strong>
          <span class="muted small">{f.name} · {f.format.toUpperCase()} · {Math.ceil(f.bytes / 1024)} KB · {f.createdBy}{f.restricted ? ' · its maker allows no embedding' : ''}</span>
        </div>
        <button class="danger" onclick={() => remove(f)} title="Only a font that no saved template uses can be deleted">Delete</button>
      </li>
    {/each}
  </ul>
</section>

<style>
  .fonts { display: grid; gap: 10px; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  li { display: flex; gap: 10px; align-items: center; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 8px; }
  li div { display: grid; }
  .sample { width: 48px; height: 48px; background: #fff; color: #000; border-radius: 4px; display: grid; place-items: center; font-size: 22px; }
  .small { font-size: 12px; }
  .button { background: var(--panel-2); border: 1px solid var(--line); border-radius: 6px; padding: 5px 10px; cursor: pointer; color: var(--text); font-size: 14px; }
  .button:hover { border-color: var(--accent); }
  .button input { display: none; }
</style>
