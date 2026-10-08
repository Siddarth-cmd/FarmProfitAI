"""Market data API endpoints."""

from fastapi import APIRouter, Header, Query

from models.market_models import MarketErrorDetails, MarketsResponse
from services.data_gov_client import try_fetch_market_prices

router = APIRouter(tags=["markets"])


@router.get("/markets", response_model=MarketsResponse)
def get_markets(
    commodity: str | None = Query(
        default=None,
        description="Commodity name to filter by (e.g., Tomato)",
    ),
    state: str | None = Query(
        default=None,
        description="State name to filter by (e.g., Maharashtra)",
    ),
    district: str | None = Query(
        default=None,
        description="District name to filter by (e.g., Nashik)",
    ),
    limit: int = Query(
        default=10,
        ge=1,
        le=100,
        description="Maximum number of records to return",
    ),
    api_key: str | None = Query(
        default=None,
        description="Optional Data.gov.in API key override via query parameter",
    ),
    x_api_key: str | None = Header(
        default=None,
        alias="X-Data-Gov-Api-Key",
        description="Optional Data.gov.in API key override via header",
    ),
) -> MarketsResponse:
    """Fetch validated market mandi prices from Data.gov.in.

    Filters can narrow down results by commodity, state, and district.
    If the external service is unavailable or key is not configured, returns
    fallback/availability status gracefully.
    """
    effective_key = api_key or x_api_key
    result = try_fetch_market_prices(
        limit=limit,
        commodity=commodity,
        state=state,
        district=district,
        api_key=effective_key,
    )

    error = None
    if not result.available and result.error_kind and result.error_message:
        error = MarketErrorDetails(
            kind=result.error_kind,
            message=result.error_message,
        )

    return MarketsResponse(
        available=result.available,
        records=result.records,
        count=len(result.records),
        source=result.source,
        skipped_invalid=result.skipped_invalid,
        error=error,
    )
