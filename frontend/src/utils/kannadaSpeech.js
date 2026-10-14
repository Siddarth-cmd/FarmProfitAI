import { getCropDisplayName } from '../localization.js'

/**
 * Identify a genuine Kannada-capable voice from the browser's speech synthesis voices.
 * Returns null if no Kannada voice is available on this browser/device.
 *
 * @param {SpeechSynthesisVoice[]} voices
 * @returns {SpeechSynthesisVoice | null}
 */
export function getKannadaVoice(voices) {
  if (!Array.isArray(voices) || voices.length === 0) return null

  // 1. Prefer voices with BCP-47 language tag starting with 'kn' (e.g., 'kn-IN', 'kn')
  const langMatch = voices.find((v) => {
    const lang = (v.lang || '').toLowerCase().replace('_', '-')
    return lang === 'kn-in' || lang === 'kn' || lang.startsWith('kn-')
  })
  if (langMatch) return langMatch

  // 2. Secondary check: Voice name mentioning Kannada
  const nameMatch = voices.find((v) => {
    const name = (v.name || '').toLowerCase()
    return name.includes('kannada')
  })
  if (nameMatch) return nameMatch

  return null
}

/**
 * Format an integer or float with Indian number grouping for readability in text.
 * @param {number} num
 * @returns {string}
 */
function formatNumber(num) {
  return Math.round(num).toLocaleString('en-IN')
}

/**
 * Construct a natural Kannada-language spoken summary from the recommendation data.
 * Adheres strictly to:
 * - Genuine recommendation validation (returns null if unavailable or missing).
 * - Never fabricating missing values or assuming missing transport costs are zero.
 * - Including crop, variety, quantity, market, net return, price, transport, and why recommended.
 *
 * @param {object} data - Recommendation result object from backend
 * @param {object} [options] - Additional context like inputs
 * @returns {string | null}
 */
export function buildKannadaRecommendationSummary(data, options = {}) {
  if (!data) return null

  // Check if recommendation was actually generated
  const marketName = data.recommended_market || data.recommendation?.recommended_market
  if (!marketName || data.available === false || data.error) {
    return null
  }

  const crop = data.crop || options.crop || ''
  const variety = data.variety || options.variety || ''
  const quantity = data.quantity_kg || options.quantity_kg || null
  const netReturn = typeof data.expected_net_return === 'number'
    ? data.expected_net_return
    : data.recommendation?.expected_net_return

  const grossRevenue = typeof data.expected_gross_revenue === 'number'
    ? data.expected_gross_revenue
    : data.recommendation?.expected_gross_revenue

  const transportCost = typeof data.transportation_cost === 'number'
    ? data.transportation_cost
    : data.recommendation?.transportation_cost

  const otherCosts = typeof data.other_costs === 'number'
    ? data.other_costs
    : data.recommendation?.other_costs

  const rankedMarkets = Array.isArray(data.ranked_markets) ? data.ranked_markets : []
  const bestMarket = rankedMarkets[0] || null
  const runnerUp = rankedMarkets[1] || null

  const parts = []

  // 1. Crop, variety, quantity, and recommended market
  const cropKn = crop ? getCropDisplayName(crop, 'kn') : 'ಬೆಳೆ'
  const varietyPart = variety && variety.trim() ? `${variety.trim()} ತಳಿಯ ` : ''
  const qtyPart = quantity && Number.isFinite(Number(quantity)) && Number(quantity) > 0
    ? `${formatNumber(Number(quantity))} ಕಿಲೋಗ್ರಾಂ `
    : ''

  parts.push(`ನಿಮ್ಮ ${qtyPart}${varietyPart}${cropKn} ಮಾರಾಟಕ್ಕೆ ${marketName} ಅತ್ಯುತ್ತಮ ಮಾರುಕಟ್ಟೆಯಾಗಿದೆ.`)

  // 2. Expected Net Return (with currency and units)
  if (typeof netReturn === 'number' && Number.isFinite(netReturn)) {
    parts.push(`ಎಲ್ಲಾ ವೆಚ್ಚಗಳನ್ನು ಕಳೆದ ನಂತರ ನಿಮ್ಮ ಅಂದಾಜು ನಿವ್ವಳ ಲಾಭ ${formatNumber(netReturn)} ರೂಪಾಯಿಗಳು.`)
  }

  // 3. Selling price per kg (if known)
  const pricePerKg = bestMarket?.price_per_kg != null
    ? bestMarket.price_per_kg
    : (grossRevenue && quantity && Number(quantity) > 0 ? (grossRevenue / Number(quantity)) : null)

  if (pricePerKg != null && Number.isFinite(pricePerKg) && pricePerKg > 0) {
    parts.push(`ಈ ಮಾರುಕಟ್ಟೆಯಲ್ಲಿ ನಿರೀಕ್ಷಿತ ಬೆಲೆ ಪ್ರತಿ ಕಿಲೋಗ್ರಾಂಗೆ ${formatNumber(pricePerKg)} ರೂಪಾಯಿ.`)
  }

  // 4. Transportation cost (only if explicitly available)
  if (transportCost !== null && transportCost !== undefined && Number.isFinite(transportCost)) {
    if (transportCost > 0) {
      parts.push(`ಅಂದಾಜು ಸಾರಿಗೆ ವೆಚ್ಚ ${formatNumber(transportCost)} ರೂಪಾಯಿ.`)
    } else {
      parts.push(`ಸಾರಿಗೆ ವೆಚ್ಚ ಶೂನ್ಯ ರೂಪಾಯಿ ಎಂದು ದಾಖಲಾಗಿದೆ.`)
    }
  }

  // 5. Other costs (if positive)
  if (otherCosts !== null && otherCosts !== undefined && Number.isFinite(otherCosts) && otherCosts > 0) {
    parts.push(`ಇತರ ಮಾರುಕಟ್ಟೆ ವೆಚ್ಚಗಳು ${formatNumber(otherCosts)} ರೂಪಾಯಿ.`)
  }

  // 6. Why recommended / Runner-up comparison
  if (runnerUp && runnerUp.name && bestMarket && typeof bestMarket.net_return === 'number' && typeof runnerUp.net_return === 'number') {
    const diff = Math.round(bestMarket.net_return - runnerUp.net_return)
    if (diff > 0) {
      parts.push(`ಇದು ಎರಡನೇ ಅತ್ಯುತ್ತಮ ಮಾರುಕಟ್ಟೆಯಾದ ${runnerUp.name} ಗಿಂತ ಸುಮಾರು ${formatNumber(diff)} ರೂಪಾಯಿ ಹೆಚ್ಚು ನಿವ್ವಳ ಲಾಭ ನೀಡುತ್ತದೆ.`)
    } else {
      parts.push(`ಸಾರಿಗೆ ಮತ್ತು ಮಂಡಿ ವೆಚ್ಚಗಳನ್ನು ಗಣನೆಗೆ ತೆಗೆದುಕೊಂಡು ಇದು ಗರಿಷ್ಠ ಲಾಭ ನೀಡುತ್ತದೆ.`)
    }
  } else if (data.explanation) {
    parts.push(`ಸಾರಿಗೆ ವೆಚ್ಚ ಮತ್ತು ಬೆಲೆಯನ್ನು ಹೋಲಿಸಿ ಈ ಶಿಫಾರಸು ನೀಡಲಾಗಿದೆ.`)
  }

  return parts.join(' ')
}
