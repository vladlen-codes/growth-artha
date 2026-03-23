import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from backend.api import radar, stocks, portfolio, chat

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Growth Artha API starting...")
    yield
    print("Growth Artha API shutting down...")

app = FastAPI(
    title="Growth Artha API",
    description="AI signal engine for Indian retail investors",
    version="1.0.0",
    lifespan=lifespan
)

# CORS — allows React on :5173 to talk to FastAPI on :8000
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:5174", "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers — each file handles one domain
app.include_router(radar.router,     prefix="/api/radar",     tags=["Radar"])
app.include_router(stocks.router,    prefix="/api/stocks",    tags=["Stocks"])
app.include_router(portfolio.router, prefix="/api/portfolio", tags=["Portfolio"])
app.include_router(chat.router,      prefix="/api/chat",      tags=["Chat"])

@app.get("/")
def root():
    return {"status": "ok", "product": "Growth Artha", "version": "1.0.0"}

@app.get("/health")
def health():
    return {"status": "healthy"}

if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)