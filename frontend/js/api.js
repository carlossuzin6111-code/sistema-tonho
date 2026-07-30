// FitLife Sync API client

const isNativeCapacitor = Boolean(globalThis.Capacitor?.isNativePlatform?.());

function resolveApiBaseUrl() {
  if (!isNativeCapacitor) return '/api';
  const configured = globalThis.__FITLIFE_API_BASE_URL__;
  if (typeof configured !== 'string' || !configured.trim()) {
    throw new Error('Configure __FITLIFE_API_BASE_URL__ antes de executar o app Capacitor.');
  }
  let url;
  try {
    url = new URL(configured, globalThis.location?.origin || undefined);
  } catch {
    throw new Error('A URL da API móvel é inválida.');
  }
  if (url.protocol !== 'https:') throw new Error('A API móvel deve usar HTTPS.');
  url.pathname = url.pathname.replace(/\/$/, '');
  return url.toString().replace(/\/$/, '');
}

const API_BASE_URL = resolveApiBaseUrl();
const API_CREDENTIALS = isNativeCapacitor ? 'include' : 'same-origin';
const CSRF_COOKIE = 'fitlife_csrf';
const MOBILE_REFRESH_TOKEN_KEY = 'fitlife_refresh_token';
const OFFLINE_DB_NAME = 'fitlife-offline-queue';
const OFFLINE_STORE = 'mutations';
const OFFLINE_MAX_ITEMS = 100;
const OFFLINE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const OfflineQueue = {
  supported() {
    return typeof indexedDB !== 'undefined';
  },

  open() {
    if (!this.supported()) return Promise.reject(new Error('IndexedDB indisponível'));
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(OFFLINE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(OFFLINE_STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('createdAt', 'createdAt');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async enqueue(request) {
    await this.prune();
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_STORE, 'readwrite');
      tx.objectStore(OFFLINE_STORE).add({ ...request, createdAt: Date.now() });
      tx.oncomplete = () => { db.close(); resolve(request.idempotencyKey); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  },

  async all() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(OFFLINE_STORE).objectStore(OFFLINE_STORE).getAll();
      request.onsuccess = () => { db.close(); resolve(request.result.sort((a, b) => a.createdAt - b.createdAt)); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  },

  async prune() {
    if (!this.supported()) return { removed: 0 };
    const items = await this.all();
    const cutoff = Date.now() - OFFLINE_MAX_AGE_MS;
    const stale = items.filter(item => item.createdAt < cutoff);
    const overflow = items.filter((item, index) => index < Math.max(0, items.length - OFFLINE_MAX_ITEMS));
    const ids = new Set([...stale, ...overflow].map(item => item.id));
    for (const id of ids) await this.remove(id);
    return { removed: ids.size };
  },

  async stats() {
    const items = this.supported() ? await this.all() : [];
    return {
      pending: items.length,
      oldestAt: items[0]?.createdAt || null,
      newestAt: items.at(-1)?.createdAt || null,
      maxItems: OFFLINE_MAX_ITEMS,
      maxAgeMs: OFFLINE_MAX_AGE_MS
    };
  },

  async remove(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_STORE, 'readwrite');
      tx.objectStore(OFFLINE_STORE).delete(id);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  },

  async flush(send) {
    if (!this.supported() || (typeof navigator !== 'undefined' && !navigator.onLine)) return { sent: 0, pending: 0 };
    await this.prune();
    const pending = await this.all();
    let sent = 0;
    for (const item of pending) {
      try {
        await send(item);
        await this.remove(item.id);
        sent += 1;
      } catch (error) {
        if (error && error.retryable) break;
        await this.remove(item.id);
      }
    }
    return { sent, pending: Math.max(0, pending.length - sent) };
  }
};

API.flushOfflineQueue = () => API.offlineQueue.flush(async item => {
  const response = await fetch(`${API_BASE_URL}${item.endpoint}`, {
    method: item.method,
    headers: { ...API.getHeaders({ mutating: true }), 'Idempotency-Key': item.idempotencyKey },
    credentials: API_CREDENTIALS,
    body: item.data === undefined ? undefined : JSON.stringify(item.data)
  });
  if (!response.ok) {
    const error = new Error(`Erro HTTP: ${response.status}`);
    error.retryable = response.status >= 500 || response.status === 408 || response.status === 429;
    throw error;
  }
  return response;
});

API.getOfflineQueueStatus = () => API.offlineQueue.stats();

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => API.flushOfflineQueue().catch(error => {
    console.warn('Falha ao sincronizar fila offline:', error.message);
  }));
}

// Remove credentials left by versions prior to HttpOnly cookie sessions.
localStorage.removeItem('fitlife_token');

const API = {
  offlineQueue: OfflineQueue,
  isQueueable(endpoint) {
    return /^\/workout-sessions(?:\/|$)/.test(endpoint);
  },

  createIdempotencyKey() {
    return globalThis.crypto?.randomUUID?.() || `fitlife-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  },

  // Cache only non-sensitive user details. The session credential is an HttpOnly cookie.
  saveSession(user) {
    localStorage.setItem('fitlife_user', JSON.stringify(user));
  },

  async saveMobileRefreshToken(token) {
    if (!isNativeCapacitor || !token) return;
    if (!globalThis.FitLifeSecureStorage?.available()) throw new Error('Secure Storage nativo indisponível.');
    await globalThis.FitLifeSecureStorage.set(MOBILE_REFRESH_TOKEN_KEY, token);
  },

  async getMobileRefreshToken() {
    if (!isNativeCapacitor || !globalThis.FitLifeSecureStorage?.available()) return null;
    return globalThis.FitLifeSecureStorage.get(MOBILE_REFRESH_TOKEN_KEY);
  },

  async clearMobileRefreshToken() {
    if (!isNativeCapacitor || !globalThis.FitLifeSecureStorage?.available()) return;
    await globalThis.FitLifeSecureStorage.remove(MOBILE_REFRESH_TOKEN_KEY);
  },

  // Clear session on logout
  clearSession() {
    localStorage.removeItem('fitlife_user');
  },

  // Get current logged in user from local storage cache
  getCurrentUser() {
    const userStr = localStorage.getItem('fitlife_user');
    return userStr ? JSON.parse(userStr) : null;
  },

  getCsrfToken() {
    const cookie = document.cookie
      .split('; ')
      .find(item => item.startsWith(`${CSRF_COOKIE}=`));
    return cookie ? decodeURIComponent(cookie.slice(CSRF_COOKIE.length + 1)) : null;
  },

  // Set up JSON and CSRF headers. Browsers attach the HttpOnly session cookie.
  getHeaders({ mutating = false } = {}) {
    const csrfToken = mutating ? this.getCsrfToken() : null;
    return {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
    };
  },

  // Handle Response helper
  async handleResponse(response) {
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const error = errData.error || `Erro HTTP: ${response.status}`;
      throw new Error(error);
    }
    return response.json();
  },

  // HTTP GET request
  async get(endpoint) {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'GET',
        headers: this.getHeaders(),
        credentials: API_CREDENTIALS
      });
      return await this.handleResponse(response);
    } catch (err) {
      console.error(`API GET ${endpoint} failed:`, err.message);
      throw err;
    }
  },

  // HTTP POST request
  async post(endpoint, data) {
    return this.mutate('POST', endpoint, data);
  },

  async mutate(method, endpoint, data) {
    const idempotencyKey = this.isQueueable(endpoint) ? this.createIdempotencyKey() : null;
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method,
        headers: { ...this.getHeaders({ mutating: true }), ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
        credentials: API_CREDENTIALS,
        body: data === undefined ? undefined : JSON.stringify(data)
      });
      if (!response.ok && (response.status >= 500 || response.status === 408 || response.status === 429)) {
        const error = new Error(`Erro HTTP: ${response.status}`); error.retryable = true; throw error;
      }
      return await this.handleResponse(response);
    } catch (err) {
      if (this.isQueueable(endpoint) && (err.retryable || !navigator.onLine) && idempotencyKey && this.offlineQueue.supported()) {
        await this.offlineQueue.enqueue({ method, endpoint, data, idempotencyKey });
        return { queued: true, idempotencyKey };
      }
      console.error(`API POST ${endpoint} failed:`, err.message);
      throw err;
    }
  },

  async patch(endpoint, data) {
    return this.mutate('PATCH', endpoint, data);
  },

  async put(endpoint, data) {
    return this.mutate('PUT', endpoint, data);
  },

  // HTTP DELETE request
  async delete(endpoint) {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'DELETE',
        headers: this.getHeaders({ mutating: true }),
        credentials: API_CREDENTIALS
      });
      return await this.handleResponse(response);
    } catch (err) {
      console.error(`API DELETE ${endpoint} failed:`, err.message);
      throw err;
    }
  },


  // Real-Time Chat Server-Sent Events subscription
  chatStream: null,
  
  connectChatStream(onMessageReceived, { onOpen, onError, onTyping } = {}) {
    // If there is an active stream, close it
    this.disconnectChatStream();

    // EventSource authenticates with the same-origin HttpOnly session cookie.
    this.chatStream = new EventSource(`${API_BASE_URL}/chat/stream`, { withCredentials: true });

    this.chatStream.onopen = () => {
      if (onOpen) onOpen();
    };

    this.chatStream.onmessage = (event) => {
      try {
        const messageData = JSON.parse(event.data);
        onMessageReceived(messageData);
      } catch (err) {
        console.error('Error parsing SSE message:', err.message);
      }
    };

    this.chatStream.addEventListener('typing', (event) => {
      try { onTyping?.(JSON.parse(event.data)); } catch (error) { console.error('Error parsing typing event:', error.message); }
    });

    this.chatStream.onerror = (err) => {
      console.error('SSE Chat Stream encountered an error:', err);
      if (onError) onError(err, this.chatStream?.readyState);
    };

    return this.chatStream;
  },

  disconnectChatStream() {
    if (this.chatStream) {
      this.chatStream.close();
      this.chatStream = null;
      console.log('SSE Chat Stream disconnected.');
    }
  }
};
