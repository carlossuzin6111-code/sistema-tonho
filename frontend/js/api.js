// FitLife Sync API client

const API_BASE_URL = '/api';
const CSRF_COOKIE = 'fitlife_csrf';

// Remove credentials left by versions prior to HttpOnly cookie sessions.
localStorage.removeItem('fitlife_token');

const API = {
  // Cache only non-sensitive user details. The session credential is an HttpOnly cookie.
  saveSession(user) {
    localStorage.setItem('fitlife_user', JSON.stringify(user));
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
        credentials: 'same-origin'
      });
      return await this.handleResponse(response);
    } catch (err) {
      console.error(`API GET ${endpoint} failed:`, err.message);
      throw err;
    }
  },

  // HTTP POST request
  async post(endpoint, data) {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: this.getHeaders({ mutating: true }),
        credentials: 'same-origin',
        body: JSON.stringify(data)
      });
      return await this.handleResponse(response);
    } catch (err) {
      console.error(`API POST ${endpoint} failed:`, err.message);
      throw err;
    }
  },

  async patch(endpoint, data) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'PATCH', headers: this.getHeaders({ mutating: true }),
      credentials: 'same-origin', body: JSON.stringify(data)
    });
    return this.handleResponse(response);
  },

  async put(endpoint, data) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'PUT', headers: this.getHeaders({ mutating: true }),
      credentials: 'same-origin', body: JSON.stringify(data)
    });
    return this.handleResponse(response);
  },

  // HTTP DELETE request
  async delete(endpoint) {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'DELETE',
        headers: this.getHeaders({ mutating: true }),
        credentials: 'same-origin'
      });
      return await this.handleResponse(response);
    } catch (err) {
      console.error(`API DELETE ${endpoint} failed:`, err.message);
      throw err;
    }
  },

  // Real-Time Chat Server-Sent Events subscription
  chatStream: null,
  
  connectChatStream(onMessageReceived, { onOpen, onError } = {}) {
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
