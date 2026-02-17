from langchain_core.tools import tool


@tool
def transfer_to_agent(target_agent: str, summary: str) -> str:
    """Transfer the conversation to another agent.

    Call this when the conversation should be handed off to the other agent.
    This can be triggered by the user explicitly asking, or by your own judgment
    that the other agent is better suited for the current topic.

    Args:
        target_agent: The agent to transfer to. Must be "bob" or "alice".
        summary: A brief summary of what was discussed and what the user needs next.
            This helps the other agent pick up seamlessly.
    """
    return f"Transferring to {target_agent}."


@tool
def end_conversation(reason: str) -> str:
    """End the conversation session.

    Call this ONLY when you have produced the final actionable to-do list
    and the homeowner has confirmed they're satisfied or said goodbye.

    Args:
        reason: Brief reason for ending (e.g. "Final to-do list delivered").
    """
    return "Conversation ended."


AGENT_TOOLS = [transfer_to_agent, end_conversation]
