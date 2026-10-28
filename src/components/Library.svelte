<script>
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import PictureList from './PictureList.svelte';
  import FontList from './FontList.svelte';
  import { toEditor, blankTemplate, editMedia, naturalOrientation, templateId, builtInIds } from '../lib/model.js';

  let { formats, onopen } = $props();
  let templates = $state([]);
  let chosen = $state(null);
  let versions = $state([]);
  let error = $state('');
  let loading = $state(true);
  let creating = $state(null);
  let showArchived = $state(false);

  const presets = $derived(formats.mediaPresets);
  // A template whose every version is archived is hidden unless asked for; label-service keeps it.
  // A built-in label stays listed: with every edited version archived, its original prints.
  const shown = $derived(templates.filter(t => showArchived || !t.archived || t.builtIn));
  const hiddenCount = $derived(templates.filter(t => t.archived && !t.builtIn).length);
  const mediaName = key => key === '*' ? 'any roll' : presets.find(p => p.key === key)?.sku || key;

  async function load() {
    loading = true; error = '';
    try { templates = (await api('/templates')).templates; } catch (e) { error = e.message; }
    loading = false;
  }
  onMount(load);

  async function choose(template) {
    chosen = template; versions = [];
    // A built-in label has versions only once it was edited here.
    if (template.builtIn && !template.version) return;
    try { versions = (await api(`/templates/${template.id}/versions`)).versions.toReversed(); } catch (e) { error = e.message; }
  }
  async function fetchDefinition(id, version) {
    return (await api(`/templates/${id}${version ? `?version=${version}` : ''}`));
  }
  async function open(id, version) {
    try {
      const record = await fetchDefinition(id, version);
      const media = editMedia(record.definition, presets, formats.mediaKey);
      onopen(toEditor(record.definition, media), media, record.builtIn ? null : { id, version: record.version, status: record.status });
    } catch (e) { error = e.message; }
  }
  async function copy(id, version) {
    try {
      const { definition } = await fetchDefinition(id, version);
      const media = editMedia(definition, presets, formats.mediaKey);
      const doc = toEditor(definition, media);
      let next = `${id}-copy`; for (let n = 2; templates.some(t => t.id === next); n++) next = `${id}-copy-${n}`;
      doc.id = next.slice(0, 64); doc.name = `${definition.name} (copy)`;
      onopen(doc, media, null);
    } catch (e) { error = e.message; }
  }
  // label-service deletes only templates that were never published, so no other system can depend on them.
  async function remove() {
    if (!confirm(`Delete "${chosen.name}" (${chosen.id}) and all its versions? This cannot be undone.`)) return;
    try { await api(`/templates/${chosen.id}`, { method: 'DELETE' }); chosen = null; versions = []; await load(); }
    catch (e) { error = e.message; }
  }
  async function setStatus(version, action) {
    if (action === 'archive' && !confirm(`Archive version ${version}? Other systems stop using it.`)) return;
    try { await api(`/templates/${chosen.id}/versions/${version}/${action}`, { method: 'POST' }); await load(); await choose(templates.find(t => t.id === chosen.id)); }
    catch (e) { error = e.message; }
  }

  const slug = name => name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  function startNew() {
    const media = presets.find(p => p.key === formats.mediaKey) || presets[0];
    creating = { name: '', id: '', idEdited: false, mediaKey: media.key, orientation: formats.style?.orientation || naturalOrientation(media) };
  }
  function create(event) {
    event.preventDefault();
    // A template for any roll is drawn on the loaded roll.
    const anyRoll = creating.mediaKey === '*', media = presets.find(p => p.key === (anyRoll ? formats.mediaKey : creating.mediaKey)) || presets[0];
    onopen(blankTemplate(media, { id: creating.id, name: creating.name.trim(), orientation: creating.orientation, anyRoll }), media, null);
    creating = null;
  }
  const idTaken = $derived(creating && templates.some(t => t.id === creating.id));
  const idValid = $derived(creating && templateId.test(creating.id) && !builtInIds.includes(creating.id));
</script>

<main class="library">
  <section class="list">
    <div class="row">
      <h2 class="grow">Templates</h2>
      <label class="inline"><input type="checkbox" bind:checked={showArchived}> Show archived{hiddenCount ? ` (${hiddenCount})` : ''}</label>
      <button onclick={load} disabled={loading}>Refresh</button>
      <button class="primary" onclick={startNew}>New template</button>
    </div>
    {#if error}<p class="error">{error}</p>{/if}
    {#if creating}
      <form class="card new" onsubmit={create}>
        <h2>New template</h2>
        <label>Name <input bind:value={creating.name} required maxlength="120" oninput={() => { if (!creating.idEdited) creating.id = slug(creating.name); }}></label>
        <label>Id (used by other systems) <input bind:value={creating.id} required oninput={() => { creating.idEdited = true; }}></label>
        {#if creating.id && !idValid}<p class="error">2-64 lower-case letters, digits or hyphens; not box, location or lines (edit those in the list).</p>{/if}
        {#if idTaken}<p class="warn">This id exists. Saving adds a new version to that template.</p>{/if}
        <label>Label format
          <select bind:value={creating.mediaKey}>
            <option value="*">Any roll (drawn on the loaded roll)</option>
            {#each presets as p (p.key)}<option value={p.key}>{p.name}{p.key === formats.mediaKey ? ' (loaded)' : ''}</option>{/each}
          </select>
        </label>
        <label>Text direction
          <select bind:value={creating.orientation}>
            <option value="portrait">Portrait (across the label)</option>
            <option value="landscape">Landscape (along the label)</option>
          </select>
        </label>
        <div class="row"><button class="primary" disabled={!idValid || !creating.name.trim()}>Create</button><button type="button" onclick={() => { creating = null; }}>Cancel</button></div>
      </form>
    {/if}
    {#if loading}<p class="muted">Loading…</p>{/if}
    <table>
      <thead><tr><th>Name</th><th>Id</th><th>Format</th><th>Status</th></tr></thead>
      <tbody>
        {#each shown as t (t.id)}
          <tr class:chosen={chosen?.id === t.id} class:archived={t.archived} onclick={() => choose(t)}>
            <td>{t.name}</td>
            <td class="mono">{t.id}</td>
            <td>{t.builtIn ? 'any roll' : (t.media || []).map(mediaName).join(', ')}</td>
            <td>
              {#if t.builtIn && !t.version}<span class="status">built-in</span>
              {:else}
                {#if t.builtIn}<span class="status">{t.replaced ? 'built-in, edited' : 'built-in'}</span>{/if}
                <span class="status {t.status}">v{t.version} {t.status}</span>
                {#if t.latest && t.latest.version !== t.version}<span class="status {t.latest.status}">v{t.latest.version} {t.latest.status}</span>{/if}
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    <PictureList />
    <FontList />
  </section>

  <aside>
    {#if chosen}
      <h2>{chosen.name}</h2>
      <p class="mono muted">{chosen.id}</p>
      {#if chosen.description}<p>{chosen.description}</p>{/if}
      {#if chosen.builtIn}
        <p class="muted">A built-in label. Other systems print it by its id on every roll. {chosen.replaced ? 'A version edited here prints instead of the original.' : 'The original prints until you publish an edited version.'}</p>
        <div class="row">
          <button class="primary" onclick={() => open(chosen.id)}>{chosen.replaced ? 'Edit the published version' : 'Edit'}</button>
          <button onclick={() => copy(chosen.id)}>Duplicate as a new template</button>
        </div>
      {/if}
      {#if chosen.builtIn && !chosen.version}
        <p class="muted small">Archive every edited version to bring the original back.</p>
      {:else}
        <h3>Versions</h3>
        <ul class="versions">
          {#each versions as v (v.version)}
            <li>
              <div class="row">
                <strong>v{v.version}</strong><span class="status {v.status}">{v.status}</span>
                <span class="muted small">{new Date(v.createdAt).toLocaleString()} · {v.createdBy}</span>
              </div>
              <div class="row">
                <button onclick={() => open(chosen.id, v.version)}>Open</button>
                <button onclick={() => copy(chosen.id, v.version)}>Duplicate</button>
                {#if v.status !== 'published'}<button onclick={() => setStatus(v.version, 'publish')}>Publish</button>{/if}
                {#if v.status !== 'archived'}<button class="danger" onclick={() => setStatus(v.version, 'archive')}>Archive</button>{/if}
              </div>
            </li>
          {/each}
        </ul>
        <p class="muted small">Other systems print the newest published version. Drafts print only from Studio.</p>
        {#if chosen.everPublished && !chosen.archived}
          <p class="muted small">This template has been published, so other systems may use it. Archive every version first; then it can be deleted, and the pictures and fonts it used can be deleted too.</p>
        {:else}
          <button class="danger delete" onclick={remove}>{chosen.builtIn ? 'Delete the edited versions' : 'Delete template'}</button>
          <p class="muted small">{chosen.everPublished ? 'Every version is archived, so no other system prints it.' : 'It was never published, so no other system uses it.'} Deleting removes every version and frees its pictures and fonts. It cannot be undone.</p>
        {/if}
      {/if}
    {:else}
      <p class="muted">Choose a template to see its versions.</p>
    {/if}
  </aside>
</main>

<style>
  .library { display: grid; grid-template-columns: 1fr 340px; gap: 16px; padding: 16px; overflow: auto; align-items: start; }
  @media (max-width: 820px) { .library { grid-template-columns: 1fr; } }
  .list { display: grid; gap: 12px; }
  table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
  th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--line); }
  th { font-size: 12px; color: var(--muted); font-weight: 500; }
  tbody tr { cursor: pointer; }
  tbody tr:hover { background: var(--panel-2); }
  tr.chosen { background: var(--panel-2); box-shadow: inset 3px 0 var(--accent); }
  tr.archived td { color: var(--muted); }
  .inline { display: flex; gap: 5px; align-items: center; color: var(--text); font-size: 13px; }
  .delete { justify-self: start; }
  .mono { font-family: 'Liberation Mono', monospace; font-size: 12px; }
  aside { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px; display: grid; gap: 10px; }
  .versions { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .versions li { display: grid; gap: 6px; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
  .small { font-size: 12px; }
  .card { background: var(--panel); border: 1px solid var(--accent); border-radius: 8px; padding: 14px; display: grid; gap: 10px; max-width: 460px; }
  .card label { display: grid; gap: 3px; }
</style>
