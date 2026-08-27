import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * The one place the app talks to the server.
 *
 * Every screen goes through `api.*`. Nothing else reads a token, builds a URL
 * or parses an error — which is what makes the refresh-on-401 below work
 * everywhere instead of in whichever screens remembered to implement it.
 */

const BASE = (process.env.EXPO_PUBLIC_API_BASE || defaultBase()).replace(/\/$/, '');

/**
 * Android's emulator cannot see the host's `localhost` — that address is the
 * emulated device itself. 10.0.2.2 is the loopback alias to the host machine,
 * and getting this wrong is the single most common "the app won't connect" in
 * React Native development.
 */
function defaultBase() {
  if (Platform.OS === 'android') return 'http://10.0.2.2:8100';
  return 'http://localhost:8100';
}

// ─── Token storage ───────────────────────────────────────────────────────────

/**
 * SecureStore on device, localStorage on web.
 *
 * SecureStore uses the iOS Keychain and Android Keystore, so a token survives
 * an app restart without being readable by another app. It has no web
 * implementation, hence the split — and on web, a token in localStorage is the
 * ordinary trade every SPA makes.
 */
const KEYS = { access: 'auth.access', refresh: 'auth.refresh' };

const store = Platform.OS === 'web'
  ? {
      get: async (k) => { try { return localStorage.getItem(k); } catch { return null; } },
      set: async (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
      del: async (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
    }
  : {
      get: (k) => SecureStore.getItemAsync(k).catch(() => null),
      set: (k, v) => SecureStore.setItemAsync(k, v).catch(() => {}),
      del: (k) => SecureStore.deleteItemAsync(k).catch(() => {}),
    };

export const tokens = {
  get: () => Promise.all([store.get(KEYS.access), store.get(KEYS.refresh)])
    .then(([access, refresh]) => ({ access, refresh })),
  save: async ({ accessToken, refreshToken }) => {
    if (accessToken) await store.set(KEYS.access, accessToken);
    if (refreshToken) await store.set(KEYS.refresh, refreshToken);
  },
  clear: () => Promise.all([store.del(KEYS.access), store.del(KEYS.refresh)]),
};

// ─── Request ─────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(message, { status, code, fields } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/**
 * Serialises concurrent refreshes.
 *
 * A screen that fires four requests at once will get four 401s at once. Without
 * this, all four try to refresh, three of them present a token the first has
 * already rotated away, and the user is thrown back to the login screen for no
 * reason. Everyone waits on the same promise instead.
 */
let refreshing = null;

async function refreshSession() {
  if (refreshing) return refreshing;

  refreshing = (async () => {
    const { refresh } = await tokens.get();
    if (!refresh) throw new ApiError('No session', { status: 401, code: 'NO_REFRESH' });

    const res = await fetch(`${BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });

    if (!res.ok) {
      await tokens.clear();
      throw new ApiError('Session expired', { status: 401, code: 'REFRESH_FAILED' });
    }

    const data = await res.json();
    await tokens.save(data);
    return data.accessToken;
  })().finally(() => { refreshing = null; });

  return refreshing;
}

async function request(method, path, body, { retry = true, isForm = false } = {}) {
  const { access } = await tokens.get();

  const headers = {};
  if (access) headers.Authorization = `Bearer ${access}`;
  // FormData must set its own Content-Type — it carries a multipart boundary
  // that fetch generates. Overriding it makes the server unable to parse it.
  if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : (isForm ? body : JSON.stringify(body)),
    });
  } catch {
    // fetch rejects only on a network failure, never on an HTTP error status.
    throw new ApiError(
      'Cannot reach the server. Check your connection.',
      { status: 0, code: 'NETWORK' },
    );
  }

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));

  if (res.ok) return data;

  // One silent retry after refreshing, and only for an expired access token.
  // Retrying a 403 or a genuinely invalid token would loop.
  if (res.status === 401 && data.code === 'TOKEN_EXPIRED' && retry) {
    try {
      await refreshSession();
      return request(method, path, body, { retry: false, isForm });
    } catch {
      await tokens.clear();
      throw new ApiError('Please sign in again', { status: 401, code: 'SESSION_EXPIRED' });
    }
  }

  throw new ApiError(data.error || `Request failed (${res.status})`, {
    status: res.status, code: data.code, fields: data.fields,
  });
}

const get = (p) => request('GET', p);
const post = (p, b) => request('POST', p, b);
const put = (p, b) => request('PUT', p, b);
const patch = (p, b) => request('PATCH', p, b);
const del = (p) => request('DELETE', p);

/** Query string from an object, skipping empty values. */
const qs = (params = {}) => {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return parts.length ? `?${parts.join('&')}` : '';
};

// ─── The API surface ─────────────────────────────────────────────────────────

export const api = {
  baseUrl: BASE,

  meta: {
    constants: () => get('/api/meta/constants'),
    schools: () => get('/api/meta/schools'),
    legal: (key) => get(`/api/meta/legal/${key}`),
    health: () => get('/api/health'),
  },

  auth: {
    requestOtp: (identifier) => post('/api/auth/otp/request', { identifier }),
    verifyOtp: (identifier, code) => post('/api/auth/otp/verify', { identifier, code }),
    register: (payload) => post('/api/auth/register', payload),
    redeemCode: (code) => post('/api/auth/redeem-code', { code }),
    adminLogin: (email, password) => post('/api/auth/admin/login', { email, password }),
    changePassword: (currentPassword, newPassword) =>
      post('/api/auth/admin/change-password', { currentPassword, newPassword }),
    me: () => get('/api/auth/me'),
    logout: (refreshToken) => post('/api/auth/logout', { refreshToken }),
  },

  content: {
    mine: () => get('/api/content/my'),
    children: (nodeId) => get(`/api/content/nodes/${nodeId}/children`),
    /** One item plus its breadcrumb — what the player screen needs. */
    item: (itemId) => get(`/api/content/items/${itemId}`),
    progress: (itemId, status, positionSecs = 0) =>
      post(`/api/content/items/${itemId}/progress`, { status, positionSecs }),
    tree: () => get('/api/content/tree'),
    createNode: (payload) => post('/api/content/nodes', payload),
    updateNode: (id, payload) => put(`/api/content/nodes/${id}`, payload),
    deleteNode: (id) => del(`/api/content/nodes/${id}`),
    createItem: (formData) => request('POST', '/api/content/items', formData, { isForm: true }),
    /** Up to 10 files in one request. Returns 207 when some were rejected. */
    uploadBulk: (formData) => request('POST', '/api/content/items/bulk', formData, { isForm: true }),
    updateItem: (id, formData) => request('PUT', `/api/content/items/${id}`, formData, { isForm: true }),
    deleteItem: (id) => del(`/api/content/items/${id}`),
  },

  /**
   * Documents and notices.
   *
   * `create` and `update` take FormData because a document may carry a file.
   * The request helper leaves Content-Type alone for FormData — fetch has to
   * set it itself, since it carries the multipart boundary.
   */
  documents: {
    feed: (params) => get(`/api/documents/feed${qs(params)}`),
    unreadCount: () => get('/api/documents/unread-count'),
    markRead: (id) => post(`/api/documents/${id}/read`),

    list: (params) => get(`/api/documents${qs(params)}`),
    create: (formData) => request('POST', '/api/documents', formData, { isForm: true }),
    update: (id, payload) => put(`/api/documents/${id}`, payload),
    remove: (id) => del(`/api/documents/${id}`),
    audiencePreview: (params) => get(`/api/documents/audience-preview${qs(params)}`),
  },

  classes: {
    /** The signed-in member's class (or each child's, for a parent). */
    mine: () => get('/api/classes/mine'),
    list: (params) => get(`/api/classes${qs(params)}`),
    detail: (id) => get(`/api/classes/${id}`),
    create: (payload) => post('/api/classes', payload),
    update: (id, payload) => put(`/api/classes/${id}`, payload),
    remove: (id) => del(`/api/classes/${id}`),
    timetable: (id) => get(`/api/classes/${id}/timetable`),
    /** Replaces the whole week atomically — see the route for why. */
    saveTimetable: (id, slots) => put(`/api/classes/${id}/timetable`, { slots }),
  },

  teachers: {
    list: (params) => get(`/api/teachers${qs(params)}`),
    create: (payload) => post('/api/teachers', payload),
    update: (id, payload) => put(`/api/teachers/${id}`, payload),
    remove: (id) => del(`/api/teachers/${id}`),
  },

  calendar: {
    range: (params) => get(`/api/calendar${qs(params)}`),
    upcoming: (limit = 5) => get(`/api/calendar/upcoming?limit=${limit}`),
    create: (payload) => post('/api/calendar', payload),
    update: (id, payload) => put(`/api/calendar/${id}`, payload),
    remove: (id) => del(`/api/calendar/${id}`),
  },

  admin: {
    dashboard: () => get('/api/admin/dashboard'),
    users: () => get('/api/admin/users'),
    createUser: (payload) => post('/api/admin/users', payload),
    setUserStatus: (id, status) => patch(`/api/admin/users/${id}/status`, { status }),
    resetPassword: (id, newPassword) => post(`/api/admin/users/${id}/password`, { newPassword }),
    settings: () => get('/api/admin/settings'),
    saveSetting: (key, value) => put(`/api/admin/settings/${key}`, { value }),
    audit: (limit = 50) => get(`/api/admin/audit?limit=${limit}`),
  },

  schools: {
    list: (params) => get(`/api/schools${qs(params)}`),
    detail: (id) => get(`/api/schools/${id}`),
    create: (payload) => post('/api/schools', payload),
    update: (id, payload) => put(`/api/schools/${id}`, payload),
    setStatus: (id, status) => patch(`/api/schools/${id}/status`, { status }),
  },

  students: {
    list: (params) => get(`/api/students${qs(params)}`),
    detail: (id) => get(`/api/students/${id}`),
    setStatus: (id, status) => patch(`/api/students/${id}/status`, { status }),
    updateProfile: (id, payload) => put(`/api/students/${id}/profile`, payload),
  },

  codes: {
    list: (params) => get(`/api/codes${qs(params)}`),
    stats: () => get('/api/codes/stats'),
    generate: (payload) => post('/api/codes/generate', payload),
    setStatus: (id, status) => patch(`/api/codes/${id}/status`, { status }),
    reassign: (id, payload) => patch(`/api/codes/${id}/reassign`, payload),
    /** Returns ready-formatted text — see codes.routes.js for why. */
    share: (payload) => post('/api/codes/share', payload),
  },

  parent: {
    children: () => get('/api/parent/children'),
    link: (accessCode, relation = 'parent') => post('/api/parent/children/link', { accessCode, relation }),
    activity: (id) => get(`/api/parent/children/${id}/activity`),
    unlink: (id) => del(`/api/parent/children/${id}`),
  },
};
