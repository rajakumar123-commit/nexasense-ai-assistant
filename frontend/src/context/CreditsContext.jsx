// ============================================================
// CreditsContext.jsx — NexaSense AI Assistant
// Global credit state — Single Source of Truth
// ============================================================

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "./AuthContext";

// Use relative /api so nginx proxy works in Docker production.
const API_URL = import.meta.env.VITE_API_URL || "/api";
const TOKEN_KEY = "token";

const CreditsContext = createContext(null);

export function CreditsProvider({ children }) {
  const { user } = useAuth();
  const [credits, setCredits] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchCredits = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    
    // If no token or user is logged out, clear state
    if (!token || !user) {
      setCredits(null);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/dashboard/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (res.ok) {
        const data = await res.json();
        // Fallback to 0 if data.data.credits is somehow undefined
        setCredits(data.data?.credits ?? 0);
      } else if (res.status === 401 || res.status === 403) {
        // Handle invalid/expired tokens gracefully without crashing
        console.warn("[CreditsContext] Unauthorized or expired token.");
        setCredits(null);
      }
    } catch (err) {
      console.error("[CreditsContext] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [user]); // Re-runs automatically when user changes (login/logout)

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  return (
    <CreditsContext.Provider value={{ credits, setCredits, loading, refresh: fetchCredits }}>
      {children}
    </CreditsContext.Provider>
  );
}

// Custom hook to consume the context safely across your app
export function useCreditsContext() {
  const context = useContext(CreditsContext);
  if (!context) {
    throw new Error("useCreditsContext must be used within a CreditsProvider");
  }
  return context;
}