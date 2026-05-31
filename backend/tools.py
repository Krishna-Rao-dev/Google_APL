# backend/tools.py
from backend.db import (
    get_full_menu, get_specials, insert_order,
    update_order_status, upsert_customer
)
from datetime import datetime
import uuid

DELIVERY_CHARGE = 40
ESTIMATED_DELIVERY_MINS = 45

# ── Tool definitions for Google ADK ─────────────────────────────────────────

async def get_menu(category: str = "") -> dict:
    """
    Returns the restaurant menu. 
    category options: main_course, breads, rice, starters, drinks, special
    If category is 'special' or None, returns full menu grouped by category.
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
    return {"menu": grouped}


async def calculate_total(items: list[dict], delivery_type: str) -> dict:
    """
    Calculate bill total.
    items: [{"name": "Dal Makhani", "qty": 2, "price": 220}, ...]
    delivery_type: "home_delivery" or "dining"
    """
    subtotal = sum(i["price"] * i["qty"] for i in items)
    delivery_charge = DELIVERY_CHARGE if delivery_type == "home_delivery" else 0
    total = subtotal + delivery_charge
    return {
        "subtotal": subtotal,
        "delivery_charge": delivery_charge,
        "total": total
    }


async def place_order(
    customer_name: str,
    phone: str,
    items: list[dict],
    delivery_type: str,
    address: str = "",
    pincode: str = "",
    party_size: int = 0
) -> dict:
    """
    Place the final order into MongoDB.
    delivery_type: "home_delivery" or "dining"
    """
    subtotal = sum(i["price"] * i["qty"] for i in items)
    delivery_charge = DELIVERY_CHARGE if delivery_type == "home_delivery" else 0
    total = subtotal + delivery_charge

    order_id = f"ORD-{uuid.uuid4().hex[:6].upper()}"

    order_doc = {
        "order_id": order_id,
        "customer_name": customer_name,
        "phone": phone,
        "items": items,
        "subtotal": subtotal,
        "delivery_type": delivery_type,
        "delivery_charge": delivery_charge,
        "total": total,
        "address": address,
        "pincode": pincode,
        "table_booking": {"party_size": party_size} if party_size else None,
        "status": "placed",
        "created_at": datetime.utcnow()
    }

    await insert_order(order_doc)
    await upsert_customer(phone, customer_name, address, pincode, order_id)

    return {
        "order_id": order_id,
        "total": total,
        "estimated_mins": ESTIMATED_DELIVERY_MINS,
        "status": "placed"
    }


async def cancel_order(order_id: str) -> dict:
    """Cancel an existing order by order_id."""
    await update_order_status(order_id, "cancelled")
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
    return {"order_id": order_id, "party_size": party_size, "status": "booked"}