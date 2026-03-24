// ============================================================
// App.jsx — NexaSense AI Assistant
// ============================================================

import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";

import Login      from "./pages/Login";
import Signup     from "./pages/Signup";
import Dashboard  from "./pages/Dashboard";
import Workspace  from "./pages/Workspace";
import Chat       from "./pages/Chat";
import AdminPanel from "./pages/AdminPanel";
import Navbar     from "./components/Navbar";
import { useAuth } from "./context/AuthContext";
import { CreditsProvider } from "./context/CreditsContext";

// ── Layouts ───────────────────────────────────────────────────

function ProtectedLayout({ children }) {
  const { user, loading } = useAuth();
  // Wait for /auth/me to complete before deciding to redirect.
  // Without this guard, user=null during loading → premature redirect to /login.
  if (loading) return null;
  if (!user)   return <Navigate to="/login" replace />;
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 py-6">{children}</main>
    </div>
  );
}

function AdminLayout({ children }) {
  const { user, loading } = useAuth();
  if (loading)               return null;
  if (!user)                 return <Navigate to="/login"    replace />;
  if (user.role !== "admin") return <Navigate to="/dashboard" replace />;
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 py-6">{children}</main>
    </div>
  );
}

// Chat needs full-height layout — no max-width container
function ChatLayout({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user)   return <Navigate to="/login" replace />;
  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      <Navbar />
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────

function App() {
  return (
    <CreditsProvider>
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: "#1e293b",
            color:      "#f1f5f9",
            border:     "1px solid #334155",
            borderRadius: "10px",
            fontSize:   "14px",
          },
          success: { iconTheme: { primary: "#22c55e", secondary: "#1e293b" } },
          error:   { iconTheme: { primary: "#ef4444", secondary: "#1e293b" } },
        }}
      />

      <Routes>
        <Route path="/login"  element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        <Route path="/dashboard" element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
        <Route path="/workspace" element={<ProtectedLayout><Workspace /></ProtectedLayout>} />
        <Route path="/chat"      element={<ChatLayout><Chat /></ChatLayout>} />
        <Route path="/admin"     element={<AdminLayout><AdminPanel /></AdminLayout>} />

        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </CreditsProvider>
  );
}

export default App;