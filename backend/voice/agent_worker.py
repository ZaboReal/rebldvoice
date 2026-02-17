import sys
import os

# Add backend root to path so we can import our modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

import json
import logging

from livekit import agents
from livekit.agents import AgentSession, Agent, AgentServer, ModelSettings, room_io
from livekit.plugins import openai, silero
from langchain_core.messages import HumanMessage

from graph.builder import build_graph

logger = logging.getLogger("renovation-agent")

BOB_VOICE = "ash"
ALICE_VOICE = "coral"


class RenovationAgent(Agent):
    def __init__(self, graph, conversation_id: str, room, shared_tts):
        super().__init__(
            instructions="",
            tts=shared_tts,
            allow_interruptions=True,
        )
        self._graph = graph
        self._conversation_id = conversation_id
        self._active_agent = "bob"
        self._room = room
        self._shared_tts = shared_tts

    @property
    def active_agent(self) -> str:
        return self._active_agent

    async def llm_node(self, chat_ctx, tools, model_settings: ModelSettings):
        """Override LLM node to route through our LangGraph agent graph with streaming."""
        # Extract the latest user message from LiveKit's chat context
        user_msg = None
        for msg in reversed(list(chat_ctx.messages())):
            if msg.role == "user":
                user_msg = msg.text_content
                break

        if not user_msg:
            return

        config = {"configurable": {"thread_id": self._conversation_id}}

        # Read the current active agent from graph state
        current_state = self._graph.get_state(config)
        active_before = (
            current_state.values.get("active_agent", "bob")
            if current_state.values
            else "bob"
        )

        logger.info(f"[{active_before}] User: {user_msg}")

        input_state = {
            "messages": [HumanMessage(content=user_msg)],
            "active_agent": active_before,
        }

        # Stream tokens from LangGraph for smoother, lower-latency TTS
        full_response = []
        transfer_happened = False
        async for event in self._graph.astream_events(
            input_state, config, version="v2"
        ):
            if event["event"] == "on_chat_model_stream":
                chunk = event["data"]["chunk"]
                # Skip tool-call chunks (e.g. transfer_to_agent calls)
                if getattr(chunk, "tool_call_chunks", None):
                    continue
                if (
                    hasattr(chunk, "content")
                    and isinstance(chunk.content, str)
                    and chunk.content
                ):
                    # Detect transfer mid-stream: switch voice in-place
                    # BEFORE yielding any text from the new agent
                    node = event.get("metadata", {}).get("langgraph_node", "")
                    if node in ("bob", "alice") and node != self._active_agent:
                        if not transfer_happened:
                            transfer_happened = True
                            logger.info(f"Transfer: {self._active_agent} → {node}")
                            self._active_agent = node
                            voice = ALICE_VOICE if node == "alice" else BOB_VOICE
                            # Update voice in-place on the shared TTS instance
                            self._shared_tts.update_options(voice=voice)
                            await self._notify_agent_switch(node)

                    full_response.append(chunk.content)
                    yield chunk.content

        # Safety net: check final state for transfers we missed mid-stream
        if not transfer_happened:
            final_state = self._graph.get_state(config)
            new_agent = (
                final_state.values.get("active_agent", active_before)
                if final_state.values
                else active_before
            )
            if new_agent != self._active_agent:
                transfer_happened = True
                logger.info(f"Transfer (post-stream): {self._active_agent} → {new_agent}")
                self._active_agent = new_agent
                voice = ALICE_VOICE if new_agent == "alice" else BOB_VOICE
                self._shared_tts.update_options(voice=voice)
                await self._notify_agent_switch(new_agent)

        response_text = "".join(full_response)
        if response_text:
            logger.info(f"[{self._active_agent}] Response: {response_text[:100]}...")
            # Publish full text as data message for instant display when voice is off
            try:
                await self._room.local_participant.publish_data(
                    payload=json.dumps({
                        "type": "agent_response",
                        "text": response_text,
                        "agent": self._active_agent,
                    }).encode(),
                    reliable=True,
                    topic="agent.events",
                )
            except Exception as e:
                logger.warning(f"Failed to publish agent response data: {e}")

        # Check if conversation was ended
        check_state = self._graph.get_state(config)
        if check_state.values and check_state.values.get("conversation_ended"):
            logger.info("Conversation ended by agent")
            try:
                await self._room.local_participant.publish_data(
                    payload=json.dumps({"type": "conversation_end"}).encode(),
                    reliable=True,
                    topic="agent.events",
                )
            except Exception as e:
                logger.warning(f"Failed to publish conversation end: {e}")

    async def _notify_agent_switch(self, agent_name: str):
        """Send a data message to the frontend so it can update the UI."""
        try:
            await self._room.local_participant.publish_data(
                payload=json.dumps({
                    "type": "agent_switch",
                    "agent": agent_name,
                }).encode(),
                reliable=True,
                topic="agent.events",
            )
        except Exception as e:
            logger.warning(f"Failed to notify frontend of agent switch: {e}")


def setup(proc: agents.JobProcess):
    proc.userdata["vad"] = silero.VAD.load()


async def entrypoint(ctx: agents.JobContext):
    conversation_id = ctx.room.name
    graph = build_graph()

    # Single shared TTS instance — voice is switched in-place via update_options()
    shared_tts = openai.TTS(model="gpt-4o-mini-tts", voice=BOB_VOICE)

    agent = RenovationAgent(graph, conversation_id, ctx.room, shared_tts)

    session = AgentSession(
        stt=openai.STT(model="gpt-4o-transcribe"),
        llm=openai.LLM(model="gpt-5"),
        tts=shared_tts,
        vad=silero.VAD.load(
            min_silence_duration=0.8,
            activation_threshold=0.6,
        ),
    )

    await session.start(
        room=ctx.room,
        agent=agent,
        room_options=room_io.RoomOptions(
            audio_input=True,
            audio_output=True,
            text_input=True,
            text_output=True,
        ),
    )

    # No initial greeting — user speaks first


server = AgentServer(setup_fnc=setup)
server.rtc_session(entrypoint, agent_name="renovation-assistant")


if __name__ == "__main__":
    agents.cli.run_app(server)
