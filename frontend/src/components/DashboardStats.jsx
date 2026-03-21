// ============================================================
// DashboardStats.jsx
// NexaSense AI Assistant
// Presents the metric cards on the Dashboard
// ============================================================

import React from "react";
import { 
  DocumentTextIcon, 
  Square3Stack3DIcon, 
  BoltIcon, 
  ClockIcon 
} from "@heroicons/react/24/outline";

function DashboardStats({ stats }) {
  
  if (!stats) return null;

  const cards = [
    {
      title: "Documents",
      value: stats.documents || 0,
      icon: <DocumentTextIcon className="w-6 h-6 text-blue-400" />,
      color: "border-blue-500/30 bg-blue-500/5",
    },
    {
      title: "Total Chunks",
      value: stats.chunks || 0,
      icon: <Square3Stack3DIcon className="w-6 h-6 text-purple-400" />,
      color: "border-purple-500/30 bg-purple-500/5",
    },
    {
      title: "Total Queries",
      value: stats.queries || 0,
      icon: <BoltIcon className="w-6 h-6 text-emerald-400" />,
      color: "border-emerald-500/30 bg-emerald-500/5",
    },
    {
      title: "Avg Response",
      value: `${stats.avgResponseMs || 0} ms`,
      icon: <ClockIcon className="w-6 h-6 text-amber-400" />,
      color: "border-amber-500/30 bg-amber-500/5",
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((card, idx) => (
        <div 
          key={idx}
          className={`p-6 rounded-xl border ${card.color} flex flex-col justify-between items-start gap-4 transition-transform hover:-translate-y-1`}
        >
          <div className="bg-slate-800 p-2 rounded-lg border border-slate-700 shadow-sm">
            {card.icon}
          </div>
          <div>
            <h3 className="text-sm font-medium text-slate-400 tracking-wide uppercase">
              {card.title}
            </h3>
            <p className="text-3xl font-bold text-slate-100 mt-1">
              {card.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default DashboardStats;