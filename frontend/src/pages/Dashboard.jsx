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
      <div className="mb-12">
        <h2 className="text-xl font-semibold mb-4 text-slate-300">
          Global RAG Pipeline
        </h2>
        <Pipeline3DAnimation />
      </div>

      {/* Stats Cards */}

      <DashboardStats stats={stats} />


      {/* Recent Queries */}

      <div className="mt-12">

        <h2 className="text-xl font-semibold mb-4">
          Recent Queries
        </h2>


        {stats?.recentQueries?.length === 0 && (

          <p className="text-slate-400">
            No recent queries.
          </p>

        )}


        <div className="space-y-3">

          {stats?.recentQueries?.map((q, i) => (

            <div
              key={i}
              className="bg-slate-800 border border-slate-700 rounded-md p-3 hover:bg-slate-700 transition"
            >

              {q.question}

            </div>

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