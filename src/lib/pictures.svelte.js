// Uploaded pictures, shared by the editor and the library. The picture bytes need the Studio key, so they are
// fetched once and shown through object URLs.
import { api, ApiError, authorizedFetch } from './api.js';

const maxBytes = 2 * 1024 * 1024;
const urls = new Map();

class Pictures {
  list = $state([]);
  loaded = $state(false);
  error = $state('');

  async load() {
    try { this.list = (await api('/assets')).assets; this.error = ''; } catch (e) { this.error = e.message; }
    this.loaded = true;
  }
  byId(id) { return this.list.find(p => p.id === id); }

  // Reads a file from the computer and uploads it; label-service checks and converts it. A PDF takes options.page
  // (1 for the first); options.crop { x, y, w, h } (shares from 0 to 1) keeps part of any picture.
  async upload(file, options = {}) {
    if (file.size > maxBytes) throw new ApiError('The file is larger than 2 MB. Make it smaller first.', 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const record = await api('/assets', { method: 'POST', body: { name: options.name || file.name.replace(/\.[^.]+$/, ''), data: btoa(binary), page: options.page, crop: options.crop } });
    this.list = [...this.list, record];
    return record;
  }
  async remove(id) {
    await api(`/assets/${id}`, { method: 'DELETE' });
    this.list = this.list.filter(p => p.id !== id);
    if (urls.has(id)) { URL.revokeObjectURL(await urls.get(id)); urls.delete(id); }
  }
  // An object URL for the stored PNG, fetched once per picture.
  url(id) {
    if (!urls.has(id)) {
      urls.set(id, authorizedFetch(`/assets/${id}/content`).then(async r => {
        if (!r.ok) throw new ApiError('Picture not found.', r.status);
        return URL.createObjectURL(await r.blob());
      }).catch(error => { urls.delete(id); throw error; }));
    }
    return urls.get(id);
  }
}

export const pictures = new Pictures();
