/**
 * API client for FarmProfit AI backend.
 * Talks to FastAPI:
 *   GET  /market-filters
 *   GET  /market-catalogue
 *   GET  /markets
 *   POST /recommend
 */

const RAW_API_BASE = import.meta.env.VITE_API_BASE_URL || ''
const API_BASE = RAW_API_BASE.replace(/\/+$/, '')

if (typeof window !== 'undefined') {
  console.log(`[FarmProfit API] Base URL: "${API_BASE || '(relative / Vite proxy -> http://127.0.0.1:8000)'}"`)
}

const DEFAULT_TIMEOUT_MS = 15000

/**
 * Robust fetch wrapper with timeout via AbortController.
 */
async function apiFetch(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Extract human-readable error detail from response.
 */
async function extractErrorDetail(response, defaultMsg) {
  try {
    const text = await response.text()
    try {
      const parsed = JSON.parse(text)
      if (typeof parsed.detail === 'string') return parsed.detail
      if (Array.isArray(parsed.detail)) {
        return parsed.detail.map((e) => e.msg || e.message).join(', ')
      }
      if (parsed.message) return parsed.message
    } catch {
      if (text && text.length < 200) return text
    }
  } catch {
    // fallback to default
  }
  return defaultMsg
}

export async function fetchMarketFilters() {
  const url = `${API_BASE}/market-filters`
  try {
    const response = await apiFetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      const detail = await extractErrorDetail(
        response,
        `Error ${response.status}: Failed to fetch market filters`,
      )
      return {
        available: false,
        states: [],
        districts: [],
        locations: [],
        commodities: [],
        error: { kind: 'http_error', message: detail },
      }
    }
    return await response.json()
  } catch (err) {
    const isTimeout = err?.name === 'AbortError'
    return {
      available: false,
      states: [],
      districts: [],
      locations: [],
      commodities: [],
      error: {
        kind: isTimeout ? 'timeout_error' : 'network_error',
        message: isTimeout
          ? 'Request timed out while loading market filters.'
          : 'Could not connect to backend server. Ensure backend is running (e.g. uvicorn main:app on port 8000).',
      },
    }
  }
}

/**
 * Fetch market price observations from the backend.
 * @param {Object} params - Query filters { commodity, state, district, limit }
 * @returns {Promise<Object>} MarketsResponse { available, records, count, source, error }
 */
export async function fetchMarkets(params = {}) {
  const query = new URLSearchParams()
  if (params.commodity) query.set('commodity', params.commodity.trim())
  if (params.state) query.set('state', params.state.trim())
  if (params.district) query.set('district', params.district.trim())
  if (params.limit) query.set('limit', String(params.limit))

  const url = `${API_BASE}/markets?${query.toString()}`

  try {
    const response = await apiFetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      const detail = await extractErrorDetail(
        response,
        `Error ${response.status}: Failed to fetch markets`,
      )
      return {
        available: false,
        records: [],
        count: 0,
        source: null,
        error: { kind: 'http_error', message: detail },
      }
    }

    return await response.json()
  } catch (err) {
    const isTimeout = err?.name === 'AbortError'
    return {
      available: false,
      records: [],
      count: 0,
      source: null,
      error: {
        kind: isTimeout ? 'timeout_error' : 'network_error',
        message: isTimeout
          ? 'Request timed out while loading market prices.'
          : 'Could not connect to backend server. Ensure backend is running on port 8000.',
      },
    }
  }
}

export async function fetchMarketCatalogue(commodity, district) {
  const params = new URLSearchParams()
  if (commodity?.trim()) params.set('commodity', commodity.trim())
  if (district?.trim()) params.set('district', district.trim())
  const query = params.toString() ? `?${params.toString()}` : ''
  const url = `${API_BASE}/market-catalogue${query}`

  try {
    const response = await apiFetch(url, {
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      const detail = await extractErrorDetail(
        response,
        `Error ${response.status}: Failed to fetch market catalogue`,
      )
      return {
        available: false,
        entries: [],
        error: { kind: 'http_error', message: detail },
      }
    }
    return await response.json()
  } catch (err) {
    const isTimeout = err?.name === 'AbortError'
    return {
      available: false,
      entries: [],
      error: {
        kind: isTimeout ? 'timeout_error' : 'network_error',
        message: isTimeout
          ? 'Request timed out while loading market catalogue.'
          : 'Could not connect to backend server. Ensure backend is running on port 8000.',
      },
    }
  }
}

/**
 * Request optimal market recommendation from the backend engine.
 * @param {Object} payload - { crop, quantity_kg, farmer_location, transportation_costs, other_costs, state, district, markets }
 * @returns {Promise<Object>} RecommendationResponse { available, recommendation, error }
 */
export async function getRecommendation(payload) {
  const url = `${API_BASE}/recommend`

  try {
    const response = await apiFetch(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      },
      25000, // allow 25s for routing / calculations
    )

    if (!response.ok) {
      const detail = await extractErrorDetail(
        response,
        `Error ${response.status}: Recommendation request failed`,
      )
      return {
        available: false,
        recommendation: null,
        error: {
          kind: 'api_error',
          message: detail,
        },
      }
    }

    return await response.json()
  } catch (err) {
    const isTimeout = err?.name === 'AbortError'
    return {
      available: false,
      recommendation: null,
      error: {
        kind: isTimeout ? 'timeout_error' : 'network_error',
        message: isTimeout
          ? 'Recommendation calculation timed out.'
          : 'Could not connect to backend server. Make sure the FastAPI service is running on port 8000.',
      },
    }
  }
}
