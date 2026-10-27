// Editor state for one template: the document, the selection, undo history and view settings.
import { History, canvasSize, canvasMargins, toDefinition, align, reorder, duplicate, newObject, bounds } from './model.js';

const snapshot = doc => JSON.parse(JSON.stringify(doc));

export class Editor {
  doc = $state(null);
  media = $state(null);
  style = $state({});
  selected = $state([]);
  tool = $state('select');
  zoom = $state(5);
  grid = $state(1);
  snap = $state(true);
  showGrid = $state(true);
  showFieldNames = $state(false);
  source = $state(null);
  saved = $state('');
  canUndo = $state(false);
  canRedo = $state(false);
  warnings = $state([]);
  clipboard = [];
  history = new History();

  canvas = $derived(this.doc && this.media ? canvasSize(this.media, this.doc.orientation) : { w: 0, h: 0 });
  margins = $derived(this.doc && this.media ? canvasMargins(this.media, this.doc.orientation) : null);
  definition = $derived(this.doc ? toDefinition(this.doc, this.canvas) : null);
  dirty = $derived(this.definition ? JSON.stringify(this.definition) !== this.saved : false);
  selection = $derived(this.doc ? this.doc.objects.filter(o => this.selected.includes(o.uid)) : []);

  // source: the saved version this document came from ({id, version, status}), or null for a new template.
  load(doc, media, source = null) {
    this.doc = doc; this.media = media; this.source = source; this.selected = []; this.tool = 'select';
    this.history = new History(); this.history.record(snapshot(doc)); this.syncHistory();
    this.saved = source ? JSON.stringify(toDefinition(doc, this.canvas)) : '';
  }
  markSaved(source) { this.source = source; this.saved = JSON.stringify(this.definition); }
  syncHistory() { this.canUndo = this.history.canUndo; this.canRedo = this.history.canRedo; }
  // Call after each finished change (end of a drag, a property edit), so one undo step is one user action.
  commit() { if (this.history.record(snapshot(this.doc))) this.syncHistory(); }
  restore(state) {
    if (!state) return;
    this.doc = state; this.selected = this.selected.filter(uid => state.objects.some(o => o.uid === uid)); this.syncHistory();
  }
  undo() { this.restore(this.history.undo()); }
  redo() { this.restore(this.history.redo()); }

  setMedia(media) { this.media = media; this.doc.media = [media.key]; this.commit(); }
  add(type, at) {
    const item = newObject(type, at, this.canvas);
    this.doc.objects.push(item); this.selected = [item.uid]; this.tool = 'select'; this.commit();
    return item;
  }
  update(uid, changes) {
    const item = this.doc.objects.find(o => o.uid === uid); if (!item) return;
    for (const [k, v] of Object.entries(changes)) { if (v === undefined) delete item[k]; else item[k] = v; }
  }
  remove() {
    if (!this.selected.length) return;
    this.doc.objects = this.doc.objects.filter(o => !this.selected.includes(o.uid)); this.selected = []; this.commit();
  }
  copy() { this.clipboard = snapshot(this.selection); }
  cut() { this.copy(); this.remove(); }
  paste() {
    if (!this.clipboard.length) return;
    const items = duplicate(this.clipboard, this.doc.objects);
    this.doc.objects.push(...items); this.selected = items.map(o => o.uid); this.clipboard = snapshot(items); this.commit();
  }
  duplicate() { this.copy(); this.paste(); }
  selectAll() { this.selected = this.doc.objects.map(o => o.uid); }
  align(mode) { this.doc.objects = align(this.doc.objects, this.selected, mode, this.canvas); this.commit(); }
  order(op) { this.doc.objects = reorder(this.doc.objects, this.selected, op); this.commit(); }
  nudge(dx, dy, resize = false) {
    for (const item of this.selection) {
      if (resize && item.type !== 'line') { item.w = Math.max(0.5, +(item.w + dx).toFixed(2)); item.h = Math.max(0.5, +(item.h + dy).toFixed(2)); }
      else if (resize) { item.w = +(item.w + dx).toFixed(2); item.h = +(item.h + dy).toFixed(2); }
      else { item.x = +(item.x + dx).toFixed(2); item.y = +(item.y + dy).toFixed(2); }
    }
  }
  selectionBounds() { return this.selection.length ? bounds(this.selection) : null; }
}
