"use client";

import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  return (
    <div className="flex h-screen">
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-6">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted"
            >
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-foreground mb-2">
            Rebld Voice Assistant
          </h2>
          <p className="text-sm text-muted mb-6 leading-relaxed">
            Plan your home renovation with Bob and Alice. Bob helps with
            planning and intake. Alice handles the technical details.
          </p>
          <button
            onClick={() => router.push("/chat")}
            className="bg-white/10 hover:bg-white/15 text-sm font-medium text-foreground rounded-lg px-6 py-2.5 transition-colors"
          >
            Start a conversation
          </button>
        </div>
      </main>
    </div>
  );
}
