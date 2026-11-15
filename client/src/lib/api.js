/** Thin API client. All calls fail soft: the app keeps working offline. */
export const API_BASE = (import.meta.env?.VITE_API_URL || '').replace(/\/$/, '');

async function request(path, { method = 'GET', body, timeout = 8000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include', // session cookie (HttpOnly)
      signal: ctrl.signal,
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(t);
  }
}

const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)).toString();

export const api = {
  health: () => request('/health', { timeout: 4000 }),
  // Auth
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me', { timeout: 5000 }),
  crewDetail: (crewId) => request(`/crew/${encodeURIComponent(crewId)}`, { timeout: 15000 }),
  // Log entries
  postReading: (r) => request('/readings', { method: 'POST', body: r }),
  readings: (crewId, from, to) => request(`/readings?${qs({ crewId, from, to })}`, { timeout: 15000 }),
  deleteReading: (id, crewId) => request(`/readings/${encodeURIComponent(id)}?${qs({ crewId })}`, { method: 'DELETE' }),
  // Baseline
  getBaseline: (crewId) => request(`/baseline/${crewId}`),
  putBaseline: (crewId, b) => request(`/baseline/${crewId}`, { method: 'PUT', body: b }),
  // Crew + escalations
  crew: () => request('/crew'),
  postEscalation: (p) => request('/escalations', { method: 'POST', body: p }),
  escalations: () => request('/escalations'),
  patchEscalation: (id, body) => request(`/escalations/${id}`, { method: 'PATCH', body }),
  replyEscalation: (id, text) => request(`/escalations/${id}/reply`, { method: 'POST', body: { text } }),
  // Earth link simulator (store and forward)
  link: () => request('/link', { timeout: 5000 }),
  setLink: (body) => request('/link', { method: 'PUT', body }),
  // Telemetry
  postTelemetry: (payload, key) => request('/telemetry', { method: 'POST', body: payload, headers: key ? { 'x-telemetry-key': key } : {} }),
  telemetry: (crewId, since) => request(`/telemetry?${qs({ crewId, since })}`, { timeout: 15000 }),
  telemetryLatest: (crewId) => request(`/telemetry/latest?${qs({ crewId })}`),
  streamUrl: (crewId) => `${API_BASE}/api/telemetry/stream?${qs({ crewId })}`,
  // Real NASA data
  spaceWeather: (refresh) => request(`/space-weather${refresh ? '?refresh=1' : ''}`, { timeout: 25000 }),
  radlab: () => request('/nasa/radlab', { timeout: 15000 }),
  // Assistant
  // A photo makes the call slower (upload + image reading), so it gets a longer timeout.
  assistant: (question, context, { image, history } = {}) =>
    request('/assistant', { method: 'POST', body: { question, context, history, image: image ? { mediaType: image.mediaType, data: image.data } : undefined }, timeout: image ? 60000 : 30000 }),
  // Symptom notes and knowledge gaps
  symptomNotes: (crewId) => request(`/symptom-notes?${qs({ crewId })}`),
  postSymptomNote: (n) => request('/symptom-notes', { method: 'POST', body: n }),
  patchSymptomNote: (id, body) => request(`/symptom-notes/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  knowledgeGaps: () => request('/knowledge-gaps'),
};

export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
