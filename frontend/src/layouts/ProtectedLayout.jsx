// ============================================================
// ProtectedLayout.jsx
// NexaSense AI Assistant
// Authenticated Application Layout
// ============================================================

import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Navbar from "../components/Navbar";

function ProtectedLayout({ children }) {

  const { user } = useAuth();

  // Redirect if not authenticated
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (

    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">

      {/* Top Navigation */}
      <Navbar />

      {/* Page Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-6">

        {children}

      </main>

    </div>

  );

}

export default ProtectedLayout;