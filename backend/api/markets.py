"""Market data API endpoints."""

from fastapi import APIRouter, Header, Query
from fastapi import HTTPException

from models.market_models import (
    MarketErrorDetails,
    MarketFiltersResponse,
    MarketCatalogueResponse,
    MarketsResponse,
    VerifiedLocationOption,
)
from services.agmarknet_client import AgmarknetError, fetch_filter_metadata
from services.distance_provider import verified_location_options
from services.market_data_service import fetch_market_prices_with_fallback
from core.geography import KARNATAKA_STATE
from services.market_catalogue import (
    CATALOGUE_SOURCE,
    load_karnataka_market_catalogue,
    same_catalogue_identity,
)

router = APIRouter(tags=["markets"])


@router.get("/market-catalogue", response_model=MarketCatalogueResponse)
def get_market_catalogue(
    commodity: str | None = Query(default=None),
    district: str | None = Query(default=None),
) -> MarketCatalogueResponse:
    """Return curated Karnataka market identities and observed-price flags."""
    entries = load_karnataka_market_catalogue()
    price_result = fetch_market_prices_with_fallback(
        limit=100,
        commodity=commodity,
        state=KARNATAKA_STATE,
        district=district,
    )
    entries = [
        entry.model_copy(
            update={
                "price_available": any(
                    same_catalogue_identity(record, entry)
                    for record in price_result.records
                )
            }
        )
        for entry in entries
    ]
    return MarketCatalogueResponse(
        entries=entries,
        source=CATALOGUE_SOURCE,
        price_source=price_result.source,
        price_data_available=bool(price_result.records),
        error=(
            MarketErrorDetails(
                kind=price_result.error_kind,
                message=price_result.error_message,
            )
            if price_result.error_kind and price_result.error_message
            else None
        ),
    )


@router.get("/market-filters", response_model=MarketFiltersResponse)
def get_market_filters() -> MarketFiltersResponse:
    """Return searchable state and district options from Agmarknet."""
    try:
        states, districts, commodities = fetch_filter_metadata()
    except AgmarknetError as exc:
        return MarketFiltersResponse(
            available=False,
            error=MarketErrorDetails(kind="service", message=str(exc)),
        )
    states = [
        option for option in states
        if option.name.casefold() == KARNATAKA_STATE.casefold()
    ]
    state_ids = {option.id for option in states}
    districts = [option for option in districts if option.state_id in state_ids]
    locations = [
        VerifiedLocationOption(**item)
        for item in verified_location_options()
    ]
    return MarketFiltersResponse(
        states=states,
        districts=districts,
        commodities=commodities,
        locations=locations,
    )


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
        default=100,
        ge=1,
        le=500,
        description="Maximum number of records to return (default: 100, max: 500)",
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
    """Fetch validated market observations from Agmarknet, then Data.gov.in.

    Filters can narrow down results by commodity, state, and district.
    If live services are unavailable or the Data.gov.in key is not configured,
    the endpoint returns clearly labelled local fallback data when available.
    """
    if state and state.strip().casefold() != KARNATAKA_STATE.casefold():
        raise HTTPException(
            status_code=400,
            detail=f"Only {KARNATAKA_STATE} market data is supported.",
        )

    effective_key = api_key or x_api_key
    result = fetch_market_prices_with_fallback(
        limit=limit,
        commodity=commodity,
        state=state or KARNATAKA_STATE,
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
        using_fallback=result.using_fallback,
        skipped_invalid=result.skipped_invalid,
        error=error,
    )
