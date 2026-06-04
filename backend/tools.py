# backend/tools.py
from backend.db import (
    get_full_menu, get_specials, insert_order,
    update_order_status, upsert_customer
)
from datetime import datetime
import uuid
from pydantic import BaseModel
import asyncio
DELIVERY_CHARGE = 40
ESTIMATED_DELIVERY_MINS = 45

# ── Tool definitions for Google ADK ─────────────────────────────────────────
# top of tools.py
_drafts: dict[str, dict] = {}  # call_sid → draft
class OrderItem(BaseModel):
    name: str
    qty: int
    price: int

async def save_order_draft(
    call_sid: str | None = None,
    customer_name: str ="",
    items: list[OrderItem] | None = None,
    delivery_type: str = "",
    address: str = "",
    pincode: str = "",
    party_size: int = 0
) -> dict:
    """
    Save partial order details as customer provides them.
    Call this whenever customer gives ANY order detail — name, address, pincode, items, delivery type.
    Do NOT call place_order until you have called this and received final verbal confirmation.
    """
    existing = _drafts.get(call_sid, {})
    items_for_draft = items
    updates = {
        k: v for k, v in {
            "customer_name": customer_name,
            "items": items_for_draft,
            "delivery_type": delivery_type,
            "address": address,
            "pincode": pincode,
            "party_size": party_size
        }.items() if v not in ("", None)
    }
    

    _drafts[call_sid] = {**existing, **updates}
    print("🔥 TOOL CALLED: save_order_draft")
    return {"saved": True, "draft": _drafts[call_sid]}


def get_draft(call_sid: str) -> dict:
    """Internal helper — not a tool. Used by place_order to pull saved draft."""
    return _drafts.get(call_sid, {})


def clear_draft(call_sid: str):
    _drafts.pop(call_sid, "")
async def get_menu(category: str = "") -> dict:
    """
    Returns the restaurant menu. 
    category options: main_course, breads, rice, starters, drinks, special
    If category is 'special' or "", returns full menu grouped by category.
    """
    if category == "special":
        items = await get_specials()
        return {"specials": items}
    
    all_items = await get_full_menu()
    
    if category:
        filtered = [i for i in all_items if i["category"] == category]
        return {"items": filtered}
    
    # Group by category
    grouped: dict = {}
    for item in all_items:
        cat = item["category"]
        grouped.setdefault(cat, []).append(item)
    print("🔥 TOOL CALLED: get_menu")
    return {"menu": grouped}


async def calculate_total(items: list[OrderItem], delivery_type: str) -> dict:
    """
    Calculate bill total.
    items: [{"name": "Dal Makhani", "qty": 2, "price": 220}, ...]
    delivery_type: "home_delivery" or "dining"
    """
    if not items:
        return {"error": "No items found"}
    subtotal = sum(i.price*i.qty for i in items)
    delivery_charge = DELIVERY_CHARGE if delivery_type == "home_delivery" else 0
    total = subtotal + delivery_charge
    print("🔥 TOOL CALLED: calculate_total")
    return {
        "subtotal": subtotal,
        "delivery_charge": delivery_charge,
        "total": total
    }


async def place_order(
    call_sid: str,
    customer_name: str | None = None,
    phone: str | None = None,
    items: list[OrderItem] | None = None,
    delivery_type: str | None = None,
    address: str | None = None,
    pincode: str | None = None,
    party_size: int | None = None
) -> dict:
    """
    Place the final order into MongoDB.
    Missing values are pulled from the saved draft.

    """

    draft = get_draft(call_sid)

    customer_name = customer_name or draft.get("customer_name")
    phone = phone or draft.get("phone")
    items = items or [
            OrderItem(**i)
            for i in draft.get("items", [])
            ]
    delivery_type = delivery_type or draft.get("delivery_type")
    address = address or draft.get("address", "")
    pincode = pincode or draft.get("pincode", "")
    party_size = party_size or draft.get("party_size", 0)


    subtotal = sum(i.price*i.qty for i in items)

    delivery_charge = (
        DELIVERY_CHARGE
        if delivery_type == "home_delivery"
        else 0
    )

    total = subtotal + delivery_charge

    order_id = f"ORD-{uuid.uuid4().hex[:6].upper()}"

    from datetime import timedelta
    eta_mins = ESTIMATED_DELIVERY_MINS if delivery_type == "home_delivery" else 20
    estimated_delivery_at = (datetime.utcnow() + timedelta(minutes=eta_mins)).isoformat()

    order_doc = {
        "order_id": order_id,
        "customer_name": customer_name,
        "phone": phone,
        "items": [i.model_dump() for i in items],
        "subtotal": subtotal,
        "delivery_type": delivery_type,
        "delivery_charge": delivery_charge,
        "total": total,
        "address": address,
        "pincode": pincode,
        "table_booking": (
            {"party_size": party_size}
            if party_size
            else ""
        ),
        "estimated_delivery_at": estimated_delivery_at,
        "status": "placed",
        "created_at": datetime.utcnow()
    }

    await insert_order(order_doc)

    await upsert_customer(
        phone,
        customer_name,
        address,
        pincode,
        order_id
    )

    clear_draft(call_sid)

    # Send SMS confirmation (non-blocking — don't delay the call)
    if phone:
        try:
            from backend.sms import send_order_confirmation
            sms_doc = {**order_doc, "estimated_mins": ESTIMATED_DELIVERY_MINS}
            asyncio.create_task(send_order_confirmation(phone, sms_doc))
        except Exception as e:
            print(f"SMS task error: {e}")

    print("🔥 TOOL CALLED: place_order")
    return {
        "order_id": order_id,
        "total": total,
        "estimated_mins": ESTIMATED_DELIVERY_MINS,
        "status": "placed"
    }

async def cancel_order(order_id: str) -> dict:
    """Cancel an existing order by order_id."""
    await update_order_status(order_id, "cancelled")
    print("🔥 TOOL CALLED: cancel_order")
    return {"order_id": order_id, "status": "cancelled"}


async def book_table(order_id: str, party_size: int) -> dict:
    """
    Record table booking for dining orders.
    Called after place_order when delivery_type is dining.
    """
    from backend.db import orders_col
    from bson import ObjectId
    await orders_col.update_one(
        {"order_id": order_id},
        {"$set": {"table_booking": {"party_size": party_size, "status": "booked"}}}
    )
    print("🔥 TOOL CALLED: book_table")
    return {"order_id": order_id, "party_size": party_size, "status": "booked"}