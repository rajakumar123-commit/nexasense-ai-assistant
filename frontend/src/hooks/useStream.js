// ============================================================
// useStream.js
// NexaSense AI Assistant
// Handles RAG query requests
// ============================================================

import { useState } from "react";

// Use relative /api so nginx proxy works in Docker production.
// VITE_API_URL can override for local dev pointing at a different host.
const API_URL = import.meta.env.VITE_API_URL || "/api";


// ─────────────────────────────────────────
// Validate conversation ID
// ─────────────────────────────────────────
function normalizeConversationId(value) {

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return typeof value === "string" && uuidPattern.test(value)
    ? value
    : null;

}


// ─────────────────────────────────────────
// Hook
// ─────────────────────────────────────────
export default function useStream() {

  const [loading, setLoading] = useState(false);


  const streamQuery = async (
    question,
    documentId,
    conversationId = null
  ) => {

    setLoading(true);

    try {

      const token = localStorage.getItem("token");

      const headers = {
        "Content-Type": "application/json"
      };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const safeConversationId =
        normalizeConversationId(conversationId);

      console.log("[useStream] sending query", {
        question,
        documentId,
        conversationId: safeConversationId
      });

      const response = await fetch(`${API_URL}/query`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          question,
          documentId,
          conversationId: safeConversationId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Query request failed");
      }

      if (!data?.success) {
        throw new Error(data?.error || "Query failed");
      }

      return {
        answer: data.answer ?? "",
        sources: Array.isArray(data.sources)
          ? data.sources
          : [],
        responseTimeMs: data.responseTimeMs ?? null,
        pipeline: data.pipeline || null
      };

    } catch (error) {

      console.error("[useStream] Query failed:", error);
      throw error;

    } finally {

      setLoading(false);

    }

  };

  return {
    streamQuery,
    loading
  };

}