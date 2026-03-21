// ============================================================
// StatusBadge.jsx — NexaSense
// Fix: correct status names matching backend pipeline
// Backend sends: uploading/extracting/chunking/embedding/storing/ready/error
// ============================================================

import React from "react";

function StatusBadge({ status }) {

  const normalized = (status || "").toLowerCase();
  const style = getStyle(normalized);

  return (
    <span style={{ ...styles.badge, ...style }}>
      {getIcon(normalized)} {normalized || "unknown"}
    </span>
  );

}

export default StatusBadge;


function getIcon(status) {
  switch (status) {
    case "ready":      return "✓";
    case "error":      return "✕";
    case "uploading":
    case "extracting":
    case "chunking":
    case "embedding":
    case "storing":    return "⟳";
    default:           return "·";
  }
}


function getStyle(status) {
  switch (status) {

    case "ready":
      return styles.ready;

    case "error":
      return styles.error;

    // All processing states
    case "uploading":
    case "extracting":
    case "chunking":
    case "embedding":
    case "storing":
      return styles.processing;

    default:
      return styles.unknown;
  }
}


const styles = {

  badge: {
    padding:       "4px 8px",
    borderRadius:  6,
    fontSize:      12,
    fontWeight:    500,
    textTransform: "capitalize",
    display:       "inline-flex",
    alignItems:    "center",
    gap:           4,
  },

  ready: {
    background: "#065f46",
    color:      "#34d399",
  },

  processing: {
    background: "#78350f",
    color:      "#fbbf24",
  },

  error: {
    background: "#7f1d1d",
    color:      "#f87171",
  },

  unknown: {
    background: "#374151",
    color:      "#9ca3af",
  },

};