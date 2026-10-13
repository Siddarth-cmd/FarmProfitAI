import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Wheat,
  Scale,
  Truck,
  AlertCircle,
  CheckCircle2,
  Circle,
  Loader2,
  Sparkles,
  ChevronDown,
  RefreshCw,
} from 'lucide-react'
import { useLanguage } from '../localization'
import { fetchMarketCatalogue, fetchMarketFilters } from '../services/api'

const COMMON_CROPS = [
  { name: 'Tomato', label: 'ಟೊಮೇಟೊ' },
  { name: 'Onion', label: 'ಈರುಳ್ಳಿ' },
  { name: 'Potato', label: 'ಆಲೂಗಡ್ಡೆ' },
  { name: 'Maize', label: 'ಮೆಕ್ಕೆಜೋಳ' },
]

const QUANTITY_PRESETS = [250, 500, 1000, 2500]

export default function FarmerInput({ onSubmit, isLoading }) {
  const { language, t } = useLanguage()
  const [harvestType, setHarvestType] = useState('single') // 'single' | 'multi'
  const [multiCrops, setMultiCrops] = useState([
    { crop: 'Tomato', quantity: '300', lossPercentage: '5' },
    { crop: 'Onion', quantity: '200', lossPercentage: '0' },
  ])
  const [crop, setCrop] = useState('Tomato')
  const [quantity, setQuantity] = useState('500')
  const [state, setState] = useState('Karnataka')
  const [district, setDistrict] = useState('')
  const [transportMode, setTransportMode] = useState('dedicated_vehicle') // 'dedicated_vehicle' | 'shared_load'
  const [sharedRateType, setSharedRateType] = useState('per_kg_per_km') // 'per_kg_per_km' | 'per_crate' | 'per_bag'
  const [sharedPricingBasis, setSharedPricingBasis] = useState('distance_based') // 'distance_based' | 'fixed_trip'
  const [sharedRate, setSharedRate] = useState('')
  const [filterOptions, setFilterOptions] = useState({ states: [], districts: [], locations: [] })
  const [filtersLoading, setFiltersLoading] = useState(true)
  const [filtersError, setFiltersError] = useState(null)
  const [otherCosts, setOtherCosts] = useState('0')
  const [lossPercentage, setLossPercentage] = useState('')
  const [markets, setMarkets] = useState([])
  const [availableMarkets, setAvailableMarkets] = useState([])
  const [marketsLoading, setMarketsLoading] = useState(false)
  const [marketsError, setMarketsError] = useState('')
  const [marketSearch, setMarketSearch] = useState('')
  const [visibleMarketCount, setVisibleMarketCount] = useState(10)
  const [formError, setFormError] = useState('')

  const loadFilters = useCallback(async () => {
    setFiltersLoading(true)
    setFiltersError(null)
    const response = await fetchMarketFilters()
    setFiltersLoading(false)
    if (response.available && response.states?.length && response.districts?.length) {
      setFilterOptions({
        states: response.states,
        districts: response.districts,
        locations: response.locations || [],
      })
      return
    }
    setFilterOptions({ states: [], districts: [], locations: [] })
    setFiltersError(response.error?.message || t('marketFiltersEmpty'))
  }, [t])

  useEffect(() => {
    loadFilters()
  }, [loadFilters])

  useEffect(() => {
    let active = true
    setMarketsLoading(true)
    setMarketsError('')
    fetchMarketCatalogue(crop, district).then((response) => {
      if (!active) return
      setMarketsLoading(false)
      if (!response.available) {
        setAvailableMarkets([])
        setMarketsError(response.error?.message || t('marketOptionsUnavailable'))
        return
      }
      const entries = response.entries || []
      setAvailableMarkets(entries)
      // Auto-select top suitable markets if none are currently selected
      setMarkets((current) => {
        if (current.length > 0) return current
        const normDist = (district || '').trim().toLowerCase()
        const localWithPrice = entries.filter(
          (m) => m.price_available && (m.district || '').trim().toLowerCase() === normDist
        )
        const othersWithPrice = entries.filter(
          (m) => m.price_available && (m.district || '').trim().toLowerCase() !== normDist
        )
        const localWithoutPrice = entries.filter(
          (m) => !m.price_available && (m.district || '').trim().toLowerCase() === normDist
        )
        const candidatePool = [...localWithPrice, ...othersWithPrice, ...localWithoutPrice]
        const top = candidatePool.slice(0, 3).map((m) => ({ name: m.name, transportCost: '' }))
        return top.length > 0 ? top : current
      })
    })
    return () => {
      active = false
    }
  }, [crop, district, t])

  const handleAutoSelectTopMarkets = useCallback(() => {
    if (!availableMarkets || availableMarkets.length === 0) return
    const normDist = (district || '').trim().toLowerCase()
    const localWithPrice = availableMarkets.filter(
      (m) => m.price_available && (m.district || '').trim().toLowerCase() === normDist
    )
    const othersWithPrice = availableMarkets.filter(
      (m) => m.price_available && (m.district || '').trim().toLowerCase() !== normDist
    )
    const localWithoutPrice = availableMarkets.filter(
      (m) => !m.price_available && (m.district || '').trim().toLowerCase() === normDist
    )
    const candidatePool = [...localWithPrice, ...othersWithPrice, ...localWithoutPrice]
    const top = candidatePool.slice(0, 4).map((m) => ({ name: m.name, transportCost: '' }))
    if (top.length > 0) {
      setMarkets(top)
      setFormError('')
    }
  }, [availableMarkets, district])

  const filteredMarkets = useMemo(() => {
    const query = marketSearch.trim().toLocaleLowerCase()
    return availableMarkets.filter((market) => (
      !query
      || market.name.toLocaleLowerCase().includes(query)
      || market.district.toLocaleLowerCase().includes(query)
    ))
  }, [availableMarkets, marketSearch])

  const visibleMarkets = filteredMarkets.slice(0, visibleMarketCount)
  const toggleMarket = (market) => {
    setMarkets((selected) => {
      const existing = selected.findIndex((item) => item.name === market.name)
      if (existing >= 0) return selected.filter((_, index) => index !== existing)
      return [...selected, { name: market.name, transportCost: '' }]
    })
    setFormError('')
  }

  const selectedState = useMemo(
    () => filterOptions.states.find(
      (option) => option.name.toLocaleLowerCase() === state.trim().toLocaleLowerCase(),
    ),
    [filterOptions.states, state],
  )
  const districtOptions = useMemo(
    () => selectedState
      ? filterOptions.districts.filter((option) => option.state_id === selectedState.id)
      : [],
    [filterOptions.districts, selectedState],
  )

  const handleMarketCostChange = (index, value) => {
    const updated = [...markets]
    updated[index].transportCost = value
    setMarkets(updated)
  }

  const handleStateChange = (event) => {
    setState(event.target.value)
    setDistrict('')
  }

  const handleDistrictChange = (event) => {
    setDistrict(event.target.value)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setFormError('')

    if (!state.trim()) {
      setFormError(t('validationState'))
      return
    }
    if (!district.trim()) {
      setFormError(t('validationDistrict'))
      return
    }

    if (markets.length === 0) {
      setFormError(t('validationMarkets'))
      return
    }

    let payloadCrops = null
    let singleCropName = null
    let singleCropQty = null
    let singleCropLoss = null

    if (harvestType === 'multi') {
      if (multiCrops.length === 0) {
        setFormError('Please add at least one crop to your combined harvest manifest.')
        return
      }
      payloadCrops = []
      for (const item of multiCrops) {
        const cName = item.crop.trim()
        const qNum = parseFloat(item.quantity)
        const lNum = item.lossPercentage.trim() === '' ? null : parseFloat(item.lossPercentage)
        if (!cName) {
          setFormError(t('validationCrop'))
          return
        }
        if (isNaN(qNum) || qNum <= 0) {
          setFormError(t('validationQuantity'))
          return
        }
        if (lNum !== null && (isNaN(lNum) || lNum < 0 || lNum > 100)) {
          setFormError(t('validationLossPercentage'))
          return
        }
        payloadCrops.push({
          crop: cName,
          quantity_kg: qNum,
          loss_percentage: lNum,
        })
      }
      singleCropName = payloadCrops[0].crop
      singleCropQty = payloadCrops[0].quantity_kg
    } else {
      if (!crop.trim()) {
        setFormError(t('validationCrop'))
        return
      }
      const qtyNum = parseFloat(quantity)
      if (isNaN(qtyNum) || qtyNum <= 0) {
        setFormError(t('validationQuantity'))
        return
      }
      const lossNum = lossPercentage.trim() === '' ? null : parseFloat(lossPercentage)
      if (
        lossPercentage.trim() !== '' &&
        (isNaN(lossNum) || lossNum < 0 || lossNum > 100)
      ) {
        setFormError(t('validationLossPercentage'))
        return
      }
      singleCropName = crop.trim()
      singleCropQty = qtyNum
      singleCropLoss = lossNum
    }

    // Quotes are optional. Unknown transport costs remain incomplete in results.
    const transportMap = {}
    const transportBasis = {}
    for (const m of markets) {
      if (m.transportCost.trim() === '') continue
      const cost = parseFloat(m.transportCost)
      if (!Number.isFinite(cost) || cost < 0) {
        setFormError(t('validationTransport', { name: m.name }))
        return
      }
      transportMap[m.name] = cost
      transportBasis[m.name] = 'actual_quote'
    }

    const otherNum = parseFloat(otherCosts) || 0
    if (otherNum < 0) {
      setFormError(t('validationOtherCosts'))
      return
    }

    const parsedSharedRate = sharedRate.trim() === '' ? null : parseFloat(sharedRate)
    if (sharedRate.trim() !== '' && (isNaN(parsedSharedRate) || parsedSharedRate < 0)) {
      setFormError('Shared transport rate must be a nonnegative number.')
      return
    }

    // farmer_location uses district as the origin for road-distance lookups
    const farmerLocation = district.trim() || state.trim()

    const payload = {
      crop: singleCropName,
      quantity_kg: singleCropQty,
      farmer_location: farmerLocation,
      state: state.trim(),
      district: district.trim(),
      selected_markets: markets.map((market) => market.name),
      transportation_costs: transportMap,
      other_costs: otherNum,
      transportation_cost_basis: transportBasis,
      transport_mode: transportMode,
    }

    // Shared-load rate configuration
    if (transportMode === 'shared_load') {
      payload.shared_pricing_basis = sharedPricingBasis
      if (parsedSharedRate !== null) {
        if (sharedPricingBasis === 'distance_based') {
          if (sharedRateType === 'per_kg_per_km') {
            payload.shared_rate_per_kg_per_km = parsedSharedRate
            payload.shared_rate_type = 'per_kg_per_km'
          } else {
            payload.shared_rate = parsedSharedRate
            payload.shared_rate_type = sharedRateType
          }
        } else {
          payload.shared_rate = parsedSharedRate
          payload.shared_rate_type = sharedRateType
        }
      } else {
        if (sharedPricingBasis === 'distance_based') {
          payload.shared_rate_type = sharedRateType
          payload.shared_rate_per_kg_per_km = 0.03
        } else {
          payload.shared_rate_type = sharedRateType
        }
      }
    }

    if (harvestType === 'multi' && payloadCrops) {
      payload.crops = payloadCrops
    } else if (singleCropLoss !== null) {
      payload.loss_percentage = singleCropLoss
    }

    onSubmit(payload)
  }

  return (
    <section id="farmer-input" className="py-12 md:py-20 relative">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-10 reveal-soft">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#DCE8D5]/60 text-[#173F2A] text-xs font-semibold uppercase tracking-wider mb-3">
            <Wheat className="w-3.5 h-3.5 text-[#173F2A]" />
            <span>{t('calculateProfit')}</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#173F2A] tracking-tight">
            {t('findProfitable')}
          </h2>
          <p className="mt-3 text-base sm:text-lg text-[#68736B]">
            {t('tellHarvest')}
          </p>
        </div>

        {/* Main Card */}
        <div className="premium-card rounded-3xl p-6 sm:p-10 relative overflow-hidden transition-all">
          {/* Subtle top forest line */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#173F2A] via-[#6F8F72] to-[#C9A227]" />

          {formError && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-start gap-3 animate-in fade-in duration-200">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm font-medium">{formError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Harvest Type Toggle */}
            <div className="p-1 rounded-2xl bg-[#F7F3E8] border border-[#E4E1D7] flex max-w-md">
              <button
                type="button"
                onClick={() => setHarvestType('single')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                  harvestType === 'single'
                    ? 'bg-[#173F2A] text-[#FFFDF7] shadow-sm'
                    : 'text-[#68736B] hover:text-[#173F2A]'
                }`}
              >
                {t('singleCropHarvest')}
              </button>
              <button
                type="button"
                onClick={() => setHarvestType('multi')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                  harvestType === 'multi'
                    ? 'bg-[#173F2A] text-[#FFFDF7] shadow-sm'
                    : 'text-[#68736B] hover:text-[#173F2A]'
                }`}
              >
                {t('multiCropHarvest')}
              </button>
            </div>

            {/* Field 1: Single Crop or Multi-Crop Manifest */}
            {harvestType === 'single' ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="crop" className="text-sm font-bold text-[#173F2A] uppercase tracking-wider flex items-center gap-2">
                    <Wheat className="w-4 h-4 text-[#6F8F72]" />
                    <span>{t('cropCommodity')}</span>
                  </label>
                  <span className="text-xs text-[#68736B]">{t('selectOrType')}</span>
                </div>

                {/* Quick Crop Pills */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {COMMON_CROPS.map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => setCrop(item.name)}
                      className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                        crop.toLowerCase() === item.name.toLowerCase()
                          ? 'bg-[#173F2A] text-[#FFFDF7] shadow-sm scale-102 font-semibold'
                          : 'bg-[#F7F3E8] text-[#1E2921] hover:bg-[#DCE8D5]/60 border border-[#E4E1D7]'
                      }`}
                    >
                      <span>{language === 'kn' ? item.label : item.name}</span>
                    </button>
                  ))}
                </div>

                <input
                  id="crop"
                  type="text"
                  value={crop}
                  onChange={(e) => setCrop(e.target.value)}
                  placeholder={t('cropPlaceholder')}
                  className="w-full px-4 py-3 rounded-xl bg-[#F7F3E8]/50 border border-[#E4E1D7] focus:bg-[#FFFDF7] focus:border-[#173F2A] focus:ring-2 focus:ring-[#173F2A]/10 text-[#1E2921] text-sm transition-all outline-hidden"
                />
              </div>
            ) : (
              <div className="rounded-2xl p-4 bg-[#F7F3E8]/60 border border-[#E4E1D7] space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-[#173F2A] uppercase tracking-wider flex items-center gap-2">
                    <Wheat className="w-4 h-4 text-[#6F8F72]" />
                    <span>{t('cropListTitle')}</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => setMultiCrops((prev) => [...prev, { crop: '', quantity: '200', lossPercentage: '0' }])}
                    className="text-xs font-bold text-[#173F2A] hover:underline cursor-pointer"
                  >
                    {t('addCrop')}
                  </button>
                </div>
                <div className="space-y-2">
                  {multiCrops.map((cItem, cIdx) => (
                    <div key={cIdx} className="flex flex-wrap sm:flex-nowrap gap-2 items-center bg-[#FFFDF7] p-2.5 rounded-xl border border-[#E4E1D7]">
                      <div className="flex-1 min-w-[120px]">
                        <input
                          type="text"
                          value={cItem.crop}
                          onChange={(e) => {
                            const updated = [...multiCrops]
                            updated[cIdx].crop = e.target.value
                            setMultiCrops(updated)
                          }}
                          placeholder="Crop name (e.g. Tomato)"
                          className="w-full px-3 py-1.5 rounded-lg border border-[#E4E1D7] text-sm text-[#1E2921]"
                        />
                      </div>
                      <div className="w-28 relative">
                        <input
                          type="number"
                          min="1"
                          value={cItem.quantity}
                          onChange={(e) => {
                            const updated = [...multiCrops]
                            updated[cIdx].quantity = e.target.value
                            setMultiCrops(updated)
                          }}
                          placeholder="Weight"
                          className="w-full pr-8 pl-2 py-1.5 rounded-lg border border-[#E4E1D7] text-sm text-[#1E2921]"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#68736B]">kg</span>
                      </div>
                      <div className="w-24 relative">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={cItem.lossPercentage}
                          onChange={(e) => {
                            const updated = [...multiCrops]
                            updated[cIdx].lossPercentage = e.target.value
                            setMultiCrops(updated)
                          }}
                          placeholder="Loss %"
                          className="w-full pr-6 pl-2 py-1.5 rounded-lg border border-[#E4E1D7] text-sm text-[#1E2921]"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#68736B]">%</span>
                      </div>
                      {multiCrops.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setMultiCrops((prev) => prev.filter((_, idx) => idx !== cIdx))}
                          className="text-xs text-red-600 hover:text-red-800 px-2 py-1"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-[#68736B]">
                  {t('combinedHarvestQuantity', {
                    total: multiCrops.reduce((acc, c) => acc + (parseFloat(c.quantity) || 0), 0),
                  })}
                </p>
              </div>
            )}

            {/* Section 2: State & District */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="state" className="text-sm font-bold text-[#173F2A] uppercase tracking-wider block mb-2">
                  {t('stateRequired')}
                </label>
                <div className="relative">
                  <select
                    id="state"
                    value={state}
                    onChange={handleStateChange}
                    disabled={filtersLoading || filterOptions.states.length === 0}
                    aria-describedby="farmer-filters-status"
                    className="w-full appearance-none pr-10 px-4 py-3 rounded-xl bg-[#F7F3E8]/50 border border-[#E4E1D7] focus:bg-[#FFFDF7] focus:border-[#173F2A] focus:ring-2 focus:ring-[#173F2A]/10 text-[#1E2921] text-sm outline-hidden disabled:opacity-60"
                  >
                    {filterOptions.states.map((option) => (
                      <option key={option.id} value={option.name}>{option.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#68736B]" />
                </div>
              </div>
              <div>
                <label htmlFor="district" className="text-sm font-bold text-[#173F2A] uppercase tracking-wider block mb-2">
                  {t('districtRequired')}
                </label>
                <div className="relative">
                  <input
                    id="district"
                    type="text"
                    list="farmer-district-options"
                    autoComplete="off"
                    value={district}
                    onChange={handleDistrictChange}
                    placeholder={selectedState ? t('districtPlaceholder') : t('selectStateFirst')}
                    disabled={!selectedState && filterOptions.states.length > 0}
                    aria-describedby="farmer-filters-status"
                    className="w-full appearance-none pr-10 px-4 py-3 rounded-xl bg-[#F7F3E8]/50 border border-[#E4E1D7] focus:bg-[#FFFDF7] focus:border-[#173F2A] focus:ring-2 focus:ring-[#173F2A]/10 text-[#1E2921] text-sm outline-hidden disabled:opacity-60"
                  />
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#68736B]" />
                  <datalist id="farmer-district-options">
                    {districtOptions.map((option) => (
                      <option key={option.id} value={option.name} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div id="farmer-filters-status" className="col-span-full flex items-center gap-2 text-xs text-[#68736B]" aria-live="polite">
                {filtersLoading && <span>{t('marketFiltersLoading')}</span>}
                {!filtersLoading && filtersError && (
                  <>
                    <span>{t('marketFiltersUnavailable')}</span>
                    <button
                      type="button"
                      onClick={loadFilters}
                      className="inline-flex items-center gap-1 font-semibold text-[#173F2A] hover:underline"
                    >
                      <RefreshCw className="w-3 h-3" />
                      {t('retry')}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Section 3: Quantity */}
            {harvestType === 'single' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="quantity" className="text-sm font-bold text-[#173F2A] uppercase tracking-wider flex items-center gap-2">
                    <Scale className="w-4 h-4 text-[#6F8F72]" />
                    <span>{t('quantityKg')}</span>
                  </label>
                  <span className="text-xs text-[#68736B]">{t('produceWeight')}</span>
                </div>
                <div className="relative mb-2">
                  <input
                    id="quantity"
                    type="number"
                    min="1"
                    step="any"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder={t('quantityPlaceholder')}
                    className="w-full pl-4 pr-12 py-3 rounded-xl bg-[#F7F3E8]/50 border border-[#E4E1D7] focus:bg-[#FFFDF7] focus:border-[#173F2A] focus:ring-2 focus:ring-[#173F2A]/10 text-[#1E2921] font-semibold text-base transition-all outline-hidden"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-[#68736B]">
                    {t('unitKg')}
                  </span>
                </div>
                {/* Presets */}
                <div className="flex gap-2">
                  {QUANTITY_PRESETS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setQuantity(String(q))}
                      className={`flex-1 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                        quantity === String(q)
                          ? 'bg-[#DCE8D5] border-[#6F8F72] text-[#173F2A] font-bold'
                          : 'bg-[#FFFDF7] border-[#E4E1D7] text-[#68736B] hover:bg-[#F7F3E8]'
                      }`}
                    >
                      {q} {t('unitKg')}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Transport Mode Selection (Feature 1) */}
            <div className="pt-4 border-t border-[#E4E1D7]">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-bold text-[#173F2A] uppercase tracking-wider flex items-center gap-2">
                  <Truck className="w-4 h-4 text-[#6F8F72]" />
                  <span>{t('transportMode')}</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <button
                  type="button"
                  onClick={() => setTransportMode('dedicated_vehicle')}
                  className={`p-3.5 rounded-2xl border text-left transition-all ${
                    transportMode === 'dedicated_vehicle'
                      ? 'bg-[#DCE8D5]/60 border-[#173F2A] shadow-xs'
                      : 'bg-[#FFFDF7] border-[#E4E1D7] hover:bg-[#F7F3E8]'
                  }`}
                >
                  <div className="font-bold text-sm text-[#173F2A] flex items-center gap-2">
                    <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${transportMode === 'dedicated_vehicle' ? 'border-[#173F2A] bg-[#173F2A]' : 'border-[#AAB7AA]'}`}>
                      {transportMode === 'dedicated_vehicle' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                    <span>{t('dedicatedVehicle')}</span>
                  </div>
                  <p className="text-xs text-[#68736B] mt-1 ml-5.5">
                    {t('dedicatedVehicleDesc')}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setTransportMode('shared_load')}
                  className={`p-3.5 rounded-2xl border text-left transition-all ${
                    transportMode === 'shared_load'
                      ? 'bg-[#DCE8D5]/60 border-[#173F2A] shadow-xs'
                      : 'bg-[#FFFDF7] border-[#E4E1D7] hover:bg-[#F7F3E8]'
                  }`}
                >
                  <div className="font-bold text-sm text-[#173F2A] flex items-center gap-2">
                    <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${transportMode === 'shared_load' ? 'border-[#173F2A] bg-[#173F2A]' : 'border-[#AAB7AA]'}`}>
                      {transportMode === 'shared_load' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                    <span>{t('sharedLoad')}</span>
                  </div>
                  <p className="text-xs text-[#68736B] mt-1 ml-5.5">
                    {t('sharedLoadDesc')}
                  </p>
                </button>
              </div>

              {/* Shared Rate Configuration */}
              {transportMode === 'shared_load' && (
                <div className="p-4 rounded-2xl bg-[#FFFDF7] border border-[#E4E1D7] mb-6 space-y-4">
                  {/* Pricing Model Basis: Distance-based vs Fixed trip */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E4E1D7]">
                    <span className="text-xs font-bold text-[#173F2A] uppercase tracking-wider">
                      {t('pricingBasis')}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSharedPricingBasis('distance_based')
                          if (sharedRateType === 'per_kg') setSharedRateType('per_kg_per_km')
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          sharedPricingBasis === 'distance_based'
                            ? 'bg-[#173F2A] text-[#FFFDF7] shadow-xs'
                            : 'bg-[#F7F3E8] text-[#68736B] hover:bg-[#DCE8D5]'
                        }`}
                      >
                        {t('distanceBasedPricing')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSharedPricingBasis('fixed_trip')
                          if (sharedRateType === 'per_kg_per_km') setSharedRateType('per_kg')
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          sharedPricingBasis === 'fixed_trip'
                            ? 'bg-[#173F2A] text-[#FFFDF7] shadow-xs'
                            : 'bg-[#F7F3E8] text-[#68736B] hover:bg-[#DCE8D5]'
                        }`}
                      >
                        {t('fixedTripPricing')}
                      </button>
                    </div>
                  </div>

                  {/* Unit Selection */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#173F2A] uppercase tracking-wider">
                      {t('sharedRateType')}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {(sharedPricingBasis === 'distance_based'
                        ? [
                            ['per_kg_per_km', t('perKgPerKmRate')],
                            ['per_crate', t('perCrateRate')],
                            ['per_bag', t('perBagRate')],
                          ]
                        : [
                            ['per_kg', '₹/kg (Flat)'],
                            ['per_crate', t('perCrateRate')],
                            ['per_bag', t('perBagRate')],
                          ]
                      ).map(([stKey, stLabel]) => (
                        <button
                          key={stKey}
                          type="button"
                          onClick={() => setSharedRateType(stKey)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                            sharedRateType === stKey
                              ? 'bg-[#173F2A] text-[#FFFDF7]'
                              : 'bg-[#F7F3E8] text-[#68736B] hover:bg-[#DCE8D5]'
                          }`}
                        >
                          {stLabel}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="relative flex-1 max-w-xs">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#68736B]">₹</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={sharedRate}
                        onChange={(e) => setSharedRate(e.target.value)}
                        placeholder={
                          sharedPricingBasis === 'distance_based'
                            ? sharedRateType === 'per_kg_per_km' ? '0.03' : sharedRateType === 'per_crate' ? '0.75' : '1.5'
                            : sharedRateType === 'per_crate' ? '30' : sharedRateType === 'per_bag' ? '50' : '1.5'
                        }
                        className="w-full pl-7 pr-3 py-2 rounded-xl bg-[#F7F3E8]/50 border border-[#E4E1D7] text-sm text-[#1E2921]"
                      />
                    </div>
                    <span className="text-xs text-[#68736B]">
                      {sharedPricingBasis === 'distance_based'
                        ? (sharedRateType === 'per_kg_per_km'
                          ? t('perKgPerKmRateHelp')
                          : sharedRateType === 'per_crate'
                          ? '₹/crate/km — converts to ₹/kg/km ÷ 25'
                          : '₹/bag/km — converts to ₹/kg/km ÷ 50')
                        : (sharedRateType === 'per_crate'
                          ? t('perCrateRateHelp')
                          : sharedRateType === 'per_bag'
                          ? t('perBagRateHelp')
                          : '₹/kg — flat full trip rate')}
                    </span>
                  </div>

                  <p className="text-xs text-[#173F2A] bg-[#DCE8D5]/50 border border-[#6F8F72]/30 rounded-xl px-3 py-2 font-medium">
                    {sharedPricingBasis === 'distance_based'
                      ? t('sharedPricingDescDistance')
                      : t('sharedPricingDescFixed')}
                  </p>
                </div>
              )}
            </div>

            {/* Field 4: Markets to compare & optional transportation quotes */}
            <div className="pt-4 border-t border-[#E4E1D7]">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <label className="text-sm font-bold text-[#173F2A] uppercase tracking-wider flex items-center gap-2">
                  <Truck className="w-4 h-4 text-[#6F8F72]" />
                  <span>{t('candidateMarkets')}</span>
                </label>
                <button
                  type="button"
                  onClick={handleAutoSelectTopMarkets}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#DCE8D5] hover:bg-[#c9ddbf] text-[#173F2A] text-xs font-bold transition-all shadow-xs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#C9A227]" />
                  <span>{t('autoSelectMarkets')}</span>
                </button>
              </div>

              <p className="text-xs text-[#68736B] mb-4">
                {t('transportHelp')}
              </p>
              <input
                type="search"
                value={marketSearch}
                onChange={(event) => {
                  setMarketSearch(event.target.value)
                  setVisibleMarketCount(10)
                }}
                placeholder={t('marketSearchPlaceholder')}
                aria-label={t('marketSearchPlaceholder')}
                className="w-full mb-2 px-3 py-2 rounded-xl bg-[#FFFDF7] border border-[#E4E1D7] text-sm text-[#1E2921] outline-hidden focus:border-[#173F2A]"
              />
              <div className="rounded-xl border border-[#E4E1D7] bg-[#FFFDF7] p-2 space-y-1">
                {visibleMarkets.map((market) => {
                  const selected = markets.some((item) => item.name === market.name)
                  return (
                    <button
                      type="button"
                      key={market.id}
                      onClick={() => toggleMarket(market)}
                      className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${selected ? 'bg-[#DCE8D5]' : 'hover:bg-[#F7F3E8]'}`}
                    >
                      <span className={`w-4 h-4 rounded border flex items-center justify-center ${selected ? 'bg-[#173F2A] border-[#173F2A] text-white' : 'border-[#AAB7AA]'}`}>
                        {selected ? '✓' : ''}
                      </span>
                      <span className="flex-1">
                        <span className="font-semibold text-[#173F2A]">{market.name}</span>
                        <span className="block text-xs text-[#68736B]">{market.district}</span>
                      </span>
                      <span className="text-[11px] text-[#68736B]">
                        {market.price_available ? t('priceAvailable') : t('priceUnavailable')}
                      </span>
                    </button>
                  )
                })}
                {!marketsLoading && visibleMarkets.length === 0 && (
                  <p className="p-3 text-sm text-[#68736B]">{t('marketOptionsEmpty')}</p>
                )}
                {visibleMarketCount < filteredMarkets.length && (
                  <div className="flex gap-2 pt-1 border-t border-[#E4E1D7]">
                    <button
                      type="button"
                      onClick={() => setVisibleMarketCount((count) => count + 20)}
                      className="flex-1 py-2 text-xs font-semibold text-[#173F2A] hover:bg-[#F7F3E8] rounded-lg transition-colors"
                    >
                      {t('showMoreMarkets')} (+20)
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibleMarketCount(filteredMarkets.length)}
                      className="flex-1 py-2 text-xs font-bold text-[#173F2A] hover:bg-[#DCE8D5] rounded-lg transition-colors"
                    >
                      Show All ({filteredMarkets.length})
                    </button>
                  </div>
                )}
              </div>
              <p className="mt-2 text-xs text-[#68736B]">
                {marketsLoading
                  ? t('marketOptionsLoading')
                  : marketsError || (availableMarkets.length === 0 ? t('marketOptionsEmpty') : t('selectedMarketsCount', { count: markets.length }))}
              </p>

              {/* Current Market List */}
              <div className="space-y-2 mb-4">
                {markets.length === 0 && availableMarkets.length > 0 && (
                  <div className="p-3 rounded-xl bg-[#DCE8D5]/40 border border-[#C9D8C5] text-sm text-[#36543F]">
                    {t('selectMarketsPrompt')}
                  </div>
                )}
                {markets.map((m, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-2.5 sm:p-3 rounded-xl bg-[#F7F3E8]/80 border border-[#E4E1D7] transition-all"
                  >
                    <div className="w-8 h-8 rounded-lg bg-[#DCE8D5]/70 flex items-center justify-center text-[#173F2A] font-bold text-xs shrink-0">
                      {idx + 1}
                    </div>

                    <div className="flex-1 min-w-[120px]">
                      <span className="text-sm font-semibold text-[#173F2A] block">
                        {m.name}
                      </span>
                    </div>

                    <div className="w-36 sm:w-44 relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#68736B]">
                        ₹
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={m.transportCost}
                        onChange={(e) => handleMarketCostChange(idx, e.target.value)}
                        aria-label={`${t('transportCost')} — ${m.name}`}
                        placeholder={t('transportCost')}
                        className="w-full pl-7 pr-3 py-1.5 rounded-lg bg-[#FFFDF7] border border-[#E4E1D7] text-sm text-[#1E2921] font-medium outline-hidden focus:border-[#173F2A]"
                      />
                    </div>

                  </div>
                ))}
              </div>
            </div>

            {/* Other Costs (Optional) */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="other-costs" className="text-xs font-semibold text-[#68736B] uppercase tracking-wider">
                  {t('otherCosts')}
                </label>
                <span className="text-xs text-[#68736B]">{t('optional')}</span>
              </div>

              {/* Expected loss estimate (optional) */}
              <div className="pt-2 border-t border-[#E4E1D7]">
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="loss-percentage" className="text-xs font-semibold text-[#68736B] uppercase tracking-wider">
                    {t('lossPercentage')}
                  </label>
                  <span className="text-xs text-[#68736B]">{t('optional')}</span>
                </div>
                <div className="relative max-w-xs">
                  <input
                    id="loss-percentage"
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={lossPercentage}
                    onChange={(e) => setLossPercentage(e.target.value)}
                    placeholder={t('lossPlaceholder')}
                    aria-describedby="loss-help"
                    className="w-full pr-10 pl-3 py-2 rounded-xl bg-[#F7F3E8]/50 border border-[#E4E1D7] text-sm text-[#1E2921] outline-hidden focus:border-[#173F2A]"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#68736B]">
                    %
                  </span>
                </div>
                <p id="loss-help" className="mt-1 text-xs text-[#68736B]">
                  {t('lossPercentageHelp')}
                </p>
              </div>
              <div className="relative max-w-xs">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#68736B]">
                  ₹
                </span>
                <input
                  id="other-costs"
                  type="number"
                  min="0"
                  step="any"
                  value={otherCosts}
                  onChange={(e) => setOtherCosts(e.target.value)}
                  placeholder="0"
                  className="w-full pl-7 pr-3 py-2 rounded-xl bg-[#F7F3E8]/50 border border-[#E4E1D7] text-sm text-[#1E2921] outline-hidden focus:border-[#173F2A]"
                />
              </div>
            </div>

            {/* Primary Action Button or Loading Progress */}
            {isLoading ? (
              <div className="p-6 rounded-2xl bg-[#173F2A] text-[#FFFDF7] shadow-lg reveal-soft" role="status" aria-live="polite">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 text-[#C9A227] animate-spin" />
                    <span className="font-bold text-base tracking-wide">
                      {t('calculating')}
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5 text-xs sm:text-sm">
                  {[
                    [t('checking'), true],
                    [t('transportation'), true],
                    [t('sortedByReturn'), false],
                    [t('findMarket'), false],
                  ].map(([stepText, isDone]) => {
                    return (
                      <div
                        key={stepText}
                        className={`flex items-center gap-3 transition-opacity ${
                          isDone ? 'text-[#DCE8D5]' : 'text-[#DCE8D5]/60'
                        }`}
                      >
                        {isDone ? (
                          <CheckCircle2 className="w-4 h-4 text-[#C9A227] shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 text-[#6F8F72] shrink-0" />
                        )}
                        <span>{stepText}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <button
                type="submit"
                className="w-full py-4 px-6 rounded-2xl text-base sm:text-lg font-bold text-[#FFFDF7] bg-[#173F2A] hover:bg-[#24543A] active:scale-[0.99] transition-all shadow-md hover:shadow-xl flex items-center justify-center gap-3 cursor-pointer group"
              >
                <span>🌾 {t('calculate')}</span>
                <Sparkles className="w-5 h-5 text-[#C9A227] group-hover:rotate-12 transition-transform" />
              </button>
            )}
          </form>
        </div>
      </div>
    </section>
  )
}
