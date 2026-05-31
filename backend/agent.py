# backend/agent.py
import os
from dotenv import load_dotenv
from google.adk.agents import LlmAgent
from google.adk.sessions import InMemorySessionService
from google.adk.runners import Runner
from google.genai import types as genai_types

from backend.tools import get_menu, calculate_total, place_order, cancel_order, book_table
from backend.db import get_customer

load_dotenv()

session_service = InMemorySessionService()
APP_NAME = "kukkad_nukkad_agent"

# Store agents separately — ADK session state isn't meant for arbitrary objects
_agents: dict[str, LlmAgent] = {}  # call_sid → agent

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

FLOW:
1. Greet → get name
2. Take order (use get_menu if needed)
3. Confirm order list → ask "anything else?" until they say no
4. Ask dining or home delivery
5. If delivery → get address → get pincode → calculate_total → final confirm → place_order
6. If dining → get party size → calculate_total → final confirm → place_order → book_table
7. Thank and end call
"""


def _make_agent(menu_context: str, customer_context: str) -> LlmAgent:
    full_prompt = SYSTEM_PROMPT + f"\n\nMENU:\n{menu_context}\n\nCUSTOMER INFO:\n{customer_context}"
    return LlmAgent(
        name="priya",
        model="gemini-2.0-flash",
        description="Restaurant phone ordering agent for Kukkad Nukkad",
        instruction=full_prompt,
        tools=[get_menu, calculate_total, place_order, cancel_order, book_table],
    )


async def _build_context(phone: str, menu: list[dict]) -> tuple[str, str]:
    menu_lines = [
        f"- {i['name']} ({i['category']}) ₹{i['price']}" + (" ⭐ Special" if i.get("is_special") else "")
        for i in menu
    ]
    menu_text = "\n".join(menu_lines)

    customer = await get_customer(phone)
    if customer:
        addrs = customer.get("saved_addresses", [])
        addr_text = ", ".join(a["address"] for a in addrs) if addrs else "none"
        cust_text = f"Returning customer. Name: {customer.get('name','Unknown')}. Saved address: {addr_text}"
    else:
        cust_text = "New customer."

    return menu_text, cust_text


async def start_session(call_sid: str, phone: str, full_menu: list[dict]) -> LlmAgent:
    menu_ctx, cust_ctx = await _build_context(phone, full_menu)
    agent = _make_agent(menu_ctx, cust_ctx)

    # ✅ await create_session
    await session_service.create_session(
        app_name=APP_NAME,
        user_id=phone,
        session_id=call_sid,
    )

    _agents[call_sid] = agent
    return agent


async def chat(call_sid: str, user_message: str, phone: str, full_menu: list[dict]) -> str:
    # ✅ await get_session
    session = await session_service.get_session(
        app_name=APP_NAME,
        user_id=phone,
        session_id=call_sid
    )

    if session is None:
        agent = await start_session(call_sid, phone, full_menu)
    else:
        agent = _agents.get(call_sid)
        if agent is None:
            # Edge case: session exists but agent lost (e.g. server restart)
            agent = await start_session(call_sid, phone, full_menu)

    # Skip __init__ warm-up message — just prep the session
    if user_message == "__init__":
        return ""

    runner = Runner(
        agent=agent,
        app_name=APP_NAME,
        session_service=session_service
    )

    content = genai_types.Content(
        role="user",
        parts=[genai_types.Part(text=user_message)]
    )

    reply_parts = []
    async for event in runner.run_async(
        user_id=phone,
        session_id=call_sid,
        new_message=content
    ):
        if event.is_final_response() and event.content:
            for part in event.content.parts:
                if part.text:
                    reply_parts.append(part.text)

    return " ".join(reply_parts) or "Sorry, could you repeat that?"


async def end_session(call_sid: str, phone: str):
    try:
        # ✅ await delete_session
        await session_service.delete_session(
            app_name=APP_NAME,
            user_id=phone,
            session_id=call_sid
        )
    except Exception:
        pass
    _agents.pop(call_sid, None)