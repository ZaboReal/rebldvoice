# Reflections & Future Improvements

## What We Built

A real-time voice assistant with two transferable AI agents (Bob and Alice) for home renovation planning. The system handles voice input, routes through a LangGraph state machine, streams token-level responses to TTS, and delivers audio back to the user — all in real time over WebRTC.

The core challenge was making all the moving parts feel like a single, cohesive conversation: seamless agent transfers with voice switching, live transcription, echo prevention, and low-latency responses.

---

## 1. Interruptable Conversation

### Current State

We set `allow_interruptions=True` on the LiveKit agent to avoid blocking the pipeline while TTS is playing. However, true conversational interruption — where a user cuts in mid-sentence and the agent stops talking and responds to the interruption — is not fully implemented.

The original design used `allow_interruptions=False` to prevent echo feedback (the agent's own audio being picked up by the user's microphone and interpreted as new input). This was a hardware-specific workaround for a Mac audio routing issue where system audio bled into the microphone input.

### How to Improve

**Short term — server-side interrupt handling:**
```
1. Set allow_interruptions=True (already done)
2. Configure the LiveKit agent pipeline's interrupt behavior:
   - min_interruption_duration: require 300-500ms of user speech
     before treating it as an intentional interruption (filters
     out coughs, background noise)
   - interrupt_min_words: require at least 2-3 words of STT output
     before interrupting the agent
3. On interrupt: cancel current TTS playback, flush audio buffers,
   process the new user input immediately
```

**Medium term — client-side interrupt signaling:**
```
1. Use the browser's VAD (or LiveKit's client-side VAD) to detect
   when the user starts speaking while the agent is talking
2. Send a data message to the backend: { type: "user_interrupt" }
3. Backend receives the signal and immediately:
   - Stops the current TTS synthesis
   - Cancels any queued audio frames
   - Waits for the full user utterance via STT
   - Processes the new message through LangGraph
4. Frontend stops playing agent audio and shows a visual indicator
   that the agent was interrupted
```

**Long term — full duplex conversation:**
```
1. Run VAD continuously on both sides (user and agent)
2. Use a turn-taking model that predicts when the user wants to
   speak vs. is just making backchannel noises ("uh huh", "yeah")
3. Implement graceful interruption: agent finishes current sentence
   before yielding the floor, rather than cutting off abruptly
4. Consider using LiveKit's built-in turn detection features as
   they mature in future SDK versions
```

---

## 2. Better Intent Routing

### Current State

Agent routing is handled by the LLM itself — each agent has a `transfer_to_agent` tool and decides when to use it based on its system prompt. The LLM determines both *whether* to transfer and *what summary* to include. This works but has limitations:

- **Latency**: The full LLM call must complete before a transfer is detected
- **Reliability**: The LLM occasionally misses transfer signals or transfers prematurely
- **Granularity**: No intermediate routing — it's all-or-nothing per turn

### How to Improve

**Classifier-based pre-routing:**
```
1. Before sending user input to the active agent, run a fast
   classifier (e.g., a fine-tuned small model or embedding-based
   similarity) that predicts the intent category:
   - INTAKE: room, budget, timeline, scope questions
   - TECHNICAL: permits, materials, sequencing, costs
   - TRANSFER_REQUEST: explicit "talk to Alice/Bob"
   - CHITCHAT: greetings, thanks, off-topic
   - END: goodbye, wrap-up

2. Use the classifier output to:
   - Route to the correct agent BEFORE the LLM call (saves a
     full round-trip when the wrong agent is active)
   - Add routing context to the system prompt ("The user's
     intent appears to be TECHNICAL — consider transferring
     if you're not the right agent")
   - Skip the LLM entirely for simple cases (e.g., "thanks"
     → short acknowledgment without full inference)
```

**Structured transfer protocol:**
```
1. Replace free-form transfer summaries with structured handoff:
   {
     "gathered_requirements": { "room": "kitchen", "budget": 25000 },
     "open_questions": ["load-bearing wall assessment"],
     "user_sentiment": "confident",
     "conversation_stage": "technical_deep_dive"
   }

2. The receiving agent gets structured context instead of prose,
   reducing hallucination and ensuring nothing is lost in transfer

3. Store this structured state in the LangGraph checkpointer so
   it persists across transfers and can be displayed in the UI
```

**Multi-agent orchestrator pattern:**
```
1. Add a lightweight "orchestrator" node that runs before
   either agent, using a smaller/faster model
2. The orchestrator reads the user message + current state
   and decides: { route: "bob" | "alice", confidence: 0.95 }
3. Only if confidence is low does it fall through to the
   current agent's own transfer logic
4. This separates routing concerns from response generation
```

---

## 3. Echo Reduction & Audio Buffering

### Current State

Echo prevention uses three layers:
1. **Browser-level**: `echoCancellation: true` in WebRTC audio capture defaults
2. **Frontend mic muting**: Microphone is disabled while the agent is speaking (via `ActiveSpeakersChanged` events) with a 1.5s debounced unmute
3. **Pipeline-level**: `allow_interruptions=True` means the pipeline accepts new input anytime, relying on the frontend to gate the microphone

This approach works but is fragile — the 1.5s unmute delay adds latency, and if the browser's AEC (Acoustic Echo Cancellation) fails, the agent hears its own voice.

### How to Improve

**Server-side echo cancellation:**
```
1. Use LiveKit's built-in echo cancellation features:
   - Configure krisp noise cancellation on the agent's audio
     input (available as a LiveKit plugin)
   - This runs server-side, independent of the browser's AEC

2. Add a reference audio stream:
   - Feed the agent's TTS output as a reference signal to the
     echo canceller
   - The echo canceller subtracts the reference from the mic
     input, eliminating echo even with speakers at full volume
```

**Smarter mic gating:**
```
1. Replace the blunt "mute while agent speaks" approach with
   energy-based gating:
   - Monitor the user's audio energy level
   - Only forward audio to STT when energy exceeds a threshold
     AND the agent's TTS is not actively playing
   - Use a short look-ahead buffer (200ms) to capture the
     start of speech that triggered the gate

2. Implement a "barge-in" detector:
   - If user energy is high AND sustained (>500ms) while agent
     is speaking, treat it as an intentional interruption
   - If user energy is low or transient, treat it as echo/noise
     and suppress it
```

**Audio buffering improvements:**
```
1. Pre-buffer TTS audio:
   - Start synthesizing the next sentence while the current
     one is playing
   - Maintain a 1-2 sentence audio buffer ahead of playback
   - This eliminates gaps between sentences entirely

2. Adaptive jitter buffer:
   - Monitor network conditions and adjust the audio buffer
     size dynamically
   - Smaller buffer = lower latency but more glitches
   - Larger buffer = smoother playback but more delay
   - Target: 50-100ms buffer for local connections,
     200-300ms for remote

3. Opus codec optimization:
   - Use Opus at 24kHz mono for agent speech (matches TTS output)
   - Configure for low-latency mode (frame size 20ms)
   - Enable FEC (Forward Error Correction) for packet loss
     resilience
```

---

## 4. UX/UI: Conversation Sidebar & History

### Current State

The sidebar was built initially but removed to simplify the interface during development. Conversations are ephemeral — they exist only in the LiveKit room's lifetime and the LangGraph MemorySaver (in-memory, lost on restart).

### How to Improve

**Persistent conversation storage:**
```
1. Replace MemorySaver with a persistent checkpointer:
   - PostgreSQL via langgraph-checkpoint-postgres
   - Or SQLite via langgraph-checkpoint-sqlite
   - This preserves full conversation history across restarts

2. Add a conversations table:
   CREATE TABLE conversations (
     id TEXT PRIMARY KEY,
     title TEXT,
     created_at TIMESTAMP,
     updated_at TIMESTAMP,
     active_agent TEXT,
     message_count INTEGER,
     summary TEXT
   );

3. Auto-generate titles:
   - After the first 2-3 exchanges, use a fast LLM call to
     generate a short title (e.g., "Kitchen Remodel - $25k")
   - Update the title as the conversation evolves
```

**Sidebar implementation:**
```
1. API endpoints:
   - GET  /api/conversations         → list all conversations
   - GET  /api/conversations/:id     → get conversation details
   - DELETE /api/conversations/:id   → delete a conversation

2. Frontend sidebar component:
   - List conversations sorted by last updated
   - Show title, preview (last message snippet), timestamp
   - Show which agents participated (Bob/Alice badges)
   - Click to load: fetch conversation state from backend,
     reconnect to LiveKit room with same conversation_id
   - Search/filter conversations

3. Resume flow:
   - When loading an old conversation, pass the conversation_id
     as the LiveKit room name
   - The LangGraph checkpointer restores full message history
   - The agent picks up where it left off with full context
   - Display previous messages in the chat (fetched from backend)
```

**Conversation export:**
```
1. Add an "Export" button per conversation
2. Generate a formatted summary:
   - Requirements gathered
   - Technical advice from Alice
   - Final to-do list from Bob
   - Estimated costs and timeline
3. Export as PDF or markdown
```

---

## 5. Better Speech Model (ElevenLabs)

### Current State

We use OpenAI's `gpt-4o-mini-tts` with two voices:
- Bob: "ash" (warm, conversational)
- Alice: "coral" (clear, precise)

OpenAI TTS is functional but has limitations:
- Limited voice customization
- No voice cloning
- Occasional unnatural prosody on technical content
- No emotion or emphasis control beyond the `instructions` parameter

### How to Improve

**ElevenLabs integration:**
```
1. Install the LiveKit ElevenLabs plugin:
   pip install livekit-plugins-elevenlabs

2. Replace the TTS initialization:
   from livekit.plugins import elevenlabs

   shared_tts = elevenlabs.TTS(
       voice_id="pNInz6obpgDQGcFmaJgB",  # Custom voice
       model_id="eleven_turbo_v2_5",       # Low-latency model
       stability=0.5,
       similarity_boost=0.75,
       style=0.3,
       use_speaker_boost=True,
   )

3. Benefits over OpenAI TTS:
   - 29+ languages with natural prosody
   - Voice cloning: create custom voices for Bob and Alice
     that sound distinctly different
   - Emotion control: adjust stability, similarity, and style
     per-utterance for more expressive speech
   - Lower latency with turbo models
   - Streaming synthesis with websocket API
```

**Voice design for agents:**
```
1. Bob (Intake + Planner):
   - Clone or select a warm, friendly male voice
   - Higher stability (0.6-0.7) for consistent, reassuring tone
   - Moderate style (0.3) for natural conversational feel
   - Slightly faster speed for quick back-and-forth

2. Alice (Technical Specialist):
   - Clone or select a clear, authoritative female voice
   - Lower stability (0.4-0.5) for more expressive delivery
   - Higher similarity_boost (0.8) for precision
   - Normal speed with emphasis on technical terms
```

**Dynamic voice parameters:**
```
1. Adjust TTS parameters based on content:
   - Lists/steps: slower pace, higher stability
   - Warnings/risks: lower stability for emphasis
   - Greetings/chitchat: higher style for warmth
   - Technical details: higher similarity for clarity

2. Implementation:
   - Analyze the response text before TTS synthesis
   - Set per-utterance voice parameters
   - ElevenLabs API supports per-request parameter overrides
```

**Hybrid approach:**
```
1. Use ElevenLabs for agent speech (higher quality)
2. Keep OpenAI STT for transcription (best accuracy)
3. This gives the best of both worlds:
   - Superior voice quality for output
   - Best-in-class speech recognition for input
4. LiveKit's plugin system makes this swap straightforward —
   just change the TTS plugin, everything else stays the same
```

---

## 6. Transfer Intent Detection

### Current Approach

Transfers between agents are driven entirely by the LLM. Each agent (Bob and Alice) is bound with a `transfer_to_agent` tool. When the user says something like "transfer me to Alice" or asks a question outside the current agent's domain, the LLM decides to call the tool with a `target_agent` and a free-text `summary`.

The flow:
1. User message enters `llm_node` in the agent worker
2. LangGraph routes to the active agent's node (bob or alice)
3. The agent's LLM processes the full message history with its system prompt
4. If the LLM decides to transfer, it emits a `transfer_to_agent` tool call
5. `check_for_tool_calls` detects the tool call and routes to `handle_transfer`
6. `handle_transfer` updates `active_agent` in graph state and sets the `handoff_summary`
7. LangGraph re-routes to the new agent, who responds with the transfer context

### Why This Approach

- **Simplicity**: No separate classifier or routing model — the LLM handles intent detection, transfer decisions, and response generation in a single call
- **Context-aware**: The LLM sees the full conversation history, so it can make nuanced transfer decisions (e.g., a question about "countertops" from Bob might not need transfer if it's about preferences, but should transfer if it's about material properties)
- **Zero training data**: No labeled dataset needed — the system prompt defines when to transfer

### Tradeoffs

| Pro | Con |
|-----|-----|
| Single model, no extra infra | Full LLM call before transfer is detected (adds latency) |
| Context-aware decisions | LLM occasionally misses explicit transfer requests |
| No training data needed | No confidence score — it either transfers or doesn't |
| Easy to adjust via prompt | Transfer decision is opaque (hard to debug why it did/didn't transfer) |

### How to Improve

A hybrid approach would give the best of both worlds:

1. **Fast pre-classifier** — Run a lightweight model (or even regex for explicit requests like "talk to Alice") before the main LLM call. If it detects a clear transfer intent with high confidence, skip the current agent's LLM call entirely and route directly.

2. **Fallback to LLM** — When the pre-classifier is uncertain, fall through to the current agent and let the LLM decide as it does today. This handles ambiguous cases where transfer is a judgment call.

3. **Orchestrator node** — Add a dedicated routing node in the LangGraph graph that runs a smaller, faster model. This separates "who should handle this?" from "what should the response be?", reducing latency for clear-cut cases while preserving quality for edge cases.

---

## 7. State & Memory Across Transfers

### Current Approach

Conversation state is managed by LangGraph's `AgentState`:

```python
class AgentState(TypedDict):
    messages: Annotated[list, add_messages]  # Full message history
    active_agent: str                        # "bob" or "alice"
    handoff_summary: str                     # Free-text summary from outgoing agent
    conversation_ended: bool                 # Set by end_conversation tool
```

When a transfer happens:
1. The outgoing agent produces a `handoff_summary` as a tool call argument — a free-text string describing what was discussed and what the user needs
2. `handle_transfer` stores this summary in graph state
3. The incoming agent's system prompt is augmented with the summary via `TRANSFER_CONTEXT_TEMPLATE`
4. The incoming agent also sees the **full message history** (all prior messages from both agents), not just the summary

Memory is backed by LangGraph's `MemorySaver` — an in-memory checkpointer keyed by `thread_id` (which is the LiveKit room name). This means conversation state persists across turns within a session but is lost on server restart.

### Why This Approach

- **Full context preservation**: The incoming agent sees every message, not just a summary. This prevents information loss during transfers — Alice can reference something the user told Bob 10 messages ago.
- **Cheap and fast**: `MemorySaver` has zero I/O overhead (it's a Python dict). No database, no serialization.
- **Natural handoff**: The free-text summary lets the outgoing agent frame the handoff in their own words, which reads naturally in the conversation flow.

### Tradeoffs

| Pro | Con |
|-----|-----|
| Full message history preserved | Message list grows unbounded — eventually hits context limits |
| Zero I/O overhead (in-memory) | State lost on server restart |
| Free-text summary is natural | Summary quality depends on LLM — can be vague or miss details |
| Simple implementation | No structured data extraction (requirements, budget, timeline aren't stored as fields) |

### How to Improve

1. **Persistent checkpointer** — Replace `MemorySaver` with `langgraph-checkpoint-postgres` or `langgraph-checkpoint-sqlite` so conversations survive restarts and can be resumed later.

2. **Structured handoff state** — Instead of free-text summaries, extract structured data during transfers:
   ```python
   handoff_data = {
       "gathered_requirements": {"room": "kitchen", "budget": 25000},
       "open_questions": ["load-bearing wall assessment"],
       "conversation_stage": "technical_deep_dive"
   }
   ```
   This makes the handoff deterministic and allows the UI to display progress (e.g., "Budget: $25k, Room: Kitchen").

3. **Sliding window + summary** — As the message list grows, periodically summarize older messages and trim the history. Keep the last N messages verbatim + a running summary of everything before. This prevents context window overflow on long conversations.

---

## 8. Key Tradeoffs & Next Steps

### Architecture Tradeoffs We Made

| Decision | What we chose | Alternative | Why |
|----------|--------------|-------------|-----|
| **Routing** | LLM-driven via tool calls | Separate classifier model | Simpler, no training data, good enough for 2 agents |
| **Voice switching** | In-place `update_options()` on shared TTS | Separate TTS instances per agent | LiveKit pipeline holds a single TTS reference — mutating in place is the only way to switch mid-stream |
| **State persistence** | In-memory `MemorySaver` | PostgreSQL/SQLite checkpointer | Fast iteration during development, no infra needed |
| **Transfer detection** | Mid-stream via `langgraph_node` metadata | Post-stream state check only | Enables voice switch before first token from new agent (lower perceived latency) |
| **Echo prevention** | Frontend mic muting + browser AEC | Server-side echo cancellation (Krisp) | Works without extra dependencies, but fragile with some hardware |
| **Text display (voice off)** | Dual channel: data message for instant text | Single channel: just speed up transcription | Instant display regardless of TTS speed, clean separation of concerns |

