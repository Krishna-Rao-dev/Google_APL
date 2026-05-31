# backend/db.py
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

client = AsyncIOMotorClient(os.getenv("MONGODB_URI"))
db = client["kukkad_nukkad"]

menu_col      = db["menu_items"]
orders_col    = db["orders"]
customers_col = db["customers"]

# ── Seed menu (run once) ─────────────────────────────────────────────────────
MENU_SEED = [
    # Mains
    {"_id": "dal_makhani",   "name": "Dal Makhani",     "category": "main_course", "price": 220, "is_special": True,  "available": True, "tags": ["veg","bestseller"]},
    {"_id": "paneer_butter", "name": "Paneer Butter Masala","category":"main_course","price":260,"is_special":False,"available":True,"tags":["veg"]},
    {"_id": "veg_pulao",     "name": "Veg Pulao",        "category": "rice",        "price": 180, "is_special": False, "available": True, "tags": ["veg"]},
    {"_id": "chicken_curry", "name": "Chicken Curry",    "category": "main_course", "price": 320, "is_special": True,  "available": True, "tags": ["non-veg","bestseller"]},
    # Breads
    {"_id": "garlic_naan",   "name": "Garlic Naan",      "category": "breads",      "price": 40,  "is_special": False, "available": True, "tags": ["veg"]},
    {"_id": "butter_roti",   "name": "Butter Roti",      "category": "breads",      "price": 20,  "is_special": False, "available": True, "tags": ["veg"]},
    # Starters
    {"_id": "paneer_tikka",  "name": "Paneer Tikka",     "category": "starters",    "price": 280, "is_special": True,  "available": True, "tags": ["veg","starter"]},
    {"_id": "veg_soup",      "name": "Veg Soup",         "category": "starters",    "price": 120, "is_special": False, "available": True, "tags": ["veg","starter"]},
    # Drinks
    {"_id": "lassi",         "name": "Sweet Lassi",      "category": "drinks",      "price": 80,  "is_special": False, "available": True, "tags": ["veg"]},
    {"_id": "chaas",         "name": "Masala Chaas",     "category": "drinks",      "price": 60,  "is_special": False, "available": True, "tags": ["veg"]},
]

async def seed_menu():
    for item in MENU_SEED:
        await menu_col.update_one({"_id": item["_id"]}, {"$setOnInsert": item}, upsert=True)
    print("Menu seeded.")

# ── Helpers ──────────────────────────────────────────────────────────────────
async def get_full_menu() -> list[dict]:
    return await menu_col.find({"available": True}, {"_id": 0}).to_list(None)

async def get_specials() -> list[dict]:
    return await menu_col.find({"is_special": True, "available": True}, {"_id": 0}).to_list(None)

async def get_customer(phone: str) -> dict | None:
    return await customers_col.find_one({"phone": phone})

async def upsert_customer(phone: str, name: str, address: str = "", pincode: str = "", order_id: str = ""):
    update: dict = {"$set": {"name": name}}
    if address and pincode:
        update["$addToSet"] = {
            "saved_addresses": {"address": address, "pincode": pincode}
        }
    if order_id:
        update.setdefault("$push", {})["order_history"] = order_id
    await customers_col.update_one({"phone": phone}, update, upsert=True)

async def insert_order(order: dict) -> str:
    result = await orders_col.insert_one(order)
    return str(result.inserted_id)

async def update_order_status(order_id: str, status: str):
    from bson import ObjectId
    await orders_col.update_one({"_id": ObjectId(order_id)}, {"$set": {"status": status}})