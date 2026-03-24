// ============================================================
// Workspace.jsx — NexaSense
// Fix 4: toast on upload/delete success/error
// Fix 5: dropped file passed to UploadModal via initialFile
// Fix 6: infinite polling loop fixed
// ============================================================

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import useApi from "../hooks/useApi";
import DocumentCard from "../components/DocumentCard";
import UploadModal  from "../components/UploadModal";
import ConfirmModal from "../components/ConfirmModal";

function Workspace() {

  const api = useApi();
  const navigate = useNavigate();

  const [documents, setDocuments]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [dragging, setDragging]     = useState(false);
  const [droppedFile, setDroppedFile] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // { id, name }

  // ── Fetch ────────────────────────────────────────────────
  // useCallback with [] so fetchDocuments is stable across renders.
  // useApi() returns new function refs every render, so we must NOT put api in deps.
  // The underlying axios instance is a module-level singleton so this is safe.
  const fetchDocuments = useCallback(async () => {
    try {
      const res  = await api.get("/documents");
      const docs = res.data?.documents || res.data?.data || res.documents || [];
      setDocuments(docs);
    } catch (err) {
      console.error("Failed to fetch documents", err);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  // Poll while any document is still processing.
  // Tracks via ref to avoid re-running effect every time documents changes.
  const pollingRef = useRef(null);
  useEffect(() => {
    const processing = documents.some(d => !["ready", "error"].includes(d.status));

    // Clear any existing interval first
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    if (processing) {
      pollingRef.current = setInterval(fetchDocuments, 3000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [documents.map(d => d.status).join(",")]); // only re-run when statuses actually change

  // ── Delete ───────────────────────────────────────────────
  const requestDelete = (id, name) => setConfirmDelete({ id, name });

  const confirmDeleteDoc = async () => {
    const { id } = confirmDelete;
    setConfirmDelete(null);
    try {
      await api.del(`/documents/${id}`);
      setDocuments(prev => prev.filter(doc => doc.id !== id));
      toast.success("Document deleted");
    } catch {
      toast.error("Delete failed — try again");
    }
  };

  const openChat = (docId) => navigate(`/chat?documentId=${docId}`);

  // ── Drag & Drop — Fix 5 ──────────────────────────────────
  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      setDroppedFile(file); // pass file to modal
      setShowUpload(true);
    }
  };

  const handleDragOver  = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = ()  => setDragging(false);

  const handleUploadSuccess = () => {
    setDroppedFile(null);
    toast.success("Document uploaded successfully"); // Fix 4
    fetchDocuments();
  };

  const handleUploadError = (msg) => {
    toast.error(msg || "Upload failed"); // Fix 4
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="p-4 sm:p-8 bg-slate-950 min-h-screen text-slate-100"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold">Your Documents</h2>
        <button
          onClick={() => setShowUpload(true)}
          className="bg-emerald-500 hover:bg-emerald-600 px-4 py-2 rounded-md font-medium transition transform hover:-translate-y-0.5"
        >
          Upload PDF
        </button>
      </div>

      {/* Drag Overlay */}
      {dragging && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-40">
          <div className="border-2 border-dashed border-emerald-400 p-12 rounded-xl text-center animate-scale-in">
            <p className="text-lg font-medium">Drop PDF to Upload</p>
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-slate-800 rounded-lg p-4 animate-pulse">
              <div className="h-4 bg-slate-700 rounded w-3/4 mb-3"></div>
              <div className="h-3 bg-slate-700 rounded w-1/2 mb-2"></div>
              <div className="h-3 bg-slate-700 rounded w-2/3"></div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && documents.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-24 text-center"
        >
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20 border border-emerald-500/20 flex items-center justify-center mb-6">
            <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-slate-200 mb-2">No documents yet</h3>
          <p className="text-slate-500 text-sm mb-2">Upload a PDF to get started with AI-powered Q&A.</p>
          <p className="text-slate-600 text-xs mb-8">💡 Tip: You can also drag &amp; drop a PDF anywhere on this page</p>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white shadow-lg shadow-emerald-500/25 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Upload Your First PDF
          </button>
        </motion.div>
      )}

      {/* Documents Grid */}
      {!loading && documents.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {documents.map((doc, index) => (
            <div
              key={doc.id}
              className="animate-slide-up"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <DocumentCard
                document={doc}
                onChat={openChat}
                onDelete={(id) => requestDelete(id, doc.file_name)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal — Fix 5: initialFile */}
      <UploadModal
        isOpen={showUpload}
        onClose={() => { setShowUpload(false); setDroppedFile(null); }}
        onUploadSuccess={handleUploadSuccess}
        onUploadError={handleUploadError}
        initialFile={droppedFile}
      />

      <ConfirmModal
        isOpen={!!confirmDelete}
        title="Delete document?"
        message={`"${confirmDelete?.name}" will be permanently deleted along with all its chunks and embeddings.`}
        confirmLabel="Delete"
        onConfirm={confirmDeleteDoc}
        onCancel={() => setConfirmDelete(null)}
      />
    </motion.div>
  );
}

export default Workspace;


function DocumentSkeleton() {
  return (
    <div className="bg-slate-800 rounded-lg p-4 animate-pulse">
      <div className="h-4 bg-slate-700 rounded w-3/4 mb-3"></div>
      <div className="h-3 bg-slate-700 rounded w-1/2 mb-2"></div>
      <div className="h-3 bg-slate-700 rounded w-2/3"></div>
    </div>
  );
}