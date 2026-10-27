<script>
  import { onMount } from 'svelte';
  import { pictures } from '../lib/pictures.svelte.js';

  let error = $state('');
  let uploading = $state(false);
  onMount(() => pictures.load());

  async function upload(event) {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
    if (!file) return;
    uploading = true; error = '';
    try { await pictures.upload(file); } catch (e) { error = e.message; }
    uploading = false;
  }
  async function remove(picture) {
    if (!confirm(`Delete the picture "${picture.name}"? This cannot be undone.`)) return;
    error = '';
    try { await pictures.remove(picture.id); } catch (e) { error = e.message; }
  }
</script>

<section class="pictures">
  <div class="row">
    <h2 class="grow">Pictures</h2>
    <label class="button">{uploading ? 'Uploading…' : 'Upload picture'}
      <input type="file" accept=".png,.jpg,.jpeg,.svg,.pdf,image/png,image/jpeg,image/svg+xml,application/pdf" disabled={uploading} onchange={upload}>
    </label>
  </div>
  {#if error || pictures.error}<p class="error">{error || pictures.error}</p>{/if}
  {#if pictures.loaded && !pictures.list.length}<p class="muted">No pictures yet. Upload a logo here or from an image object in the editor.</p>{/if}
  <ul>
    {#each pictures.list as p (p.id)}
      <li>
        {#await pictures.url(p.id) then src}<img {src} alt="">{:catch}<span class="missing">?</span>{/await}
        <div class="grow">
          <strong>{p.name}</strong>
          <span class="muted small">{p.type.toUpperCase()} · {p.width} × {p.height} px · {Math.ceil(p.bytes / 1024)} KB · {p.createdBy}</span>
        </div>
        <button class="danger" onclick={() => remove(p)} title="Only a picture that no saved template uses can be deleted">Delete</button>
      </li>
    {/each}
  </ul>
</section>

<style>
  .pictures { display: grid; gap: 10px; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  li { display: flex; gap: 10px; align-items: center; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 8px; }
  li div { display: grid; }
  img, .missing { width: 48px; height: 48px; object-fit: contain; background: #fff; border-radius: 4px; filter: grayscale(1); display: grid; place-items: center; color: #999; }
  .small { font-size: 12px; }
  .button { background: var(--panel-2); border: 1px solid var(--line); border-radius: 6px; padding: 5px 10px; cursor: pointer; color: var(--text); font-size: 14px; }
  .button:hover { border-color: var(--accent); }
  .button input { display: none; }
</style>
