# Call2Cart — AI Phone Ordering Agent

> A real phone number. A real conversation. A real order placed — no app, no typing.

Customers call a Twilio number and speak naturally. An AI agent (LangGraph + Groq) handles the entire ordering flow — takes the order, confirms it, collects delivery details, writes to MongoDB, and updates the admin dashboard live.

---

For Instance consider name of the Agent to be "Priya"
## Demo Flow

```
Customer: "Hi, I'm Krishna. I'd like to order from Kukkad Nukkad."
  Priya:  "Hi Krishna! What would you like to have today?"
Customer: "2 Dal Makhani, 4 Garlic Naan, 1 Veg Pulao."
  Priya:  "Got it! 2 Dal Makhani, 4 Garlic Naan, 1 Veg Pulao — anything else?"
Customer: "No that's it."
  Priya:  "Dining in or home delivery? Delivery has a ₹40 charge."
Customer: "Home delivery."
  Priya:  "What's your address?"
Customer: "Pune Institute Of Computer Technology, Dhankwadi."
  Priya:  "And the pincode?"
Customer: "411043."
  Priya:  "Perfect. Your total is ₹1240. Shall I place the order?"
Customer: "Yes."
  Priya:  "Order placed! Estimated delivery in 45 minutes. Have a great day!"
```
## REAL TIME DEMO:

[CALL LOG.mp3](https://github.com/user-attachments/files/28613231/CALL.LOG.mp3)
<br/>
<br/>
- `00:00 - 00:05` - Automated Caller Recognition & Session Initialization
- `00:05 - 00:21` - Multi-Item Entity Extraction and Order State Tracking
- `00:21 - 00:43` - Live Barge-In Detection and Dynamic Order Updates
- `00:43 - 01:03` - Historical Customer Profile Retrieval & Address Resolution
- `01:03 - 01:22` - Dynamic Pricing Engine and Delivery Charge Computation
- `01:22 - 01:38` - Order Verification and Transaction Commitment
- `01:38 - 01:47` - Automated Twilio Notification Dispatch

## CONFIRMATION MESSAGE VIA SMS
<img width="200" height="300" alt="WhatsApp Image 2026-06-05 at 1 01 07 AM (1)" src="https://github.com/user-attachments/assets/a52dfb84-1185-4aa0-83e1-8f9e73b763a1" />

## GETS LOGGED ON DASHBOARD OF THE RESTAURANT
<img width="1026" height="595" alt="Screenshot 2026-06-05 005830" src="https://github.com/user-attachments/assets/d9e99645-a75b-4ed7-967f-2960d65fa08c" />


## Live Delivery Progress Updates to the Customer
<img width="200" height="300" alt="WhatsApp Image 2026-06-05 at 1 01 07 AM" src="https://github.com/user-attachments/assets/086b02bb-7d30-49d9-960d-ab780202dbf3" />

---

## Architecture

### System Overview

```mermaid
flowchart TD
    A([📞 Customer Call]) --> B[Twilio Voice]
    B -->|Speech-to-Text| C[FastAPI Server]
    C --> D[LangGraph Runner]
    D --> E[Groq LLM\nllama-3.3-70b-versatile - Priya]
    E -->|Tool Call| F{Tools}
    F --> G[(MongoDB)]
    F --> H[Calculate Total]
    E -->|Text Reply| C
    C -->|TwiML + TTS| B
    B -->|Speaks reply| A
    G -->|Live Data| I[React Dashboard]

    style A fill:#f59e0b,color:#000
    style E fill:#4285f4,color:#fff
    style G fill:#10b981,color:#fff
    style I fill:#8b5cf6,color:#fff
```

---

### Call Loop (Per Conversation Turn)

```mermaid
sequenceDiagram
    participant C as Customer
    participant T as Twilio
    participant F as FastAPI
    participant A as LangGraph Agent
    participant DB as MongoDB

    C->>T: Speaks
    T->>F: POST /voice/respond<br/>(SpeechResult, CallSid)
    F->>A: chat(call_sid, text, phone)
    A->>DB: get_menu() / get_customer()
    DB-->>A: Menu + customer history
    A->>A: Groq decides reply or tool call
    alt Tool call needed
        A->>DB: place_order() / book_table()
        DB-->>A: Confirmation
    end
    A-->>F: Agent text reply
    F-->>T: TwiML <Say> + <Gather>
    T-->>C: Speaks reply, listens
```

---

### Conversation State Machine

```mermaid
stateDiagram-v2
    [*] --> GREETING
    GREETING --> TAKING_ORDER : name received
    TAKING_ORDER --> CONFIRM_ORDER : items collected
    CONFIRM_ORDER --> TAKING_ORDER : "add more"
    CONFIRM_ORDER --> DELIVERY_TYPE : "no that's all"
    DELIVERY_TYPE --> COLLECT_ADDRESS : home delivery
    DELIVERY_TYPE --> COLLECT_PARTY_SIZE : dining
    COLLECT_ADDRESS --> COLLECT_PINCODE : address given
    COLLECT_PINCODE --> FINAL_CONFIRM : pincode given
    COLLECT_PARTY_SIZE --> FINAL_CONFIRM : party size given
    FINAL_CONFIRM --> ORDER_PLACED : confirmed
    FINAL_CONFIRM --> CANCELLED : customer cancels
    ORDER_PLACED --> [*] : call ends
    CANCELLED --> [*] : call ends

    ORDER_PLACED --> CANCELLED : cancel after placing
```

---

### MongoDB Collections

```mermaid
erDiagram
    MENU_ITEMS {
        string _id
        string name
        string category
        number price
        bool is_special
        bool available
        array tags
    }

    ORDERS {
        string order_id
        string customer_name
        string phone
        array items
        number subtotal
        string delivery_type
        number delivery_charge
        number total
        string address
        string pincode
        object table_booking
        string status
        date created_at
    }

    CUSTOMERS {
        string phone PK
        string name
        array saved_addresses
        array order_history
    }

    CUSTOMERS ||--o{ ORDERS : places
    ORDERS }o--|| MENU_ITEMS : contains
```

---



## Tech Stack

| Layer | Technology |
|-------|-----------|
| Phone | Twilio Voice (STT + TTS) |
| Voice | Amazon Polly — `Polly.Aditi` (Indian English) |
| Agent | LangGraph `StateGraph` |
| LLM | Groq — `llama-3.3-70b-versatile` |
| Backend | FastAPI + Uvicorn |
| Database | MongoDB + Motor (async) |
| Dashboard | React + Recharts |

---

## Setup

### 1. Clone & Install

```bash
git clone https://github.com/Krishna-Rao-dev/Google_APL
pip install -r requirements.txt
```

### 2. Environment Variables

```bash
cp .env.example .env
```

| Variable | Where to get |
|----------|-------------|
| `TWILIO_ACCOUNT_SID` | [Twilio Console](https://console.twilio.com) |
| `TWILIO_AUTH_TOKEN` | Twilio Console |
| `TWILIO_PHONE_NUMBER` | Your Twilio number |
| `MONGODB_URI` | [MongoDB Atlas](https://cloud.mongodb.com) → Connect |
| `GROQ_API_KEY` | [Groq Console](https://console.groq.com) |

### 3. Run

```bash
# Backend
uvicorn backend.main:app --reload --port 8000

# Expose publicly (dev)
ngrok http 8000
```

### 4. Twilio Console

Go to **Phone Numbers → Your Number → Voice Configuration**:

| Field | Value |
|-------|-------|
| A call comes in | `https://YOUR_URL/voice` — HTTP POST |
| Call status changes | `https://YOUR_URL/voice/status` — HTTP POST |

### 5. Dashboard

```bash
cd dashboard
npm install
npm run dev
# → http://localhost:5173
```

---

## Agent Tools

| Tool | Triggers When | DB Action |
|------|--------------|-----------|
| `get_menu(category?)` | Customer asks what's available / special | READ menu_items |
| `save_order_draft(...)` | Customer gives any detail — name, items, address, pincode | None (in-memory) |
| `calculate_total(items, type)` | Order confirmed, delivery type chosen | None |
| `place_order(...)` | Customer gives final "yes" | WRITE orders + UPSERT customers |
| `book_table(order_id, party_size)` | Dining chosen | UPDATE orders.table_booking |
| `cancel_order(order_id)` | Customer cancels at any point | UPDATE orders.status |

---

## Special Cases

| Scenario | Behaviour |
|----------|-----------|
| "What's special today?" | `get_menu(category="special")` → reads `is_special: true` items |
| Customer changes order mid-way | Agent updates draft, recalculates, re-confirms |
| Cancel before placing | Agent confirms cancellation, ends call gracefully |
| Cancel after placing | `cancel_order()` called, status → `cancelled` in DB |
| Dining chosen | Skips address flow, asks party size → `book_table()` |
| Returning customer | Saved address offered automatically at delivery step |
| Address + pincode in one message | Agent extracts both, saves in single `save_order_draft` call |

---

## Admin Dashboard

**1. Multi-Tab Kitchen Portal - Centralized dashboard with Overview, Delivery, Dining, and Menu management tabs for order tracking and analytics**
<br/>
<br/>
2. Live Delivery Queue & Real-time ETA Tracking - Active delivery queue with countdown timers, one-time ETA setting per order, and "Delivered" status confirmation 
<br/>
<br/>
**3. Order Status Management - Change order statuses across delivery (placed → preparing → out for delivery → delivered) and dining (booked → seated → done) workflows**
<br/>
<br/>
**4. Menu Management - Add, remove, and categorize menu items with pricing, prep times, veg/non-veg tags, and "Today's Special" marking**
<br/>
<br/>
**5. Real-time Analytics & Auto-refresh - Dashboard displays today's revenue, order counts, top items ordered, and revenue trends with 15-second auto-refresh cycle** 
<br/>
<br/>
---

## Deployment (Production)

```bash
# Railway / Render — set env vars in dashboard, deploy from GitHub
# MongoDB Atlas — free M0 cluster works for low volume
# Twilio — swap ngrok URL for your Railway/Render URL in console
```

No code changes needed between dev and prod — just swap the public URL.

---

### Prototype Images:

`Dashboard` 


<img width="1917" height="915" alt="image" src="https://github.com/user-attachments/assets/ee238909-fa4f-46b8-8ccd-c978a449a8a4" />

<br/>
<br/>
<img width="1898" height="920" alt="image" src="https://github.com/user-attachments/assets/8061636f-ff2c-46ca-ae2d-2c0ecea12de6" />
<br/>
<br/>
<img width="1915" height="905" alt="image" src="https://github.com/user-attachments/assets/13a51d57-14c1-4c1d-91eb-41e44ca93011" />

<br/>
<br/>
<img width="1893" height="904" alt="image" src="https://github.com/user-attachments/assets/6c8bd64c-578e-453f-ac76-987d01fb4812" />
<br/>
<br/>
<img width="1897" height="903" alt="image" src="https://github.com/user-attachments/assets/50d76d31-7741-4687-b4f2-13d7f857df1a" />
<br/>
<br/>



> Built with LangGraph · Groq llama-3.3-70b · FastAPI · MongoDB · Twilio
