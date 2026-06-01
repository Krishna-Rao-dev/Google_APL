# backend/main.py
import logging
import traceback
from fastapi import FastAPI, Form, Request
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from twilio.twiml.voice_response import VoiceResponse, Gather

from backend.db import seed_menu, get_full_menu
from backend.agent import chat, end_session
from backend.dashboard_routes import router as dashboard_router

# ── Logging setup ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%H:%M:%S"
)
log = logging.getLogger("kukkad")

active_calls: dict[str, str] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("🚀 Starting up — seeding menu...")
    try:
        await seed_menu()
        log.info("✅ Menu seeded OK")
    except Exception as e:
        log.error(f"❌ Menu seed failed: {e}")
        log.error(traceback.format_exc())
    yield
    log.info("🛑 Shutting down")


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard_router)


# ── Debug middleware — logs every request/response ────────────────────────────
@app.middleware("http")
async def log_requests(request: Request, call_next):
    log.info(f"▶ {request.method} {request.url.path}")
    try:
        # Log raw body for Twilio POST requests
        if request.method == "POST":
            body = await request.body()
            log.debug(f"  BODY: {body.decode('utf-8', errors='replace')[:500]}")
            # Rebuild request so FastAPI can still read it
            from starlette.datastructures import Headers
            from starlette.requests import Request as StarletteRequest
            import io
            async def receive():
                return {"type": "http.request", "body": body}
            request = Request(request.scope, receive)

        response = await call_next(request)
        log.info(f"◀ {response.status_code} {request.url.path}")
        return response
    except Exception as e:
        log.error(f"❌ Middleware error: {e}")
        log.error(traceback.format_exc())
        raise


def twiml_say(text: str) -> Response:
    log.info(f"🗣  Priya says: {text[:120]}")
    vr = VoiceResponse()
    gather = Gather(
        input="speech",
        action="/voice/respond",
        speech_timeout="auto",
        language="en-IN",
        enhanced=True
    )
    gather.say(text, voice="Polly.Aditi", language="en-IN")
    vr.append(gather)
    # Fallback if caller goes silent
    vr.say("I didn't catch that, please call again. Goodbye!", voice="Polly.Aditi")
    xml = str(vr)
    log.debug(f"  TwiML: {xml}")
    return Response(content=xml, media_type="application/xml")


def twiml_error(msg: str = "Something went wrong, please call again.") -> Response:
    vr = VoiceResponse()
    vr.say(msg, voice="Polly.Aditi")
    return Response(content=str(vr), media_type="application/xml")


# ── Twilio webhooks ───────────────────────────────────────────────────────────

@app.post("/voice")
async def incoming_call(
    CallSid: str = Form(...),
    From: str = Form(...),
    To: str = Form(default="unknown"),
    CallStatus: str = Form(default="unknown"),
):
    log.info(f"📞 Incoming call | SID={CallSid} | From={From} | To={To} | Status={CallStatus}")
    try:
        phone = From
        active_calls[CallSid] = phone

        log.debug("  Fetching menu from DB...")
        menu = await get_full_menu()
        log.info(f"  Menu loaded: {len(menu)} items")

        log.debug("  Initialising agent session...")
        await chat(CallSid, "__init__", phone, menu)
        log.info(f"  Session created for {CallSid}")

        vr = VoiceResponse()
        gather = Gather(
            input="speech",
            action="/voice/respond",
            speech_timeout="auto",
            language="en-IN",
            enhanced=True
        )
        gather.say(
            "Hello! Welcome to Kukkad Nukkad. How can I help you today?",
            voice="Polly.Aditi",
            language="en-IN"
        )
        vr.append(gather)
        return Response(content=str(vr), media_type="application/xml")

    except Exception as e:
        log.error(f"❌ /voice error: {e}")
        log.error(traceback.format_exc())
        return twiml_error()


@app.post("/voice/respond")
async def handle_speech(
    SpeechResult: str = Form(default=""),
    Confidence: str = Form(default="0"),
    CallSid: str = Form(...),
    From: str = Form(...),
):
    log.info(f"🎙  Speech | SID={CallSid} | Confidence={Confidence}")
    log.info(f"  Customer said: '{SpeechResult}'")

    try:
        if not SpeechResult.strip():
            log.warning("  Empty SpeechResult — asking to repeat")
            return twiml_say("Sorry, I didn't catch that. Could you say that again?")

        phone = From
        menu = await get_full_menu()

        log.debug("  Sending to agent...")
        reply = await chat(CallSid, SpeechResult, phone, menu)
        log.info(f"  Agent reply: '{reply[:120]}'")

        return twiml_say(reply)

    except Exception as e:
        log.error(f"❌ /voice/respond error: {e}")
        log.error(traceback.format_exc())
        return twiml_error("Sorry, I ran into an issue. Please call again.")


@app.post("/voice/status")
async def call_status(
    CallSid: str = Form(...),
    CallStatus: str = Form(...),
    CallDuration: str = Form(default="0"),
):
    log.info(f"📋 Status update | SID={CallSid} | Status={CallStatus} | Duration={CallDuration}s")
    if CallStatus in ("completed", "failed", "busy", "no-answer"):
        phone = active_calls.pop(CallSid, "unknown")
        log.info(f"  Cleaning up session for {phone}")
        await end_session(CallSid, phone)
    return Response(status_code=204)


@app.get("/")
async def health():
    log.debug("Health check hit")
    return {"status": "Kukkad Nukkad agent running 🍛"}