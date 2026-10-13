import React, { useState, useEffect, useCallback } from 'react'
import {
  Search,
  RefreshCw,
  AlertCircle,
  Layers,
  Database,
  CheckCircle2,
  Clock,
  Archive,
  AlertTriangle,
} from 'lucide-react'
import { fetchMarketFilters, fetchMarkets } from '../services/api'
import { localizeBackendText, useLanguage } from '../localization'

export default function MarketExplorer() {
  const { language, t } = useLanguage()
  const [commodity, setCommodity] = useState('Tomato')
  const [state, setState] = useState('Karnataka')
  const [district, setDistrict] = useState('')
  const [filterOptions, setFilterOptions] = useState({ states: [], districts: [], commodities: [] })
  const [filtersLoading, setFiltersLoading] = useState(true)
  const [filtersError, setFiltersError] = useState(null)

  const [loading, setLoading] = useState(false)
  const [marketsData, setMarketsData] = useState([])
  const [source, setSource] = useState('agmarknet.gov.in')
  const [usingFallback, setUsingFallback] = useState(false)
  const [errorInfo, setErrorInfo] = useState(null)
  const [errorKind, setErrorKind] = useState(null)

  const loadFilters = useCallback(async () => {
    setFiltersLoading(true)
    setFiltersError(null)
    const res = await fetchMarketFilters()
    setFiltersLoading(false)
    if (res.available && res.states?.length > 0) {
      setFilterOptions({
        states: res.states || [],
        districts: res.districts || [],
        commodities: res.commodities || [],
      })
    } else {
      setFilterOptions({ states: [], districts: [], commodities: [] })
      setFiltersError(res.error?.message || t('marketFiltersEmpty'))
    }
  }, [t])

  useEffect(() => {
    loadFilters()
  }, [loadFilters])

  const selectedState = filterOptions.states.find(
    (option) => option.name.toLocaleLowerCase() === state.trim().toLocaleLowerCase(),
  )
  const districtOptions = selectedState
    ? filterOptions.districts.filter((option) => option.state_id === selectedState.id)
    : []

  const loadData = useCallback(async () => {
    if (filtersLoading) return

    setLoading(true)
    setErrorInfo(null)
    setErrorKind(null)

    const res = await fetchMarkets({
      commodity,
      state,
      district: district.trim() || undefined, // omit district for state-wide Karnataka search
      limit: 200,
    })

    setLoading(false)

    if (res.available) {
      setMarketsData(res.records || [])
      setSource(res.source || 'agmarknet.gov.in')
      setUsingFallback(Boolean(res.using_fallback))
    } else {
      setMarketsData([])
      setErrorKind(res.error?.kind || 'service')
      setErrorInfo(res.error?.message || t('upstreamUnavailable'))
    }
  }, [commodity, filtersLoading, state, district, t])


  useEffect(() => {
    if (!filtersLoading && selectedState) {
      loadData()
    }
  }, [filtersLoading, selectedState, loadData])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!selectedState) {
      setErrorInfo(t('marketExplorerRequiresLocation'))
      return
    }
    loadData()
  }

  const handleStateChange = (e) => {
    setState(e.target.value)
    setDistrict('')
    setMarketsData([])
    setErrorInfo(null)
  }

  const renderFreshnessBadge = (row) => {
    const status = row.freshness_status || (row.is_stale ? 'stale' : 'within_acceptable_window')
    if (status === 'fresh') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
          <CheckCircle2 className="w-3 h-3 text-emerald-700" />
          <span>{t('freshBadge')}</span>
        </span>
      )
    }
    if (status === 'cached' || status === 'cached_acceptable') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
          <Archive className="w-3 h-3 text-blue-700" />
          <span>{t('cachedBadge')}</span>
        </span>
      )
    }
    if (status === 'fallback' || status === 'fallback_demo') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-300">
          <AlertTriangle className="w-3 h-3 text-orange-700" />
          <span>{t('fallbackBadge')}</span>
        </span>
      )
    }
    if (status === 'stale' || row.is_stale) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
          <Clock className="w-3 h-3 text-amber-700" />
          <span>{t('staleBadge')}</span>
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-800 border border-teal-300">
        <CheckCircle2 className="w-3 h-3 text-teal-700" />
        <span>{t('acceptableBadge')}</span>
      </span>
    )
  }

  const renderSourceBadge = (row) => {
    const rawSource = (row.source_provider || source || '').toLowerCase()
    if (rawSource.includes('fallback') || rawSource.includes('demo')) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">
          {t('sourceLocalFallback')}
        </span>
      )
    }
    if (rawSource.includes('cached') || rawSource.includes('observations.db')) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
          {t('sourceVerifiedCache')}
        </span>
      )
    }
    if (rawSource.includes('data.gov.in')) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
          {t('sourceDataGov')}
        </span>
      )
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
        {t('sourceAgmarknet')}
      </span>
    )
  }

  const isCachedSource = Boolean(source && source.toLowerCase().includes('cached'))

  return (
    <section className="py-12 md:py-20 botanical-bg reveal-soft">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Page Header */}
      <div className="max-w-3xl mb-10">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#E6EDE0] border border-[#9CAF88]/50 text-[#3A472E] text-xs font-bold uppercase tracking-wider mb-2 shadow-xs">
          <Database className="w-3.5 h-3.5 text-[#5E724C]" />
          <span>{t('marketExplorerBadge')}</span>
        </div>
        <h2 className="text-3xl sm:text-5xl font-extrabold text-[#1D201C] tracking-tight">
          {t('exploreMarketPrices')}
        </h2>
        <p className="mt-3 text-base text-[#5C5C5A]">
          {t('marketExplorerDesc')}
        </p>
      </div>

      {/* Filter Toolbar */}
      <form
        onSubmit={handleSubmit}
        className="card-botanical p-5 sm:p-6 rounded-3xl mb-8 flex flex-col md:flex-row gap-4 items-stretch md:items-end border border-[#E2DFD5] shadow-lg"
      >
        <div className="flex-1">
          <label htmlFor="market-commodity" className="text-xs font-bold uppercase tracking-wider text-[#1D201C] block mb-1.5">
            {t('crop')}
          </label>
          <div className="relative">
            <input
              id="market-commodity"
              type="text"
              value={commodity}
              onChange={(e) => setCommodity(e.target.value)}
              list="market-commodity-options"
              placeholder={t('cropMarketPlaceholder')}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F5F3] border border-[#DEDEDA] text-sm text-[#1D201C] focus:bg-white focus:border-[#9CAF88] outline-hidden shadow-2xs"
            />
            <datalist id="market-commodity-options">
              {filterOptions.commodities.map((option) => (
                <option key={option.id} value={option.name} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="flex-1">
          <label htmlFor="market-state" className="text-xs font-bold uppercase tracking-wider text-[#1D201C] block mb-1.5">
            {t('stateRequired')}
          </label>
          <select
            id="market-state"
            value={state}
            onChange={handleStateChange}
            disabled={filtersLoading || filterOptions.states.length === 0}
            aria-required="true"
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F5F3] border border-[#DEDEDA] text-sm text-[#1D201C] focus:bg-white focus:border-[#9CAF88] outline-hidden shadow-2xs"
          >
            {filterOptions.states.map((option) => (
              <option key={option.id} value={option.name}>{option.name}</option>
            ))}
          </select>
        </div>

        <div className="flex-1">
          <label htmlFor="market-district" className="text-xs font-bold uppercase tracking-wider text-[#1D201C] block mb-1.5">
            {t('location')} <span className="text-[#5E724C] font-normal normal-case tracking-normal">({t('districtSelectPrompt')})</span>
          </label>
          <select
            id="market-district"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            disabled={!selectedState || districtOptions.length === 0}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F5F3] border border-[#DEDEDA] text-sm text-[#1D201C] focus:bg-white focus:border-[#9CAF88] outline-hidden shadow-2xs"
          >
            <option value="">{t('allDistricts')}</option>
            {districtOptions.map((option) => (
              <option key={option.id} value={option.name}>
                {option.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="btn-3d-amber px-7 py-2.5 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin text-white" />
            ) : (
              <Search className="w-4 h-4 text-white" />
            )}
            <span>{t('search')}</span>
          </button>
        </div>
        {filtersLoading && (
          <p className="text-xs text-[#646860] md:max-w-44">{t('marketFiltersLoading')}</p>
        )}
      </form>

      {filtersError && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 mb-8 flex items-center justify-between gap-3">
          <p className="text-sm">{localizeBackendText(language, filtersError)}</p>
          <button
            type="button"
            onClick={loadFilters}
            className="shrink-0 px-3 py-2 rounded-lg bg-[#173F2A] text-[#FFFDF7] text-xs font-bold cursor-pointer"
          >
            {t('retry')}
          </button>
        </div>
      )}

      {/* Error / Data Notice state */}
      {errorInfo && (
        <div className={`p-6 rounded-2xl mb-8 flex items-start gap-3 ${
          errorKind === 'data'
            ? 'bg-blue-50/80 border border-blue-200 text-blue-900'
            : 'bg-amber-50 border border-amber-200 text-amber-900'
        }`}>
          <AlertCircle className={`w-5 h-5 shrink-0 mt-0.5 ${
            errorKind === 'data' ? 'text-blue-700' : 'text-amber-700'
          }`} />
          <div>
            <h4 className="font-bold text-sm">
              {errorKind === 'data' ? t('marketDataNoticeTitle') : t('marketDataNoticeTitle')}
            </h4>
            <p className={`text-sm mt-0.5 ${errorKind === 'data' ? 'text-blue-800' : 'text-amber-800'}`}>
              {localizeBackendText(language, errorInfo)}
            </p>
            {errorKind !== 'data' && (
              <p className="text-xs text-amber-700/80 mt-2">
                {t('apiNotice')}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Results Table / Cards */}
      {loading ? (
        <div className="py-20 text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#173F2A] mb-3" />
          <p className="text-sm font-semibold text-[#68736B]">
            {t('querying')}
          </p>
        </div>
      ) : marketsData.length === 0 && !errorInfo ? (
        <div className="py-20 text-center bg-[#FFFDF7] rounded-3xl border border-[#E4E1D7] p-8">
          <Layers className="w-12 h-12 mx-auto text-[#6F8F72] mb-3" />
          <h3 className="text-lg font-bold text-[#173F2A]">{t('noRecords')}</h3>
          <p className="text-sm text-[#68736B] mt-1 max-w-md mx-auto">
            {t('noRecordsDesc')}
          </p>
        </div>
      ) : marketsData.length > 0 ? (
        <div className="card-botanical rounded-3xl overflow-hidden shadow-sm">
          {/* Header Bar */}
          <div className="px-6 py-4 border-b border-[#E4E1D7] bg-[#F7F3E8]/60 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#173F2A]">
                {t('showing', { count: marketsData.length, source })}
              </span>
              {usingFallback ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-800 border border-orange-300">
                  <AlertTriangle className="w-3 h-3 text-orange-700" />
                  <span>{t('sourceFallbackBadge')}</span>
                </span>
              ) : isCachedSource ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">
                  <Archive className="w-3 h-3 text-blue-700" />
                  <span>{t('sourceCachedBadge')}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                  <span>{t('sourceLiveBadge')}</span>
                </span>
              )}
            </div>
            <span className="text-xs text-[#68736B] font-mono">
              {t('normalizedUnit')}
            </span>
          </div>

          {usingFallback && (
            <p className="px-6 py-3 text-xs text-orange-900 bg-orange-50 border-b border-orange-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-700 shrink-0" />
              <span>{t('sourceFallbackWarning')} {t('staleDataWarning')}</span>
            </p>
          )}

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm divide-y divide-[#E4E1D7]">
              <thead className="bg-[#EBF0E6] text-[#1E3019] text-xs uppercase tracking-wider font-bold">
                <tr>
                  <th className="px-6 py-3.5">{t('marketMandi')}</th>
                  <th className="px-6 py-3.5">{t('location')}</th>
                  <th className="px-6 py-3.5">{t('commodityVariety')}</th>
                  <th className="px-6 py-3.5">{t('date')}</th>
                  <th className="px-6 py-3.5">{t('dataSource')}</th>
                  <th className="px-6 py-3.5 text-right">{t('marketPrice')}</th>
                  <th className="px-6 py-3.5 text-right">{t('priceRange')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(94,114,76,0.12)] bg-[#FFFFFF]">
                {marketsData.map((row, idx) => (
                  <tr
                    key={`${row.market}-${row.date}-${idx}`}
                    className="hover:bg-[#EBF0E6]/60 transition-colors group"
                  >
                    <td className="px-6 py-4 font-bold text-[#173F2A]">
                      {row.market}
                    </td>
                    <td className="px-6 py-4 text-[#68736B]">
                      {row.district}, {row.state}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-semibold text-[#1E2921]">
                        {row.commodity}
                      </span>
                      {row.variety && (
                        <span className="text-xs text-[#68736B] block">
                          {row.variety}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 items-start">
                        <span className="text-xs font-mono text-[#68736B]">{row.date}</span>
                        {renderFreshnessBadge(row)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {renderSourceBadge(row)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-base font-extrabold text-[#173F2A]">
                        ₹{Number(row.observation_price_per_kg ?? row.modal_price).toFixed(2)}
                      </span>
                      <span className="text-xs text-[#68736B] block">/{t('unitKg')}</span>
                      {row.source_price_value != null && row.source_unit && (
                        <span className="text-[11px] font-mono text-[#68736B] block mt-0.5">
                          ₹{Number(row.source_price_value).toLocaleString()} / {row.source_unit.replace(/^Rs\.\/?/i, '')}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-xs text-[#68736B]">
                      {row.min_price == null || row.max_price == null ? (
                        <span className="italic">{t('rangeUnavailable')}</span>
                      ) : (
                        <div>
                          <span className="font-semibold text-[#1E2921]">
                            ₹{Number(row.min_price).toFixed(2)} – ₹{Number(row.max_price).toFixed(2)}
                          </span>
                          <span className="block text-[11px]">/{t('unitKg')}</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden divide-y divide-[#E4E1D7]">
            {marketsData.map((row, idx) => (
              <article key={`${row.market}-${idx}`} className="p-5 bg-[#FFFDF7]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-extrabold text-[#173F2A]">{row.market}</h3>
                    <p className="text-xs text-[#68736B] mt-1">
                      {row.district}, {row.state}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black text-[#173F2A]">
                      ₹{Number(row.observation_price_per_kg ?? row.modal_price).toFixed(2)}
                    </div>
                    <div className="text-[11px] text-[#68736B]">{t('perKg')}</div>
                    {row.source_price_value != null && row.source_unit && (
                      <div className="text-[10px] font-mono text-[#68736B]">
                        ₹{Number(row.source_price_value).toLocaleString()} / {row.source_unit.replace(/^Rs\.\/?/i, '')}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    {renderSourceBadge(row)}
                    {renderFreshnessBadge(row)}
                  </div>
                  <span className="text-xs font-mono text-[#68736B]">{row.date}</span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl bg-[#F7F3E8] border border-[#E4E1D7] p-3">
                    <span className="block text-[#68736B]">{t('commodityVariety')}</span>
                    <strong className="text-[#1E2921]">{row.commodity}</strong>
                    {row.variety && <span className="block text-[#68736B] text-[11px]">{row.variety}</span>}
                  </div>
                  <div className="rounded-xl bg-[#F7F3E8] border border-[#E4E1D7] p-3">
                    <span className="block text-[#68736B]">{t('priceRange')}</span>
                    <strong className="text-[#1E2921]">
                      {row.min_price == null || row.max_price == null
                        ? t('rangeUnavailable')
                        : `₹${Number(row.min_price).toFixed(2)} – ₹${Number(row.max_price).toFixed(2)} / kg`}
                    </strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
      </div>
    </section>
  )
}
