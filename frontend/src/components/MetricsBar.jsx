// ============================================================
// MetricsBar.jsx
// NexaSense AI Assistant
// Displays query metrics (latency, cache, chunks, tokens)
// ============================================================

import React from "react";

function MetricsBar({ metrics }) {

  if (!metrics) return null;

  const latency = metrics.latency_ms ?? metrics.total_ms;
  const cache = metrics.cache_hit ?? metrics.from_cache;
  const chunks = metrics.chunks ?? metrics.chunk_count;
  const tokens = metrics.tokens ?? metrics.token_count;

  return (

    <div className="flex flex-wrap gap-4 mt-3 text-xs bg-slate-900 border border-slate-800 rounded-md px-3 py-2">

      {latency !== undefined && (
        <Metric label="Latency" value={`${latency} ms`} />
      )}

      {cache !== undefined && (
        <Metric
          label="Cache"
          value={cache ? "Hit" : "Miss"}
          highlight={cache}
        />
      )}

      {chunks !== undefined && (
        <Metric label="Chunks" value={chunks} />
      )}

      {tokens !== undefined && (
        <Metric label="Tokens" value={tokens} />
      )}

    </div>

  );

}

export default MetricsBar;


// ============================================================
// Metric Item
// ============================================================

function Metric({ label, value, highlight }) {

  return (

    <div className="flex items-center gap-1">

      <span className="text-slate-400">
        {label}:
      </span>

      <span
        className={`font-medium ${
          highlight ? "text-emerald-400" : "text-slate-200"
        }`}
      >
        {value}
      </span>

    </div>

  );

}