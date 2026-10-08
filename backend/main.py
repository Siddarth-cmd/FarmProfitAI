from fastapi import FastAPI

from api.markets import router as markets_router
from api.recommendation import router as recommendation_router

app = FastAPI(
    title="FarmProfit AI",
    description="API for recommending where and when farmers should sell produce.",
    version="0.1.0",
)

app.include_router(markets_router)
app.include_router(recommendation_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
