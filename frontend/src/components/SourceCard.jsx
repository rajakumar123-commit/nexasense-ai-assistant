// ============================================================
// SourceCard.jsx
// NexaSense AI Assistant
// Displays a single RAG source citation
// ============================================================

import React from "react";

function SourceCard({ source }) {

  if (!source) return null;

  const chunk =
    source.preview ||
    source.chunk ||
    source.content ||
    "";

  const page =
    source.pageNumber ||
    source.metadata?.page ||
    source.metadata?.pageNumber;

  const score = source.similarity ?? source.score;

  return (

    <div className="bg-slate-800 border border-slate-700 rounded-md p-3 mt-2 text-sm text-slate-100">

      {/* Header */}
      <div className="flex justify-between items-center mb-1 text-xs text-slate-400">

        <span className="uppercase tracking-wide">
          Source
        </span>

        {page && (
          <span className="bg-slate-700 px-2 py-0.5 rounded">
            Page {page}
          </span>
        )}

      </div>


      {/* Chunk Preview */}
      <p className="text-sm text-slate-200 leading-relaxed line-clamp-4">
        {chunk}
      </p>


      {/* Similarity Score */}
      {score !== undefined && (
        <p className="text-xs text-slate-400 mt-2">
          relevance: {(score * 100).toFixed(1)}%
        </p>
      )}

    </div>

  );

}

export default SourceCard;