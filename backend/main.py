from fastapi import FastAPI

app = FastAPI(
    title="FarmProfit AI",
    description="API for recommending where and when farmers should sell produce.",
    version="0.1.0",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
