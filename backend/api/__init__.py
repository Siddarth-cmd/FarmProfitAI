# HTTP routes and request handlers.

from api.markets import router as markets_router
from api.recommendation import router as recommendation_router

__all__ = ["markets_router", "recommendation_router"]
