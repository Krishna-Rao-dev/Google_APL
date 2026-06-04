# backend/sms.py
import os
import logging
from twilio.rest import Client
from twilio.twiml.messaging_response import MessagingResponse
from datetime import timedelta
from backend.db import orders_col

log = logging.getLogger("kukkad.sms")

_client = None

def get_twilio_client() -> Client:
    global _client
    if _client is None:
        _client = Client(
            os.getenv("TWILIO_ACCOUNT_SID"),
            os.getenv("TWILIO_AUTH_TOKEN")
        )
    return _client


def _format_items(items: list[dict]) -> str:
    return ", ".join(f"{i['qty']}x {i['name']}" for i in items)


async def send_order_confirmation(phone: str, order: dict):
    """Send SMS confirmation to customer after order is placed."""
    items_text = _format_items(order.get("items", []))
    delivery_type = order.get("delivery_type", "")

    if delivery_type == "home_delivery":
        delivery_line = f"🚴 Home Delivery to {order.get('address', '')} - {order.get('pincode', '')}"
    else:
        party = order.get("table_booking", {})
        size = party.get("party_size", "") if isinstance(party, dict) else ""
        delivery_line = f"🍽️ Dining for {size} people"

    msg = (
        f"✅ Kukkad Nukkad — Order Confirmed!\n"
        f"Order ID: {order['order_id']}\n"
        f"Items: {items_text}\n"
        f"Total: ₹{order['total']}\n"
        f"{delivery_line}\n"
        f"ETA: {order.get('estimated_mins', 45)} mins\n\n"
        f"Reply with your Order ID anytime to check status."
    )

    try:
        get_twilio_client().messages.create(
            body=msg,
            from_=os.getenv("TWILIO_PHONE_NUMBER"),
            to=phone
        )
        log.info(f"📱 SMS sent to {phone} for {order['order_id']}")
    except Exception as e:
        log.error(f"❌ SMS failed to {phone}: {e}")



STATUS_MESSAGES = {
    "placed":           "✅ We've received your order!",
    "preparing":        "👨‍🍳 Your food is being prepared!",
    "out_for_delivery": "🚴 Your order is on the way!",
    "delivered":        "🎉 Order delivered! Enjoy your meal!",
    "cancelled":        "❌ Your order has been cancelled.",
    "booked":           "🟡 Your table is booked!",
    "seated":           "🍽️ You've been seated. Enjoy!",
    "done":             "✅ Thanks for dining with us!",
}

async def send_status_update(order: dict, new_status: str):
    """Push SMS to customer when manager updates order status."""
    phone = order.get("phone")
    if not phone:
        return

    order_id   = order.get("order_id", "")
    customer   = order.get("customer_name", "there")
    status_msg = STATUS_MESSAGES.get(new_status, f"Status: {new_status}")

    # Calculate ETA line
    eta_line = ""
    eta_str = order.get("estimated_delivery_at")
    if eta_str and new_status not in ("delivered", "cancelled", "done"):
        try:
            eta_dt = datetime.fromisoformat(eta_str)
            now    = datetime.utcnow()
            diff   = eta_dt - now
            mins_remaining = max(0, int(diff.total_seconds() / 60))
            eta_ist = eta_dt + timedelta(hours=5, minutes=30)  # UTC → IST
            eta_time_str = eta_ist.strftime("%I:%M %p")
            if mins_remaining > 0:
                eta_line = f"\nDelivery by {eta_time_str} ({mins_remaining} mins away)"
            else:
                eta_line = f"\nDelivery by {eta_time_str}"
        except Exception:
            pass

    msg = (
        f"Hi {customer},\n"
        f"Order {order_id} Update:\n"
        f"{status_msg}"
        f"{eta_line}\n\n"
        f"— Kukkad Nukkad 🍛"
    )

    try:
        get_twilio_client().messages.create(
            body=msg,
            from_=os.getenv("TWILIO_PHONE_NUMBER"),
            to=phone
        )
        log.info(f"📱 Status SMS sent to {phone} | {order_id} → {new_status}")
    except Exception as e:
        log.error(f"❌ Status SMS failed: {e}")


async def handle_inbound_sms(body: str, from_phone: str) -> str:
    """
    Customer texts an order ID → fetch status from DB → reply.
    Returns TwiML XML string.
    """
    order_id = body.strip().upper()
    response = MessagingResponse()

    if not order_id.startswith("ORD-"):
        response.message(
            "Hi! This is Kukkad Nukkad. Reply with your Order ID (e.g. ORD-ABC123) to check your order status."
        )
        return str(response)

    order = await orders_col.find_one({"order_id": order_id}, {"_id": 0})

    if not order:
        response.message(f"Sorry, we couldn't find order {order_id}. Please check the ID and try again.")
        return str(response)

    status = order.get("status", "unknown")
    items_text = _format_items(order.get("items", []))

    STATUS_EMOJI = {
        "placed":             "🟡 Placed — we've received your order!",
        "preparing":          "👨‍🍳 Preparing — your food is being made!",
        "out_for_delivery":   "🚴 Out for Delivery — on the way!",
        "delivered":          "✅ Delivered — enjoy your meal!",
        "cancelled":          "❌ Cancelled",
        "booked":             "🟡 Table Booked",
        "seated":             "🍽️ Seated — enjoy your meal!",
        "done":               "✅ Done — thank you for dining with us!",
    }

    status_text = STATUS_EMOJI.get(status, f"Status: {status}")

    reply = (
        f"📦 Order {order_id}\n"
        f"Items: {items_text}\n"
        f"Total: ₹{order.get('total', '?')}\n"
        f"{status_text}\n\n"
        f"Questions? Call us on this number anytime!"
    )

    response.message(reply)
    return str(response)