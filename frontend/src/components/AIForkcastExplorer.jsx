import React, { useState, useEffect, useCallback } from 'react'
import {
  Sparkles,
  RefreshCw,
  AlertCircle,
  Database,
} from 'lucide-react'
import AITimingForecast from './AITimingForecast'
import { fetchMarketFilters, fetchAvailableMarkets } from '../services/api'
import { useLanguage, getCropDisplayName } from '../localization'

const DEFAULT_CROPS = [
  'Tomato',
  'Onion',
  'Potato',
  'Maize',
  'Green Chilli',
  'Cabbage',
  'Carrot',
  'Capsicum',
]

export default function AIForkcastExplorer() {
  const { language, t } = useLanguage()
  const [selectedCrop, setSelectedCrop] = useState('Tomato')
  const [selectedMarket, setSelectedMarket] = useState('')
  const [selectedDistrict, setSelectedDistrict] = useState('')
  const [quantityKg, setQuantityKg] = useState(1000)
  const [transportCost, setTransportCost] = useState(400)

  const [cropOptions, setCropOptions] = useState(DEFAULT_CROPS)
  const [marketOptions, setMarketOptions] = useState([])
  const [marketsLoading, setMarketsLoading] = useState(false)
  const [marketsError, setMarketsError] = useState(null)

  // The committed query sent to AITimingForecast (only updated on submit)
  const [committedQuery, setCommittedQuery] = useState(null)

  // Load commodity options from backend
  useEffect(() => {
    async function loadCropOptions() {
      try {
        const filters = await fetchMarketFilters()
        if (filters?.commodities?.length > 0) {
          const names = filters.commodities.map((c) => c.name).filter(Boolean)
          setCropOptions(Array.from(new Set([...DEFAULT_CROPS, ...names])).slice(0, 50))
        }
      } catch {
        // use DEFAULT_CROPS as fallback
      }
    }
    loadCropOptions()
  }, [])

  // Load available markets for the selected crop from the backend observations DB
  const loadMarkets = useCallback(async (crop) => {
    if (!crop) return
    setMarketsLoading(true)
    setMarketsError(null)
    setMarketOptions([])
    setSelectedMarket('')
    setSelectedDistrict('')

    try {
      const result = await fetchAvailableMarkets(crop)
      if (result.available && result.markets?.length > 0) {
        setMarketOptions(result.markets)
        // Auto-select the market with most observations (first in sorted list)
        setSelectedMarket(result.markets[0].market)
        setSelectedDistrict(result.markets[0].district)
      } else {
        setMarketsError(
          `No markets with recorded price data found for "${crop}". ` +
          `Try searching for this crop in Market Explorer first to populate observations.`
        )
      }
    } catch {
      setMarketsError('Could not load market options. Check backend connection.')
    } finally {
      setMarketsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMarkets(selectedCrop)
  }, [selectedCrop, loadMarkets])

  const handleMarketChange = (e) => {
    const marketName = e.target.value
    setSelectedMarket(marketName)
    const found = marketOptions.find((m) => m.market === marketName)
    setSelectedDistrict(found ? found.district : '')
    setCommittedQuery(null) // reset forecast on market change
  }

  const handleCropChange = (e) => {
    setSelectedCrop(e.target.value)
    setCommittedQuery(null)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!selectedMarket) return
    setCommittedQuery({
      commodity: selectedCrop,
      market: selectedMarket,
      district: selectedDistrict || null,
      quantityKg: Number(quantityKg) || 1000,
      transportCost: Number(transportCost) || 0,
    })
  }

  return (
    <section className="py-12 md:py-20 botanical-bg reveal-soft">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Title */}
      <div className="text-center max-w-3xl mx-auto mb-10">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#E6EDE0] border border-[#9CAF88]/50 text-[#3A472E] text-xs font-bold uppercase tracking-wider mb-3 shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-[#CC5500]" />
          <span>{language === 'kn' ? 'ಕರ್ನಾಟಕ ಎಪಿಎಂಸಿ ಮುನ್ನೋಟ' : 'Karnataka APMC Price Intelligence'}</span>
        </div>
        <h2 className="text-3xl sm:text-5xl font-extrabold text-[#1D201C] tracking-tight">
          {language === 'kn' ? 'ಎಐ ಬೆಲೆ ಮುನ್ನೋಟ ಮತ್ತು ಸಮಯ' : 'AI Price Forecast & Timing'}
        </h2>
        <p className="mt-3 text-base text-[#5C5C5A]">
          {language === 'kn'
            ? 'ಕರ್ನಾಟಕ ಎಪಿಎಂಸಿ ದರಗಳ ಮುನ್ನೋಟವನ್ನು ಪರಿಶೀಲಿಸಿ, ತಕ್ಷಣ ಮಾರಾಟ ಮಾಡಬೇಕೇ ಅಥವಾ ಕಾಯಬೇಕೇ ಎಂದು ನಿರ್ಧರಿಸಿ.'
            : 'Track Karnataka APMC wholesale arrivals, review verified historical observations, and understand whether to sell immediately or hold produce.'}
        </p>
      </div>

      {/* Control Selector Card */}
      <form
        onSubmit={handleSubmit}
        className="card-botanical p-6 sm:p-8 rounded-3xl border border-[#E2DFD5] shadow-lg mb-6"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          {/* Crop Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#1D201C] mb-1.5">
              {t('crop')}
            </label>
            <select
              value={selectedCrop}
              onChange={handleCropChange}
              className="w-full bg-[#F5F5F3] border border-[#DEDEDA] rounded-xl px-3.5 py-2.5 text-sm font-semibold text-[#1D201C] focus:bg-white focus:border-[#9CAF88] outline-hidden cursor-pointer shadow-2xs"
            >
              {cropOptions.map((crop) => (
                <option key={crop} value={crop}>
                  {getCropDisplayName(crop, language)}
                </option>
              ))}
            </select>
          </div>

          {/* Market Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#1D201C] mb-1.5">
              {t('marketMandi')}
              {marketsLoading && (
                <span className="ml-1 text-[10px] font-normal text-[#646860] normal-case">{t('loadingIndicator')}</span>
              )}
            </label>
            <select
              value={selectedMarket}
              onChange={handleMarketChange}
              disabled={marketsLoading || marketOptions.length === 0}
              className="w-full bg-[#F5F5F3] border border-[#DEDEDA] rounded-xl px-3.5 py-2.5 text-sm font-semibold text-[#1D201C] focus:bg-white focus:border-[#9CAF88] outline-hidden cursor-pointer disabled:opacity-50 shadow-2xs"
            >
              {marketOptions.length === 0 && !marketsLoading && (
                <option value="">{t('marketOptionsEmpty')}</option>
              )}
              {marketOptions.map((m) => (
                <option key={`${m.market}|${m.district}`} value={m.market}>
                  {m.market} — {m.district} ({m.observation_count} obs.)
                </option>
              ))}
            </select>
          </div>

          {/* Quantity Input */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#1D201C] mb-1.5">
              {t('quantityKg')}
            </label>
            <input
              type="number"
              min="1"
              value={quantityKg}
              onChange={(e) => setQuantityKg(Math.max(1, Number(e.target.value)))}
              className="w-full bg-[#F5F5F3] border border-[#DEDEDA] rounded-xl px-3.5 py-2.5 text-sm font-semibold text-[#1D201C] focus:bg-white focus:border-[#9CAF88] outline-hidden shadow-2xs"
            />
          </div>

          {/* Transport Cost */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#1D201C] mb-1.5">
              {t('transportCost')} (₹)
            </label>
            <input
              type="number"
              min="0"
              value={transportCost}
              onChange={(e) => setTransportCost(Math.max(0, Number(e.target.value)))}
              className="w-full bg-[#F5F5F3] border border-[#DEDEDA] rounded-xl px-3.5 py-2.5 text-sm font-semibold text-[#1D201C] focus:bg-white focus:border-[#9CAF88] outline-hidden shadow-2xs"
            />
          </div>
        </div>

        {/* Submit Row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 border-t border-[#E2DFD5]">
          <button
            type="submit"
            disabled={marketsLoading || !selectedMarket}
            className="btn-3d-amber px-7 py-3 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {marketsLoading ? (
              <RefreshCw className="w-4 h-4 animate-spin text-white" />
            ) : (
              <Sparkles className="w-4 h-4 text-white" />
            )}
            <span>{t('runAIForecastBtn')}</span>
          </button>

          {selectedMarket && selectedDistrict && (
            <span className="text-xs text-[#646860] flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-[#5E724C]" />
              <span>{t('selectedMandiLabel')}: <strong className="text-[#1D201C]">{selectedMarket}</strong> ({selectedDistrict})</span>
            </span>
          )}
        </div>
      </form>

      {/* Market error notice */}
      {marketsError && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">{t('noPriceDataAvailable')}</p>
            <p className="text-xs text-amber-800 mt-0.5">{marketsError}</p>
            <p className="text-xs text-amber-700 mt-1">
              {language === 'kn'
                ? 'ಈ ಬೆಳೆಗೆ ಲೈವ್ ಅಗ್ಮಾರ್ಕ್‌ನೆಟ್ ದರಗಳನ್ನು ಹುಡುಕಲು ಮೇಲಿನ ಮಾರುಕಟ್ಟೆ ಎಕ್ಸ್‌ಪ್ಲೋರರ್ ಬಳಸಿ.'
                : 'Use the Market Explorer above to search for this crop — that search will fetch and store live Agmarknet prices which the AI Forecast can then use.'}
            </p>
          </div>
        </div>
      )}

      {/* Main AI Forecast & Timing Component — only rendered after Submit */}
      {committedQuery && (
        <AITimingForecast
          commodity={committedQuery.commodity}
          market={committedQuery.market}
          district={committedQuery.district}
          quantityKg={committedQuery.quantityKg}
          transportCost={committedQuery.transportCost}
        />
      )}

      {!committedQuery && !marketsError && selectedMarket && (
        <div className="text-center py-12 text-[#68736B] text-sm">
          <Sparkles className="w-8 h-8 mx-auto mb-2 text-[#C9A227] opacity-60" />
          <p>{t('selectMarketPromptForecast')} <strong className="text-[#173F2A]">{t('runAIForecastBtn')}</strong> {t('toSeePredictions')}</p>
        </div>
      )}
      </div>
    </section>
  )
}
