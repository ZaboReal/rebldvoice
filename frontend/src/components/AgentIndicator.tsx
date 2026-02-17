"use client";

import { ActiveAgent } from "@/lib/types";

interface AgentIndicatorProps {
  agent: ActiveAgent;
  isConnected: boolean;
}

export default function AgentIndicator({
  agent,
  isConnected,
}: AgentIndicatorProps) {
  const isBob = agent === "bob";

  return (
    <div className="flex items-center gap-3">
      {/* Avatar */}
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold ${
          isBob
            ? "bg-accent-bob/15 text-accent-bob"
            : "bg-accent-alice/15 text-accent-alice"
        }`}
      >
        {isBob ? "B" : "A"}
      </div>

      {/* Name and status */}
      <div>
        <div className="text-sm font-medium text-foreground">
          {isBob ? "Bob" : "Alice"}
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              isConnected ? "bg-green-500" : "bg-muted"
            }`}
          />
          <span className="text-xs text-muted">
            {isConnected
              ? isBob
                ? "Planner"
                : "Specialist"
              : "Connecting..."}
          </span>
        </div>
      </div>
    </div>
  );
}
