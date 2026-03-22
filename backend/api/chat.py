from fastapi import APIRouter
from pydantic import BaseModel
from backend.ai.gemini_client import answer_chat_question

router = APIRouter()

class ChatRequest(BaseModel):
    question: str
    portfolio: list[str] = []
    session_id: str = ""

@router.post("/ask")
def ask(request: ChatRequest):
    from backend.api.radar import _jobs

    # Pull latest signals for context
    completed = [j for j in _jobs.values() if j["status"] == "done"]
    latest_signals = completed[-1]["result"] if completed else {}

    context = {
        "portfolio": request.portfolio,
        "signals": latest_signals
    }

    answer = answer_chat_question(request.question, context)
    return {"answer": answer}