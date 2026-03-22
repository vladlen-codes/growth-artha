from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

# In-memory store — replace with SQLite in Step 5 if time permits
_portfolio_store: dict = {}

class Holding(BaseModel):
    symbol: str
    quantity: float
    avg_price: float

class PortfolioRequest(BaseModel):
    session_id: str
    holdings: list[Holding]

@router.post("/save")
def save_portfolio(request: PortfolioRequest):
    _portfolio_store[request.session_id] = [h.dict() for h in request.holdings]
    return {"status": "saved", "count": len(request.holdings)}

@router.get("/{session_id}")
def get_portfolio(session_id: str):
    holdings = _portfolio_store.get(session_id, [])
    return {"session_id": session_id, "holdings": holdings}