const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const TOKEN_KEY = 'dws.token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function loginUrl() {
  return `${API_URL}/auth/login`
}

/**
 * Reads the token the API left in the URL fragment after OAuth, then strips it
 * from the address bar so it does not sit in history or get pasted around.
 */
export function consumeTokenFromUrl() {
  const hash = window.location.hash.slice(1)
  if (!hash) return null
  const params = new URLSearchParams(hash)

  const error = params.get('error')
  if (error) {
    window.history.replaceState({}, '', window.location.pathname)
    return { error }
  }

  const token = params.get('token')
  if (!token) return null
  setToken(token)
  window.history.replaceState({}, '', window.location.pathname)
  return { token }
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function request(path, options = {}) {
  const token = getToken()
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (res.status === 401) {
    clearToken()
    throw new ApiError(401, 'Session expired — sign in again')
  }
  if (res.status === 204) return null

  const body = await res.json().catch(() => null)
  if (!res.ok) {
    // FastAPI puts a string in `detail` for HTTPException and a list of field
    // errors there for validation failures; flatten both to one line.
    const detail = body?.detail
    const message = Array.isArray(detail)
      ? detail
          .map((d) => {
            // Pydantic prefixes model-level errors with "Value error, ", and
            // their loc is empty, which used to render as a leading colon.
            const text = String(d.msg).replace(/^Value error,\s*/, '')
            const field = d.loc?.slice(1).filter((p) => p !== 'body').join('.')
            return field ? `${field}: ${text}` : text
          })
          .join('; ')
      : detail || `Request failed (${res.status})`
    throw new ApiError(res.status, message)
  }
  return body
}

export const api = {
  /* The Pass War app talks to /lineups directly. Exposing the same helper
     the typed calls use means one implementation of token handling, which
     is what its own auth.js used to duplicate. */
  raw: (path, opts) => request(path, opts),

  me: () => request('/auth/me'),
  health: () => request('/health'),
  channels: () => request('/channels'),
  roles: () => request('/roles'),

  listAnnouncements: () => request('/announcements'),
  createAnnouncement: (data) =>
    request('/announcements', { method: 'POST', body: JSON.stringify(data) }),
  updateAnnouncement: (id, data) =>
    request(`/announcements/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAnnouncement: (id) => request(`/announcements/${id}`, { method: 'DELETE' }),
  testAnnouncement: (id) => request(`/announcements/${id}/test`, { method: 'POST' }),

  listEvents: () => request('/events'),
  createEvent: (data) => request('/events', { method: 'POST', body: JSON.stringify(data) }),
  updateEvent: (id, data) =>
    request(`/events/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEvent: (id) => request(`/events/${id}`, { method: 'DELETE' }),
  previewEvent: (data) => request('/events/preview', { method: 'POST', body: JSON.stringify(data) }),

  listOccurrences: (eventId, count = 8) =>
    request(`/events/${eventId}/occurrences?count=${count}`),
  overrideOccurrence: (eventId, data) =>
    request(`/events/${eventId}/occurrences`, { method: 'PUT', body: JSON.stringify(data) }),
  clearOccurrence: (eventId, originalStartsAt) =>
    request(
      `/events/${eventId}/occurrences?original_starts_at=${encodeURIComponent(originalStartsAt)}`,
      { method: 'DELETE' },
    ),

  guidedSetup: (data) =>
    request('/setup/event-announcement', { method: 'POST', body: JSON.stringify(data) }),

  previewSchedule: (data) =>
    request('/announcements/preview-schedule', { method: 'POST', body: JSON.stringify(data) }),

  listHistory: (entity) =>
    request(`/history${entity ? `?entity=${entity}` : ''}`),

}
