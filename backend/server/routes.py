import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from livekit import api
from langchain_core.messages import HumanMessage

from graph.builder import build_graph
from config import LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET


router = APIRouter()
graph = build_graph()


# --- LiveKit Token ---

class TokenRequest(BaseModel):
    room_name: str | None = None
    participant_name: str = "user"


class TokenResponse(BaseModel):
    token: str
    url: str
    room_name: str


@router.post("/token", response_model=TokenResponse)
async def get_token(request: TokenRequest):
    room_name = request.room_name or f"renovation-{uuid.uuid4().hex[:8]}"
    participant_identity = f"user-{uuid.uuid4().hex[:6]}"

    token = (
        api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        .with_identity(participant_identity)
        .with_name(request.participant_name)
        .with_grants(api.VideoGrants(
            room_join=True,
            room=room_name,
            can_publish=True,
            can_subscribe=True,
            can_publish_data=True,
        ))
        .with_room_config(api.RoomConfiguration(
            agents=[
                api.RoomAgentDispatch(agent_name="renovation-assistant"),
            ],
        ))
    )

    return TokenResponse(
        token=token.to_jwt(),
        url=LIVEKIT_URL,
        room_name=room_name,
    )


class ChatRequest(BaseModel):
    message: str
    conversation_id: str | None = None


class ChatResponse(BaseModel):
    conversation_id: str
    active_agent: str
    response: str
    transfer_occurred: bool


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    conversation_id = request.conversation_id or str(uuid.uuid4())

    config = {"configurable": {"thread_id": conversation_id}}

    # Get current state to determine the starting agent
    current_state = graph.get_state(config)
    active_agent_before = (
        current_state.values.get("active_agent", "bob")
        if current_state.values
        else "bob"
    )

    # Run the graph with the user's message
    input_state = {
        "messages": [HumanMessage(content=request.message)],
        "active_agent": active_agent_before,
    }

    result = await graph.ainvoke(input_state, config)

    # Extract the final assistant response (last AI message without tool calls)
    response_text = ""
    for msg in reversed(result["messages"]):
        if hasattr(msg, "content") and msg.content and not getattr(msg, "tool_calls", None):
            if msg.type == "ai":
                response_text = msg.content
                break

    active_agent_after = result.get("active_agent", active_agent_before)
    transfer_occurred = active_agent_before != active_agent_after

    return ChatResponse(
        conversation_id=conversation_id,
        active_agent=active_agent_after,
        response=response_text,
        transfer_occurred=transfer_occurred,
    )


class ConversationState(BaseModel):
    conversation_id: str
    active_agent: str
    message_count: int


@router.get("/conversations/{conversation_id}", response_model=ConversationState)
async def get_conversation(conversation_id: str):
    config = {"configurable": {"thread_id": conversation_id}}
    state = graph.get_state(config)

    if not state.values:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return ConversationState(
        conversation_id=conversation_id,
        active_agent=state.values.get("active_agent", "bob"),
        message_count=len(state.values.get("messages", [])),
    )


@router.get("/health")
async def health():
    return {"status": "ok"}
