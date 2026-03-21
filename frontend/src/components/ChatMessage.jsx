// ============================================================
// ChatMessage.jsx — NexaSense
// Premium animated chat bubble with avatar + source citations
// ============================================================
import React from "react";
import { motion } from "framer-motion";
import SourceCard from "./SourceCard";

function ChatMessage({ role, content, sources = [] }) {
  const isUser = role === "user";

  return (
    <div className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center text-xs font-bold ${
        isUser
          ? "bg-gradient-to-br from-blue-500 to-violet-600 text-white"
          : "bg-gradient-to-br from-slate-600 to-slate-700 border border-slate-600 text-slate-300"
      }`}>
        {isUser
          ? <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
        }
      </div>

      {/* Bubble */}
      <div className={`max-w-[75%] flex flex-col gap-2 ${isUser ? "items-end" : "items-start"}`}>
        {/* Label */}
        <span className="text-xs text-slate-500 font-medium px-1">
          {isUser ? "You" : "NexaSense AI"}
        </span>

        {/* Content bubble */}
        <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? "bg-gradient-to-br from-blue-600 to-violet-600 text-white rounded-tr-sm shadow-lg shadow-blue-500/20"
            : content.startsWith("Error:")
            ? "bg-red-950/60 border border-red-500/30 text-red-300 rounded-tl-sm"
            : "bg-slate-800 border border-slate-700/50 text-slate-100 rounded-tl-sm"
        }`}>
          {content || <span className="opacity-50 italic">Waiting for response…</span>}
        </div>

        {/* Source citations */}
        {!isUser && Array.isArray(sources) && sources.length > 0 && (
          <div className="space-y-1.5 w-full">
            <p className="text-xs text-slate-500 px-1">📎 Sources</p>
            {sources.map((source, idx) => (
              <SourceCard key={idx} source={source} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatMessage;