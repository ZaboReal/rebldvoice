"use client";

import { ChatMessage } from "@/lib/types";

interface ChatBubbleProps {
  message: ChatMessage;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === "user";
  const isBob = message.agent === "bob";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div className={`max-w-[75%] ${isUser ? "items-end" : "items-start"}`}>
        {/* Agent label */}
        {!isUser && message.agent && (
          <span
            className={`text-xs font-medium mb-1 block ${
              isBob ? "text-accent-bob/70" : "text-accent-alice/70"
            }`}
          >
            {isBob ? "Bob" : "Alice"}
          </span>
        )}

        {/* Bubble */}
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? "bg-chat-bubble-user text-foreground rounded-br-md"
              : "bg-chat-bubble-agent text-foreground rounded-bl-md"
          } ${message.isTranscribing ? "opacity-60 italic" : ""}`}
        >
          {message.content}
          {message.isTranscribing && (
            <span className="inline-block ml-1 animate-pulse">...</span>
          )}
        </div>

        {/* Timestamp */}
        <div
          className={`text-xs text-muted/50 mt-1 ${
            isUser ? "text-right" : "text-left"
          }`}
        >
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}
