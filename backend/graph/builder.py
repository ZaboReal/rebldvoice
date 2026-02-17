from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, ToolMessage, AIMessage
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

from graph.state import AgentState
from agents.prompts import BOB_SYSTEM_PROMPT, ALICE_SYSTEM_PROMPT, TRANSFER_CONTEXT_TEMPLATE
from agents.tools import AGENT_TOOLS, transfer_to_agent, end_conversation
from config import OPENAI_API_KEY, OPENAI_MODEL


TRANSFER_TOOL_NAME = "transfer_to_agent"
END_TOOL_NAME = "end_conversation"


def _get_llm():
    return ChatOpenAI(
        model=OPENAI_MODEL,
        api_key=OPENAI_API_KEY,
    ).bind_tools(AGENT_TOOLS)


def _build_system_message(state: AgentState, agent_name: str) -> SystemMessage:
    """Build the system message for an agent, including transfer context if applicable."""
    base_prompt = BOB_SYSTEM_PROMPT if agent_name == "bob" else ALICE_SYSTEM_PROMPT

    # If there's a handoff summary, append transfer context
    if state.get("handoff_summary"):
        from_agent = "Alice" if agent_name == "bob" else "Bob"
        to_agent = "Bob" if agent_name == "bob" else "Alice"
        transfer_context = TRANSFER_CONTEXT_TEMPLATE.format(
            from_agent=from_agent,
            to_agent=to_agent,
            handoff_summary=state["handoff_summary"],
        )
        return SystemMessage(content=f"{base_prompt}\n\n{transfer_context}")

    return SystemMessage(content=base_prompt)


async def bob_node(state: AgentState) -> dict:
    """Bob agent node — intake and planning."""
    llm = _get_llm()
    system_msg = _build_system_message(state, "bob")
    messages = [system_msg] + state["messages"]
    response = await llm.ainvoke(messages)
    return {"messages": [response], "handoff_summary": ""}


async def alice_node(state: AgentState) -> dict:
    """Alice agent node — specialist and technical."""
    llm = _get_llm()
    system_msg = _build_system_message(state, "alice")
    messages = [system_msg] + state["messages"]
    response = await llm.ainvoke(messages)
    return {"messages": [response], "handoff_summary": ""}


def handle_transfer(state: AgentState) -> dict:
    """Process a transfer tool call — update active agent and inject context."""
    last_message = state["messages"][-1]

    # Extract the transfer tool call
    tool_call = None
    for tc in last_message.tool_calls:
        if tc["name"] == TRANSFER_TOOL_NAME:
            tool_call = tc
            break

    if tool_call is None:
        return {}

    target = tool_call["args"]["target_agent"].lower()
    summary = tool_call["args"].get("summary", "")

    # Determine valid target
    if target not in ("bob", "alice"):
        # Invalid target — add error tool message and keep current agent
        error_msg = ToolMessage(
            content=f"Invalid target agent '{target}'. Must be 'bob' or 'alice'.",
            tool_call_id=tool_call["id"],
        )
        return {"messages": [error_msg]}

    # If trying to transfer to the already-active agent
    if target == state["active_agent"]:
        already_here_msg = ToolMessage(
            content=f"{target.capitalize()} is already the active agent.",
            tool_call_id=tool_call["id"],
        )
        return {"messages": [already_here_msg]}

    # Execute the transfer
    confirmation_msg = ToolMessage(
        content=f"Transfer complete. {target.capitalize()} is now active.",
        tool_call_id=tool_call["id"],
    )

    return {
        "messages": [confirmation_msg],
        "active_agent": target,
        "handoff_summary": summary,
    }


def route_to_agent(state: AgentState) -> str:
    """Route to the correct agent based on active_agent."""
    active = state.get("active_agent", "bob")
    if active == "alice":
        return "alice"
    return "bob"


def handle_end(state: AgentState) -> dict:
    """Process an end_conversation tool call."""
    last_message = state["messages"][-1]
    tool_call = None
    for tc in last_message.tool_calls:
        if tc["name"] == END_TOOL_NAME:
            tool_call = tc
            break

    if tool_call is None:
        return {}

    confirmation = ToolMessage(
        content="Session ended.",
        tool_call_id=tool_call["id"],
    )
    return {"messages": [confirmation], "conversation_ended": True}


def check_for_tool_calls(state: AgentState) -> str:
    """Check if the last message contains a transfer or end tool call."""
    last_message = state["messages"][-1]
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        for tc in last_message.tool_calls:
            if tc["name"] == TRANSFER_TOOL_NAME:
                return "transfer"
            if tc["name"] == END_TOOL_NAME:
                return "end_conversation"
    return "done"


def build_graph():
    """Build and compile the agent graph."""
    graph = StateGraph(AgentState)

    # Add nodes
    graph.add_node("bob", bob_node)
    graph.add_node("alice", alice_node)
    graph.add_node("handle_transfer", handle_transfer)
    graph.add_node("handle_end", handle_end)

    # Entry point: route to the active agent
    graph.add_conditional_edges(START, route_to_agent, {"bob": "bob", "alice": "alice"})

    # After each agent: check for transfer, end, or done
    edge_map = {"transfer": "handle_transfer", "end_conversation": "handle_end", "done": END}
    graph.add_conditional_edges("bob", check_for_tool_calls, edge_map)
    graph.add_conditional_edges("alice", check_for_tool_calls, edge_map)

    # After transfer: route to the new agent so they can respond immediately
    graph.add_conditional_edges("handle_transfer", route_to_agent, {"bob": "bob", "alice": "alice"})

    # After end: conversation is over
    graph.add_edge("handle_end", END)

    # Compile with memory checkpointer for conversation persistence
    checkpointer = MemorySaver()
    return graph.compile(checkpointer=checkpointer)
