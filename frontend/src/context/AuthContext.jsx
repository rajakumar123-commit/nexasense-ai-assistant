// ============================================================
// AuthContext.jsx — NexaSense AI Assistant
// ============================================================

import React, { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";

const AuthContext = createContext();

const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token"); // key shared with useApi.js
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { setLoading(false); return; }

    api.get("/auth/me")
      .then(res => setUser(res.data.user))
      .catch(() => {
        // Token invalid or expired — clear both storage keys
        localStorage.removeItem("token");
        localStorage.removeItem("refreshToken");
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const res = await api.post("/auth/login", { email, password });

    // Backend returns { accessToken, refreshToken, user }
    // Store under "token" key — all consumers (useApi.js, AdminPanel) read this key
    localStorage.setItem("token", res.data.accessToken);
    if (res.data.refreshToken) {
      localStorage.setItem("refreshToken", res.data.refreshToken);
    }

    setUser(res.data.user);
    return res.data;
  };

  const signup = async (email, password, fullName) => {
    const res = await api.post("/auth/signup", {
      email,
      password,
      full_name: fullName,
    });
    return res.data;
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}