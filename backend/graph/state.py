from typing import Annotated, Any
from typing_extensions import TypedDict
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    active_agent: str  # "bob" or "alice"
    handoff_summary: str  # summary from outgoing agent during transfer
    conversation_ended: bool  # True when agent calls end_conversation
