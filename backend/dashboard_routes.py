from fastapi import APIRouter
from backend.db import orders_col, update_order_status
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()

class StatusUpdate(BaseModel):
    status: str

@router.get("/dashboard")
async def dashboard_data():
    orders = await orders_col.find(
        {},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)

    # Convert datetime to string for JSON
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
    # Also update table_booking status for dining
    await orders_col.update_one(
        {"order_id": order_id, "table_booking": {"$ne": None}},
        {"$set": {"table_booking.status": body.status}}
    )
    return {"order_id": order_id, "status": body.status}