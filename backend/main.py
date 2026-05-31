# backend/main.py  (final version)
from fastapi import FastAPI, Form
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from twilio.twiml.voice_response import VoiceResponse, Gather

from backend.db import seed_menu, get_full_menu
from backend.agent import chat, end_session
from backend.dashboard_routes import router as dashboard_router

active_calls: dict[str, str] = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    await seed_menu()
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard_router)


def twiml_say(text: str) -> Response:
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
    vr.say("I didn't catch that. Please call again. Goodbye!", voice="Polly.Aditi")
    return Response(content=str(vr), media_type="application/xml")


@app.post("/voice")
async def incoming_call(CallSid: str = Form(...), From: str = Form(...)):
    phone = From
    active_calls[CallSid] = phone
    menu = await get_full_menu()
    await chat(CallSid, "__init__", phone, menu)

    vr = VoiceResponse()
    gather = Gather(input="speech", action="/voice/respond",
                    speech_timeout="auto", language="en-IN", enhanced=True)
    gather.say("Hello! Welcome to Kukkad Nukkad. How can I help you today?",
               voice="Polly.Aditi", language="en-IN")
    vr.append(gather)
    return Response(content=str(vr), media_type="application/xml")


@app.post("/voice/respond")
async def handle_speech(
    SpeechResult: str = Form(default=""),
    CallSid: str = Form(...),
    From: str = Form(...)
):
    if not SpeechResult.strip():
        return twiml_say("Sorry, I didn't catch that. Could you repeat?")

    menu = await get_full_menu()
    reply = await chat(CallSid, SpeechResult, From, menu)
    return twiml_say(reply)


@app.post("/voice/status")
async def call_status(CallSid: str = Form(...), CallStatus: str = Form(...)):
    if CallStatus in ("completed", "failed", "busy", "no-answer"):
        phone = active_calls.pop(CallSid, "unknown")
        await end_session(CallSid, phone)
    return Response(status_code=204)


@app.get("/")
async def health():
    return {"status": "Kukkad Nukkad agent running"}