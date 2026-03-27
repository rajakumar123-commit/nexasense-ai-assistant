// ============================================================
// UploadModal.jsx — NexaSense
// Premium animated upload modal with progress + drag-and-drop
// ============================================================
import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import useApi from "../hooks/useApi";


const DEFAULT_ALLOWED = ".pdf,.docx,.txt";
const ALLOWED_EXTS  = import.meta.env.VITE_ALLOWED_FILE_TYPES || DEFAULT_ALLOWED;

// Map extensions to mime types for drag-and-drop validation
const MIME_MAP = {
  ".pdf":  "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt":  "text/plain"
};

const ALLOWED_MIMES = ALLOWED_EXTS.split(",").map(ext => MIME_MAP[ext.trim()]).filter(Boolean);

function UploadModal({ isOpen, onClose, onUploadSuccess, onUploadError, initialFile }) {
  const api = useApi();
  const inputRef = useRef(null);

  const [mode, setMode]       = useState("file"); // "file" or "url"
  const [url, setUrl]         = useState("");
  const [file, setFile]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError]       = useState("");
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialFile) { setFile(initialFile); setMode("file"); }
      setError("");
    }
    if (!isOpen) { setFile(null); setUrl(""); setError(""); setProgress(0); }
  }, [isOpen, initialFile]);

  if (!isOpen) return null;

  const handleFileChange = (e) => { setFile(e.target.files[0]); setError(""); };

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && ALLOWED_MIMES.includes(f.type)) { setFile(f); setError(""); }
    else setError(`Only ${ALLOWED_EXTS.toUpperCase().replace(/\./g, "")} files are supported.`);
  };

  const handleUpload = async () => {
    if (mode === "file") {
      if (!file) { setError("Please select a file."); return; }
      if (!ALLOWED_MIMES.includes(file.type)) { setError(`Only ${ALLOWED_EXTS.toUpperCase().replace(/\./g, "")} files are supported.`); return; }
    } else {
      if (!url || !url.startsWith("http")) { setError("Please enter a valid URL (starting with http/https)."); return; }
    }

    setError(""); setLoading(true); setProgress(10);
    const interval = setInterval(() => setProgress(p => Math.min(p + 12, 85)), 400);

    try {
      if (mode === "file") {
        const formData = new FormData();
        formData.append("file", file);
        await api.post("/upload", formData);
      } else {
        await api.post("/upload/scrape", { url });
      }

      clearInterval(interval);
      setProgress(100);
      setTimeout(() => { setFile(null); setUrl(""); onUploadSuccess?.(); onClose(); }, 400);
    } catch (err) {
      clearInterval(interval); setProgress(0);
      const msg = err?.response?.data?.error || "Action failed. Please try again.";
      setError(msg);
      onUploadError?.(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="bg-slate-900 border border-slate-700/60 rounded-2xl p-6 w-full max-w-md shadow-2xl shadow-black/60"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-100">Add Knowledge Source</h3>
                <p className="text-xs text-slate-500">Document or Live URL</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Mode Switcher */}
          <div className="flex p-1 bg-slate-800/50 rounded-lg mb-5 border border-slate-700/50">
            <button
              onClick={() => setMode("file")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${mode === "file" ? "bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"}`}
            >
              File Upload
            </button>
            <button
              onClick={() => setMode("url")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${mode === "url" ? "bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"}`}
            >
              Web Scraping
            </button>
          </div>

          {/* Drop zone / URL Input */}
          {mode === "file" ? (
            <>
              {!file ? (
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onClick={() => inputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                    dragging ? "border-emerald-400 bg-emerald-500/10" : "border-slate-700 hover:border-slate-600 hover:bg-slate-800/50"
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <svg className="w-10 h-10 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm font-medium text-slate-300">Drag document here or click to browse</p>
                    <p className="text-xs text-slate-500">{ALLOWED_EXTS.toUpperCase().replace(/\./g, "").replace(/,/g, ", ")} format</p>
                  </div>
                  <input ref={inputRef} type="file" accept={ALLOWED_EXTS} className="hidden" onChange={handleFileChange} />
                </div>
              ) : (
                <div className="flex items-center gap-3 bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3">
                  <div className="w-9 h-9 rounded-lg bg-red-500/20 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-100 truncate">{file.name}</p>
                    <p className="text-xs text-slate-500">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
                  </div>
                  {!loading && (
                    <button onClick={() => setFile(null)} className="p-1 rounded text-slate-500 hover:text-white transition">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Website Address</label>
              <div className="relative">
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/article"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition"
                />
              </div>
              <p className="text-[10px] text-slate-500 px-1">AI will crawl the page and index the main article content.</p>
            </div>
          )}

          {/* Progress bar */}
          {loading && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>{mode === "file" ? "Uploading" : "Processing"}…</span><span>{progress}%</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <motion.div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full"
                  initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ ease: "easeOut" }} />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-3 flex items-center gap-2 text-red-400 text-sm bg-red-950/40 border border-red-500/20 rounded-lg px-3 py-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 mt-5">
            <motion.button
              onClick={handleUpload} disabled={loading || (mode === "file" ? !file : !url)}
              whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 transition">
              {loading ? (mode === "file" ? "Uploading…" : "Scanning…") : (mode === "file" ? "Upload" : "Index URL")}
            </motion.button>
            <button onClick={onClose} disabled={loading} className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition disabled:opacity-50">
              Cancel
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default UploadModal;