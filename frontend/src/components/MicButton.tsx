"use client";

interface MicButtonProps {
  isActive: boolean;
  isMuted: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export default function MicButton({
  isActive,
  isMuted,
  onToggle,
  disabled = false,
}: MicButtonProps) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`relative w-14 h-14 rounded-full flex items-center justify-center transition-all ${
        disabled
          ? "bg-white/5 text-muted cursor-not-allowed"
          : isMuted
          ? "bg-white/10 hover:bg-white/15 text-muted"
          : isActive
          ? "bg-white/20 text-foreground mic-pulse"
          : "bg-white/10 hover:bg-white/15 text-foreground"
      }`}
      title={isMuted ? "Unmute microphone" : "Mute microphone"}
    >
      {isMuted ? (
        /* Mic off icon */
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
          <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .34-.03.67-.08 1" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      ) : (
        /* Mic on icon */
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      )}
    </button>
  );
}
