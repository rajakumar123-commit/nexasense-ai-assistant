// ============================================================
// Navbar.jsx — NexaSense AI Assistant (WITH PAYMENTS)
// ============================================================

import React, { useState, useEffect, useRef } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import useTheme from "../hooks/useTheme";

// ✅ NEW IMPORTS
import { useCreditsContext } from "../context/CreditsContext";
import PaymentModal from "./PaymentModal";

function Navbar() {
  // ── Hooks (DO NOT BREAK ORDER) ──────
  const { user, logout, loading } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  // ✅ NEW STATE
  const [paymentOpen, setPaymentOpen] = useState(false);
  const { credits, refresh } = useCreditsContext();
  const [creditFlash, setCreditFlash] = useState(false);
  const prevCredits = useRef(credits);

  // Flash animation when credits change
  useEffect(() => {
    if (prevCredits.current !== null && credits !== null && credits < prevCredits.current) {
      setCreditFlash(true);
      setTimeout(() => setCreditFlash(false), 600);
    }
    prevCredits.current = credits;
  }, [credits]);

  if (loading) return null;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const navLinks = [
    { to: "/dashboard", label: "Dashboard", icon: "📊" },
    { to: "/workspace", label: "Workspace", icon: "📁" },
    { to: "/chat", label: "Chat", icon: "💬" },
  ];

  if (user?.role === "admin") {
    navLinks.push({ to: "/admin", label: "Admin Panel", icon: "⚙️" });
  }

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
            <span className="text-lg font-bold ai-gradient-text tracking-tight hidden sm:block">
              NexaSense
            </span>
          </NavLink>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <NavLink key={link.to} to={link.to} className={linkCls}>
                <span>{link.icon}</span>
                <span>{link.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Right controls */}
          <div className="flex items-center gap-2">

            {/* Theme */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition text-sm"
              title={theme === "dark" ? "Light mode" : "Dark mode"}
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>

            {/* CREDITS DISPLAY */}
            {user && credits !== null && (
              <div
                onClick={() => credits === 0 && setPaymentOpen(true)}
                className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
                  credits === 0
                    ? "bg-red-500/10 border-red-500/30 cursor-pointer hover:bg-red-500/20"
                    : credits <= 10
                    ? "bg-amber-500/10 border-amber-500/30"
                    : "bg-slate-800/60 border-slate-700/50"
                }`}
              >
                {credits <= 10 && credits > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                )}
                <span className="text-xs text-slate-400">Credits:</span>
                <span className={`text-sm font-bold transition-all ${
                  creditFlash ? "scale-125 text-blue-300" : ""
                } ${
                  credits === 0 ? "text-red-400" : credits <= 10 ? "text-amber-400" : "text-emerald-400"
                }`}>
                  {credits}
                </span>
                {credits <= 10 && credits > 0 && (
                  <span className="text-xs text-amber-500 hidden md:block">Low</span>
                )}
              </div>
            )}

            {/* UPGRADE BUTTON */}
            <button
              onClick={() => setPaymentOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Upgrade
            </button>

            {/* User */}
            {user && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-xs text-white font-bold">
                  {user.email?.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs text-slate-400 max-w-[120px] truncate">
                  {user.email}
                </span>
              </div>
            )}

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 hover:text-red-300 text-sm font-medium transition"
            >
              <span className="hidden sm:block">Logout</span>
            </button>

            {/* Mobile toggle */}
            <button
              className="md:hidden p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 transition"
              onClick={() => setMobileOpen((o) => !o)}
            >
              ☰
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
                {navLinks.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    className={linkCls}
                    onClick={() => setMobileOpen(false)}
                  >
                    <span>{link.icon}</span>
                    <span>{link.label}</span>
                  </NavLink>
                ))}

                <div className="text-sm mt-2">
                  <span className="text-slate-400">Credits: </span>
                  <span className={credits === 0 ? 'text-red-400' : 'text-green-400'}>
                    {credits === null ? '—' : credits}
                  </span>
                </div>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ZERO CREDIT BANNER */}
      <AnimatePresence>
        {user && credits === 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-red-500/10 border-b border-red-500/20 overflow-hidden"
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-red-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="font-medium">You have no credits remaining.</span>
                <span className="hidden sm:inline">AI pipeline access is paused.</span>
              </div>
              <button
                onClick={() => setPaymentOpen(true)}
                className="text-red-300 hover:text-white font-semibold flex items-center gap-1 transition-colors"
              >
                Upgrade now <span aria-hidden="true">&rarr;</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ✅ PAYMENT MODAL */}
      <PaymentModal
        isOpen={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        onSuccess={() => {
          setPaymentOpen(false);
          refresh(); // fetch new balance immediately
        }}
      />
    </>
  );
}

export default Navbar;