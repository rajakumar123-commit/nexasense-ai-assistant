// ============================================================
// Pipeline3DAnimation.jsx
// NexaSense AI Assistant
// Interactive 3D visualization of the RAG Pipeline
// ============================================================

import React from "react";
import { motion } from "framer-motion";

function Pipeline3DAnimation() {
  return (
    <div className="relative w-full h-[500px] bg-slate-900 rounded-xl border border-slate-800 overflow-hidden flex items-center justify-center p-8 perspective-1000">
      
      {/* Background ambient glow */}
      <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 to-transparent pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-blue-500/10 blur-[100px] rounded-full pointer-events-none" />

      {/* 3D Scene Container */}
      <motion.div 
        className="relative w-full max-w-4xl h-full flex flex-col md:flex-row items-center justify-between gap-8 md:gap-4 preserve-3d"
        initial={{ rotateX: 20, rotateY: -10 }}
        animate={{ rotateX: [20, 22, 20], rotateY: [-10, -8, -10] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      >

        {/* 1. Document Node */}
        <Node title="Source Document" delay={0}>
          <div className="relative w-24 h-32 bg-slate-800 border-2 border-slate-700 rounded-md shadow-xl flex flex-col p-3 overflow-hidden">
            <div className="w-1/2 h-2 bg-slate-600 rounded mb-2" />
            <div className="w-full h-1 bg-slate-700 rounded mb-1" />
            <div className="w-full h-1 bg-slate-700 rounded mb-1" />
            <div className="w-4/5 h-1 bg-slate-700 rounded mb-1" />
            
            {/* Scanning Laser */}
            <motion.div 
              className="absolute left-0 right-0 h-0.5 bg-accent shadow-[0_0_8px_rgba(108,99,255,0.8)]"
              animate={{ top: ["0%", "100%", "0%"] }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            />
          </div>
        </Node>

        <DataStream delay={0.5} />

        {/* 2. Chunking Node */}
        <Node title="Semantic Chunking" delay={0.2}>
          <div className="relative w-24 h-24 flex items-center justify-center">
            {/* Split chunks */}
            <motion.div 
              className="absolute grid grid-cols-2 gap-1 w-full h-full"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 4, repeat: Infinity }}
            >
              {[...Array(4)].map((_, i) => (
                <motion.div 
                  key={i}
                  className="bg-slate-700 border border-slate-600 rounded-sm"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, delay: i * 0.2, repeat: Infinity }}
                />
              ))}
            </motion.div>
            <div className="absolute inset-0 border-2 border-dashed border-accent/50 rounded-lg animate-[spin-slow_10s_linear_infinite]" />
          </div>
        </Node>

        <DataStream delay={1.5} />

        {/* 3. Embedding Node */}
        <Node title="Embedding Model" delay={0.4}>
          <div className="relative w-28 h-28 bg-slate-900 border-2 border-accent-3/50 rounded-xl shadow-[0_0_30px_rgba(56,189,248,0.2)] flex items-center justify-center overflow-hidden">
            {/* Neural Net visual */}
            <svg viewBox="0 0 100 100" className="w-full h-full p-2 opacity-80">
              <motion.path 
                d="M10,50 L50,20 L90,50 L50,80 Z" 
                fill="none" 
                stroke="#38bdf8" 
                strokeWidth="2"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1, opacity: [0.2, 1, 0.2] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              />
              <motion.circle cx="50" cy="50" r="10" fill="#38bdf8" animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 2, repeat: Infinity }} />
            </svg>
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-accent-3/10 to-transparent" />
          </div>
        </Node>

        <DataStream delay={2.5} />

        {/* 4. Vector DB Node */}
        <Node title="Vector Database" delay={0.6}>
           {/* 3D Cylinder representation */}
           <div className="relative w-28 h-32 flex flex-col preserve-3d">
              {/* Top ellipse */}
              <div className="w-full h-8 bg-slate-700/80 rounded-[50%] border-2 border-emerald-500 shadow-[0_0_15px_rgba(34,197,94,0.4)] absolute top-0 z-20" />
              {/* Body */}
              <div className="w-full h-full bg-gradient-to-b from-slate-800 to-slate-900 border-x-2 border-emerald-500/50 absolute top-4 z-10" />
              {/* Bottom ellipse */}
              <div className="w-full h-8 bg-slate-900 rounded-[50%] border-b-2 border-emerald-500/50 absolute bottom-[-16px] z-20" />
              
              {/* Floating vectors inside */}
              <div className="absolute inset-0 z-30 flex flex-col justify-center items-center gap-1 overflow-hidden mt-6">
                 {[1,2,3].map(i => (
                    <motion.div 
                      key={i}
                      className="w-16 h-1 bg-emerald-400/80 rounded-full"
                      animate={{ x: [-10, 10, -10], opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 3, delay: i * 0.5, repeat: Infinity }}
                    />
                 ))}
              </div>
           </div>
        </Node>

      </motion.div>
    </div>
  );
}

// Subcomponent: A node in the pipeline
function Node({ title, children, delay }) {
  return (
    <motion.div 
      className="flex flex-col items-center gap-4 z-10 transform-style-preserve-3d"
      initial={{ opacity: 0, y: 20, translateZ: -50 }}
      animate={{ opacity: 1, y: 0, translateZ: 0 }}
      transition={{ duration: 0.8, delay }}
    >
      {/* Node content with hover lift */}
      <motion.div 
        className="relative group cursor-pointer"
        whileHover={{ scale: 1.05, translateZ: 20 }}
        transition={{ type: "spring", stiffness: 300 }}
      >
        {children}
        {/* Glow effect on hover */}
        <div className="absolute inset-0 rounded-xl bg-accent opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-300 -z-10" />
      </motion.div>
      <span className="text-sm font-semibold text-slate-300 tracking-wide bg-slate-950/50 px-3 py-1 rounded-full border border-slate-800 backdrop-blur-sm">
        {title}
      </span>
    </motion.div>
  );
}

// Subcomponent: Animated data stream flowing between nodes
function DataStream({ delay }) {
  return (
    <div className="hidden md:flex flex-1 items-center justify-center relative h-8 mx-2 overflow-hidden w-full min-w-[40px]">
      {/* Base line */}
      <div className="absolute w-full h-[2px] bg-slate-800" />
      
      {/* Flowing particles */}
      <motion.div 
        className="absolute w-full h-full flex items-center justify-start"
        initial={{ x: "-100%" }}
        animate={{ x: "100%" }}
        transition={{ duration: 2, delay, repeat: Infinity, ease: "linear" }}
      >
        <div className="w-8 h-2 bg-gradient-to-r from-transparent via-accent to-transparent rounded-full shadow-[0_0_10px_rgba(108,99,255,0.8)]" />
      </motion.div>
    </div>
  );
}

export default Pipeline3DAnimation;
