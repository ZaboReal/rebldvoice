# Rebld Voice Assistant

A voice-based AI assistant for home renovation planning. Two agents — **Bob** (intake & planning) and **Alice** (technical specialist) — collaborate through seamless handoffs to help homeowners plan their projects.

Built with LangGraph, LiveKit, FastAPI, and Next.js.

## Prerequisites

- Python 3.10+
- Node.js 20+
- [OpenAI API key](https://platform.openai.com/api-keys)
- [LiveKit Cloud account](https://cloud.livekit.io/) 

## Project Structure

```
backend/
  agents/        # Agent prompts and tools
  graph/         # LangGraph state machine
  server/        # FastAPI routes
  voice/         # LiveKit agent worker
  main.py        # API server entry point
  config.py      # Environment config
frontend/
  src/app/       # Next.js pages
  src/components/ # React components
  src/lib/       # API client and types
```

## Setup

### 1. Clone and install backend dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure environment variables



Edit `backend/.env`:

```
OPENAI_API_KEY=sk-...
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=API...
LIVEKIT_API_SECRET=...
```

### 3. Install frontend dependencies

```bash
cd frontend
npm install
```

### 4. Configure frontend environment

Create `frontend/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

## Running

You need **three terminals** running simultaneously:

### Terminal 1: FastAPI server

```bash
cd backend
python main.py
```

Runs on `http://localhost:8000`. API routes are under `/api`.

### Terminal 2: LiveKit agent worker

```bash
cd backend
python voice/agent_worker.py dev
```

Connects to LiveKit Cloud and registers the `renovation-assistant` agent. The `dev` flag enables hot-reload on file changes.

### Terminal 3: Next.js frontend

```bash
cd frontend
npm run dev
```

Runs on `http://localhost:3000`. Open this in your browser.

## Usage

1. Open `http://localhost:3000` and click **Start a conversation**
2. Allow microphone access when prompted
3. Start speaking — Bob will respond to help plan your renovation
4. Bob handles intake (room, budget, timeline, scope) and produces to-do lists
5. When you need technical advice, say **"transfer me to Alice"** — she handles permits, sequencing, materials, cost breakdowns, and risks
6. When you're done with technical questions, say **"transfer me back to Bob"** — he'll summarize and give you action items
7. Agents may suggest a transfer, but you can always request one manually at any time

### Example Projects to Try

- "I want to remodel my kitchen — new countertops, cabinets, and flooring."
- "I'm adding a bathroom to my basement."
- "I need to finish my attic and turn it into a bedroom."
- "My deck is falling apart, I want to rebuild it."
- "I'm knocking down a wall between my kitchen and living room to make an open floor plan."
- "I want to convert my garage into a home office."
- "My roof is 20 years old, I think it's time to replace it."
- "I'm renovating a fixer-upper — the whole house needs work."

### Controls

| Control | Description |
|---------|-------------|
| **Voice On/Off** | Toggle agent speech. Voice off shows text instantly |
| **End** | End the current conversation |
| **+ New** | Start a fresh conversation |
| **Mic button** | Mute/unmute your microphone |

## Architecture

```
Browser (Next.js)
  ↕ WebRTC audio + data messages
LiveKit Cloud
  ↕ LiveKit Agents SDK
Agent Worker (Python)
  → STT (OpenAI gpt-4o-transcribe)
  → LangGraph (router → bob/alice → transfer logic)
  → TTS (OpenAI gpt-4o-mini-tts)
  ↕ REST API
FastAPI Server
```

- **LangGraph** manages conversation state, agent routing, and transfers with a memory checkpointer
- **LiveKit** handles real-time voice I/O (WebRTC), speech-to-text, and text-to-speech
- **Token-level streaming** from LangGraph to TTS for low-latency speech
- **Agent transfers** switch TTS voice in-place mid-stream via `update_options()`

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/token` | Get a LiveKit room token |
| POST | `/api/chat` | REST chat endpoint (non-voice) |
| GET | `/api/conversations/:id` | Get conversation state |
| GET | `/api/health` | Health check |
