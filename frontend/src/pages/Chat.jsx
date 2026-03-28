// ============================================================
// Chat.jsx — NexaSense
// Premium animated AI chat interface (Streaming Enabled)
// ============================================================
import React, { useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

import useStream from "../hooks/useStream";
import ChatMessage from "../components/ChatMessage";
import ConversationSidebar from "../components/ConversationSidebar";
import PipelineInspector from "../components/PipelineInspector";
import { useCreditsContext } from "../context/CreditsContext";

function Chat() {
  const { streamQuery, loading } = useStream();
  const { credits, refresh: refreshCredits } = useCreditsContext();
  const [searchParams] = useSearchParams();
  const documentId = searchParams.get("documentId");

  const [question, setQuestion]           = useState("");
  const [error, setError]                 = useState("");
  const [sessions, setSessions]           = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [pipeline, setPipeline]           = useState(null);
  const [sidebarOpen, setSidebarOpen]     = useState(false);
  const [isListening, setIsListening]     = useState(false);

  const chatEndRef    = useRef(null);
  const textareaRef   = useRef(null);
  const recognitionRef = useRef(null);

  // ── Voice Input (SpeechRecognition) ─────────────────────────
  const toggleListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang           = "";  // empty = uses browser/OS language
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setQuestion(prev => prev ? prev + " " + transcript : transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend   = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  const activeSessionData = sessions.find(s => s.id === activeSession) || null;
  const messages = activeSessionData?.messages || [];

  const createSessionId = () =>
    globalThis.crypto?.randomUUID?.() || `session-${Date.now()}`;

  const buildSessionTitle = (text) => text.trim().slice(0, 44) || "New Chat";

  const updateSession = (sessionId, updater) =>
    setSessions(prev => prev.map(s => s.id === sessionId ? updater(s) : s));

  // Auto-scroll to bottom of chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  
  useEffect(() => { 
    setSessions([]); 
    setActiveSession(null); 
    setError(""); 
    setQuestion("");
    setPipeline(null);

    if (documentId) {
      const fetchHistory = async () => {
        try {
          const API_URL = import.meta.env.VITE_API_URL || "/api";
          const res = await fetch(`${API_URL}/conversations/document/${documentId}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
          });
          const data = await res.json();
          if (data.success && data.conversations && data.conversations.length > 0) {
            setSessions(data.conversations);
            setActiveSession(data.conversations[0].id);
          }
        } catch (err) {
          console.error("Failed to load conversation history:", err);
        }
      };
      fetchHistory();
    }
  }, [documentId]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!question.trim() || loading || credits === 0) return;
    if (!documentId) { setError("No document selected. Go to Workspace and open a document."); return; }

    setError("");
    const currentQuestion = question.trim();
    const userMessageId   = createSessionId();
    const assistantId     = createSessionId();

    const userMessage          = { id: userMessageId, role: "user", content: currentQuestion };
    const assistantPlaceholder = { id: assistantId, role: "assistant", content: "", sources: [] };

    let sessionId = activeSession;
    if (!sessionId) {
      sessionId = createSessionId();
      setSessions(prev => [{ id: sessionId, title: buildSessionTitle(currentQuestion), messages: [] }, ...prev]);
      setActiveSession(sessionId);
    }

    updateSession(sessionId, s => ({
      ...s,
      title: s.title === "New Chat" ? buildSessionTitle(currentQuestion) : s.title,
      messages: [...s.messages, userMessage, assistantPlaceholder]
    }));
    setQuestion("");

    try {
      // ✅ Pass callbacks to render tokens as they stream in
      const result = await streamQuery(currentQuestion, documentId, sessionId, {
        onToken: (token, fullAnswerSoFar) => {
          updateSession(sessionId, s => ({
            ...s,
            messages: s.messages.map(msg =>
              msg.id === assistantId
                ? { ...msg, content: fullAnswerSoFar }
                : msg
            )
          }));
        },
        onMeta: (metadata) => {
          updateSession(sessionId, s => ({
            ...s,
            messages: s.messages.map(msg =>
              msg.id === assistantId
                ? { ...msg, sources: metadata.sources || [] }
                : msg
            )
          }));
        }
      });
      
      let finalSessionId = sessionId;
      if (result.conversationId && result.conversationId !== sessionId) {
        finalSessionId = result.conversationId;
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, id: finalSessionId } : s));
        if (activeSession === sessionId) {
          setActiveSession(finalSessionId);
        }
      }

      setPipeline(result.pipeline || null);
      refreshCredits();

    } catch (err) {
      const message = err?.message || "Failed to fetch answer.";
      const isOutofCredits = message.toLowerCase().includes("credits") || message.toLowerCase().includes("upgrade");
      
      updateSession(sessionId, s => ({
        ...s,
        messages: s.messages.map(msg =>
          msg.id === assistantId ? { 
            ...msg, 
            content: isOutofCredits 
              ? `[ERROR_CREDITS] ${message}` 
              : `Error: ${message}`, 
            sources: [] 
          } : msg
        )
      }));
      if (!isOutofCredits) setError(message);
    }
  };

  const newChat = () => {
    const id = createSessionId();
    setSessions(prev => [{ id, title: "New Chat", messages: [] }, ...prev]);
    setActiveSession(id);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  return (
    <div className="flex h-[calc(100vh-57px)] bg-slate-950">
      {/* Mobile sidebar toggle */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setSidebarOpen(false)} />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <ConversationSidebar
        conversations={sessions}
        activeId={activeSession}
        onSelect={id => { setActiveSession(id); setError(""); setSidebarOpen(false); }}
        onNewChat={newChat}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900/60 backdrop-blur-sm">
          <button onClick={() => setSidebarOpen(true)} className="md:hidden p-2 rounded-lg hover:bg-slate-800 text-slate-400 transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-slate-100 truncate">
              {activeSessionData?.title || "Select a document to start chatting"}
            </h2>
            {documentId && (
              <p className="text-xs flex items-center gap-1.5 text-slate-400 font-medium mt-0.5">
                {documentId === "all" ? (
                  <>
                    <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                    Global Context: All Documents
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                    Document: {documentId.slice(0, 8)}…
                  </>
                )}
              </p>
            )}
          </div>
          {!documentId && (
            <Link to="/workspace" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600/30 transition">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Open Document
            </Link>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Empty state */}
          {messages.length === 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-full text-center py-20">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-violet-600/20 border border-blue-500/20 flex items-center justify-center mb-6">
                <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-200 mb-2">
                {documentId ? "Start a conversation" : "No document selected"}
              </h3>
              <p className="text-slate-400 text-sm max-w-md">
                {documentId === "all"
                  ? "You are chatting across ALL your uploaded documents! Ask away in English, Hindi, or any language."
                  : documentId
                    ? "Ask any question about your uploaded document. You can ask in Hindi, English, or any language!"
                    : "Go to the Workspace and click 'Chat' on a document to start."}
              </p>
            </motion.div>
          )}

          {/* Error banner */}
          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="bg-red-950/60 border border-red-500/30 text-red-300 p-3 rounded-xl text-sm flex items-start gap-2">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Messages */}
          {messages.map((msg, i) => {
            if (msg.content && msg.content.startsWith("[ERROR_CREDITS]")) {
              const errorText = msg.content.replace("[ERROR_CREDITS]", "").trim();
              return (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }} className="max-w-2xl mx-auto w-full my-6">
                  <div className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-red-500/20 rounded-2xl p-6 text-center shadow-2xl relative overflow-hidden">
                    <div className="absolute -top-10 -left-10 w-32 h-32 bg-red-500/10 rounded-full blur-2xl pointer-events-none" />
                    <div className="w-12 h-12 rounded-xl bg-red-500/15 border border-red-500/20 flex items-center justify-center mx-auto mb-4 relative z-10">
                      <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    </div>
                    <h4 className="text-lg font-bold text-slate-100 mb-2 relative z-10">Out of Credits</h4>
                    <p className="text-slate-400 text-sm mb-6 relative z-10">{errorText}</p>
                    <Link to="/workspace" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-white text-slate-900 hover:bg-slate-200 transition shadow-lg relative z-10">
                      Go to Dashboard to Upgrade
                    </Link>
                  </div>
                </motion.div>
              );
            }
            return (
              <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
                <ChatMessage role={msg.role} content={msg.content} sources={msg.sources} />
              </motion.div>
            );
          })}

          {/* Typing indicator (only shows before the first token arrives) */}
          {loading && messages.length > 0 && messages[messages.length-1].role === "assistant" && messages[messages.length-1].content === "" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
              </div>
              <div className="bg-slate-800 border border-slate-700/50 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                {[0, 150, 300].map(delay => (
                  <div key={delay} className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                ))}
              </div>
            </motion.div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-slate-800 p-4 bg-slate-900/60 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="flex gap-3 max-w-4xl mx-auto">
            <div className="relative flex-1">
              <textarea
                ref={textareaRef}
                className={`w-full bg-slate-800/80 border border-slate-700 rounded-xl p-3.5 pr-12 resize-none text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-blue-500/50 transition min-h-[52px] max-h-32 ${credits === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
                placeholder={credits === 0 ? "You have 0 credits. Upgrade to ask questions." : documentId === "all" ? "Search across all your documents..." : documentId ? "Ask a question about your document…" : "Select a document first…"}
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={!documentId || credits === 0}
              />
              {/* Mic Button */}
              {(window.SpeechRecognition || window.webkitSpeechRecognition) && (
                <button
                  type="button"
                  onClick={toggleListening}
                  title={isListening ? "Stop listening" : "Speak your question"}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all ${
                    isListening
                      ? "bg-red-500/20 text-red-400 animate-pulse"
                      : "text-slate-500 hover:text-slate-300 hover:bg-slate-700"
                  }`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </button>
              )}
            </div>
            <motion.button
              type="submit" disabled={loading || !question.trim() || !documentId || credits === 0}
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-semibold text-sm shadow-lg shadow-blue-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0">
              {loading ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>}
              <span className="hidden sm:block">{loading ? "Thinking…" : "Ask"}</span>
            </motion.button>
          </form>
          <div className="flex justify-between items-center max-w-4xl mx-auto mt-2 text-xs">
            <p className="text-slate-600">Press Enter to send · Shift+Enter for new line</p>
            {credits !== null && (
              <p className={`font-medium ${credits === 0 ? "text-red-400" : credits <= 10 ? "text-amber-400" : "text-emerald-400/70"}`}>
                {credits} {credits === 1 ? "credit" : "credits"} remaining
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Pipeline Inspector */}
      <PipelineInspector pipeline={pipeline} />
    </div>
  );
}

export default Chat;