# backend/sms.py
import os
import logging
from datetime import datetime, timedelta
from twilio.rest import Client
from twilio.twiml.messaging_response import MessagingResponse
from backend.db import orders_col

log = logging.getLogger("kukkad.sms")

_client = None

def get_twilio_client() -> Client:
    global _client
    if _client is None:
        _client = Client(os.getenv("TWILIO_ACCOUNT_SID"), os.getenv("TWILIO_AUTH_TOKEN"))
    return _client


def _send(phone: str, msg: str, label: str):
    try:
        get_twilio_client().messages.create(
            body=msg,
            from_=os.getenv("TWILIO_PHONE_NUMBER"),
            to=phone
        )
        log.info(f"SMS sent to {phone} | {label}")
    except Exception as e:
        log.error(f"SMS failed to {phone}: {e}")


async def send_order_confirmation(phone: str, order: dict):
    msg = (
        f"Hi {order['customer_name']},\n"
        f"Order ID: {order['order_id']}\n"
        f"Your meal is confirmed!\n"
        f"Total: Rs.{order['total']}\n\n"
        f"Thank you for choosing Kukkad Nukkad!"
    )
    _send(phone, msg, order['order_id'])


STATUS_LINE = {
    "preparing":        "being prepared",
    "out_for_delivery": "on the way",
    "delivered":        "delivered. Enjoy!",
    "cancelled":        "cancelled",
    "booked":           "table booked",
    "seated":           "ready at your table",
    "done":             "complete. Thanks for dining!",
}

async def send_status_update(order: dict, new_status: str):
    phone = order.get("phone")
    if not phone:
        return

    order_id = order.get("order_id", "")
    customer = order.get("customer_name", "there")
    line     = STATUS_LINE.get(new_status, new_status)

    eta_line = ""
    eta_str  = order.get("estimated_delivery_at")
    if eta_str and new_status not in ("delivered", "cancelled", "done"):
        try:
            eta_dt         = datetime.fromisoformat(eta_str)
            mins_remaining = max(0, int((eta_dt - datetime.utcnow()).total_seconds() / 60))
            eta_ist        = (eta_dt + timedelta(hours=5, minutes=30)).strftime("%I:%M %p")
            eta_line       = f"\nDelivery by {eta_ist} ({mins_remaining} mins away)"
        except Exception:
            pass

    msg = (
        f"Hi {customer},\n"
        f"Order ID: {order_id}\n"
        f"Your meal is {line}.{eta_line}\n\n"
        f"Thank you for choosing Kukkad Nukkad!"
    )
    _send(phone, msg, f"{order_id} -> {new_status}")


async def handle_inbound_sms(body: str, from_phone: str) -> str:
    order_id = body.strip().upper()
    response = MessagingResponse()

    if not order_id.startswith("ORD-"):
        response.message("Reply with your Order ID (e.g. ORD-ABC123) to check status.")
        return str(response)

    order = await orders_col.find_one({"order_id": order_id}, {"_id": 0})
    if not order:
        response.message(f"Could not find {order_id}. Please check and try again.")
        return str(response)

    status = STATUS_LINE.get(order.get("status", ""), order.get("status", "unknown"))
    response.message(
        f"Hi {order.get('customer_name', 'there')},\n"
        f"Order ID: {order_id}\n"
        f"Your meal is {status}.\n\n"
        f"Thank you for choosing Kukkad Nukkad!"
    )
    return str(response)