// ============================================================
// PipelineInspector.jsx
// NexaSense AI Assistant
// Visualizes the RAG pipeline stages (UI Polished)
// ============================================================

import React from "react";

function PipelineInspector({ pipeline }) {

  if (!pipeline) {
    return (
      <div className="w-[350px] bg-slate-900 border-l border-slate-800 p-5 text-slate-200 overflow-y-auto">
        <h3 className="text-lg font-semibold mb-2">
          Pipeline Inspector
        </h3>

        <p className="text-sm text-slate-400">
          No pipeline data available
        </p>
      </div>
    );
  }

  return (

    <div className="w-[350px] bg-slate-900 border-l border-slate-800 p-5 text-slate-200 overflow-y-auto">

      <h3 className="text-lg font-semibold mb-4">
        Pipeline Inspector
      </h3>

      {/* Query Rewrite */}

      {pipeline.rewrite && (
        <Section title="Query Rewrite" color="text-purple-400 drop-shadow-[0_0_5px_rgba(192,132,252,0.6)]">
          <p className="text-sm text-slate-300 whitespace-pre-wrap">
            {pipeline.rewrite}
          </p>
        </Section>
      )}

      {/* Vector Search */}

      {pipeline.vectorResults?.length > 0 && (
        <Section title="Vector Search" color="text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.6)]">

          {pipeline.vectorResults.map((r, i) => (
            <ResultItem
              key={i}
              text={r.chunk}
              score={r.score}
            />
          ))}

        </Section>
      )}

      {/* Keyword Search */}

      {pipeline.keywordResults?.length > 0 && (
        <Section title="Keyword Search" color="text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.6)]">

          {pipeline.keywordResults.map((r, i) => (
            <ResultItem
              key={i}
              text={r.chunk}
              score={r.score}
            />
          ))}

        </Section>
      )}

      {/* Reranked */}

      {pipeline.reranked?.length > 0 && (
        <Section title="Reranked Chunks" color="text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.6)]">

          {pipeline.reranked.map((r, i) => (
            <ResultItem
              key={i}
              text={r.chunk}
              score={r.score}
            />
          ))}

        </Section>
      )}

      {/* Context */}

      {pipeline.contextChunks?.length > 0 && (
        <Section title="Final Context Sent to LLM" color="text-pink-400 drop-shadow-[0_0_5px_rgba(244,114,182,0.6)]">

          {pipeline.contextChunks.map((chunk, i) => (
            <p
              key={i}
              className="text-xs text-slate-400 mb-2 leading-relaxed"
            >
              {chunk}
            </p>
          ))}

        </Section>
      )}

    </div>

  );

}

export default PipelineInspector;



// ─────────────────────────────────────────
// Section
// ─────────────────────────────────────────

function Section({ title, children, color = "text-slate-400" }) {

  return (

    <div className="mt-6 animate-slide-up">

      <h4 className={`text-xs font-bold uppercase tracking-wider mb-3 ${color}`}>
        {title}
      </h4>

      {children}

    </div>

  );

}



// ─────────────────────────────────────────
// Result Item
// ─────────────────────────────────────────

function ResultItem({ text, score }) {

  return (

    <div className="bg-slate-800 border border-slate-700 p-2 rounded-md mb-2">

      <p className="text-xs text-slate-300 line-clamp-4">
        {text}
      </p>

      {score !== undefined && (
        <span className="text-[10px] text-slate-500 font-medium">
          {(score * 100).toFixed(1)}%
        </span>
      )}

    </div>

  );

}