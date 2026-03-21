// ============================================================
// Navbar.jsx — NexaSense
// Premium animated navbar with active indicators
// ============================================================
import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import useTheme from "../hooks/useTheme";

function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const navLinks = [
    { to: "/dashboard", label: "Dashboard", icon: "📊" },
    { to: "/workspace", label: "Workspace", icon: "📁" },
    { to: "/chat",      label: "Chat",      icon: "💬" },
  ];

  const linkCls = ({ isActive }) =>
    `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
      isActive
        ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
        : "text-slate-400 hover:text-slate-100 hover:bg-slate-800"
    }`;

  return (
    <>
      <header className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">

          {/* Logo */}
          <NavLink to="/dashboard" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/20 flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <span className="text-lg font-bold ai-gradient-text tracking-tight hidden sm:block">NexaSense</span>
          </NavLink>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map(link => (
              <NavLink key={link.to} to={link.to} className={linkCls}>
                <span>{link.icon}</span>
                <span>{link.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            <button onClick={toggleTheme}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition text-sm"
              title={theme === "dark" ? "Light mode" : "Dark mode"}>
              {theme === "dark" ? "☀️" : "🌙"}
            </button>

            {user && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-xs text-white font-bold">
                  {user.email?.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs text-slate-400 max-w-[120px] truncate">{user.email}</span>
              </div>
            )}

            <button onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 hover:text-red-300 text-sm font-medium transition">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:block">Logout</span>
            </button>

            {/* Mobile hamburger */}
            <button className="md:hidden p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 transition" onClick={() => setMobileOpen(o => !o)}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {mobileOpen
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-slate-800 bg-slate-950/95"
            >
              <nav className="p-4 flex flex-col gap-1">
                {navLinks.map(link => (
                  <NavLink key={link.to} to={link.to} className={linkCls} onClick={() => setMobileOpen(false)}>
                    <span>{link.icon}</span>
                    <span>{link.label}</span>
                  </NavLink>
                ))}
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>
    </>
  );
}

export default Navbar;
