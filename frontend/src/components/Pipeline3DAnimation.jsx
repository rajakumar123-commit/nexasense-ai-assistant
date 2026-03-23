// ============================================================
// Pipeline3DAnimation.jsx
// NexaSense AI Assistant
// Exact Mermaid flowchart → 3D animated React component
// Sunset gradient background · no overlaps · proper spacing
// ============================================================

import React, { useEffect, useRef } from "react";
import { motion, useMotionValue, useTransform, useSpring } from "framer-motion";

// ── colour tokens ─────────────────────────────────────────────
const C = {
  pre:         "#a78bfa",
  preDim:      "rgba(167,139,250,0.15)",
  preBorder:   "rgba(167,139,250,0.55)",
  cache:       "#38bdf8",
  cacheDim:    "rgba(56,189,248,0.15)",
  cacheBorder: "rgba(56,189,248,0.55)",
  ret:         "#34d399",
  retDim:      "rgba(52,211,153,0.15)",
  retBorder:   "rgba(52,211,153,0.55)",
  gen:         "#fb923c",
  genDim:      "rgba(251,146,60,0.15)",
  genBorder:   "rgba(251,146,60,0.55)",
  ans:         "#fde68a",
  ansBorder:   "rgba(253,230,138,0.7)",
};

// ── helpers ───────────────────────────────────────────────────
const Row = ({ children, gap = 12, wrap = true }) => (
  <div style={{ display:"flex", alignItems:"center", justifyContent:"center", flexWrap: wrap ? "wrap" : "nowrap", gap }}>
    {children}
  </div>
);

const Col = ({ children, gap = 0 }) => (
  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap }}>
    {children}
  </div>
);

// thin vertical line + arrowhead between rows inside a lane
const VArrow = ({ color = "rgba(255,255,255,0.4)", h = 20 }) => (
  <Col>
    <motion.div
      style={{ width:2, height:h, background:`linear-gradient(to bottom,rgba(255,255,255,0.1),${color})`, position:"relative", overflow:"hidden", borderRadius:1 }}
    >
      <motion.div
        style={{ position:"absolute", top:0, left:0, width:"100%", height:10, background:"linear-gradient(to bottom,transparent,rgba(255,255,255,0.9),transparent)" }}
        animate={{ top:["-14px",`${h+4}px`] }}
        transition={{ duration:1.4, repeat:Infinity, ease:"linear" }}
      />
    </motion.div>
    <div style={{ width:0,height:0, borderLeft:"5px solid transparent", borderRight:"5px solid transparent", borderTop:`7px solid ${color}`, marginTop:1 }} />
  </Col>
);

// horizontal connector with flowing pulse
const HArrow = ({ color = "rgba(255,255,255,0.45)", label, minW = 28, maxW = 56 }) => (
  <div style={{ display:"flex", alignItems:"center", flex:1, minWidth:minW, maxWidth:maxW }}>
    <div style={{ height:2, flex:1, background:`linear-gradient(to right,rgba(255,255,255,0.08),${color})`, position:"relative", overflow:"hidden", borderRadius:1 }}>
      <motion.div
        style={{ position:"absolute", top:0, left:"-22px", height:"100%", width:22, background:"linear-gradient(to right,transparent,rgba(255,255,255,0.9),transparent)" }}
        animate={{ left:["-22px","110%"] }}
        transition={{ duration:1.3, repeat:Infinity, ease:"linear" }}
      />
    </div>
    {label && <span style={{ fontSize:9, color:"rgba(255,255,255,0.85)", margin:"0 4px", whiteSpace:"nowrap", fontWeight:700, textShadow:"0 1px 4px rgba(0,0,0,0.7)" }}>{label}</span>}
    <div style={{ width:0,height:0, borderTop:"5px solid transparent", borderBottom:"5px solid transparent", borderLeft:`7px solid ${color}`, flexShrink:0 }} />
  </div>
);

// between lanes — taller connector
const LaneConnector = ({ label, color = "rgba(255,255,255,0.45)" }) => (
  <Col>
    <motion.div
      style={{ width:2, height:32, background:`linear-gradient(to bottom,rgba(255,255,255,0.1),${color})`, position:"relative", overflow:"hidden", borderRadius:1 }}
    >
      <motion.div
        style={{ position:"absolute", top:0, left:0, width:"100%", height:12, background:"linear-gradient(to bottom,transparent,rgba(255,255,255,0.95),transparent)" }}
        animate={{ top:["-18px","42px"] }}
        transition={{ duration:1.5, repeat:Infinity, ease:"linear" }}
      />
    </motion.div>
    {label && (
      <div style={{ fontSize:9, color:"rgba(255,255,255,0.85)", letterSpacing:".08em", fontWeight:700, border:"1px solid rgba(255,255,255,0.25)", borderRadius:20, padding:"2px 10px", margin:"3px 0", background:"rgba(0,0,0,0.45)", backdropFilter:"blur(4px)", textShadow:"0 1px 4px rgba(0,0,0,0.6)" }}>
        {label}
      </div>
    )}
    <div style={{ width:0,height:0, borderLeft:"6px solid transparent", borderRight:"6px solid transparent", borderTop:`8px solid ${color}`, marginTop:1 }} />
  </Col>
);

// lane container
const Lane = ({ label, color, border, dim, delay=0, children }) => (
  <motion.div
    initial={{ opacity:0, y:20 }}
    animate={{ opacity:1, y:0 }}
    transition={{ duration:0.6, delay, ease:[0.23,1,0.32,1] }}
    style={{ position:"relative", border:`1px solid ${border}`, borderRadius:16, padding:"28px 20px 24px", background:dim, boxShadow:`inset 0 0 30px ${dim},0 8px 32px rgba(0,0,0,0.3)`, backdropFilter:"blur(10px)", WebkitBackdropFilter:"blur(10px)" }}
  >
    <div style={{ position:"absolute", top:-13, left:22, fontSize:10, fontWeight:700, letterSpacing:".14em", textTransform:"uppercase", color, border:`1px solid ${border}`, background:"rgba(0,0,0,0.72)", padding:"3px 14px", borderRadius:20, boxShadow:"0 4px 12px rgba(0,0,0,0.5)", backdropFilter:"blur(4px)" }}>
      {label}
    </div>
    {children}
  </motion.div>
);

// standard process node
const PNode = ({ color, border, dim, badge, delay=0, children, style={} }) => (
  <motion.div
    initial={{ opacity:0, y:14 }}
    animate={{ opacity:1, y:0 }}
    transition={{ duration:0.5, delay, ease:[0.23,1,0.32,1] }}
    whileHover={{ scale:1.05, z:20 }}
    style={{ position:"relative", minWidth:130, maxWidth:210, padding:"10px 14px", borderRadius:12, border:`1px solid ${border}`, background:dim, color:"#fff", fontSize:12, fontWeight:600, lineHeight:1.5, textAlign:"center", cursor:"default", backdropFilter:"blur(10px)", WebkitBackdropFilter:"blur(10px)", boxShadow:`0 8px 24px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.15)`, textShadow:"0 1px 6px rgba(0,0,0,0.6)", ...style }}
  >
    {badge && <div style={{ fontSize:9, letterSpacing:".05em", color, border:`1px solid ${border}`, borderRadius:20, padding:"2px 8px", marginBottom:6, display:"inline-block", background:"rgba(0,0,0,0.55)", fontWeight:700 }}>{badge}</div>}
    <div>{children}</div>
    <div style={{ position:"absolute", inset:0, borderRadius:12, pointerEvents:"none", background:"linear-gradient(135deg,rgba(255,255,255,0.1) 0%,transparent 55%)" }} />
  </motion.div>
);

// diamond decision node
const Diamond = ({ color, border, dim, delay=0, children }) => (
  <motion.div
    initial={{ opacity:0, scale:0.8 }}
    animate={{ opacity:1, scale:1 }}
    transition={{ duration:0.5, delay }}
    whileHover={{ scale:1.06 }}
    style={{ width:116, height:70, background:dim, border:`1px solid ${border}`, clipPath:"polygon(50% 0%,100% 50%,50% 100%,0% 50%)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color, textAlign:"center", lineHeight:1.3, padding:"0 24px", cursor:"default", backdropFilter:"blur(8px)", boxShadow:"0 10px 24px rgba(0,0,0,0.45)" }}
  >
    {children}
  </motion.div>
);

// terminal pill (Q / Answer)
const Pill = ({ children, delay=0, gold=false }) => (
  <motion.div
    initial={{ opacity:0, y:-14 }}
    animate={{ opacity:1, y:0 }}
    transition={{ duration:0.6, delay }}
    whileHover={{ scale:1.03 }}
    style={{ padding: gold ? "13px 40px" : "12px 32px", borderRadius:40, border: gold ? `1px solid ${C.ansBorder}` : "1px solid rgba(255,255,255,0.4)", background: gold ? "rgba(253,230,138,0.18)" : "rgba(255,255,255,0.13)", backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)", fontSize: gold ? 15 : 14, fontWeight:800, color: gold ? "#fff8d6" : "#fff", letterSpacing:".03em", boxShadow: gold ? "0 10px 32px rgba(255,180,0,0.3),inset 0 1px 0 rgba(255,255,255,0.25)" : "0 8px 32px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.25)", textShadow:"0 2px 8px rgba(0,0,0,0.55)", textAlign:"center" }}
  >
    {children}
  </motion.div>
);

const BranchTag = ({ color, border, children }) => (
  <span style={{ fontSize:9, color, letterSpacing:".07em", fontWeight:700, border:`1px solid ${border}`, borderRadius:20, padding:"3px 12px", background:"rgba(0,0,0,0.5)", backdropFilter:"blur(4px)", textShadow:"0 1px 4px rgba(0,0,0,0.7)" }}>
    {children}
  </span>
);

// ── main export ───────────────────────────────────────────────
export default function Pipeline3DAnimation() {
  const ref   = useRef(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotX  = useSpring(useTransform(mouseY,[-1,1],[15,8]),  { stiffness:55, damping:20 });
  const rotY  = useSpring(useTransform(mouseX,[-1,1],[-9,4]), { stiffness:55, damping:20 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mv = (e) => {
      const { left,top,width,height } = el.getBoundingClientRect();
      mouseX.set(((e.clientX-left)/width -0.5)*2);
      mouseY.set(((e.clientY-top) /height-0.5)*2);
    };
    const ml = () => { mouseX.set(0); mouseY.set(0); };
    el.addEventListener("mousemove", mv);
    el.addEventListener("mouseleave", ml);
    return () => { el.removeEventListener("mousemove",mv); el.removeEventListener("mouseleave",ml); };
  }, [mouseX, mouseY]);

  return (
    <div
      ref={ref}
      style={{
        position:"relative", width:"100%", minHeight:640,
        background:`
          radial-gradient(circle at 50% 78%, rgba(255,220,120,0.85) 0%, rgba(255,140,60,0.65) 18%, rgba(255,80,40,0.55) 34%, transparent 58%),
          linear-gradient(to bottom, #9ecbff 0%, #c6a4ff 18%, #ff9bb3 38%, #ff7a4d 62%, #ff3c1f 83%, #b30000 100%)
        `,
        borderRadius:24,
        border:"1px solid rgba(255,255,255,0.22)",
        boxShadow:"0 32px 64px -16px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.28)",
        overflow:"hidden",
        padding:"36px 24px 52px",
        perspective:"1600px",
        fontFamily:"'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace",
      }}
    >
      {/* dark overlay for readability */}
      <div style={{ position:"absolute",inset:0,pointerEvents:"none",background:"rgba(0,0,0,0.42)" }} />
      <div style={{ position:"absolute",inset:0,pointerEvents:"none",background:"radial-gradient(ellipse 55% 35% at 50% 50%,rgba(255,255,255,0.05) 0%,transparent 70%)" }} />

      {/* 3-D floating stage */}
      <motion.div
        style={{ rotateX:rotX, rotateY:rotY, transformStyle:"preserve-3d", position:"relative", zIndex:1 }}
        animate={{ y:[0,-14,0] }}
        transition={{ duration:9, repeat:Infinity, ease:"easeInOut" }}
      >
        {/* title */}
        <div style={{ textAlign:"center", marginBottom:28, fontSize:12, fontWeight:700, letterSpacing:".18em", color:"rgba(255,255,255,0.8)", textTransform:"uppercase", textShadow:"0 2px 12px rgba(0,0,0,0.7)" }}>
          RAG Pipeline · NexaSense
        </div>

        {/* ── Q ── */}
        <Row><Pill>💬 User Question</Pill></Row>
        <div style={{ height:8 }} />
        <Row><LaneConnector /></Row>
        <div style={{ height:4 }} />

        {/* ══ CACHE LAYER ══
            Q → ExactCache
            ExactCache --HIT--> A   ExactCache --MISS--> Spell (below)
            SemCache   --HIT--> A   SemCache   --MISS--> History (below)
            Spell → Expand → SemCache  (handled as left-to-right inside lane)
        */}
        <Lane label="Cache Layer" color={C.cache} border={C.cacheBorder} dim={C.cacheDim} delay={0.05}>
          {/* row: Spell → Expand → SemCache with diamonds mixed in */}
          {/* Layout: ExactCache --MISS--> Spell --> Expand --> SemCache --MISS--> (exit below) */}
          {/*         ExactCache --HIT --> Answer (shown as side label)                         */}
          <Row gap={10} wrap={false}>
            <Col gap={4}>
              <Diamond color={C.cache} border={C.cacheBorder} dim={C.cacheDim} delay={0.08}>
                Exact<br/>Cache?
              </Diamond>
              <div style={{ fontSize:9, color:C.cache, fontWeight:700, textShadow:"0 1px 4px rgba(0,0,0,0.7)" }}>HIT ↑ / MISS →</div>
            </Col>
            <HArrow color={C.cache} label="MISS" minW={20} maxW={44} />
            <PNode color={C.cache} border={C.cacheBorder} dim={C.cacheDim} badge="Gemini" delay={0.12}>Spell<br/>Correction</PNode>
            <HArrow color={C.cache} minW={16} maxW={32} />
            <PNode color={C.cache} border={C.cacheBorder} dim={C.cacheDim} badge="Gemini" delay={0.16}>Query<br/>Expansion</PNode>
            <HArrow color={C.cache} minW={16} maxW={32} />
            <Col gap={4}>
              <Diamond color={C.cache} border={C.cacheBorder} dim={C.cacheDim} delay={0.20}>
                Semantic<br/>Cache?
              </Diamond>
              <div style={{ fontSize:9, color:C.cache, fontWeight:700, textShadow:"0 1px 4px rgba(0,0,0,0.7)" }}>HIT ↑ / MISS ↓</div>
            </Col>
          </Row>

          {/* HIT target — shown as shared answer pill */}
          <div style={{ display:"flex", justifyContent:"flex-end", marginTop:10 }}>
            <div style={{ fontSize:9, color:"rgba(253,230,138,0.85)", letterSpacing:".06em", border:"1px solid rgba(253,230,138,0.4)", borderRadius:20, padding:"2px 12px", background:"rgba(0,0,0,0.4)", backdropFilter:"blur(4px)", textShadow:"0 1px 4px rgba(0,0,0,0.6)" }}>
              ↑ HIT on Exact or Semantic Cache → ✅ Final Answer immediately
            </div>
          </div>
        </Lane>

        <LaneConnector label="MISS" />

        {/* ══ PRE-PROCESSING ══
            History → Rewrite  (Spell/Expand already done in Cache lane above)
        */}
        <Lane label="Pre-Processing" color={C.pre} border={C.preBorder} dim={C.preDim} delay={0.25}>
          <Row gap={12} wrap={false}>
            <PNode color={C.pre} border={C.preBorder} dim={C.preDim} delay={0.28}>Load Conversation<br/>Context</PNode>
            <HArrow color={C.pre} minW={20} maxW={48} />
            <PNode color={C.pre} border={C.preBorder} dim={C.preDim} badge="Gemini" delay={0.32}>Contextual<br/>Rewrite</PNode>
          </Row>
        </Lane>

        <LaneConnector />

        {/* ══ RETRIEVAL ══
            HyDE
            ↓        ↓
          VecSearch  KwSearch
               ↓
             Merge → Rerank
        */}
        <Lane label="Retrieval" color={C.ret} border={C.retBorder} dim={C.retDim} delay={0.36}>
          {/* HyDE */}
          <Row>
            <PNode color={C.ret} border={C.retBorder} dim={C.retDim} badge="HyDE" delay={0.38}>
              Hypothetical Doc Generation
            </PNode>
          </Row>

          {/* split down to two parallel searches */}
          <div style={{ display:"flex", justifyContent:"center", gap:80, marginTop:6 }}>
            <VArrow color={C.retBorder} h={18} />
            <VArrow color={C.retBorder} h={18} />
          </div>

          {/* parallel row */}
          <Row gap={24}>
            <PNode color={C.ret} border={C.retBorder} dim={C.retDim} badge="ChromaDB" delay={0.42}>
              Multi-Doc<br/>Vector Search
            </PNode>
            <PNode color={C.ret} border={C.retBorder} dim={C.retDim} badge="PostgreSQL" delay={0.45}>
              Full-Text<br/>Search
            </PNode>
          </Row>

          {/* merge arrow */}
          <div style={{ display:"flex", justifyContent:"center", gap:80, marginTop:6 }}>
            <VArrow color={C.retBorder} h={18} />
            <VArrow color={C.retBorder} h={18} />
          </div>

          {/* merge + rerank */}
          <Row gap={12}>
            <PNode color={C.ret} border={C.retBorder} dim={C.retDim} delay={0.48}>
              Deduplicate + Merge
            </PNode>
            <HArrow color={C.ret} minW={20} maxW={48} />
            <PNode color={C.ret} border={C.retBorder} dim={C.retDim} delay={0.51}>
              Semantic Re-rank<br/>→ Top 7 Chunks
            </PNode>
          </Row>
        </Lane>

        <LaneConnector />

        {/* ══ GENERATION ══
            EarlyExit
            ├── None  → Fallback → A
            └── Found → Compress → Draft → Refine → Reflect
        */}
        <Lane label="Generation" color={C.gen} border={C.genBorder} dim={C.genDim} delay={0.54}>
          {/* EarlyExit */}
          <Row>
            <Diamond color={C.gen} border={C.genBorder} dim={C.genDim} delay={0.56}>
              Chunks<br/>Found?
            </Diamond>
          </Row>

          {/* two branches side-by-side */}
          <div style={{ display:"flex", gap:20, marginTop:20, alignItems:"flex-start", justifyContent:"center", flexWrap:"wrap" }}>

            {/* None branch */}
            <Col gap={10} style={{ minWidth:150, alignItems:"center" }}>
              <BranchTag color={C.gen} border={C.genBorder}>None</BranchTag>
              <VArrow color={C.genBorder} h={16} />
              <PNode color={C.gen} border={C.genBorder} dim={C.genDim} badge="Gemini" delay={0.58}>
                Out-of-Domain<br/>Rejection
              </PNode>
              <VArrow color={C.genBorder} h={16} />
              <Pill gold delay={0.60}>✅ Final Answer</Pill>
            </Col>

            {/* divider */}
            <div style={{ width:1, minHeight:180, background:"rgba(255,255,255,0.1)", alignSelf:"stretch" }} />

            {/* Found branch — vertical chain */}
            <Col gap={0} style={{ flex:1, minWidth:220, alignItems:"center" }}>
              <BranchTag color={C.gen} border={C.genBorder}>Found</BranchTag>
              <VArrow color={C.genBorder} h={14} />
              <PNode color={C.gen} border={C.genBorder} dim={C.genDim} delay={0.60} style={{ width:"100%", maxWidth:240 }}>
                Context Compression
              </PNode>
              <VArrow color={C.genBorder} h={14} />
              <PNode color={C.gen} border={C.genBorder} dim={C.genDim} badge="Groq · Llama 3.3 70B" delay={0.63} style={{ width:"100%", maxWidth:240 }}>
                Draft Answer
              </PNode>
              <VArrow color={C.genBorder} h={14} />
              <PNode color={C.gen} border={C.genBorder} dim={C.genDim} badge="Gemini" delay={0.66} style={{ width:"100%", maxWidth:240 }}>
                Reasoning + Refinement
              </PNode>
              <VArrow color={C.genBorder} h={14} />
              <PNode color={C.gen} border={C.genBorder} dim={C.genDim} badge="Gemini" delay={0.69} style={{ width:"100%", maxWidth:240 }}>
                Self-Reflection + Confidence
              </PNode>
            </Col>
          </div>
        </Lane>

        <LaneConnector />

        {/* ── SAVE CACHE ── */}
        <Row>
          <PNode color={C.ans} border={C.ansBorder} dim="rgba(253,230,138,0.14)" delay={0.72} style={{ minWidth:240, fontSize:13 }}>
            💾 Save to Semantic Cache
          </PNode>
        </Row>

        <LaneConnector />

        {/* ── FINAL ANSWER ── */}
        <Row>
          <Pill gold delay={0.75}>✅ Final Answer + Sources</Pill>
        </Row>

      </motion.div>
    </div>
  );
}
