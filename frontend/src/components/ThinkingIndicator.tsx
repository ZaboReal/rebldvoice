"use client";

import { ActiveAgent } from "@/lib/types";

interface ThinkingIndicatorProps {
  agent: ActiveAgent;
}

export default function ThinkingIndicator({ agent }: ThinkingIndicatorProps) {
  const isBob = agent === "bob";

  return (
    <div className="flex justify-start mb-3">
      <div>
        <span
          className={`text-xs font-medium mb-1 block ${
            isBob ? "text-accent-bob/70" : "text-accent-alice/70"
          }`}
        >
          {isBob ? "Bob" : "Alice"}
        </span>
        <div className="bg-chat-bubble-agent rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
          <span className="thinking-dot" style={{ animationDelay: "0ms" }} />
          <span className="thinking-dot" style={{ animationDelay: "150ms" }} />
          <span className="thinking-dot" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}
