// ============================================================
// AdminPanel.jsx — NexaSense AI Assistant
// ============================================================

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import useApi from "../hooks/useApi";   // ← shared hook, not own axios instance

export default function AdminPanel() {
  const api = useApi();

  const [users, setUsers]                       = useState([]);
  const [loadingUsers, setLoadingUsers]         = useState(true);
  const [selectedUser, setSelectedUser]         = useState(null);
  const [questions, setQuestions]               = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    try {
      const res = await api.get("/admin/users");
      setUsers(res.data.users || []);
    } catch {
      toast.error("Failed to fetch users");
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleViewQuestions = async (user) => {
    setSelectedUser(user);
    setLoadingQuestions(true);
    setQuestions([]);
    try {
      const res = await api.get(`/admin/users/${user.id}/questions`);
      setQuestions(res.data.questions || []);
    } catch {
      toast.error("Failed to fetch questions");
    } finally {
      setLoadingQuestions(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Admin Control Panel</h1>
        <p className="text-slate-400 mt-1">Manage users and view system activity.</p>
      </div>

      {/*
        IMPORTANT: Do NOT use template-literal Tailwind classes like col-span-${n}.
        Vite's production build purges any class not found as a literal string in source.
        Use explicit conditional strings instead.
      */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        <div className={selectedUser ? "lg:col-span-1" : "lg:col-span-3"}>
          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800/80 bg-slate-800/20">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <span>👥</span> Registered Users
              </h2>
            </div>
            <div className="overflow-x-auto">
              {loadingUsers ? (
                <div className="p-8 text-center text-slate-400">Loading users...</div>
              ) : (
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-800/40 text-xs uppercase font-medium text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Joined</th>
                      <th className="px-4 py-3 text-right">Questions</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {users.map(u => (
                      <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-200">{u.full_name || "Anonymous"}</div>
                          <div className="text-xs text-slate-500">{u.email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            u.role === "admin"
                              ? "bg-purple-500/20 text-purple-400"
                              : "bg-slate-700 text-slate-400"
                          }`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {u.total_questions}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => handleViewQuestions(u)}
                            className="text-xs px-3 py-1.5 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded-lg transition">
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan="5" className="px-4 py-8 text-center text-slate-500">
                          No users found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Questions panel — AnimatePresence handles enter/exit */}
        <AnimatePresence>
          {selectedUser && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="lg:col-span-2"
            >
              <div className="bg-slate-900/50 backdrop-blur-xl border border-blue-500/20 rounded-2xl overflow-hidden shadow-2xl">
                <div className="p-4 border-b border-slate-800/80 bg-slate-800/20 flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                      <span>💬</span>{" "}
                      {selectedUser.full_name || selectedUser.email}&apos;s History
                    </h2>
                    <p className="text-xs text-slate-400">{selectedUser.email}</p>
                  </div>
                  <button onClick={() => setSelectedUser(null)}
                    className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 transition">
                    ✕
                  </button>
                </div>

                <div className="p-4 max-h-[600px] overflow-y-auto flex flex-col gap-4 custom-scrollbar">
                  {loadingQuestions ? (
                    <div className="py-12 text-center text-slate-400">Loading history...</div>
                  ) : questions.length === 0 ? (
                    <div className="py-12 flex flex-col items-center text-center">
                      <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mb-3">
                        <span className="text-2xl">👻</span>
                      </div>
                      <p className="text-slate-400">This user hasn&apos;t asked anything yet.</p>
                    </div>
                  ) : (
                    questions.map(q => (
                      <div key={q.id} className="bg-slate-800/40 border border-slate-700/50 p-4 rounded-xl">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-mono text-slate-500">
                            {new Date(q.created_at).toLocaleString()}
                          </span>
                          {q.file_name && (
                            <span className="text-xs px-2 py-0.5 bg-slate-700/50 text-slate-400 rounded flex items-center gap-1">
                              <span>📄</span> {q.file_name}
                            </span>
                          )}
                        </div>
                        <div className="space-y-3">
                          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-blue-100/90 text-sm">
                            <span className="font-semibold text-blue-400 mr-2">Q:</span>
                            {q.question}
                          </div>
                          <div className="bg-slate-900/50 rounded-lg p-3 text-slate-300 text-sm">
                            <span className="font-semibold text-purple-400 block mb-1">A:</span>
                            {q.answer
                              ? q.answer.substring(0, 300) + (q.answer.length > 300 ? "..." : "")
                              : <span className="italic text-slate-500">No answer recorded</span>
                            }
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}