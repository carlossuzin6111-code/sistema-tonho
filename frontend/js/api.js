// FitLife Sync API client

const API_BASE_URL = '/api';

const API = {
  // Get token from localStorage
  getToken() {
    return localStorage.getItem('fitlife_token');
  },

  // Save token & user details
  saveSession(token, user) {
    localStorage.setItem('fitlife_token', token);
    localStorage.setItem('fitlife_user', JSON.stringify(user));
  },

  // Clear session on logout
  clearSession() {
    localStorage.removeItem('fitlife_token');
    localStorage.removeItem('fitlife_user');
  },

  // Get current logged in user from local storage cache
  getCurrentUser() {
    const userStr = localStorage.getItem('fitlife_user');
    return userStr ? JSON.parse(userStr) : null;
  },

  // Set up authentication headers
  getHeaders() {
    const token = this.getToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
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
        headers: this.getHeaders()
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
        headers: this.getHeaders(),
        body: JSON.stringify(data)
      });
      return await this.handleResponse(response);
    } catch (err) {
      console.error(`API POST ${endpoint} failed:`, err.message);
      throw err;
    }
  },

  // HTTP DELETE request
  async delete(endpoint) {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });
      return await this.handleResponse(response);
    } catch (err) {
      console.error(`API DELETE ${endpoint} failed:`, err.message);
      throw err;
    }
  },

  // HTTP PATCH request
  async patch(endpoint, data) {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify(data || {})
      });
      return await this.handleResponse(response);
    } catch (err) {
      console.error(`API PATCH ${endpoint} failed:`, err.message);
      throw err;
    }
  },

  // HTTP PUT request
  async put(endpoint, data) {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(data || {})
      });
      return await this.handleResponse(response);
    } catch (err) {
      console.error(`API PUT ${endpoint} failed:`, err.message);
      throw err;
    }
  },

  // Real-Time Chat Server-Sent Events subscription
  chatStream: null,
  
  connectChatStream(onMessageReceived, onError) {
    const token = this.getToken();
    if (!token) return null;

    // If there is an active stream, close it
    this.disconnectChatStream();

    // Create an EventSource subscribing to the stream, passing the token via query params
    const sseUrl = `${API_BASE_URL}/chat/stream?token=${encodeURIComponent(token)}`;
    this.chatStream = new EventSource(sseUrl);

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
      if (onError) onError(err);
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
