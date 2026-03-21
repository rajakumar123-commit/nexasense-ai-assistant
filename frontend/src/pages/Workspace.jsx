// ============================================================
// Workspace.jsx — NexaSense
// Fix 4: toast on upload/delete success/error
// Fix 5: dropped file passed to UploadModal via initialFile
// ============================================================

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import useApi from "../hooks/useApi";
import DocumentCard from "../components/DocumentCard";
import UploadModal  from "../components/UploadModal";

function Workspace() {

  const api = useApi();
  const navigate = useNavigate();

  const [documents, setDocuments]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [dragging, setDragging]     = useState(false);
  const [droppedFile, setDroppedFile] = useState(null); // Fix 5

  // ── Fetch ────────────────────────────────────────────────
  const fetchDocuments = async () => {
    try {
      const res  = await api.get("/documents");
      const docs = res.data?.documents || res.data?.data || res.documents || [];
      setDocuments(docs);
    } catch (err) {
      console.error("Failed to fetch documents", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDocuments(); }, []);

  // Poll while processing
  useEffect(() => {
    const processing = documents.some(d => !["ready","error"].includes(d.status));
    if (!processing) return;
    const id = setInterval(fetchDocuments, 3000);
    return () => clearInterval(id);
  }, [documents]);

  // ── Delete ───────────────────────────────────────────────
  const deleteDocument = async (id) => {
    if (!window.confirm("Delete this document?")) return;
    try {
      await api.del(`/documents/${id}`);
      setDocuments(prev => prev.filter(doc => doc.id !== id));
      toast.success("Document deleted");        // Fix 4
    } catch {
      toast.error("Delete failed — try again"); // Fix 4
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
        <div className="text-center text-slate-400 mt-20">
          <p className="mb-4">No documents uploaded yet.</p>
          <button
            onClick={() => setShowUpload(true)}
            className="bg-emerald-500 hover:bg-emerald-600 px-5 py-2 rounded-md"
          >
            Upload Your First PDF
          </button>
        </div>
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
                onDelete={deleteDocument}
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