import React, { useState, useEffect, useCallback } from 'react'
import {
  Search,
  RefreshCw,
  AlertCircle,
  Layers,
  Database,
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
  const [source, setSource] = useState('data.gov.in')
  const [usingFallback, setUsingFallback] = useState(false)
  const [errorInfo, setErrorInfo] = useState(null)

  const loadFilters = useCallback(async () => {
    setFiltersLoading(true)
    setFiltersError(null)
    const res = await fetchMarketFilters()
    setFiltersLoading(false)
    if (res.available && res.states?.length > 0 && res.districts?.length > 0) {
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
  const selectedStateId = selectedState?.id ?? null
  const districtOptions = selectedState
    ? filterOptions.districts.filter((option) => option.state_id === selectedState.id)
    : []
  const selectedDistrict = districtOptions.find(
    (option) => option.name.toLocaleLowerCase() === district.trim().toLocaleLowerCase(),
  )
  const selectedDistrictId = selectedDistrict?.id ?? null

  const loadData = useCallback(async () => {
    // District is optional – allow state-wide searches
    if (selectedStateId === null) {
      setMarketsData([])
      setSource(null)
      setUsingFallback(false)
      setErrorInfo(t('marketExplorerRequiresLocation'))
      return
    }

    setLoading(true)
    setErrorInfo(null)

    const res = await fetchMarkets({
      commodity,
      state,
      district: district.trim() || undefined,  // omit district for state-wide search
      limit: 50,
    })

    setLoading(false)

    if (res.available) {
      setMarketsData(res.records || [])
      setSource(res.source || 'data.gov.in')
      setUsingFallback(Boolean(res.using_fallback))
    } else {
      setMarketsData([])
      setErrorInfo(res.error?.message || t('upstreamUnavailable'))
    }
  }, [commodity, selectedStateId, state, district, t])

  useEffect(() => {
    loadData()
  }, [loadData])

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

  return (
    <section className="py-12 md:py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 reveal-soft">
      {/* Page Header */}
      <div className="max-w-3xl mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#DCE8D5]/60 text-[#173F2A] text-xs font-semibold uppercase tracking-wider mb-2">
          <Database className="w-3.5 h-3.5 text-[#173F2A]" />
          <span>{t('marketExplorerBadge')}</span>
        </div>
        <h2 className="text-3xl sm:text-5xl font-extrabold text-[#173F2A] tracking-tight">
          {t('exploreMarketPrices')}
        </h2>
        <p className="mt-3 text-base text-[#68736B]">
          {t('marketExplorerDesc')}
        </p>
      </div>

      {/* Filter Toolbar */}
      <form
        onSubmit={handleSubmit}
        className="premium-card p-4 sm:p-6 rounded-3xl mb-8 flex flex-col md:flex-row gap-4 items-stretch md:items-end"
      >
        <div className="flex-1">
          <label htmlFor="market-commodity" className="text-xs font-bold uppercase tracking-wider text-[#173F2A] block mb-1.5">
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
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#F7F3E8]/50 border border-[#E4E1D7] text-sm text-[#1E2921] focus:bg-[#FFFDF7] focus:border-[#173F2A] outline-hidden"
            />
            <datalist id="market-commodity-options">
              {filterOptions.commodities.map((option) => (
                <option key={option.id} value={option.name} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="flex-1">
          <label htmlFor="market-state" className="text-xs font-bold uppercase tracking-wider text-[#173F2A] block mb-1.5">
            {t('stateRequired')}
          </label>
          <select
            id="market-state"
            value={state}
            onChange={handleStateChange}
            disabled={filtersLoading || filterOptions.states.length === 0}
            aria-required="true"
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#F7F3E8]/50 border border-[#E4E1D7] text-sm text-[#1E2921] focus:bg-[#FFFDF7] focus:border-[#173F2A] outline-hidden"
          >
            {filterOptions.states.map((option) => (
              <option key={option.id} value={option.name}>{option.name}</option>
            ))}
          </select>
        </div>

        <div className="flex-1">
          <label htmlFor="market-district" className="text-xs font-bold uppercase tracking-wider text-[#173F2A] block mb-1.5">
            {t('district')} <span className="text-[#6F8F72] font-normal normal-case tracking-normal">(optional – leave blank for all Karnataka)</span>
          </label>
          <input
            id="market-district"
            type="text"
            list="market-district-options"
            autoComplete="off"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            placeholder="All districts"
            disabled={!selectedState || districtOptions.length === 0}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#F7F3E8]/50 border border-[#E4E1D7] text-sm text-[#1E2921] focus:bg-[#FFFDF7] focus:border-[#173F2A] outline-hidden"
          />
          <datalist id="market-district-options">
            {districtOptions.map((option) => (
              <option key={option.id} value={option.name} />
            ))}
          </datalist>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 rounded-xl bg-[#173F2A] hover:bg-[#24543A] text-[#FFFDF7] text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs disabled:opacity-50"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin text-[#DCE8D5]" />
            ) : (
              <Search className="w-4 h-4 text-[#DCE8D5]" />
            )}
            <span>{t('search')}</span>
          </button>
        </div>
        {filtersLoading && (
          <p className="text-xs text-[#68736B] md:max-w-44">{t('marketFiltersLoading')}</p>
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

      {/* Error state */}
      {errorInfo && (
        <div className="p-6 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 mb-8 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-sm">{t('marketDataNoticeTitle')}</h4>
            <p className="text-sm mt-0.5 text-amber-800">
              {localizeBackendText(language, errorInfo)}
            </p>
            <p className="text-xs text-amber-700/80 mt-2">
              {t('apiNotice')}
            </p>
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
        <div className="premium-card rounded-3xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#E4E1D7] bg-[#F7F3E8]/50 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#68736B]">
              {t('showing', { count: marketsData.length, source })}
              {usingFallback? ` — ${t('sourceFallback')}`: ' — Provider data'}
            </span>
            <span className="text-xs text-[#68736B] font-mono">
              {t('normalizedUnit')}
            </span>
          </div>
          {usingFallback && (
            <p className="px-6 py-3 text-xs text-amber-800 bg-amber-50 border-b border-amber-200">
              {t('sourceFallbackWarning')} {t('staleDataWarning')}
            </p>
          )}

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm divide-y divide-[#E4E1D7]">
              <thead className="bg-[#F7F3E8] text-[#173F2A] text-xs uppercase tracking-wider font-bold">
                <tr>
                  <th className="px-6 py-3.5">{t('marketMandi')}</th>
                  <th className="px-6 py-3.5">{t('location')}</th>
                  <th className="px-6 py-3.5">{t('commodityVariety')}</th>
                  <th className="px-6 py-3.5">{t('date')}</th>
                  <th className="px-6 py-3.5 text-right">{t('marketPrice')}</th>
                  <th className="px-6 py-3.5 text-right">{t('priceRange')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E1D7] bg-[#FFFDF7]">
                {marketsData.map((row, idx) => (
                  <tr
                    key={idx}
                    className="hover:bg-[#F7F3E8]/60 transition-colors group"
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
                    <td className="px-6 py-4 text-[#68736B] text-xs font-mono">
                      {row.date}
                      {row.is_stale && (
                        <span className="block text-amber-700 font-sans mt-1">{t('staleObservation')}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-base font-extrabold text-[#173F2A]">
                        ₹{Number(row.observation_price_per_kg ?? row.modal_price).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-xs text-[#68736B]">
                      {row.min_price == null || row.max_price == null
                        ? t('rangeUnavailable')
                        : `₹${Number(row.min_price).toFixed(2)} – ₹${Number(row.max_price).toFixed(2)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl bg-[#F7F3E8] border border-[#E4E1D7] p-3">
                    <span className="block text-[#68736B]">{t('crop')}</span>
                    <strong className="text-[#1E2921]">{row.commodity}</strong>
                  </div>
                  <div className="rounded-xl bg-[#F7F3E8] border border-[#E4E1D7] p-3">
                    <span className="block text-[#68736B]">{t('priceRange')}</span>
                    <strong className="text-[#1E2921]">
                      {row.min_price == null || row.max_price == null
                        ? t('rangeUnavailable')
                        : `₹${Number(row.min_price).toFixed(2)} – ₹${Number(row.max_price).toFixed(2)}`}
                    </strong>
                  </div>
                </div>
                <p className="mt-3 text-xs font-mono text-[#68736B]">
                  {row.date}
                  {row.is_stale && <span className="block font-sans text-amber-700 mt-1">{t('staleObservation')}</span>}
                </p>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
