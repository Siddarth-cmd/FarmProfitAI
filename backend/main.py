import asyncio
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Pre-load environment configuration from root and backend directories
_backend_dir = Path(__file__).resolve().parent
_root_dir = _backend_dir.parent
load_dotenv(_root_dir / ".env")
load_dotenv(_backend_dir / ".env")

from api.markets import router as markets_router
from api.recommendation import router as recommendation_router
from api.forecast import router as forecast_router
from services.market_data_service import _background_ingestion_loop

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_background_ingestion_loop())
    try:
        yield
    finally:
        task.cancel()

app = FastAPI(
    title="FarmProfit AI",
    description="API for recommending where and when farmers should sell produce.",
    version="0.1.0",
    lifespan=lifespan,
)

# Enable CORS for frontend Vite dev and preview servers, and direct browser requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(markets_router)
app.include_router(recommendation_router)
app.include_router(forecast_router)

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
