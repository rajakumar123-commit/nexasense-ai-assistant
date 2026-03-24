// ============================================================
// CreditsContext.jsx — NexaSense AI Assistant
// Global credit state — re-fetches whenever auth state changes
// ============================================================

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "./AuthContext";

const CreditsContext = createContext(null);

// Token key matches AuthContext.jsx: localStorage.setItem("token", ...)
const TOKEN_KEY = "token";

export function CreditsProvider({ children }) {
  const { user } = useAuth();
  const [credits, setCredits] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchCredits = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token || !user) {
      setCredits(null);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/dashboard/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setCredits(data.data?.credits ?? 0);
      }
    } catch (err) {
      console.error("Credits fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [user]); // re-runs when user changes (login / logout)

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  return (
    <CreditsContext.Provider value={{ credits, setCredits, loading, refresh: fetchCredits }}>
      {children}
    </CreditsContext.Provider>
  );
}

export function useCreditsContext() {
  return useContext(CreditsContext);
}
