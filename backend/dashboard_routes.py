from fastapi import APIRouter
from backend.db import orders_col, menu_col
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
import uuid

router = APIRouter()


# ── Models ────────────────────────────────────────────────────────────────────
class StatusUpdate(BaseModel):
    status: str

class EstimatedTimeUpdate(BaseModel):
    estimated_time: int  # minutes from now

class MenuItemCreate(BaseModel):
    name: str
    category: str
    price: int
    is_special: bool = False
    tags: list[str] = []
    prep_time: int = 20  # minutes to prepare


# ── Orders ────────────────────────────────────────────────────────────────────
@router.get("/dashboard")
async def dashboard_data():
    orders = await orders_col.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for o in orders:
        if isinstance(o.get("created_at"), datetime):
            o["created_at"] = o["created_at"].isoformat()
    return {"orders": orders, "analytics": {}}


@router.patch("/orders/{order_id}/status")
async def patch_status(order_id: str, body: StatusUpdate):
    await orders_col.update_one(
        {"order_id": order_id},
        {"$set": {"status": body.status}}
    )
    await orders_col.update_one(
        {"order_id": order_id, "table_booking": {"$type": "object"}},
        {"$set": {"table_booking.status": body.status}}
    )

    # Push SMS notification to customer
    import asyncio
    from backend.sms import send_status_update
    order = await orders_col.find_one({"order_id": order_id}, {"_id": 0})
    if order and order.get("phone"):
        asyncio.create_task(send_status_update(order, body.status))

    return {"order_id": order_id, "status": body.status}


@router.patch("/orders/{order_id}/estimated_time")
async def patch_estimated_time(order_id: str, body: EstimatedTimeUpdate):
    """Set estimated delivery time in minutes. Stored as an ISO timestamp (deadline)."""
    from datetime import timedelta
    deadline = datetime.utcnow() + timedelta(minutes=body.estimated_time)
    await orders_col.update_one(
        {"order_id": order_id},
        {"$set": {"estimated_delivery_at": deadline.isoformat()}}
    )
    return {"order_id": order_id, "estimated_delivery_at": deadline.isoformat()}


# ── Menu CRUD ─────────────────────────────────────────────────────────────────
@router.get("/menu")
async def get_all_menu():
    """Returns all menu items including unavailable ones, for management."""
    items = await menu_col.find({}, {"_id": 1, "name": 1, "category": 1, "price": 1,
                                      "is_special": 1, "available": 1, "tags": 1,
                                      "prep_time": 1}).to_list(None)
    for item in items:
        item["id"] = str(item.pop("_id"))
    return {"items": items}


@router.post("/menu")
async def add_menu_item(body: MenuItemCreate):
    """Add a new menu item."""
    slug = body.name.lower().replace(" ", "_").replace("-", "_")
    item_id = f"{slug}_{uuid.uuid4().hex[:4]}"
    doc = {
        "_id": item_id,
        "name": body.name,
        "category": body.category,
        "price": body.price,
        "is_special": body.is_special,
        "available": True,
        "tags": body.tags,
        "prep_time": body.prep_time,
    }
    await menu_col.insert_one(doc)
    return {"id": item_id, **{k: v for k, v in doc.items() if k != "_id"}}


@router.delete("/menu/{item_id}")
async def delete_menu_item(item_id: str):
    """Soft delete — marks as unavailable instead of removing."""
    await menu_col.update_one({"_id": item_id}, {"$set": {"available": False}})
    return {"id": item_id, "deleted": True}


@router.patch("/menu/{item_id}/toggle")
async def toggle_menu_item(item_id: str):
    """Toggle available status."""
    item = await menu_col.find_one({"_id": item_id})
    if not item:
        return {"error": "not found"}
    new_val = not item.get("available", True)
    await menu_col.update_one({"_id": item_id}, {"$set": {"available": new_val}})
    return {"id": item_id, "available": new_val}