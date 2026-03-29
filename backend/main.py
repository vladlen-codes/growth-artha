import uvicorn
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from backend.api import radar, stocks, portfolio, chat, video
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


class PermissiveCORSMiddleware(BaseHTTPMiddleware):
    """
    Dead-simple CORS middleware that works regardless of Starlette version quirks.
    Always returns Access-Control-Allow-Origin: * for every request.
    """
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            response = JSONResponse(content={}, status_code=200)
        else:
            response = await call_next(request)

        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        return response


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

app.add_middleware(PermissiveCORSMiddleware)

# Routers — each file handles one domain
app.include_router(radar.router,     prefix="/api/radar",     tags=["Radar"])
app.include_router(stocks.router,    prefix="/api/stocks",    tags=["Stocks"])
app.include_router(portfolio.router, prefix="/api/portfolio", tags=["Portfolio"])
app.include_router(chat.router,      prefix="/api/chat",      tags=["Chat"])
app.include_router(video.router,     prefix="/api/video",     tags=["Video"])

@app.get("/")
def root():
    return {"status": "ok", "product": "Growth Artha", "version": "1.0.0"}

@app.get("/health")
def health():
    return {"status": "healthy"}

if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8002, reload=True)