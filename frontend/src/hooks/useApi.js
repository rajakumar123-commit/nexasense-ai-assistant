// ============================================================
// useApi.js — NexaSense
// Fix: return full axios response so callers can use res.data
// Previously returned res.data directly — broke all callers
// ============================================================

import axios from "axios";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3000/api";

// ─────────────────────────────────────────
// Axios instance
// ─────────────────────────────────────────
const api = axios.create({
  baseURL:  API_URL,
  timeout:  20000,
});

// ─────────────────────────────────────────
// Attach JWT automatically
// ─────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─────────────────────────────────────────
// Handle auth expiration
// ─────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem("token");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);


// ─────────────────────────────────────────
// API Hook
// Fix: return full response object (res)
// so callers can access res.data.documents
// res.data.token etc — matching original usage
// ─────────────────────────────────────────
export default function useApi() {

  const get = (url, config = {}) =>
    api.get(url, config);

  const post = (url, data = {}, config = {}) =>
    api.post(url, data, config);

  const put = (url, data = {}, config = {}) =>
    api.put(url, data, config);

  const del = (url, config = {}) =>
    api.delete(url, config);

  const upload = (url, formData) =>
    api.post(url, formData, {
      headers: { "Content-Type": "multipart/form-data" }
    });

  return { get, post, put, del, upload };

}