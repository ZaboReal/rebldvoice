"use client";

import { Conversation } from "@/lib/types";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
}

function formatTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } else if (days === 1) {
    return "Yesterday";
  } else if (days < 7) {
    return date.toLocaleDateString([], { weekday: "long" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
}: SidebarProps) {
  return (
    <aside className="w-64 h-full bg-sidebar-bg border-r border-sidebar-border flex flex-col">
      {/* Header */}
      <div className="px-4 py-4 border-b border-sidebar-border">
        <h1 className="text-sm font-semibold tracking-wide text-foreground">
          Rebld Voice
        </h1>
      </div>

      {/* Search */}
      <div className="px-3 py-3">
        <input
          type="text"
          placeholder="Search or start new chat"
          className="w-full bg-input-bg text-sm text-foreground placeholder-muted rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-muted/30"
        />
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2">
        {conversations.map((conv) => (
          <button
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={`w-full text-left px-3 py-3 rounded-lg mb-0.5 transition-colors ${
              activeId === conv.id
                ? "bg-white/5"
                : "hover:bg-white/[0.03]"
            }`}
          >
            <div className="flex justify-between items-baseline">
              <span className="text-sm font-medium text-foreground truncate">
                {conv.title}
              </span>
              <span className="text-xs text-muted ml-2 shrink-0">
                {formatTime(conv.timestamp)}
              </span>
            </div>
            <p className="text-xs text-muted mt-0.5 truncate">{conv.preview}</p>
          </button>
        ))}
      </div>

      {/* New chat button */}
      <div className="px-3 py-3 border-t border-sidebar-border">
        <button
          onClick={onNewChat}
          className="w-full bg-white/10 hover:bg-white/15 text-sm font-medium text-foreground rounded-lg px-4 py-2.5 transition-colors"
        >
          + NEW CHAT
        </button>
      </div>
    </aside>
  );
}
