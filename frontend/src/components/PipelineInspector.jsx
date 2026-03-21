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
        <Section title="Query Rewrite">
          <p className="text-sm text-slate-300 whitespace-pre-wrap">
            {pipeline.rewrite}
          </p>
        </Section>
      )}

      {/* Vector Search */}

      {pipeline.vectorResults?.length > 0 && (
        <Section title="Vector Search">

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
        <Section title="Keyword Search">

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
        <Section title="Reranked Chunks">

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
        <Section title="Final Context Sent to LLM">

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

function Section({ title, children }) {

  return (

    <div className="mt-6 animate-slide-up">

      <h4 className="text-xs uppercase tracking-wide text-slate-400 mb-2">
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
        <span className="text-[10px] text-slate-500">
          {(score * 100).toFixed(1)}%
        </span>
      )}

    </div>

  );

}