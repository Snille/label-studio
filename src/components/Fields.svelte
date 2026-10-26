<script>
  import { fieldName, unusedFields } from '../lib/model.js';

  let { editor } = $props();
  let newName = $state('');
  const fields = $derived(editor.definition.fields);
  const unused = $derived(new Set(unusedFields({ ...editor.doc, fields })));

  // A field made automatically from a placeholder is written into the document on its first edit.
  function change(name, key, value) {
    const field = { ...fields[name], ...editor.doc.fields[name] };
    if (value === undefined || value === '' || value === false) delete field[key]; else field[key] = value;
    editor.doc.fields[name] = field; editor.commit();
  }
  function add(event) {
    event.preventDefault();
    const name = newName.trim();
    if (!fieldName.test(name) || fields[name]) return;
    editor.doc.fields[name] = { type: 'text', label: name, sample: name }; newName = ''; editor.commit();
  }
  function remove(name) { delete editor.doc.fields[name]; editor.commit(); }
</script>

<p class="muted">Fields are the values other systems send. Write {'{{name}}'} in a text object to use one. The test value is saved with the template and used for the preview.</p>

{#each Object.entries(fields) as [name, field] (name)}
  <div class="field">
    <div class="row">
      <strong class="grow mono">{name}</strong>
      <span class="muted">{field.type}</span>
      {#if unused.has(name)}<span class="warn small">not used</span><button class="danger" onclick={() => remove(name)}>Remove</button>{/if}
    </div>
    {#if field.type === 'text'}
      <label>Test value
        {#if field.multiline}
          <textarea rows="2" value={field.sample ?? ''} onchange={e => change(name, 'sample', e.currentTarget.value)}></textarea>
        {:else}
          <input value={field.sample ?? ''} onchange={e => change(name, 'sample', e.currentTarget.value)}>
        {/if}
      </label>
      <div class="grid">
        <label>Label<input value={field.label ?? ''} onchange={e => change(name, 'label', e.currentTarget.value)}></label>
        <label>Max length<input type="number" min="1" max="2000" value={field.maxLength ?? ''} placeholder="240"
          onchange={e => change(name, 'maxLength', Number.isInteger(e.currentTarget.valueAsNumber) ? e.currentTarget.valueAsNumber : undefined)}></label>
        <label class="wide">Pattern (regular expression, optional)<input value={field.pattern ?? ''} onchange={e => change(name, 'pattern', e.currentTarget.value)}></label>
      </div>
      <div class="row checks">
        <label><input type="checkbox" checked={field.required !== false} onchange={e => change(name, 'required', e.currentTarget.checked ? undefined : false)}> Required</label>
        <label><input type="checkbox" checked={Boolean(field.multiline)} onchange={e => change(name, 'multiline', e.currentTarget.checked)}> Several lines</label>
      </div>
    {:else}
      <label>Test lines (one per row)
        <textarea rows="3" value={field.sample ?? ''} onchange={e => change(name, 'sample', e.currentTarget.value)}></textarea>
      </label>
    {/if}
  </div>
{:else}
  <p class="muted">No fields yet.</p>
{/each}

<form class="row" onsubmit={add}>
  <input class="grow" placeholder="New field name" bind:value={newName}>
  <button disabled={!fieldName.test(newName.trim()) || Boolean(fields[newName.trim()])}>Add field</button>
</form>

<style>
  .field { display: grid; gap: 6px; padding: 10px 0; border-bottom: 1px solid var(--line); }
  .field label { display: grid; gap: 3px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .wide { grid-column: 1 / -1; }
  .checks label { display: flex; gap: 5px; align-items: center; color: var(--text); font-size: 13px; }
  .mono { font-family: 'Liberation Mono', monospace; }
  .small { font-size: 12px; }
  p { margin: 0 0 8px; }
  form { margin-top: 10px; }
</style>
