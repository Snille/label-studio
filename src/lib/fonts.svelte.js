// Font families for the editor: the ones label-service ships and the ones designers uploaded. An uploaded font is
// fetched once with the Studio key and added to the page as a FontFace, so the canvas draws it like the built-in ones.
import { api, ApiError, authorizedFetch } from './api.js';
import { fontFamilies } from './model.js';

const maxBytes = 8 * 1024 * 1024;
const faces = new Map();
const styles = { regular: ['400', 'normal'], bold: ['700', 'normal'], italic: ['400', 'italic'], boldItalic: ['700', 'italic'] };

class Fonts {
  // { family, regular, bold, italic, boldItalic, uploaded?, files? } as label-service lists them in /formats.
  families = $state(fontFamilies.map(family => ({ family, regular: true, bold: true, italic: family === 'Liberation Sans', boldItalic: family === 'Liberation Sans' })));
  list = $state([]);
  loaded = $state(false);
  error = $state('');

  byName(family) { return this.families.find(f => f.family === (family || 'Liberation Sans')); }
  has(family, style) { return Boolean(this.byName(family)?.[style]); }

  // Takes the families from label-service and loads the faces of uploaded ones that the page does not have yet.
  use(families) {
    if (!families) return;
    this.families = families;
    for (const f of families.filter(f => f.uploaded)) for (const [style, id] of Object.entries(f.files)) if (!faces.has(id)) faces.set(id, this.face(id, f.family, style));
  }
  async face(id, family, style) {
    try {
      const response = await authorizedFetch(`/fonts/${id}/content`);
      if (!response.ok) throw new ApiError('Font not found.', response.status);
      const [weight, fontStyle] = styles[style];
      const face = await new FontFace(family, await response.arrayBuffer(), { weight, style: fontStyle }).load();
      document.fonts.add(face);
      return face;
    } catch { faces.delete(id); return null; }
  }
  async load() {
    try { this.list = (await api('/fonts')).fonts; this.error = ''; } catch (e) { this.error = e.message; }
    this.loaded = true;
  }
  async refresh() { await this.load(); try { this.use((await api('/formats')).fonts); } catch { /* keep the families */ } }

  // A .ttf, .otf or .woff file, or a .zip with several; label-service reads the family and style from each font.
  async upload(file) {
    if (file.size > maxBytes) throw new ApiError('The file is larger than 8 MB.', 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const result = await api('/fonts', { method: 'POST', body: { name: file.name, data: btoa(binary) } });
    await this.refresh();
    return result;
  }
  async remove(id) {
    await api(`/fonts/${id}`, { method: 'DELETE' });
    const face = await faces.get(id); if (face) document.fonts.delete(face);
    faces.delete(id);
    await this.refresh();
  }
}

export const fonts = new Fonts();
