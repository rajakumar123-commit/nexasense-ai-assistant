// ============================================================
// DocumentCard.jsx — NexaSense
// Premium animated document card with status indicators
// ============================================================
import React from "react";
import { motion } from "framer-motion";
import StatusBadge from "./StatusBadge";

const STATUS_ICONS = {
  ready:      { icon: "✓", color: "text-emerald-400" },
  error:      { icon: "✕", color: "text-red-400" },
  embedding:  { icon: "⟳", color: "text-blue-400 animate-spin" },
  chunking:   { icon: "⟳", color: "text-amber-400 animate-spin" },
  extracting: { icon: "⟳", color: "text-violet-400 animate-spin" },
  uploaded:   { icon: "↑", color: "text-slate-400" },
};

function DocumentCard({ document, onChat, onDelete }) {
  if (!document) return null;
  const { id, file_name, status, chunk_count, created_at } = document;

  const isReady   = status === "ready";
  const hasError  = status === "error";
  const processing = !isReady && !hasError;

  const dateStr = created_at
    ? new Date(created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3, boxShadow: "0 8px 30px rgba(0,0,0,0.4)" }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className={`relative bg-slate-900 border rounded-xl p-5 flex flex-col gap-3 transition-all duration-200 ${
        hasError
          ? "border-red-500/30"
          : isReady
          ? "border-slate-700/60 hover:border-blue-500/50 hover:ring-2 hover:ring-blue-500/20 hover:shadow-lg hover:shadow-blue-500/10"
          : "border-slate-700/50"
      }`}
    >
      {/* Processing glow pulse */}
      {processing && (
        <div className="absolute inset-0 rounded-xl ring-1 ring-amber-500/30 animate-pulse pointer-events-none" />
      )}

      {/* PDF icon + filename */}
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
          hasError ? "bg-red-500/15 border border-red-500/20" : "bg-blue-500/15 border border-blue-500/20"
        }`}>
          <svg className={`w-5 h-5 ${hasError ? "text-red-400" : "text-blue-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-100 leading-snug truncate">{file_name}</h3>
          {dateStr && <p className="text-xs text-slate-500 mt-0.5">{dateStr}</p>}
        </div>
      </div>

      {/* Status + chunk count */}
      <div className="flex items-center justify-between">
        <StatusBadge status={status} />
        {isReady && chunk_count > 0 && (
          <span className="text-xs text-slate-500">{chunk_count} chunks</span>
        )}
        {processing && (
          <span className="flex items-center gap-1.5 text-xs text-amber-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Processing…
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {isReady && (
          <motion.button
            onClick={() => onChat(id)}
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600/30 hover:text-blue-300 text-xs font-semibold transition">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            Chat
          </motion.button>
        )}
        <motion.button
          onClick={() => onDelete(id)}
          whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:text-red-300 text-xs font-semibold transition">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </motion.button>
      </div>
    </motion.div>
  );
}

export default DocumentCard;