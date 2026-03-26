// ============================================================
// DashboardStats.jsx
// NexaSense AI Assistant — Enterprise UI Redesign
// Presents the metric cards on the Dashboard
// ============================================================

import React from "react";
import { motion } from "framer-motion";
import {
  DocumentTextIcon,
  Square3Stack3DIcon,
  BoltIcon,
  ClockIcon,
  CurrencyDollarIcon,
} from "@heroicons/react/24/outline";

// ─────────────────────────────────────────
// Animation Variants
// ─────────────────────────────────────────

const gridVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.09,
      delayChildren: 0.05,
    },
  },
};

const cardVariants = {
  hidden: {
    opacity: 0,
    y: 28,
    scale: 0.97,
    filter: "blur(6px)",
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

// ─────────────────────────────────────────
// Card Config
// ─────────────────────────────────────────

const CARD_CONFIG = [
  {
    title: "Documents",
    key: "documents",
    suffix: "",
    icon: DocumentTextIcon,
    accent: {
      text: "text-blue-400",
      iconBg: "bg-blue-500/[0.08]",
      iconRing: "ring-blue-500/20",
      iconHoverBg: "group-hover:bg-blue-500/[0.15]",
      iconHoverRing: "group-hover:ring-blue-500/35",
      glow: "group-hover:shadow-[0_0_32px_rgba(59,130,246,0.12)]",
      bar: "bg-blue-500",
      barGlow: "shadow-[0_0_8px_rgba(59,130,246,0.7)]",
      borderHover: "hover:ring-blue-500/20",
      gradientText: "from-blue-300 to-blue-500",
    },
  },
  {
    title: "Total Chunks",
    key: "chunks",
    suffix: "",
    icon: Square3Stack3DIcon,
    accent: {
      text: "text-violet-400",
      iconBg: "bg-violet-500/[0.08]",
      iconRing: "ring-violet-500/20",
      iconHoverBg: "group-hover:bg-violet-500/[0.15]",
      iconHoverRing: "group-hover:ring-violet-500/35",
      glow: "group-hover:shadow-[0_0_32px_rgba(139,92,246,0.12)]",
      bar: "bg-violet-500",
      barGlow: "shadow-[0_0_8px_rgba(139,92,246,0.7)]",
      borderHover: "hover:ring-violet-500/20",
      gradientText: "from-violet-300 to-violet-500",
    },
  },
  {
    title: "Total Queries",
    key: "queries",
    suffix: "",
    icon: BoltIcon,
    accent: {
      text: "text-emerald-400",
      iconBg: "bg-emerald-500/[0.08]",
      iconRing: "ring-emerald-500/20",
      iconHoverBg: "group-hover:bg-emerald-500/[0.15]",
      iconHoverRing: "group-hover:ring-emerald-500/35",
      glow: "group-hover:shadow-[0_0_32px_rgba(16,185,129,0.12)]",
      bar: "bg-emerald-500",
      barGlow: "shadow-[0_0_8px_rgba(16,185,129,0.7)]",
      borderHover: "hover:ring-emerald-500/20",
      gradientText: "from-emerald-300 to-emerald-500",
    },
  },
  {
    title: "Avg Response",
    key: "avgResponseMs",
    suffix: " ms",
    icon: ClockIcon,
    accent: {
      text: "text-amber-400",
      iconBg: "bg-amber-500/[0.08]",
      iconRing: "ring-amber-500/20",
      iconHoverBg: "group-hover:bg-amber-500/[0.15]",
      iconHoverRing: "group-hover:ring-amber-500/35",
      glow: "group-hover:shadow-[0_0_32px_rgba(245,158,11,0.12)]",
      bar: "bg-amber-500",
      barGlow: "shadow-[0_0_8px_rgba(245,158,11,0.7)]",
      borderHover: "hover:ring-amber-500/20",
      gradientText: "from-amber-300 to-amber-500",
    },
  },
  {
    title: "Credits",
    key: "credits",
    suffix: "",
    icon: CurrencyDollarIcon,
    accent: {
      text: "text-cyan-400",
      iconBg: "bg-cyan-500/[0.08]",
      iconRing: "ring-cyan-500/20",
      iconHoverBg: "group-hover:bg-cyan-500/[0.15]",
      iconHoverRing: "group-hover:ring-cyan-500/35",
      glow: "group-hover:shadow-[0_0_32px_rgba(6,182,212,0.12)]",
      bar: "bg-cyan-500",
      barGlow: "shadow-[0_0_8px_rgba(6,182,212,0.7)]",
      borderHover: "hover:ring-cyan-500/20",
      gradientText: "from-cyan-300 to-cyan-500",
    },
  },
];

// ─────────────────────────────────────────
// DashboardStats Component
// ─────────────────────────────────────────

function DashboardStats({ stats }) {
  if (!stats) return null;

  return (
    <motion.div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5"
      variants={gridVariants}
      initial="hidden"
      animate="visible"
    >
      {CARD_CONFIG.map((config, idx) => {
        const raw = stats[config.key] ?? 0;
        const display = `${raw}${config.suffix}`;
        const a = config.accent;
        const Icon = config.icon;

        return (
          <motion.div
            key={idx}
            variants={cardVariants}
            whileHover={{
              scale: 1.035,
              y: -4,
              transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
            }}
            whileTap={{ scale: 0.98 }}
            className={`
              group relative overflow-hidden rounded-2xl
              bg-slate-900/50 backdrop-blur-xl
              ring-1 ring-white/[0.07] ${a.borderHover}
              ${a.glow}
              shadow-sm
              transition-all duration-300 ease-out
              cursor-default
              p-6 flex flex-col justify-between gap-5
            `}
          >
            {/* ── Corner shimmer on hover ── */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
              <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full blur-2xl opacity-30"
                style={{ background: `radial-gradient(circle, var(--glow-color, white) 0%, transparent 70%)` }} />
            </div>

            {/* ── Top row: icon + subtle index ── */}
            <div className="flex items-start justify-between">
              <div className={`
                w-10 h-10 rounded-xl flex items-center justify-center
                ring-1 ${a.iconRing} ${a.iconBg}
                ${a.iconHoverBg} ${a.iconHoverRing}
                transition-all duration-300
                shadow-inner
              `}>
                <Icon className={`w-5 h-5 ${a.text}`} strokeWidth={1.5} />
              </div>

              {/* Subtle top-right ornament */}
              <span className="text-[10px] font-mono text-slate-700 group-hover:text-slate-600 transition-colors duration-200 select-none tabular-nums">
                {String(idx + 1).padStart(2, "0")}
              </span>
            </div>

            {/* ── Value + Title ── */}
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-500 tracking-widest uppercase">
                {config.title}
              </p>
              <p className={`
                text-3xl font-bold tracking-tight leading-none
                bg-gradient-to-br ${a.gradientText}
                bg-clip-text text-transparent
              `}>
                {display}
              </p>
            </div>

            {/* ── Bottom accent bar ── */}
            <div className="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden rounded-b-2xl">
              <motion.div
                className={`h-full ${a.bar} ${a.barGlow}`}
                initial={{ scaleX: 0, originX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.3 + idx * 0.09, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>

            {/* ── Noise texture overlay for depth ── */}
            <div
              className="absolute inset-0 rounded-2xl opacity-[0.025] pointer-events-none"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                backgroundSize: "128px 128px",
              }}
            />
          </motion.div>
        );
      })}
    </motion.div>
  );
}

export default DashboardStats;