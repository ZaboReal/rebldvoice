export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  agent?: "bob" | "alice";
  timestamp: Date;
  isTranscribing?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  preview: string;
  timestamp: Date;
  agents: ("bob" | "alice")[];
}

export type ActiveAgent = "bob" | "alice";
