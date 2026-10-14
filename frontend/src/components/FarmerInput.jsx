import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Wheat,
  Scale,
  Truck,
  MapPin,
  AlertCircle,
  CheckCircle2,
  Circle,
  Loader2,
  Sparkles,
  ChevronDown,
  RefreshCw,
  Search,
  Tag,
  X,
  Check,
} from 'lucide-react'
import { useLanguage, getCropDisplayName } from '../localization'
import {
  fetchMarketCatalogue,
  fetchMarketFilters,
  fetchCrops,
  fetchCropVarieties,
} from '../services/api'

const COMMON_CROPS = [
  {
    name: 'Tomato',
    label: 'ಟೊಮೇಟೊ',
    image: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=320&q=80',
  },
  {
    name: 'Onion',
    label: 'ಈರುಳ್ಳಿ',
    image: 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?auto=format&fit=crop&w=320&q=80',
  },
  {
    name: 'Potato',
    label: 'ಆಲೂಗಡ್ಡೆ',
    image: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=320&q=80',
  },
  {
    name: 'Maize',
    label: 'ಮೆಕ್ಕೆಜೋಳ',
    image: 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?auto=format&fit=crop&w=320&q=80',
  },
  {
    name: 'Green Chilli',
    label: 'ಹಸಿ ಮೆಣಸಿನಕಾಯಿ',
    image: 'https://images.unsplash.com/photo-1588252303782-cb80119abd6d?auto=format&fit=crop&w=320&q=80',
  },
  {
    name: 'Capsicum',
    label: 'ದಪ್ಪ ಮೆಣಸಿನಕಾಯಿ',
    image: 'https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?auto=format&fit=crop&w=320&q=80',
  },
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
  const [cropOptions, setCropOptions] = useState([])
  const [cropsLoading, setCropsLoading] = useState(true)
  const [cropsError, setCropsError] = useState('')
  const [cropSearch, setCropSearch] = useState('')
  const [isCropDropdownOpen, setIsCropDropdownOpen] = useState(false)

  const [variety, setVariety] = useState('')
  const [varietyOptions, setVarietyOptions] = useState([])
  const [varietiesLoading, setVarietiesLoading] = useState(false)
  const [varietiesError, setVarietiesError] = useState('')
  const [varietySearch, setVarietySearch] = useState('')
  const [isVarietyDropdownOpen, setIsVarietyDropdownOpen] = useState(false)

  const cropDropdownRef = useRef(null)
  const varietyDropdownRef = useRef(null)

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

  const totalProduceWeight = useMemo(() => {
    if (harvestType === 'single') {
      return Math.max(0, parseFloat(quantity) || 0)
    }
    return multiCrops.reduce((acc, c) => acc + Math.max(0, parseFloat(c.quantity) || 0), 0)
  }, [harvestType, quantity, multiCrops])

  const sharedUnitsCount = useMemo(() => {
    if (sharedRateType === 'per_crate') {
      return Math.ceil(totalProduceWeight / 25)
    }
    if (sharedRateType === 'per_bag') {
      return Math.ceil(totalProduceWeight / 50)
    }
    return totalProduceWeight
  }, [sharedRateType, totalProduceWeight])

  const defaultSharedRate = useMemo(() => {
    if (sharedPricingBasis === 'distance_based') {
      if (sharedRateType === 'per_crate') return 0.75
      if (sharedRateType === 'per_bag') return 1.50
      return 0.03
    } else {
      if (sharedRateType === 'per_crate') return 30
      if (sharedRateType === 'per_bag') return 50
      return 1.50
    }
  }, [sharedPricingBasis, sharedRateType])

  // Load database-backed crops
  const loadCropsList = useCallback(async () => {
    setCropsLoading(true)
    setCropsError('')
    try {
      const response = await fetchCrops()
      setCropsLoading(false)
      if (response && Array.isArray(response.crops) && response.crops.length > 0) {
        setCropOptions(response.crops)
      } else {
        setCropsError(response?.error || t('cropsError'))
      }
    } catch (err) {
      setCropsLoading(false)
      setCropsError(err?.message || t('cropsError'))
    }
  }, [t])

  useEffect(() => {
    loadCropsList()
  }, [loadCropsList])

  // Load database-backed varieties when selected crop changes
  useEffect(() => {
    let active = true
    setVariety('')
    setVarietySearch('')
    setIsVarietyDropdownOpen(false)
    if (!crop || !crop.trim()) {
      setVarietyOptions([])
      setVarietiesLoading(false)
      setVarietiesError('')
      return
    }

    setVarietiesLoading(true)
    setVarietiesError('')
    fetchCropVarieties(crop).then((response) => {
      if (!active) return
      setVarietiesLoading(false)
      if (response && Array.isArray(response.varieties)) {
        const clean = response.varieties.filter((v) => {
          if (!v || typeof v !== 'string') return false
          const upper = v.toUpperCase()
          if (upper.includes('APMC') || upper.includes('MARKET') || upper.includes('MANDI')) return false
          if (v.trim().toLowerCase() === crop.trim().toLowerCase()) return false
          return true
        })
        setVarietyOptions(clean)
      } else {
        setVarietyOptions([])
        if (response?.error) setVarietiesError(response.error)
      }
    }).catch((err) => {
      if (!active) return
      setVarietiesLoading(false)
      setVarietiesError(err?.message || t('varietiesError'))
    })

    return () => {
      active = false
    }
  }, [crop, t])

  // Outside click listeners for dropdown menus
  useEffect(() => {
    function handleClickOutside(event) {
      if (cropDropdownRef.current && !cropDropdownRef.current.contains(event.target)) {
        setIsCropDropdownOpen(false)
      }
      if (varietyDropdownRef.current && !varietyDropdownRef.current.contains(event.target)) {
        setIsVarietyDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const filteredCrops = useMemo(() => {
    const q = cropSearch.trim().toLowerCase()
    if (!q) return cropOptions
    return cropOptions.filter((c) => {
      const nameMatch = c.toLowerCase().includes(q)
      const knName = getCropDisplayName(c, 'kn').toLowerCase()
      return nameMatch || knName.includes(q)
    })
  }, [cropOptions, cropSearch])

  const filteredVarieties = useMemo(() => {
    const q = varietySearch.trim().toLowerCase()
    if (!q) return varietyOptions
    return varietyOptions.filter((v) => v.toLowerCase().includes(q))
  }, [varietyOptions, varietySearch])

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
      const seenCrops = new Set()
      for (const item of multiCrops) {
        const cName = item.crop.trim()
        const qNum = parseFloat(item.quantity)
        const lNum = item.lossPercentage.trim() === '' ? null : parseFloat(item.lossPercentage)
        if (!cName) {
          setFormError(t('validationCrop'))
          return
        }
        const cLower = cName.toLowerCase()
        if (seenCrops.has(cLower)) {
          setFormError(t('duplicateCropWarning'))
          return
        }
        seenCrops.add(cLower)

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
      variety: harvestType === 'single' && variety && variety.trim() ? variety.trim() : undefined,
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
    <section id="farmer-input" className="py-12 md:py-20 botanical-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-10 reveal-soft">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#173D2A] text-[#E7C96B] text-xs font-bold uppercase tracking-wider mb-3 shadow-xs">
            <Wheat className="w-3.5 h-3.5 text-[#E7C96B]" />
            <span>{t('calculateProfit')}</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-[#173D2A] tracking-tight font-editorial">
            {t('findProfitable')}
          </h2>
          <p className="mt-3 text-base sm:text-lg text-[#52604D]">
            {t('tellHarvest')}
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-[#FFFDF7] rounded-3xl p-6 sm:p-10 relative overflow-hidden transition-all border border-[#286B43]/20 shadow-md">
          {/* Deep Forest to Harvest Gold gradient top bar */}
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-[#173D2A] via-[#286B43] to-[#E7C96B]" />

          {formError && (
            <div className="mb-6 p-4 rounded-2xl bg-[#FFF4E6] border border-[#C25E00]/30 text-[#8B3800] flex items-start gap-3 animate-in fade-in duration-200">
              <AlertCircle className="w-5 h-5 text-[#C25E00] shrink-0 mt-0.5" />
              <p className="text-sm font-semibold">{formError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* Left Column (7 cols): Crop, Quantity, Location & Candidate Markets */}
              <div className="lg:col-span-7 space-y-7">
                
                {/* Harvest Type Toggle */}
                <div className="p-1 rounded-2xl bg-[#FCFAF4] border border-[#286B43]/20 flex max-w-sm shadow-xs">
                  <button
                    type="button"
                    onClick={() => setHarvestType('single')}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#286B43] ${
                      harvestType === 'single'
                        ? 'bg-[#173D2A] text-[#FFFDF7] shadow-xs'
                        : 'text-[#52604D] hover:text-[#173D2A]'
                    }`}
                  >
                    {t('singleCropHarvest')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setHarvestType('multi')}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#286B43] ${
                      harvestType === 'multi'
                        ? 'bg-[#173D2A] text-[#FFFDF7] shadow-xs'
                        : 'text-[#52604D] hover:text-[#173D2A]'
                    }`}
                  >
                    {t('multiCropHarvest')}
                  </button>
                </div>

                {/* Field 1: Single Crop and Variety (Database-driven Dropdowns) */}
                {harvestType === 'single' ? (
                  <div className="card-softwhite p-5 rounded-2xl border border-[#286B43]/20 space-y-4">
                    {/* Header Row */}
                    <div className="flex items-center justify-between">
                      <label htmlFor="crop-select-trigger" className="text-xs font-bold text-[#173D2A] uppercase tracking-wider flex items-center gap-2">
                        <Wheat className="w-4 h-4 text-[#286B43]" />
                        <span>{t('cropCommodity')}</span>
                      </label>
                      <span className="text-[11px] text-[#52604D] font-medium">{t('selectOrType')}</span>
                    </div>

                    {/* Photographic Crop Selection Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                      {COMMON_CROPS.map((item) => {
                        const isSelected = crop.toLowerCase() === item.name.toLowerCase()
                        return (
                          <button
                            key={item.name}
                            type="button"
                            onClick={() => {
                              setCrop(item.name)
                              setVariety('')
                              setIsCropDropdownOpen(false)
                              setCropSearch('')
                            }}
                            className={`p-2 rounded-xl text-center transition-all flex flex-col items-center cursor-pointer border focus:outline-none focus:ring-2 focus:ring-[#286B43] focus:ring-offset-2 ${
                              isSelected
                                ? 'bg-[#EAF4EE] border-[#173D2A] ring-2 ring-[#286B43]/40 shadow-xs'
                                : 'bg-[#FCFAF4] border-[#286B43]/15 hover:bg-[#EAF4EE]/60 hover:border-[#286B43]/40'
                            }`}
                          >
                            <div className="w-full h-14 sm:h-16 rounded-lg overflow-hidden mb-1.5 bg-[#EAF4EE] relative flex items-center justify-center">
                              <img
                                src={item.image}
                                alt={item.name}
                                loading="lazy"
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none'
                                  const fallback = e.currentTarget.parentElement?.querySelector('.fallback-icon')
                                  if (fallback) fallback.classList.remove('hidden')
                                }}
                              />
                              <Wheat className="w-6 h-6 text-[#286B43] fallback-icon hidden" />
                              {isSelected && (
                                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#173D2A] text-[#E7C96B] flex items-center justify-center text-[10px] font-bold shadow-xs">
                                  ✓
                                </span>
                              )}
                            </div>
                            <span className="text-xs font-bold text-[#173D2A] truncate w-full">
                              {language === 'kn' ? item.label : item.name}
                            </span>
                          </button>
                        )
                      })}
                    </div>

                    {/* Searchable Crop Dropdown */}
                    <div className="relative" ref={cropDropdownRef}>
                      <button
                        id="crop-select-trigger"
                        type="button"
                        onClick={() => setIsCropDropdownOpen((prev) => !prev)}
                        aria-haspopup="listbox"
                        aria-expanded={isCropDropdownOpen}
                        aria-label={t('cropCommodity')}
                        className="w-full px-4 py-2.5 rounded-xl bg-[#FCFAF4] border border-[#286B43]/25 hover:border-[#286B43] focus:outline-none focus:ring-2 focus:ring-[#286B43] focus:border-[#286B43] text-left flex items-center justify-between text-sm transition-all shadow-2xs cursor-pointer"
                      >
                        <span className="font-semibold text-[#173D2A]">
                          {crop ? getCropDisplayName(crop, language) : t('cropSelectPlaceholder')}
                        </span>
                        <div className="flex items-center gap-1.5 text-[#52604D]">
                          {cropsLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-[#286B43]" />
                          ) : (
                            <ChevronDown className={`w-4 h-4 transition-transform ${isCropDropdownOpen ? 'rotate-180' : ''}`} />
                          )}
                        </div>
                      </button>

                      {isCropDropdownOpen && (
                        <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#FFFDF7] border border-[#286B43]/30 rounded-2xl shadow-xl z-30 p-2.5 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150">
                          {/* Crop Search Input */}
                          <div className="relative mb-2">
                            <Search className="w-4 h-4 text-[#52604D] absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              value={cropSearch}
                              onChange={(e) => setCropSearch(e.target.value)}
                              placeholder={t('cropSelectPlaceholder')}
                              className="w-full pl-9 pr-8 py-2 rounded-xl bg-[#FCFAF4] border border-[#286B43]/25 text-sm text-[#173D2A] focus:bg-[#FFFDF7] focus:outline-none focus:ring-2 focus:ring-[#286B43] focus:border-[#286B43]"
                              autoFocus
                            />
                            {cropSearch && (
                              <button
                                type="button"
                                onClick={() => setCropSearch('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#52604D] hover:text-[#173D2A] p-0.5 rounded focus:outline-none focus:ring-1 focus:ring-[#286B43]"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Crop Options List */}
                          <div className="max-h-56 overflow-y-auto space-y-1 pr-1" role="listbox">
                            {cropsLoading ? (
                              <div className="p-3 text-center text-xs text-[#52604D] flex items-center justify-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin text-[#286B43]" />
                                <span>{t('loadingCrops')}</span>
                              </div>
                            ) : cropsError ? (
                              <div className="p-3 text-center text-xs text-red-600">
                                <p>{cropsError}</p>
                                <button
                                  type="button"
                                  onClick={loadCropsList}
                                  className="mt-1 text-xs font-bold text-[#B45309] hover:text-[#7A5F12] underline focus:outline-none focus:ring-1 focus:ring-[#286B43] rounded"
                                >
                                  {t('retry')}
                                </button>
                              </div>
                            ) : filteredCrops.length === 0 ? (
                              <div className="p-3 text-center text-xs text-[#52604D]">
                                {t('cropsEmpty')}
                              </div>
                            ) : (
                              filteredCrops.map((c) => {
                                const isSelected = crop.toLowerCase() === c.toLowerCase()
                                const displayName = getCropDisplayName(c, language)
                                return (
                                  <button
                                    key={c}
                                    type="button"
                                    role="option"
                                    aria-selected={isSelected}
                                    onClick={() => {
                                      setCrop(c)
                                      setVariety('')
                                      setIsCropDropdownOpen(false)
                                      setCropSearch('')
                                    }}
                                    className={`w-full px-3 py-2 rounded-xl text-left text-sm flex items-center justify-between transition-colors cursor-pointer focus:outline-none focus:bg-[#EAF4EE] focus:ring-1 focus:ring-[#286B43] ${
                                      isSelected
                                        ? 'bg-[#EAF4EE] text-[#173D2A] font-bold'
                                        : 'hover:bg-[#FCFAF4] text-[#173D2A]'
                                    }`}
                                  >
                                    <span>{displayName}</span>
                                    {isSelected && <Check className="w-4 h-4 text-[#286B43]" />}
                                  </button>
                                )
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Variety Dropdown (Dependent on Crop) */}
                    <div className="pt-3 border-t border-[#286B43]/20">
                      <div className="flex items-center justify-between mb-1.5">
                        <label htmlFor="variety-select-trigger" className="text-xs font-bold text-[#173D2A] uppercase tracking-wider flex items-center gap-2">
                          <Tag className="w-3.5 h-3.5 text-[#286B43]" />
                          <span>{t('varietyLabel')}</span>
                        </label>
                        <span className="text-[11px] text-[#52604D] font-medium">({t('varietyOptional')})</span>
                      </div>

                      <div className="relative" ref={varietyDropdownRef}>
                        <button
                          id="variety-select-trigger"
                          type="button"
                          disabled={!crop || varietiesLoading}
                          onClick={() => setIsVarietyDropdownOpen((prev) => !prev)}
                          aria-haspopup="listbox"
                          aria-expanded={isVarietyDropdownOpen}
                          aria-label={t('varietyLabel')}
                          className={`w-full px-4 py-2.5 rounded-xl border text-left flex items-center justify-between text-sm transition-all shadow-2xs ${
                            !crop
                              ? 'bg-[#F6F0E1]/50 border-[#286B43]/15 text-[#52604D]/60 cursor-not-allowed opacity-75'
                              : 'bg-[#FCFAF4] border-[#286B43]/25 hover:border-[#286B43] focus:outline-none focus:ring-2 focus:ring-[#286B43] focus:border-[#286B43] text-[#173D2A] cursor-pointer'
                          }`}
                        >
                          <span className={`font-semibold ${variety ? 'text-[#173D2A]' : 'text-[#52604D]'}`}>
                            {!crop
                              ? t('selectCropFirst')
                              : varietiesLoading
                                ? t('loadingVarieties')
                                : variety || t('allVarieties')}
                          </span>
                          <div className="flex items-center gap-1.5 text-[#52604D]">
                            {variety && (
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setVariety('')
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.stopPropagation()
                                    setVariety('')
                                  }
                                }}
                                title={t('clearSelection')}
                                className="p-0.5 rounded-full hover:bg-[#EAF4EE] text-[#52604D] hover:text-[#173D2A] cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#286B43]"
                              >
                                <X className="w-3.5 h-3.5" />
                              </span>
                            )}
                            {varietiesLoading ? (
                              <Loader2 className="w-4 h-4 animate-spin text-[#286B43]" />
                            ) : (
                              <ChevronDown className={`w-4 h-4 transition-transform ${isVarietyDropdownOpen ? 'rotate-180' : ''}`} />
                            )}
                          </div>
                        </button>

                        {isVarietyDropdownOpen && crop && (
                          <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#FFFDF7] border border-[#286B43]/30 rounded-2xl shadow-xl z-30 p-2.5 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150">
                            {/* Variety Search Input if large list */}
                            {varietyOptions.length > 5 && (
                              <div className="relative mb-2">
                                <Search className="w-4 h-4 text-[#52604D] absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                  type="text"
                                  value={varietySearch}
                                  onChange={(e) => setVarietySearch(e.target.value)}
                                  placeholder={t('varietySelectPlaceholder')}
                                  className="w-full pl-9 pr-8 py-2 rounded-xl bg-[#FCFAF4] border border-[#286B43]/25 text-sm text-[#173D2A] focus:bg-[#FFFDF7] focus:outline-none focus:ring-2 focus:ring-[#286B43] focus:border-[#286B43]"
                                  autoFocus
                                />
                                {varietySearch && (
                                  <button
                                    type="button"
                                    onClick={() => setVarietySearch('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#52604D] hover:text-[#173D2A] p-0.5 rounded focus:outline-none focus:ring-1 focus:ring-[#286B43]"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Variety Options List */}
                            <div className="max-h-56 overflow-y-auto space-y-1 pr-1" role="listbox">
                              {varietiesLoading ? (
                                <div className="p-3 text-center text-xs text-[#52604D] flex items-center justify-center gap-2">
                                  <Loader2 className="w-4 h-4 animate-spin text-[#286B43]" />
                                  <span>{t('loadingVarieties')}</span>
                                </div>
                              ) : varietiesError ? (
                                <div className="p-3 text-center text-xs text-red-600">
                                  {varietiesError}
                                </div>
                              ) : varietyOptions.length === 0 ? (
                                <div className="p-3 text-center text-xs text-[#52604D] italic">
                                  {t('noVarietiesAvailable')}
                                </div>
                              ) : (
                                <>
                                  {/* All Varieties Option */}
                                  <button
                                    type="button"
                                    role="option"
                                    aria-selected={!variety}
                                    onClick={() => {
                                      setVariety('')
                                      setIsVarietyDropdownOpen(false)
                                      setVarietySearch('')
                                    }}
                                    className={`w-full px-3 py-2 rounded-xl text-left text-sm flex items-center justify-between transition-colors cursor-pointer focus:outline-none focus:bg-[#EAF4EE] focus:ring-1 focus:ring-[#286B43] ${
                                      !variety
                                        ? 'bg-[#EAF4EE] text-[#173D2A] font-bold'
                                        : 'hover:bg-[#FCFAF4] text-[#52604D]'
                                    }`}
                                  >
                                    <span>{t('allVarieties')}</span>
                                    {!variety && <Check className="w-4 h-4 text-[#286B43]" />}
                                  </button>

                                  {filteredVarieties.length === 0 && varietySearch ? (
                                    <div className="p-3 text-center text-xs text-[#52604D]">
                                      {t('varietiesEmpty')}
                                    </div>
                                  ) : (
                                    filteredVarieties.map((v) => {
                                      const isSelected = variety === v
                                      return (
                                        <button
                                          key={v}
                                          type="button"
                                          role="option"
                                          aria-selected={isSelected}
                                          onClick={() => {
                                            setVariety(v)
                                            setIsVarietyDropdownOpen(false)
                                            setVarietySearch('')
                                          }}
                                          className={`w-full px-3 py-2 rounded-xl text-left text-sm flex items-center justify-between transition-colors cursor-pointer focus:outline-none focus:bg-[#EAF4EE] focus:ring-1 focus:ring-[#286B43] ${
                                            isSelected
                                              ? 'bg-[#EAF4EE] text-[#173D2A] font-bold'
                                              : 'hover:bg-[#FCFAF4] text-[#173D2A]'
                                          }`}
                                        >
                                          <span className="truncate">{v}</span>
                                          {isSelected && <Check className="w-4 h-4 text-[#286B43] shrink-0" />}
                                        </button>
                                      )
                                    })
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="card-softwhite bg-[#FFFDF7] rounded-2xl p-5 border border-[#286B43]/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-[#173D2A] uppercase tracking-wider flex items-center gap-2">
                        <Wheat className="w-4 h-4 text-[#286B43]" />
                        <span>{t('cropListTitle')}</span>
                      </h4>
                      <button
                        type="button"
                        onClick={() => setMultiCrops((prev) => [...prev, { crop: '', quantity: '200', lossPercentage: '0' }])}
                        className="text-xs font-bold text-[#173D2A] bg-[#EAF4EE] hover:bg-[#286B43] hover:text-white px-2.5 py-1 rounded-lg border border-[#286B43]/30 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#286B43]"
                      >
                        + {t('addCrop')}
                      </button>
                    </div>
                    <div className="space-y-2">
                      {multiCrops.map((cItem, cIdx) => (
                        <div key={cIdx} className="flex flex-wrap sm:flex-nowrap gap-2 items-center bg-[#FCFAF4] p-3 rounded-xl border border-[#286B43]/20 shadow-2xs">
                          <div className="flex-1 min-w-[120px]">
                            <input
                              type="text"
                              list="multi-crop-datalist"
                              value={cItem.crop}
                              onChange={(e) => {
                                const updated = [...multiCrops]
                                updated[cIdx].crop = e.target.value
                                setMultiCrops(updated)
                              }}
                              placeholder={t('cropPlaceholder')}
                              className="w-full px-3 py-1.5 rounded-lg border border-[#286B43]/25 bg-[#FFFDF7] text-sm text-[#173D2A] focus:outline-none focus:ring-2 focus:ring-[#286B43] focus:border-[#286B43]"
                            />
                            <datalist id="multi-crop-datalist">
                              {cropOptions.map((c) => (
                                <option key={c} value={c}>
                                  {getCropDisplayName(c, language)}
                                </option>
                              ))}
                            </datalist>
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
                              placeholder={t('produceWeight')}
                              className="w-full pr-8 pl-2 py-1.5 rounded-lg border border-[#286B43]/25 bg-[#FFFDF7] text-sm text-[#173D2A] focus:outline-none focus:ring-2 focus:ring-[#286B43] focus:border-[#286B43]"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#52604D]">{t('unitKg')}</span>
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
                              className="w-full pr-6 pl-2 py-1.5 rounded-lg border border-[#286B43]/25 bg-[#FFFDF7] text-sm text-[#173D2A] focus:outline-none focus:ring-2 focus:ring-[#286B43] focus:border-[#286B43]"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#52604D]">%</span>
                          </div>
                          {multiCrops.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setMultiCrops((prev) => prev.filter((_, idx) => idx !== cIdx))}
                              className="text-xs text-[#B91C1C] hover:bg-red-50 rounded-lg px-2 py-1 cursor-pointer focus:outline-none focus:ring-1 focus:ring-red-400"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-[#52604D]">
                      {t('combinedHarvestQuantity', {
                        total: multiCrops.reduce((acc, c) => acc + (parseFloat(c.quantity) || 0), 0),
                      })}
                    </p>
                  </div>
                )}

                {/* Section 2: Quantity in KG */}
                {harvestType === 'single' && (
                  <div className="card-softwhite p-5 rounded-2xl border border-[#286B43]/20">
                    <div className="flex items-center justify-between mb-2">
                      <label htmlFor="quantity" className="text-xs font-bold text-[#173D2A] uppercase tracking-wider flex items-center gap-2">
                        <Scale className="w-4 h-4 text-[#286B43]" />
                        <span>{t('quantityKg')}</span>
                      </label>
                      <span className="text-[11px] text-[#52604D]">{t('produceWeight')}</span>
                    </div>
                    <div className="relative mb-3">
                      <input
                        id="quantity"
                        type="number"
                        min="1"
                        step="any"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        placeholder={t('quantityPlaceholder')}
                        className="w-full pl-4 pr-12 py-2.5 rounded-xl bg-[#FCFAF4] border border-[#286B43]/25 focus:outline-none focus:ring-2 focus:ring-[#286B43] focus:border-[#286B43] text-[#173D2A] font-semibold text-base transition-all shadow-2xs"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-[#52604D]">
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
                          className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#286B43] focus:ring-offset-1 ${
                            quantity === String(q)
                              ? 'bg-[#173D2A] border-[#173D2A] text-[#E7C96B] font-bold shadow-xs'
                              : 'bg-[#FCFAF4] border-[#286B43]/20 text-[#52604D] hover:bg-[#EAF4EE]'
                          }`}
                        >
                          {q} {t('unitKg')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Section 3: State & District */}
                <div className="card-softwhite p-5 rounded-2xl border border-[#286B43]/20">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="state" className="text-xs font-bold text-[#173D2A] uppercase tracking-wider block mb-1.5">
                        {t('stateRequired')}
                      </label>
                      <div className="relative">
                        <select
                          id="state"
                          value={state}
                          onChange={handleStateChange}
                          disabled={filtersLoading || filterOptions.states.length === 0}
                          aria-describedby="farmer-filters-status"
                          className="w-full appearance-none pr-10 px-3.5 py-2.5 rounded-xl bg-[#FCFAF4] border border-[#286B43]/25 focus:outline-none focus:ring-2 focus:ring-[#286B43] focus:border-[#286B43] text-[#173D2A] text-sm disabled:opacity-60 shadow-2xs"
                        >
                          {filterOptions.states.map((option) => (
                            <option key={option.id} value={option.name}>{option.name}</option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#52604D]" />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="district" className="text-xs font-bold text-[#173D2A] uppercase tracking-wider block mb-1.5">
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
                          className="w-full appearance-none pr-10 px-3.5 py-2.5 rounded-xl bg-[#FCFAF4] border border-[#286B43]/25 focus:outline-none focus:ring-2 focus:ring-[#286B43] focus:border-[#286B43] text-[#173D2A] text-sm disabled:opacity-60 shadow-2xs"
                        />
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#52604D]" />
                        <datalist id="farmer-district-options">
                          {districtOptions.map((option) => (
                            <option key={option.id} value={option.name} />
                          ))}
                        </datalist>
                      </div>
                    </div>
                    <div id="farmer-filters-status" className="col-span-full flex items-center gap-2 text-xs text-[#52604D]" aria-live="polite">
                      {filtersLoading && <span>{t('marketFiltersLoading')}</span>}
                      {!filtersLoading && filtersError && (
                        <>
                          <span>{t('marketFiltersUnavailable')}</span>
                          <button
                            type="button"
                            onClick={loadFilters}
                            className="inline-flex items-center gap-1 font-semibold text-[#B45309] hover:text-[#7A5F12] underline cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#286B43] rounded"
                          >
                            <RefreshCw className="w-3 h-3" />
                            {t('retry')}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Section 4: Candidate Mandis & Selection */}
                <div className="card-softwhite p-5 rounded-2xl border border-[#286B43]/20">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <label className="text-xs font-bold text-[#173D2A] uppercase tracking-wider flex items-center gap-2">
                      <Truck className="w-4 h-4 text-[#286B43]" />
                      <span>{t('candidateMarkets')}</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleAutoSelectTopMarkets}
                      className="btn-gold px-3 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer shadow-xs focus:outline-none focus:ring-2 focus:ring-[#286B43] focus:ring-offset-1"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#173D2A]" />
                      <span>{t('autoSelectTopMarkets') || '✦ Auto-select top markets'}</span>
                    </button>
                  </div>

                  <p className="text-xs text-[#52604D] mb-3 leading-relaxed">
                    {transportMode === 'shared_load' ? t('sharedCandidateHelp') : t('transportHelp')}
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
                    className="w-full mb-3 px-3.5 py-2 rounded-xl bg-[#FCFAF4] border border-[#286B43]/20 text-sm text-[#173D2A] focus:outline-none focus:ring-2 focus:ring-[#286B43] focus:border-[#286B43] shadow-2xs"
                  />
                  <div className="rounded-xl border border-[#286B43]/20 bg-[#FCFAF4] p-2 space-y-1 max-h-60 overflow-y-auto">
                    {visibleMarkets.map((market) => {
                      const selected = markets.some((item) => item.name === market.name)
                      return (
                        <button
                          type="button"
                          key={market.id}
                          onClick={() => toggleMarket(market)}
                          className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#286B43] ${
                            selected ? 'bg-[#EAF4EE] border border-[#286B43]/40' : 'hover:bg-[#FFFDF7]'
                          }`}
                        >
                          <span className={`w-4 h-4 rounded border flex items-center justify-center ${selected ? 'bg-[#173D2A] border-[#173D2A] text-[#E7C96B] font-bold text-xs' : 'border-[#286B43]/30'}`}>
                            {selected ? '✓' : ''}
                          </span>
                          <span className="flex-1">
                            <span className="font-semibold text-[#173D2A]">{market.name}</span>
                            <span className="block text-xs text-[#52604D]">{market.district}</span>
                          </span>
                          <span className="text-[11px] font-medium text-[#52604D]">
                            {market.price_available ? (
                              <span className="text-[#173D2A] bg-[#EAF4EE] border border-[#286B43]/30 px-2 py-0.5 rounded-full font-semibold">
                                {t('priceAvailable')}
                              </span>
                            ) : (
                              <span>{t('priceUnavailable')}</span>
                            )}
                          </span>
                        </button>
                      )
                    })}
                    {!marketsLoading && visibleMarkets.length === 0 && (
                      <p className="p-3 text-sm text-[#52604D]">{t('marketOptionsEmpty')}</p>
                    )}
                    {visibleMarketCount < filteredMarkets.length && (
                      <div className="flex gap-2 pt-1 border-t border-[#286B43]/15">
                        <button
                          type="button"
                          onClick={() => setVisibleMarketCount((count) => count + 20)}
                          className="flex-1 py-1.5 text-xs font-semibold text-[#173D2A] hover:bg-[#EAF4EE] rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#286B43]"
                        >
                          {t('showMoreMarkets')} (+20)
                        </button>
                        <button
                          type="button"
                          onClick={() => setVisibleMarketCount(filteredMarkets.length)}
                          className="flex-1 py-1.5 text-xs font-bold text-[#173D2A] hover:bg-[#EAF4EE] rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#286B43]"
                        >
                          Show All ({filteredMarkets.length})
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-[#52604D]">
                    {marketsLoading
                      ? t('marketOptionsLoading')
                      : marketsError || (availableMarkets.length === 0 ? t('marketOptionsEmpty') : t('selectedMarketsCount', { count: markets.length }))}
                  </p>

                  {/* Selected Markets with Transport Quotes */}
                  <div className="space-y-2 mt-3">
                    {markets.map((m, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 p-3 rounded-xl bg-[#FFFDF7] border border-[#286B43]/20 shadow-2xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-7 h-7 rounded-lg bg-[#173D2A] text-[#E7C96B] font-bold text-xs flex items-center justify-center shrink-0">
                            {idx + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-semibold text-[#173D2A] block truncate sm:whitespace-normal">
                              {m.name}
                            </span>
                            {m.district && (
                              <span className="text-[11px] text-[#52604D] block truncate">
                                {m.district}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="w-full sm:w-44 relative shrink-0">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#52604D]">
                            ₹
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={m.transportCost}
                            onChange={(e) => handleMarketCostChange(idx, e.target.value)}
                            aria-label={`${t('transportCost')} — ${m.name}`}
                            placeholder={transportMode === 'shared_load' ? t('sharedQuotePlaceholder') : t('transportCost')}
                            className="w-full pl-7 pr-3 py-2 sm:py-1.5 rounded-lg bg-[#FCFAF4] border border-[#286B43]/25 text-sm text-[#173D2A] font-medium focus:outline-none focus:ring-2 focus:ring-[#286B43] focus:border-[#286B43] shadow-2xs"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Right Column (5 cols): Transport Mode, Other Costs & Action Sticky Card */}
              <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-24">
                
                {/* Transport Mode Switcher */}
                <div className="card-softwhite p-5 rounded-2xl border border-[#286B43]/20">
                  <label className="text-xs font-bold text-[#173D2A] uppercase tracking-wider flex items-center gap-2 mb-3">
                    <Truck className="w-4 h-4 text-[#286B43]" />
                    <span>{t('transportMode')}</span>
                  </label>

                  <div className="grid grid-cols-1 gap-2.5 mb-4">
                    <button
                      type="button"
                      onClick={() => setTransportMode('dedicated_vehicle')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#286B43] focus:ring-offset-1 ${
                        transportMode === 'dedicated_vehicle'
                          ? 'bg-[#EAF4EE] border-[#173D2A] shadow-xs'
                          : 'bg-[#FCFAF4] border-[#286B43]/15 hover:bg-[#EAF4EE]/60'
                      }`}
                    >
                      <div className="font-bold text-xs text-[#173D2A] flex items-center gap-2">
                        <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${transportMode === 'dedicated_vehicle' ? 'border-[#173D2A] bg-[#173D2A]' : 'border-[#286B43]/40'}`}>
                          {transportMode === 'dedicated_vehicle' && <span className="w-1.5 h-1.5 rounded-full bg-[#E7C96B]" />}
                        </span>
                        <span>{t('dedicatedVehicle')}</span>
                      </div>
                      <p className="text-[11px] text-[#52604D] mt-1 ml-5.5 leading-snug">
                        {t('dedicatedVehicleDesc')}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTransportMode('shared_load')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#286B43] focus:ring-offset-1 ${
                        transportMode === 'shared_load'
                          ? 'bg-[#EAF4EE] border-[#173D2A] shadow-xs'
                          : 'bg-[#FCFAF4] border-[#286B43]/15 hover:bg-[#EAF4EE]/60'
                      }`}
                    >
                      <div className="font-bold text-xs text-[#173D2A] flex items-center gap-2">
                        <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${transportMode === 'shared_load' ? 'border-[#173D2A] bg-[#173D2A]' : 'border-[#286B43]/40'}`}>
                          {transportMode === 'shared_load' && <span className="w-1.5 h-1.5 rounded-full bg-[#E7C96B]" />}
                        </span>
                        <span>{t('sharedLoad')}</span>
                      </div>
                      <p className="text-[11px] text-[#52604D] mt-1 ml-5.5 leading-snug">
                        {t('sharedLoadDesc')}
                      </p>
                    </button>
                  </div>

                  {/* Shared Rate Options */}
                  {transportMode === 'shared_load' && (
                    <div className="p-3.5 rounded-xl bg-[#FCFAF4] border border-[#286B43]/20 space-y-3.5">
                      {/* Pricing Basis Toggle */}
                      <div className="flex flex-wrap items-center justify-between gap-1 pb-2 border-b border-[#286B43]/15">
                        <span className="text-[11px] font-bold text-[#173D2A] uppercase tracking-wider">
                          {t('pricingBasis')}
                        </span>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSharedPricingBasis('distance_based')
                              if (sharedRateType === 'per_kg') setSharedRateType('per_kg_per_km')
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#286B43] ${
                              sharedPricingBasis === 'distance_based'
                                ? 'bg-[#173D2A] text-[#FFFDF7]'
                                : 'bg-[#FCFAF4] text-[#52604D] hover:bg-[#EAF4EE]'
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
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#286B43] ${
                              sharedPricingBasis === 'fixed_trip'
                                ? 'bg-[#173D2A] text-[#FFFDF7]'
                                : 'bg-[#FCFAF4] text-[#52604D] hover:bg-[#EAF4EE]'
                            }`}
                          >
                            {t('fixedTripPricing')}
                          </button>
                        </div>
                      </div>

                      {/* Packaging Unit Selector */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-[#52604D]">
                          <span className="font-semibold text-[#173D2A] uppercase tracking-wider">
                            {t('sharedUnitsLabel')}
                          </span>
                          <span>
                            {totalProduceWeight.toLocaleString('en-IN')} kg (~{sharedUnitsCount} {sharedRateType === 'per_crate' ? 'crates' : sharedRateType === 'per_bag' ? 'bags' : 'kg'})
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSharedRateType(sharedPricingBasis === 'distance_based' ? 'per_kg_per_km' : 'per_kg')}
                            className={`py-1.5 px-2 rounded-lg text-xs font-semibold text-center cursor-pointer border transition-colors focus:outline-none focus:ring-2 focus:ring-[#286B43] ${
                              (sharedRateType === 'per_kg_per_km' || sharedRateType === 'per_kg')
                                ? 'bg-[#173D2A] text-[#FFFDF7] border-[#173D2A]'
                                : 'bg-[#FFFDF7] text-[#52604D] border-[#286B43]/20 hover:bg-[#EAF4EE]'
                            }`}
                          >
                            {sharedPricingBasis === 'distance_based' ? t('perKgPerKmRate') : t('sharedPerKgRate')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSharedRateType('per_crate')}
                            className={`py-1.5 px-2 rounded-lg text-xs font-semibold text-center cursor-pointer border transition-colors focus:outline-none focus:ring-2 focus:ring-[#286B43] ${
                              sharedRateType === 'per_crate'
                                ? 'bg-[#173D2A] text-[#FFFDF7] border-[#173D2A]'
                                : 'bg-[#FFFDF7] text-[#52604D] border-[#286B43]/20 hover:bg-[#EAF4EE]'
                            }`}
                          >
                            {t('perCrateRate')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSharedRateType('per_bag')}
                            className={`py-1.5 px-2 rounded-lg text-xs font-semibold text-center cursor-pointer border transition-colors focus:outline-none focus:ring-2 focus:ring-[#286B43] ${
                              sharedRateType === 'per_bag'
                                ? 'bg-[#173D2A] text-[#FFFDF7] border-[#173D2A]'
                                : 'bg-[#FFFDF7] text-[#52604D] border-[#286B43]/20 hover:bg-[#EAF4EE]'
                            }`}
                          >
                            {t('perBagRate')}
                          </button>
                        </div>
                      </div>

                      {/* Rate Input */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-[#52604D]">
                          <span>Custom rate (leave blank to use default ₹{defaultSharedRate})</span>
                        </div>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#52604D]">₹</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={sharedRate}
                            onChange={(e) => setSharedRate(e.target.value)}
                            placeholder={String(defaultSharedRate)}
                            className="w-full pl-7 pr-3 py-1.5 rounded-lg bg-[#FCFAF4] border border-[#286B43]/20 text-xs text-[#173D2A] focus:outline-none focus:ring-2 focus:ring-[#286B43] focus:border-[#286B43]"
                          />
                        </div>
                      </div>

                      {/* Load Capacity Advisory Warning */}
                      {totalProduceWeight > 2500 && (
                        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2 shadow-2xs">
                          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                          <div className="leading-snug">
                            <span className="font-bold block">{t('sharedCapacityWarning')}</span>
                            <span className="text-[11px] text-amber-800">
                              {totalProduceWeight.toLocaleString('en-IN')} kg produce exceeds standard 2,500 kg capacity for shared pickup/auto hauls.
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Live Preview Box */}
                      <div className="p-2.5 rounded-xl bg-[#EAF4EE] border border-[#286B43]/25 text-xs text-[#173D2A] space-y-1">
                        <span className="font-bold text-[11px] uppercase tracking-wider text-[#286B43] block">
                          {t('sharedPreviewTitle')}
                        </span>
                        <div className="text-[11px] text-[#52604D] leading-relaxed">
                          {sharedPricingBasis === 'distance_based' ? (
                            <>
                              Rate applied: <span className="font-bold text-[#173D2A]">₹{sharedRate.trim() || defaultSharedRate}</span> per {sharedRateType === 'per_crate' ? 'crate (25kg)' : sharedRateType === 'per_bag' ? 'bag (50kg)' : 'kg'} / km.
                              <br />
                              For a sample 50 km haul: <span className="font-bold text-[#173D2A]">~₹{Math.round((parseFloat(sharedRate) || defaultSharedRate) * sharedUnitsCount * 50).toLocaleString('en-IN')}</span> total freight.
                            </>
                          ) : (
                            <>
                              Rate applied: <span className="font-bold text-[#173D2A]">₹{sharedRate.trim() || defaultSharedRate}</span> flat per {sharedRateType === 'per_crate' ? 'crate (25kg)' : sharedRateType === 'per_bag' ? 'bag (50kg)' : 'kg'}.
                              <br />
                              Estimated trip freight: <span className="font-bold text-[#173D2A]">~₹{Math.round((parseFloat(sharedRate) || defaultSharedRate) * sharedUnitsCount).toLocaleString('en-IN')}</span> total for this harvest.
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Other Costs & Loss Percentage */}
                <div className="card-softwhite p-5 rounded-2xl border border-[#286B43]/20 space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="loss-percentage" className="text-xs font-bold text-[#173D2A] uppercase tracking-wider">
                        {t('lossPercentage')}
                      </label>
                      <span className="text-[11px] text-[#52604D]">{t('optional')}</span>
                    </div>
                    <div className="relative">
                      <input
                        id="loss-percentage"
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        value={lossPercentage}
                        onChange={(e) => setLossPercentage(e.target.value)}
                        placeholder="0"
                        className="w-full pr-10 pl-3 py-2 rounded-xl bg-[#FCFAF4] border border-[#286B43]/25 text-sm text-[#173D2A] focus:outline-none focus:ring-2 focus:ring-[#286B43] focus:border-[#286B43]"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#52604D]">
                        %
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="other-costs" className="text-xs font-bold text-[#173D2A] uppercase tracking-wider">
                        {t('otherCosts')}
                      </label>
                      <span className="text-[11px] text-[#52604D]">{t('optional')}</span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#52604D]">
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
                        className="w-full pl-7 pr-3 py-2 rounded-xl bg-[#FCFAF4] border border-[#286B43]/25 text-sm text-[#173D2A] focus:outline-none focus:ring-2 focus:ring-[#286B43] focus:border-[#286B43]"
                      />
                    </div>
                  </div>
                </div>

                {/* Section: Your Harvest at a Glance (Live Summary Panel) */}
                <div className="card-softwhite p-5 rounded-2xl border border-[#286B43]/25 shadow-xs space-y-4">
                  {/* Panel Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-[#286B43]/15">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-[#173D2A] text-[#E7C96B] flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                        🌾
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-[#173D2A] uppercase tracking-wider">
                          {t('harvestAtAGlance')}
                        </h4>
                        <p className="text-[11px] text-[#52604D]">
                          {t('harvestSummarySubtitle')}
                        </p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                      totalProduceWeight > 0 && district
                        ? 'bg-[#EAF4EE] text-[#173D2A] border border-[#286B43]/30'
                        : 'bg-amber-50 text-amber-900 border border-amber-200'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${totalProduceWeight > 0 && district ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                      <span>{totalProduceWeight > 0 && district ? t('summaryReadyToCalculate') : t('summaryPendingDetails')}</span>
                    </span>
                  </div>

                  {/* Metrics Grid */}
                  <div className="space-y-2.5 text-xs">
                    {/* Produce & Quantity Row */}
                    <div className="p-3 rounded-xl bg-[#FCFAF4] border border-[#286B43]/15 flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <Wheat className="w-4 h-4 text-[#286B43] shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <span className="text-[11px] font-bold text-[#52604D] uppercase tracking-wider block">
                            {t('summaryCrop')}
                          </span>
                          {harvestType === 'single' ? (
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                              <span className="font-bold text-sm text-[#173D2A]">
                                {crop ? getCropDisplayName(crop, language) : t('summaryNotSelected')}
                              </span>
                              {variety && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#EAF4EE] text-[#173D2A] border border-[#286B43]/20">
                                  {variety}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="mt-0.5">
                              <span className="font-bold text-sm text-[#173D2A]">
                                {t('summaryMultiCropsCount', { count: multiCrops.filter(c => c.crop && parseFloat(c.quantity) > 0).length })}
                              </span>
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {multiCrops.map((c, idx) => (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] bg-[#EAF4EE] text-[#173D2A] border border-[#286B43]/20 font-medium"
                                  >
                                    <span>{getCropDisplayName(c.crop, language)}</span>
                                    <span className="font-bold text-[#286B43]">
                                      ({parseFloat(c.quantity) > 0 ? `${parseFloat(c.quantity).toLocaleString('en-IN')} kg` : '—'})
                                    </span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[11px] font-bold text-[#52604D] uppercase tracking-wider block">
                          {t('summaryQuantity')}
                        </span>
                        <span className="font-extrabold text-sm text-[#173D2A] mt-0.5 block">
                          {totalProduceWeight > 0 ? (
                            `${totalProduceWeight.toLocaleString('en-IN')} kg`
                          ) : (
                            <span className="text-[#52604D] font-normal italic">{t('summaryNotSpecified')}</span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Location & Transport 2-Col Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {/* Origin Location */}
                      <div className="p-2.5 rounded-xl bg-[#FCFAF4] border border-[#286B43]/15">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#52604D] uppercase tracking-wider mb-1">
                          <MapPin className="w-3.5 h-3.5 text-[#286B43]" />
                          <span>{t('summaryLocation')}</span>
                        </div>
                        <div className="font-semibold text-xs text-[#173D2A] truncate">
                          {district ? (
                            `${district}, ${state}`
                          ) : (
                            <span className="text-[#52604D] font-normal italic">{t('summaryNotSelected')}</span>
                          )}
                        </div>
                      </div>

                      {/* Logistics Mode */}
                      <div className="p-2.5 rounded-xl bg-[#FCFAF4] border border-[#286B43]/15">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#52604D] uppercase tracking-wider mb-1">
                          <Truck className="w-3.5 h-3.5 text-[#286B43]" />
                          <span>{t('summaryLogistics')}</span>
                        </div>
                        <div className="font-semibold text-xs text-[#173D2A] truncate">
                          {transportMode === 'dedicated_vehicle' ? (
                            t('dedicatedVehicle')
                          ) : (
                            <span>
                              {t('sharedLoad')}{' '}
                              <span className="text-[10px] text-[#52604D] font-normal">
                                ({sharedPricingBasis === 'distance_based' ? '₹/km' : 'fixed'})
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Candidate Markets & Status Row */}
                    <div className="p-3 rounded-xl bg-[#FCFAF4] border border-[#286B43]/15 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 font-bold text-[#173D2A]">
                          <Scale className="w-3.5 h-3.5 text-[#286B43]" />
                          <span>{t('summaryMarkets')}</span>
                        </div>
                        <span className="font-bold text-[#173D2A]">
                          {markets.length > 0 ? (
                            t('selectedMarketsCount', { count: markets.length })
                          ) : (
                            <span className="text-[11px] text-[#52604D] font-normal">{t('summaryAutoSelectHint')}</span>
                          )}
                        </span>
                      </div>

                      {markets.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-[#286B43]/10 text-[11px] text-[#52604D]">
                          <span className="inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#286B43]" />
                            <span>
                              {t('summaryPricesReported', {
                                count: markets.filter((m) => m.price_available).length,
                                total: markets.length,
                              })}
                            </span>
                          </span>
                          <span className="text-[#52604D]/40">•</span>
                          <span className="inline-flex items-center gap-1">
                            {markets.every((m) => m.transportCost && parseFloat(m.transportCost) > 0) ? (
                              <span className="text-[#173D2A] font-semibold">
                                ✓ {t('summaryAllQuotesPresent', { count: markets.length })}
                              </span>
                            ) : (
                              <span>
                                {t('summaryQuotesMissing', {
                                  count: markets.filter((m) => !m.transportCost || parseFloat(m.transportCost) <= 0).length,
                                })}
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Optional adjustments pill (Transit Loss / Other Costs) if specified */}
                    {(Boolean(parseFloat(lossPercentage) > 0) || Boolean(parseFloat(otherCosts) > 0)) && (
                      <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px]">
                        {parseFloat(lossPercentage) > 0 && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900 font-medium">
                            {t('summaryTransitLoss', { loss: lossPercentage })}
                          </span>
                        )}
                        {parseFloat(otherCosts) > 0 && (
                          <span className="px-2 py-0.5 rounded-md bg-[#FCFAF4] border border-[#286B43]/20 text-[#173D2A] font-medium">
                            {t('summaryOtherCosts', { cost: parseFloat(otherCosts).toLocaleString('en-IN') })}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Primary Action Button & Live Progress */}
                {isLoading ? (
                  <div className="p-6 rounded-2xl bg-[#173D2A] text-[#FFFDF7] border border-[#E7C96B]/30 shadow-xl reveal-soft" role="status" aria-live="polite">
                    <div className="flex items-center gap-3 mb-4">
                      <Loader2 className="w-5 h-5 text-[#E7C96B] animate-spin" />
                      <span className="font-bold text-base tracking-wide text-[#E7C96B]">
                        {t('calculating')}
                      </span>
                    </div>

                    <div className="space-y-2.5 text-xs">
                      {[
                        [t('checking'), true],
                        [t('transportation'), true],
                        [t('sortedByReturn'), false],
                        [t('findMarket'), false],
                      ].map(([stepText, isDone]) => (
                        <div
                          key={stepText}
                          className={`flex items-center gap-2.5 ${isDone ? 'text-[#FFFDF7]' : 'text-[#FFFDF7]/60'}`}
                        >
                          {isDone ? (
                            <CheckCircle2 className="w-4 h-4 text-[#E7C96B] shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-[#FFFDF7]/40 shrink-0" />
                          )}
                          <span>{stepText}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <button
                    type="submit"
                    className="w-full btn-gold py-4 px-6 text-base font-bold flex items-center justify-center gap-3 cursor-pointer shadow-xl text-[#173D2A] focus:outline-none focus:ring-2 focus:ring-[#286B43] focus:ring-offset-2"
                  >
                    <span>🌾 {t('calculate')}</span>
                    <Sparkles className="w-5 h-5 text-[#173D2A] animate-pulse" />
                  </button>
                )}

              </div>

            </div>
          </form>
        </div>
      </div>
    </section>
  )
}
