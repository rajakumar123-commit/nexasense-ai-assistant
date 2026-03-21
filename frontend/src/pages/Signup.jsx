// ============================================================
// Signup.jsx — NexaSense
// Premium animated signup page
// ============================================================
import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";

function Signup() {
  const { signup } = useAuth();
  const navigate   = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);

  const strengthLevel = password.length === 0 ? 0
    : password.length < 8 ? 1
    : password.length < 12 ? 2
    : 3;
  const strengthColor = ["", "bg-red-500", "bg-amber-400", "bg-emerald-500"][strengthLevel];
  const strengthLabel = ["", "Weak", "Good", "Strong"][strengthLevel];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      await signup(email, password, fullName);
      toast.success("Account created! Please sign in.");
      navigate("/login");
    } catch {
      toast.error("Signup failed — this email may already be in use.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-slate-950 flex items-center justify-center overflow-hidden">
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-600/20 rounded-full blur-3xl animate-pulse pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl animate-pulse pointer-events-none" style={{ animationDelay: "0.7s" }} />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-600 shadow-lg shadow-emerald-500/30 mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold ai-gradient-text tracking-tight">NexaSense</h1>
          <p className="text-slate-400 text-sm mt-1">Create your account</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8 shadow-2xl shadow-black/50">
          <h2 className="text-xl font-semibold text-slate-100 mb-6">Get Started Free</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Full Name</label>
              <input id="signup-name" type="text" placeholder="John Doe" value={fullName}
                onChange={e => setFullName(e.target.value)} required
                className="w-full px-4 py-3 bg-slate-800/70 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500/60 transition" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Email address</label>
              <input id="signup-email" type="email" placeholder="you@example.com" value={email}
                onChange={e => setEmail(e.target.value)} required
                className="w-full px-4 py-3 bg-slate-800/70 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500/60 transition" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
              <input id="signup-password" type="password" placeholder="Min. 6 characters" value={password}
                onChange={e => setPassword(e.target.value)} required
                className="w-full px-4 py-3 bg-slate-800/70 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500/60 transition" />
              {password.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 flex gap-1">
                    {[1,2,3].map(i => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= strengthLevel ? strengthColor : "bg-slate-700"}`} />
                    ))}
                  </div>
                  <span className="text-xs text-slate-400">{strengthLabel}</span>
                </div>
              )}
            </div>

            <motion.button type="submit" disabled={loading}
              whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
              className="w-full py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-lg shadow-emerald-500/25 disabled:opacity-60 disabled:cursor-not-allowed transition-all">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  Creating Account...
                </span>
              ) : "Create Account"}
            </motion.button>
          </form>

          <p className="text-center text-sm text-slate-400 mt-6">
            Already have an account?{" "}
            <Link to="/login" className="text-emerald-400 hover:text-emerald-300 font-medium transition">Sign in</Link>
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}

export default Signup;