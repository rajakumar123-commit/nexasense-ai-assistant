// ============================================================
// AuthContext.jsx
// NexaSense AI Assistant
// Handles authentication state across the frontend
// ============================================================

import React, { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";

const AuthContext = createContext();

const API_URL = "/api";

const api = axios.create({
  baseURL: API_URL
});

api.interceptors.request.use((config) => {

  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;

});


// ============================================================
// Auth Provider
// ============================================================

export function AuthProvider({ children }) {

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);


  useEffect(() => {

    const token = localStorage.getItem("token");

    if (!token) {
      setLoading(false);
      return;
    }

    api.get("/auth/me")
      .then(res => {
        setUser(res.data.user);
      })
      .catch(() => {
        localStorage.removeItem("token");
      })
      .finally(() => {
        setLoading(false);
      });

  }, []);


  const login = async (email, password) => {

    const res = await api.post("/auth/login", {
      email,
      password
    });

    const token = res.data.token;

    localStorage.setItem("token", token);

    setUser(res.data.user);

    return res.data;

  };


  const signup = async (email, password, fullName) => {

    const res = await api.post("/auth/signup", {
      email,
      password,
      full_name: fullName
    });

    return res.data;

  };


  const logout = () => {

    localStorage.removeItem("token");
    setUser(null);

  };


  return (

    <AuthContext.Provider
      value={{
        user,
        login,
        signup,
        logout,
        loading
      }}
    >

      {children}

    </AuthContext.Provider>

  );

}


// ============================================================
// Hook
// ============================================================

export function useAuth() {

  return useContext(AuthContext);

}