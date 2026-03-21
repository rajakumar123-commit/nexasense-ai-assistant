// ============================================================
// ConversationSidebar.jsx — NexaSense
// Fix 3: accepts isOpen + onClose props for mobile drawer
// ============================================================

import React from "react";

function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  isOpen,
  onClose
}) {

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[190] md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${isOpen ? "open" : ""} md:relative md:transform-none md:z-auto`}>

        {/* Header */}
        <div className="p-4 border-b border-slate-800 dark:border-slate-800 flex items-center gap-2">
          <button
            onClick={onNewChat}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-md font-medium transition text-sm"
          >
            + New Chat
          </button>
          {/* Close — mobile only */}
          <button
            onClick={onClose}
            className="md:hidden p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition"
            aria-label="Close sidebar"
          >
            ✕
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 && (
            <p className="text-slate-400 text-sm px-3 py-2">No conversations yet</p>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => { onSelect(c.id); onClose?.(); }}
              className={`w-full text-left px-3 py-2 rounded-md text-sm truncate transition
                ${c.id === activeId
                  ? "bg-slate-700 text-white"
                  : "text-slate-300 hover:bg-slate-800"
                }`}
            >
              {c.title || "New Chat"}
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}

export default ConversationSidebar;