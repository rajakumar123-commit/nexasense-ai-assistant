// ============================================================
// Dashboard.jsx
// NexaSense AI Assistant
// ============================================================

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import useApi from "../hooks/useApi";
import DashboardStats from "../components/DashboardStats";
import Pipeline3DAnimation from "../components/Pipeline3DAnimation";

function Dashboard() {

  const api = useApi();

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);


  // ─────────────────────────────────────────
  // Fetch dashboard stats
  // ─────────────────────────────────────────

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
  // Loading state
  // ─────────────────────────────────────────

  if (loading) {

    return (

      <div className="p-8 text-slate-100">

        <h1 className="text-3xl font-bold mb-6">
          NexaSense AI Dashboard
        </h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">

          {Array.from({ length: 4 }).map((_, i) => (
            <StatSkeleton key={i} />
          ))}

        </div>

      </div>

    );

  }


  return (

    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="p-4 sm:p-8 text-slate-100 max-w-7xl mx-auto"
    >

      {/* Page Title */}

      <h1 className="text-2xl sm:text-3xl font-bold mb-8 ai-gradient-text">
        NexaSense AI Dashboard
      </h1>

      {/* 3D Pipeline Visualization */}
      <div className="mb-12 rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/5 bg-[#04080f]/50 mt-12">
        <Pipeline3DAnimation />
      </div>

      {/* Stats Cards */}

      <DashboardStats stats={stats} />


      {/* Recent Queries */}
      <div className="mt-12">
        <h2 className="text-xl font-semibold mb-4 text-slate-100">Recent Queries</h2>

        {(!stats?.recentQueries || stats.recentQueries.length === 0) && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-slate-300 font-medium mb-1">No queries yet</p>
            <p className="text-slate-500 text-sm">Upload a document and start asking questions.</p>
          </div>
        )}

        <div className="space-y-3">
          {stats?.recentQueries?.map((q, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-start gap-4 hover:border-slate-700 transition group"
            >
              {/* Icon */}
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-200 leading-relaxed line-clamp-2">{q.question}</p>
                {q.created_at && (
                  <p className="text-xs text-slate-500 mt-1.5">
                    {new Date(q.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </div>
              {/* Response time badge */}
              {q.response_time_ms && (
                <span className="text-xs text-slate-500 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full flex-shrink-0">
                  {q.response_time_ms}ms
                </span>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>

  );

}

export default Dashboard;



// ============================================================
// Loading Skeleton
// ============================================================

function StatSkeleton() {

  return (

    <div className="bg-slate-800 p-6 rounded-lg animate-pulse">

      <div className="h-4 bg-slate-700 rounded w-1/2 mb-3"></div>

      <div className="h-6 bg-slate-700 rounded w-1/3"></div>

    </div>

  );

}