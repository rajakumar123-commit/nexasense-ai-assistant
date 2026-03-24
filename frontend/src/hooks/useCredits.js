import { useEffect, useState, useCallback } from "react";

// Token key matches AuthContext.jsx: localStorage.setItem("token", ...)
const TOKEN_KEY = "token";

export default function useCredits() {
  const [credits, setCredits] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchCredits = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
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
  }, []);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  return { credits, setCredits, loading, refresh: fetchCredits };
}