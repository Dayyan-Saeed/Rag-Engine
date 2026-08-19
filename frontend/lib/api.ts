import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const TOKEN_KEY = 'rag_token';

export const getToken = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
};

export const setToken = (token: string) => {
  localStorage.setItem(TOKEN_KEY, token);
};

export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
};

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      if (process.env.NODE_ENV !== 'development') {
        if (typeof window !== 'undefined') {
          window.location.href = '/sign-in';
        }
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),
};

// Document API
export const documentApi = {
  upload: (file: File, onProgress?: (progress: number) => void) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          onProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
        }
      },
    });
  },

  list: (page = 1, pageSize = 20) =>
    api.get('/documents', { params: { page, page_size: pageSize } }),

  getStatus: (id: string) => api.get(`/documents/${id}/status`),

  delete: (id: string) => api.delete(`/documents/${id}`),
};

// Search API
export const searchApi = {
  search: (query: string, options?: { top_k?: number; document_ids?: string[]; min_score?: number }) =>
    api.post('/search', { query, ...options }),
};

// Chat API
export const chatApi = {
  createSession: (title: string, documentIds: string[] = []) =>
    api.post('/chat/sessions', { title, document_ids: documentIds }),

  listSessions: () => api.get('/chat/sessions'),

  getSession: (id: string) => api.get(`/chat/sessions/${id}`),

  getMessages: (sessionId: string) => api.get(`/chat/sessions/${sessionId}/messages`),

  chat: (message: string, options?: { session_id?: string; document_ids?: string[]; stream?: boolean }) =>
    api.post('/chat', { message, ...options }),

  // Streaming chat using Fetch API for SSE support
  chatStream: (message: string, options?: { session_id?: string; document_ids?: string[] }) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const token = getToken();
    return fetch(`${baseUrl}/api/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message, stream: true, ...options }),
    });
  },
};

export default api;