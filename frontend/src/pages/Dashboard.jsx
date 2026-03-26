// ============================================================
// Dashboard.jsx
// NexaSense AI Assistant — Enterprise UI Redesign
// ============================================================

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import useApi from "../hooks/useApi";
import DashboardStats from "../components/DashboardStats";
import Pipeline3DAnimation from "../components/Pipeline3DAnimation";

// ─────────────────────────────────────────
// Animation Variants
// ─────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20, filter: "blur(4px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.55,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

const queryCardVariants = {
  hidden: { opacity: 0, x: -16, filter: "blur(4px)" },
  visible: (i) => ({
    opacity: 1,
    x: 0,
    filter: "blur(0px)",
    transition: {
      delay: i * 0.07,
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1],
    },
  }),
};

// ─────────────────────────────────────────
// Dashboard Component
// ─────────────────────────────────────────

function Dashboard() {
  const api = useApi();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Fetch dashboard stats ──
  const fetchStats = async () => {
    try {
      const res = await api.get("/dashboard/stats");
      const data = res.data?.data || res.data;
      setStats(data);
    } catch (err) {
      console.error("Failed to load dashboard", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  // ─────────────────────────────────────────
  // Loading State
  // ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#020608] p-8">
        {/* Background orbs during load */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="ambient-orb-emerald" />
          <div className="ambient-orb-cyan" />
        </div>

        <div className="relative z-10">
          <div className="h-9 w-64 rounded-lg bg-slate-800/60 animate-pulse mb-10" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <StatSkeleton key={i} delay={i * 0.1} />
            ))}
          </div>
          <div className="mt-10 h-64 rounded-2xl bg-slate-900/40 animate-pulse" />
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────
  // Main Render
  // ─────────────────────────────────────────
  return (
    <div className="relative min-h-screen bg-[#020608] overflow-x-hidden">

      {/* ── Ambient Background Glow Orbs ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="ambient-orb-emerald" />
        <div className="ambient-orb-cyan" />
        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
            backgroundSize: "64px 64px",
          }}
        />
        {/* Top vignette */}
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#020608] to-transparent" />
      </div>

      {/* ── Page Content ── */}
      <motion.div
        className="relative z-10 max-w-7xl mx-auto px-4 sm:px-8 py-10 pb-24"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >

        {/* ── Header ── */}
        <motion.div variants={itemVariants} className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            {/* Status indicator */}
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-xs font-medium text-emerald-400/80 tracking-widest uppercase">
              Live Dashboard
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            <span className="nexasense-gradient-text">NexaSense</span>
            <span className="text-slate-200"> AI Dashboard</span>
          </h1>
          <p className="text-slate-500 text-sm mt-2 tracking-wide">
            Real-time intelligence pipeline — query analytics & system health
          </p>
        </motion.div>

        {/* ── Stats Cards ── */}
        <motion.div variants={itemVariants}>
          <DashboardStats stats={stats} />
        </motion.div>

        {/* ── Pipeline 3D Visualization ── */}
        <motion.div variants={itemVariants} className="mt-10">
          <SectionLabel label="RAG Pipeline" icon={PipelineIcon} />
          <div className="mt-3 rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/[0.06] bg-slate-900/40 backdrop-blur-xl">
            <Pipeline3DAnimation />
          </div>
        </motion.div>

        {/* ── Recent Queries ── */}
        <motion.div variants={itemVariants} className="mt-12">
          <div className="flex items-center justify-between mb-5">
            <SectionLabel label="Recent Queries" icon={QueryIcon} />
            {stats?.recentQueries?.length > 0 && (
              <span className="text-xs text-slate-500 bg-slate-800/60 border border-slate-700/50 px-3 py-1 rounded-full">
                {stats.recentQueries.length} entries
              </span>
            )}
          </div>

          <AnimatePresence>
            {(!stats?.recentQueries || stats.recentQueries.length === 0) ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-20 text-center rounded-2xl ring-1 ring-white/[0.05] bg-slate-900/30 backdrop-blur-md"
              >
                <div className="w-14 h-14 rounded-2xl bg-slate-800/80 ring-1 ring-white/[0.07] flex items-center justify-center mb-5 shadow-inner">
                  <svg className="w-6 h-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <p className="text-slate-300 font-semibold tracking-tight text-sm">No queries yet</p>
                <p className="text-slate-600 text-xs mt-1.5 max-w-xs">
                  Upload a document and start asking questions to see your query history here.
                </p>
              </motion.div>
            ) : (
              <div className="space-y-2.5">
                {stats.recentQueries.map((q, i) => (
                  <QueryCard key={i} query={q} index={i} />
                ))}
              </div>
            )}
          </AnimatePresence>
        </motion.div>

      </motion.div>
    </div>
  );
}

export default Dashboard;

// ─────────────────────────────────────────
// QueryCard Sub-Component
// ─────────────────────────────────────────

function QueryCard({ query: q, index: i }) {
  return (
    <motion.div
      custom={i}
      variants={queryCardVariants}
      initial="hidden"
      animate="visible"
      whileHover={{ scale: 1.005, y: -1 }}
      className="group relative flex items-start gap-4 px-5 py-4 rounded-xl
                 bg-slate-900/50 backdrop-blur-md
                 ring-1 ring-white/[0.06] hover:ring-white/[0.12]
                 border border-transparent hover:border-slate-700/40
                 shadow-sm hover:shadow-[0_0_24px_rgba(16,185,129,0.04)]
                 transition-all duration-300 cursor-default overflow-hidden"
    >
      {/* Left accent line on hover */}
      <div className="absolute left-0 top-0 h-full w-0.5 rounded-full bg-gradient-to-b from-emerald-500/0 via-emerald-500/60 to-emerald-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* Icon */}
      <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-lg
                      bg-emerald-500/[0.08] ring-1 ring-emerald-500/20
                      flex items-center justify-center
                      group-hover:bg-emerald-500/[0.14] group-hover:ring-emerald-500/30
                      transition-all duration-300">
        <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 leading-relaxed line-clamp-2 tracking-tight">
          {q.question}
        </p>
        {q.created_at && (
          <p className="text-xs text-slate-600 mt-1.5 group-hover:text-slate-500 transition-colors duration-200">
            {new Date(q.created_at).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
      </div>

      {/* Response time badge */}
      {q.response_time_ms && (
        <div className="flex-shrink-0 flex items-center">
          <span className={`
            text-xs px-2.5 py-1 rounded-full font-medium tracking-tight border
            ${q.response_time_ms < 500
              ? "text-emerald-400 bg-emerald-500/[0.08] border-emerald-500/20"
              : q.response_time_ms < 1500
              ? "text-amber-400 bg-amber-500/[0.08] border-amber-500/20"
              : "text-rose-400 bg-rose-500/[0.08] border-rose-500/20"}
          `}>
            {q.response_time_ms}ms
          </span>
        </div>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────
// Section Label Sub-Component
// ─────────────────────────────────────────

function SectionLabel({ label, icon: Icon }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-6 h-6 rounded-md bg-slate-800/80 ring-1 ring-white/[0.07] flex items-center justify-center">
        <Icon className="w-3.5 h-3.5 text-slate-400" />
      </div>
      <h2 className="text-sm font-semibold text-slate-300 tracking-wide uppercase">
        {label}
      </h2>
    </div>
  );
}

// ─────────────────────────────────────────
// SVG Icon Components
// ─────────────────────────────────────────

function PipelineIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  );
}

function QueryIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

// ─────────────────────────────────────────
// Loading Skeleton
// ─────────────────────────────────────────

function StatSkeleton({ delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay, duration: 0.4 }}
      className="relative overflow-hidden rounded-2xl bg-slate-900/50 ring-1 ring-white/[0.06] p-6 backdrop-blur-md"
    >
      {/* Shimmer sweep */}
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
      <div className="h-3 w-24 bg-slate-800/80 rounded-full mb-4" />
      <div className="h-7 w-16 bg-slate-800/60 rounded-lg mb-3" />
      <div className="h-2 w-20 bg-slate-800/40 rounded-full" />
    </motion.div>
  );
}