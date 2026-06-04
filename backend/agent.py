# backend/agent.py
import os
import json
import logging
from typing import Annotated, TypedDict
from dotenv import load_dotenv

from langchain_groq import ChatGroq
from langchain_core.messages import (
    HumanMessage, AIMessage, SystemMessage, ToolMessage, BaseMessage
)
from langchain_core.tools import tool
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from backend.db import get_customer
from backend.tools import (
    get_menu as _get_menu,
    calculate_total as _calculate_total,
    save_order_draft as _save_order_draft,
    place_order as _place_order,
    cancel_order as _cancel_order,
    book_table as _book_table,
    OrderItem,
)

load_dotenv()
os.environ["GROQ_API_KEY"] = os.getenv("GROQ_API_KEY", "")

log = logging.getLogger("kukkad.agent")

# ── LLM ──────────────────────────────────────────────────────────────────────
llm = ChatGroq(
    model="llama-3.3-70b-versatile",
    temperature=0.1,
)

# ── Prompts ───────────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """
You are Priya, a friendly phone agent for Kukkad Nukkad restaurant in Pune.
You are on a LIVE phone call.

RULES:
- Keep replies SHORT and NATURAL. You're speaking, not writing.
- Never read out prices unless asked or confirming order.
- Use get_menu tool to fetch menu — never make up items or prices.
- Delivery charge is ₹40 extra. Always mention it when delivery is chosen.
- ALWAYS confirm the full order before placing it.
- For home delivery: ask address, then pincode separately.
- For dining: ask how many people for table booking.
- Only call place_order when customer gives FINAL verbal confirmation ("yes", "confirm", "go ahead").
- If customer cancels AFTER order is placed, call cancel_order immediately.
- If customer wants to change order, update your understanding and re-confirm.
- End every completed order with estimated delivery/wait time (45 mins delivery, 20 mins dining).
- Be warm, natural, and helpful. Address customer by name once you know it.
- For returning customers, mention their saved address and ask if they want to use it.

GENERAL FLOW:
1. Greet → get name
2. Take order — ONLY call get_menu if user explicitly asks "what do you have" / "what's special"
3. Confirm the order list by asking "anything else?" until they say no
4. Ask dining or home delivery
5. If delivery → get address → get pincode → calculate_total → final confirm → place_order
6. If dining → get party size → calculate_total → final confirm → place_order → book_table
7. Thank and end call

NOTE: THE ABOVE FLOW MAY GET DYNAMIC. BE PREPARED TO HAVE A NATURAL TONE.
KEEP CONVERSATIONS QUITE SHORT AND PRECISE.

ADDITIONAL INSTRUCTIONS:
- NEVER call get_menu on the first turn or when customer is just greeting/ordering known items.
- Extract MAXIMUM information from a single customer message. If they give address AND pincode together, extract both. Never ask for something already given.
- NEVER call place_order in the same turn you receive address/pincode/party_size. Always call save_order_draft first, then confirm, then place_order on next turn.
- Keep confirmations to one liner ONLY TWICE:
  1. After items are stated: "OK [Name], I've noted [items]. Anything else?"
  2. Final: "OK [Name], Final Confirmation — You have Ordered [items] and want [Home Delivery to [ADDRESS] / Dining for [N] people]. Total is ₹[X]. Is that right?"

TOOLS — WHEN AND HOW TO USE:

get_menu:
  - ONLY when customer asks "what do you have", "what's available", "what's special"
  - category = "special" or "main_course"/"breads"/"rice"/"starters"/"drinks"
  - NEVER call on first turn or just to look up a price.

save_order_draft:
  - Call IMMEDIATELY when customer gives ANY detail — name, items, address, pincode, delivery type, party size
  - Extract EVERYTHING from one message. If they say "Aurora Hostel, Dhankwadi 411043" — save address AND pincode in ONE call
  - Think of this as your notepad. Save first, talk second.
  - NEVER hold details in your head across turns. Always save them.

calculate_total:
  - Call once you know items + delivery type, BEFORE final confirmation

place_order:
  - ONLY after final verbal yes — "yes", "confirm", "go ahead", "haan", "theek hai"
  - NEVER in the same turn you received address/pincode/party_size
  - Draft must be saved before this. It will auto-pull from draft for missing fields.

book_table:
  - ONLY for dining orders, AFTER place_order succeeds
  - Call immediately after place_order returns order_id

cancel_order:
  - When customer says cancel at ANY point

NOTE:
THESE ARE THE ONLY TOOLS AVAILABLE, NO OTHER TOOL IS AVAILABLE.
SUGGESTED DECISION FLOW:
  Customer speaks → extract all params → save_order_draft → respond naturally
  Delivery type known + items known → calculate_total → tell total casually
  Final "yes" received → place_order → (if dining) book_table → thank and close

STRICTLY DO NOT these MISTAKES :
1. Asking for Confirmation & Placing order in the same turn. CONFIRM FIRST AND THEN PLACE ORDER NEXT.

"""

# ── LangChain tools (thin wrappers so LLM can call them) ─────────────────────
# We use a module-level _current_call_sid to pass call_sid into tools
# because LangChain @tool functions can't receive extra runtime context easily.
# Each call is sequential (one turn at a time), so this is safe.
_current_call_sid: str = ""
_current_phone: str = ""


@tool
async def get_menu(category: str = "") -> str:
    """
    Get restaurant menu.
    category options: main_course, breads, rice, starters, drinks, special.
    Leave empty for full menu.
    """
    result = await _get_menu(category)
    return json.dumps(result)


@tool
async def save_order_draft(
    customer_name: str = "",
    items: list[dict] = None,
    delivery_type: str = "",
    address: str = "",
    pincode: str = "",
    party_size: int = 0,
) -> str:
    """
    Save partial order details as customer provides them.
    Call whenever customer gives ANY detail — name, address, pincode, items, delivery type.
    items format: [{"name": "Dal Makhani", "qty": 2, "price": 220}]
    """
    parsed_items = None
    if items:
        parsed_items = [OrderItem(**i) if isinstance(i, dict) else i for i in items]
    result = await _save_order_draft(
        call_sid=_current_call_sid,
        customer_name=customer_name,
        items=parsed_items,
        delivery_type=delivery_type,
        address=address,
        pincode=pincode,
        party_size=party_size,
    )
    return json.dumps(result)


@tool
async def calculate_total(items: list[dict], delivery_type: str) -> str:
    """
    Calculate bill total.
    items: [{"name": "Dal Makhani", "qty": 2, "price": 220}]
    delivery_type: "home_delivery" or "dining"
    """
    parsed = [OrderItem(**i) if isinstance(i, dict) else i for i in items]
    result = await _calculate_total(parsed, delivery_type)
    return json.dumps(result)


@tool
async def place_order(
    customer_name: str = "",
    items: list[dict] = None,
    delivery_type: str = "",
    address: str = "",
    pincode: str = "",
    party_size: int = 0,
) -> str:
    """
    Place the final confirmed order. Only call after explicit customer confirmation.
    Missing fields are pulled from saved draft automatically.
    items format: [{"name": "Dal Makhani", "qty": 2, "price": 220}]
    """
    parsed_items = None
    if items:
        parsed_items = [OrderItem(**i) if isinstance(i, dict) else i for i in items]
    result = await _place_order(
        call_sid=_current_call_sid,
        customer_name=customer_name or None,
        phone=_current_phone,
        items=parsed_items,
        delivery_type=delivery_type or None,
        address=address or None,
        pincode=pincode or None,
        party_size=party_size or None,
    )
    return json.dumps(result)


@tool
async def book_table(order_id: str, party_size: int) -> str:
    """
    Book a table for dining orders. Call immediately after place_order for dining.
    order_id: from the place_order response.
    """
    result = await _book_table(order_id, party_size)
    return json.dumps(result)


@tool
async def cancel_order(order_id: str) -> str:
    """Cancel an existing order by order_id."""
    result = await _cancel_order(order_id)
    return json.dumps(result)


TOOLS = [get_menu, save_order_draft, calculate_total, place_order, book_table, cancel_order]
TOOL_MAP = {t.name: t for t in TOOLS}

llm_with_tools = llm.bind_tools(TOOLS)

# ── LangGraph state ───────────────────────────────────────────────────────────
class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]


# ── Graph nodes ───────────────────────────────────────────────────────────────
async def call_model(state: AgentState) -> AgentState:
    """Send messages to LLM, get back a response (possibly with tool calls)."""
    response = await llm_with_tools.ainvoke(state["messages"])
    return {"messages": [response]}


async def call_tools(state: AgentState) -> AgentState:
    """Execute any tool calls the LLM requested."""
    last_msg = state["messages"][-1]
    tool_messages = []
    for tool_call in last_msg.tool_calls:
        tool_fn = TOOL_MAP.get(tool_call["name"])
        if tool_fn is None:
            result = f"Unknown tool: {tool_call['name']}"
        else:
            try:
                result = await tool_fn.ainvoke(tool_call["args"])
            except Exception as e:
                log.error(f"Tool {tool_call['name']} error: {e}")
                result = json.dumps({"error": str(e)})
        tool_messages.append(
            ToolMessage(content=str(result), tool_call_id=tool_call["id"])
        )
    return {"messages": tool_messages}


def should_continue(state: AgentState) -> str:
    """Route: if LLM made tool calls → run them. Otherwise → done."""
    last = state["messages"][-1]
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "tools"
    return END


# ── Build the graph ───────────────────────────────────────────────────────────
def _build_graph() -> StateGraph:
    graph = StateGraph(AgentState)
    graph.add_node("model", call_model)
    graph.add_node("tools", call_tools)
    graph.set_entry_point("model")
    graph.add_conditional_edges("model", should_continue, {"tools": "tools", END: END})
    graph.add_edge("tools", "model")
    return graph.compile()


_graph = _build_graph()

# ── Session store ─────────────────────────────────────────────────────────────
# call_sid → list of messages (full conversation history)
_sessions: dict[str, list[BaseMessage]] = {}


# ── Public API (same signatures as ADK version) ───────────────────────────────
async def chat(call_sid: str, user_message: str, phone: str, full_menu: list[dict]) -> str:
    global _current_call_sid, _current_phone
    _current_call_sid = call_sid
    _current_phone = phone

    # Build system prompt with menu + customer context on first turn
    if call_sid not in _sessions:
        menu_lines = [
            f"- {i['name']} ({i['category']}) ₹{i['price']}" + (" ⭐ Special" if i.get("is_special") else "")
            for i in full_menu
        ]
        customer = await get_customer(phone)
        if customer:
            addrs = customer.get("saved_addresses", [])
            addr_text = ", ".join(a["address"] for a in addrs) if addrs else "none"
            cust_text = f"Returning customer. Name: {customer.get('name', 'Unknown')}. Saved addresses: {addr_text}"
        else:
            cust_text = "New customer."

        system_content = (
            SYSTEM_PROMPT
            + f"\n\nMENU:\n" + "\n".join(menu_lines)
            + f"\n\nCUSTOMER INFO:\n{cust_text}"
        )
        _sessions[call_sid] = [SystemMessage(content=system_content)]
        log.debug(f"Session created for {call_sid}")

    # Warm-up init call — just prep session, no reply needed
    if user_message == "__init__":
        return ""

    # Append user turn
    _sessions[call_sid].append(HumanMessage(content=user_message))

    # Run graph
    result = await _graph.ainvoke({"messages": _sessions[call_sid]})

    # Persist updated history
    _sessions[call_sid] = result["messages"]

    # Extract final text reply
    for msg in reversed(result["messages"]):
        if isinstance(msg, AIMessage) and msg.content:
            if isinstance(msg.content, str):
                return msg.content
            if isinstance(msg.content, list):
                texts = [b["text"] for b in msg.content if isinstance(b, dict) and b.get("type") == "text"]
                if texts:
                    return " ".join(texts)

    return "Sorry, could you repeat that?"


async def end_session(call_sid: str, phone: str):
    """Clean up session when call ends."""
    _sessions.pop(call_sid, None)
    log.debug(f"Session ended for {call_sid}")