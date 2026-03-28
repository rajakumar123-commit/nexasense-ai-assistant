// ============================================================
// useStream.js
// NexaSense AI Assistant
// Handles TRUE RAG SSE Streaming requests
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
  return typeof value === "string" && uuidPattern.test(value) ? value : null;
}

// ─────────────────────────────────────────
// Hook
// ─────────────────────────────────────────
export default function useStream() {
  const [loading, setLoading] = useState(false);

  const streamQuery = async (
    question,
    documentId,
    conversationId = null,
    callbacks = {}
  ) => {
    setLoading(true);

    const { onToken, onMeta } = callbacks;
    let accumulatedAnswer = "";
    let finalMeta = null;

    try {
      const token = localStorage.getItem("token");
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const safeConversationId = normalizeConversationId(conversationId);

      // ✅ Hit the true streaming endpoint
      const response = await fetch(`${API_URL}/query/stream`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          question,
          documentId,
          conversationId: safeConversationId
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error || `HTTP ${response.status} Error`);
      }

      // ✅ Native SSE Stream Reader
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Split by SSE event boundary
        const parts = buffer.split("\n\n");
        buffer = parts.pop(); // Keep the last incomplete part in the buffer

        for (const part of parts) {
          const lines = part.split("\n");
          let eventType = "message";
          let dataStr = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.substring(7).trim();
            else if (line.startsWith("data: ")) dataStr = line.substring(6).trim();
          }

          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);

            if (eventType === "error" || data.error) {
              throw new Error(data.error || "Streaming error occurred");
            } 
            else if (eventType === "meta") {
              finalMeta = data;
              if (onMeta) onMeta(data); // Trigger metadata callback (sources, etc.)
            } 
            else if (eventType === "ping" || eventType === "done") {
              continue; // Ignore
            } 
            else if (data.token) {
              accumulatedAnswer += data.token;
              // ✅ Trigger token callback to update UI instantly
              if (onToken) onToken(data.token, accumulatedAnswer); 
            }
          } catch (e) {
            // Ignore partial JSON parse errors for incomplete chunks
            if (e.message !== "Unexpected end of JSON input") throw e;
          }
        }
      }

      // Return the final aggregated result
      return {
        answer: accumulatedAnswer,
        sources: finalMeta?.sources || [],
        responseTimeMs: finalMeta?.responseTimeMs || null,
        pipeline: finalMeta?.pipeline || null,
        conversationId: finalMeta?.conversationId || safeConversationId
      };

    } catch (error) {
      console.error("[useStream] Query failed:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return { streamQuery, loading };
}