"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Room,
  RoomEvent,
  Track,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteParticipant,
  DisconnectReason,
} from "livekit-client";
import AgentIndicator from "@/components/AgentIndicator";
import ChatBubble from "@/components/ChatBubble";
import MicButton from "@/components/MicButton";
import ThinkingIndicator from "@/components/ThinkingIndicator";
import { ChatMessage, ActiveAgent } from "@/lib/types";
import { getToken } from "@/lib/api";

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeAgent, setActiveAgent] = useState<ActiveAgent>("bob");
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [agentVoiceEnabled, setAgentVoiceEnabled] = useState(true);
  const [conversationEnded, setConversationEnded] = useState(false);
  const agentVoiceRef = useRef(true);
  const [roomName, setRoomName] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const connectCalledRef = useRef(false);
  const unmuteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeAgentRef = useRef<ActiveAgent>("bob");

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Keep activeAgent ref in sync so event handlers always read the latest value
  useEffect(() => {
    activeAgentRef.current = activeAgent;
  }, [activeAgent]);

  // Add or update a message
  const upsertMessage = useCallback(
    (id: string, update: Partial<ChatMessage> & { content: string }) => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], ...update };
          return updated;
        }
        return [
          ...prev,
          {
            id,
            role: update.role || "user",
            content: update.content,
            agent: update.agent,
            timestamp: update.timestamp || new Date(),
            isTranscribing: update.isTranscribing,
          },
        ];
      });
    },
    []
  );

  // Connect to LiveKit room
  const connect = useCallback(async () => {
    if (isConnecting || isConnected) return;
    setIsConnecting(true);

    try {
      const { token, url, room_name } = await getToken();
      setRoomName(room_name);

      const room = new Room({
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      roomRef.current = room;

      // Handle agent audio
      room.on(
        RoomEvent.TrackSubscribed,
        (
          track: RemoteTrack,
          publication: RemoteTrackPublication,
          participant: RemoteParticipant
        ) => {
          if (track.kind === Track.Kind.Audio) {
            const el = track.attach();
            el.id = `audio-${participant.identity}`;
            el.muted = !agentVoiceRef.current;
            document.body.appendChild(el);
          }
        }
      );

      room.on(
        RoomEvent.TrackUnsubscribed,
        (track: RemoteTrack) => {
          track.detach().forEach((el) => el.remove());
        }
      );

      // Mute mic while agent is speaking — debounced to prevent rapid toggling
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        // When voice is off, don't mute mic — agent audio is irrelevant
        if (!agentVoiceRef.current) return;

        const isAgentSpeaking = speakers.some(
          (s) => s.identity !== room.localParticipant.identity
        );

        if (isAgentSpeaking) {
          // Agent started speaking — mute immediately
          if (unmuteTimerRef.current) {
            clearTimeout(unmuteTimerRef.current);
            unmuteTimerRef.current = null;
          }
          setAgentSpeaking(true);
          room.localParticipant.setMicrophoneEnabled(false);
          setIsMuted(true);
        } else if (!isAgentSpeaking) {
          // Agent stopped — wait 1.5s before unmuting to ensure fully done
          if (!unmuteTimerRef.current) {
            unmuteTimerRef.current = setTimeout(() => {
              setAgentSpeaking(false);
              room.localParticipant.setMicrophoneEnabled(true);
              setIsMuted(false);
              unmuteTimerRef.current = null;
            }, 1500);
          }
        }
      });

      // Handle data messages (agent switch, instant text responses)
      room.on(RoomEvent.DataReceived, (data: Uint8Array) => {
        try {
          const decoded = JSON.parse(new TextDecoder().decode(data));
          if (decoded.type === "agent_switch") {
            setActiveAgent(decoded.agent as ActiveAgent);
          } else if (decoded.type === "conversation_end") {
            setConversationEnded(true);
            setIsThinking(false);
            roomRef.current?.disconnect();
          } else if (decoded.type === "agent_response" && !agentVoiceRef.current) {
            // Voice is off — show full response text instantly
            setIsThinking(false);
            const msgId = `agent-instant-${Date.now()}`;
            upsertMessage(msgId, {
              content: decoded.text,
              role: "assistant",
              agent: decoded.agent as ActiveAgent,
              timestamp: new Date(),
              isTranscribing: false,
            });
          }
        } catch {
          // Ignore non-JSON data
        }
      });

      // Handle transcription from LiveKit's built-in text streams
      room.on(
        RoomEvent.TranscriptionReceived,
        (segments, participant) => {
          for (const segment of segments) {
            const isAgent = participant?.identity !== room.localParticipant.identity;
            const msgId = isAgent
              ? `agent-${segment.id}`
              : `user-${segment.id}`;

            // Show thinking indicator after user finishes speaking
            if (!isAgent && segment.final) {
              setIsThinking(true);
            }
            // Hide thinking indicator when agent starts responding
            if (isAgent) {
              setIsThinking(false);
            }

            // When voice is off, skip all agent transcription segments
            // (full text arrives instantly via data message instead)
            if (isAgent && !agentVoiceRef.current) {
              continue;
            }

            upsertMessage(msgId, {
              content: segment.text,
              role: isAgent ? "assistant" : "user",
              agent: isAgent ? activeAgentRef.current : undefined,
              timestamp: new Date(),
              isTranscribing: !segment.final,
            });
          }
        }
      );

      room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
        setIsConnected(false);
        roomRef.current = null;
      });

      await room.connect(url, token);
      await room.localParticipant.setMicrophoneEnabled(true);

      setIsConnected(true);
    } catch (err) {
      console.error("Failed to connect:", err);
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting, isConnected, activeAgent, upsertMessage]);

  // Auto-connect on mount — guarded against React Strict Mode double-mount
  useEffect(() => {
    if (connectCalledRef.current) return;
    connectCalledRef.current = true;
    connect();
    return () => {
      if (unmuteTimerRef.current) clearTimeout(unmuteTimerRef.current);
      roomRef.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toggle mute (manual control — only when agent is not speaking)
  const handleMicToggle = useCallback(async () => {
    const room = roomRef.current;
    if (!room || agentSpeaking) return;
    const newMuted = !isMuted;
    await room.localParticipant.setMicrophoneEnabled(!newMuted);
    setIsMuted(newMuted);
  }, [isMuted, agentSpeaking]);

  const handleNewConversation = useCallback(() => {
    if (unmuteTimerRef.current) clearTimeout(unmuteTimerRef.current);
    roomRef.current?.disconnect();
    roomRef.current = null;
    connectCalledRef.current = false;
    setMessages([]);
    setActiveAgent("bob");
    activeAgentRef.current = "bob";
    setIsConnected(false);
    setIsConnecting(false);
    setIsMuted(false);
    setAgentSpeaking(false);
    setIsThinking(false);
    setConversationEnded(false);
    setRoomName(null);
    // Reconnect with a fresh room
    setTimeout(() => {
      connectCalledRef.current = true;
      connect();
    }, 100);
  }, [connect]);

  const handleEndConversation = useCallback(() => {
    setConversationEnded(true);
    setIsThinking(false);
    roomRef.current?.disconnect();
  }, []);

  const toggleAgentVoice = useCallback(() => {
    const next = !agentVoiceEnabled;
    setAgentVoiceEnabled(next);
    agentVoiceRef.current = next;
    // Mute/unmute all existing agent audio elements
    document.querySelectorAll<HTMLAudioElement>("audio[id^='audio-']").forEach((el) => {
      el.muted = !next;
    });
  }, [agentVoiceEnabled]);

  return (
    <div className="flex h-screen">
      <main className="flex-1 flex flex-col">
        {/* Header with agent indicator */}
        <header className="px-6 py-3 border-b border-sidebar-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AgentIndicator agent={activeAgent} isConnected={isConnected} />
            <button
              onClick={handleNewConversation}
              className="text-xs px-2 py-1 rounded bg-white/10 text-foreground hover:bg-white/15 transition-colors"
            >
              + New
            </button>
          </div>

          <div className="flex items-center gap-2">
            {isConnected && !conversationEnded && (
              <>
                <button
                  onClick={toggleAgentVoice}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    agentVoiceEnabled
                      ? "bg-white/10 text-foreground"
                      : "bg-red-500/20 text-red-400"
                  }`}
                >
                  {agentVoiceEnabled ? "🔊 Voice On" : "🔇 Voice Off"}
                </button>
                <button
                  onClick={handleEndConversation}
                  className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                >
                  End
                </button>
                <span className="text-xs text-muted bg-white/5 px-2 py-1 rounded">
                  {roomName}
                </span>
              </>
            )}
            {conversationEnded && (
              <span className="text-xs text-muted bg-white/5 px-2 py-1 rounded">
                Session ended
              </span>
            )}
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {messages.length === 0 && isConnected && (
            <div className="text-center text-muted text-sm mt-20">
              <p>Connected. Listening...</p>
              <p className="mt-1 text-xs">
                Start speaking to begin your renovation consultation.
              </p>
            </div>
          )}

          {!isConnected && !isConnecting && (
            <div className="text-center text-muted text-sm mt-20">
              <p>Disconnected.</p>
              <button
                onClick={connect}
                className="mt-2 text-foreground underline text-xs"
              >
                Reconnect
              </button>
            </div>
          )}

          {isConnecting && (
            <div className="text-center text-muted text-sm mt-20">
              <p>Connecting...</p>
            </div>
          )}

          {messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} />
          ))}
          {isThinking && <ThinkingIndicator agent={activeAgent} />}
          <div ref={messagesEndRef} />
        </div>

        {/* Bottom bar */}
        <footer className="px-6 py-4 border-t border-sidebar-border">
          {conversationEnded ? (
            <div className="text-center text-muted text-sm">
              Conversation ended. Thanks for using Rebld!
            </div>
          ) : (
            <div className="flex items-center justify-center gap-4">
              <MicButton
                isActive={isConnected && !isMuted}
                isMuted={isMuted || agentSpeaking}
                onToggle={handleMicToggle}
                disabled={!isConnected || agentSpeaking}
              />
              <span className="text-xs text-muted">
                {agentSpeaking
                  ? "Agent speaking..."
                  : isMuted
                  ? "Microphone muted"
                  : isConnected
                  ? "Listening..."
                  : "Not connected"}
              </span>
            </div>
          )}
        </footer>
      </main>
    </div>
  );
}
