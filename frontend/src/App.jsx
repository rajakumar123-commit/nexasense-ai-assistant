// ============================================================
// App.jsx — NexaSense
// Fix 4: <Toaster /> mounted here
// ============================================================

import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";

import Login     from "./pages/Login";
import Signup    from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import Workspace from "./pages/Workspace";
import Chat      from "./pages/Chat";
import Navbar    from "./components/Navbar";
import { useAuth } from "./context/AuthContext";


function ProtectedLayout({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 py-6">
        {children}
      </main>
    </div>
  );
}

// Chat needs full-height layout without container constraints
function ChatLayout({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      <Navbar />
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function App() {
  return (
    <>
      {/* Toast renderer */}
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

        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </>
  );
}

export default App;