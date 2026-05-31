# main.py
from fastapi import FastAPI, Form
from fastapi.responses import Response
from twilio.twiml.voice_response import VoiceResponse, Gather

app = FastAPI()

@app.post("/voice")
async def incoming_call():
    """First hit - caller just connected"""
    response = VoiceResponse()
    
    gather = Gather(
        input="speech",           # accept voice, not keypad
        action="/voice/respond",  # where to send the transcript
        speech_timeout="auto",    # stops listening after silence
        language="en-IN"          # Indian English
    )
    gather.say("Hello, welcome to Kukkad Nukkad. How can I help you?", 
               voice="Polly.Aditi")  # Indian voice
    
    response.append(gather)
    return Response(content=str(response), media_type="application/xml")


@app.post("/voice/respond")
async def handle_speech(SpeechResult: str = Form(...), 
                         CallSid: str = Form(...)):
    """Every subsequent turn - SpeechResult is what caller said"""
    response = VoiceResponse()
    
    # For now, just echo back
    agent_reply = f"You said: {SpeechResult}"  # ← Claude goes here later
    print(agent_reply)
    gather = Gather(
        input="speech",
        action="/voice/respond",   # loops back to same endpoint
        speech_timeout="auto",
        language="en-IN"
    )
    gather.say(agent_reply, voice="Polly.Aditi")
    
    response.append(gather)
    return Response(content=str(response), media_type="application/xml")