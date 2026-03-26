// ============================================================
// useApi.js — NexaSense AI Assistant
// ============================================================

import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "/api";

const api = axios.create({ baseURL: API_URL, timeout: 120000 });

// Attach JWT automatically — reads same key AuthContext writes
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401: Attempt silent refresh, or clear storage and redirect
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and not already retrying
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem("refreshToken");

      if (refreshToken) {
        try {
          const res = await axios.post("/api/auth/refresh", { refreshToken });
          const { accessToken } = res.data;

          localStorage.setItem("token", accessToken);
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;

          return api(originalRequest);
        } catch (refreshError) {
          // Refresh failed — clear all and redirect
          localStorage.removeItem("token");
          localStorage.removeItem("refreshToken");
          window.location.href = "/login";
        }
      } else {
        localStorage.removeItem("token");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

// Returns full axios response — callers access res.data.*
export default function useApi() {
  const get = (url, config = {}) => api.get(url, config);
  const post = (url, data = {}, config = {}) => api.post(url, data, config);
  const put = (url, data = {}, config = {}) => api.put(url, data, config);
  const del = (url, config = {}) => api.delete(url, config);
  const upload = (url, formData) =>
    api.post(url, formData, { headers: { "Content-Type": "multipart/form-data" } });

  return { get, post, put, del, upload };
}