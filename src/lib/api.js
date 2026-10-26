// label-service API through the Studio server. The Studio key lives in this browser only (decision B13).
const storageKey = 'label-studio.key';
let key = '';
try { key = localStorage.getItem(storageKey) || ''; } catch { /* storage blocked: the key lasts for this tab */ }

export const hasKey = () => Boolean(key);
export function setKey(value) { key = value; try { localStorage.setItem(storageKey, value); } catch { /* tab only */ } }
export function clearKey() { key = ''; try { localStorage.removeItem(storageKey); } catch { /* tab only */ } }

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function api(path, { method = 'GET', body, apiKey = key } = {}) {
  let response;
  try {
    response = await fetch(`/api/v1${path}`, { method, headers: { 'x-api-key': apiKey, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body && JSON.stringify(body) });
  } catch {
    throw new ApiError('Label Studio is not reachable.', 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || `Request failed (${response.status}).`, response.status);
  return data;
}

// A raw response with the key, for binary content such as pictures.
export const authorizedFetch = path => fetch(`/api/v1${path}`, { headers: { 'x-api-key': key } });

// A Studio key must be valid and have the designer role. Publishing a version that does not exist answers 404 for a
// designer and 403 for any other key, and changes nothing.
export async function checkKey(candidate) {
  const formats = await api('/formats', { apiKey: candidate });
  try {
    await api('/templates/zz-role-check/versions/1/publish', { method: 'POST', apiKey: candidate });
  } catch (error) {
    if (error.status === 403) throw new ApiError('This key works, but it cannot design templates. Ask for a key with the designer role.', 403);
    if (error.status !== 404) throw error;
  }
  return formats;
}
