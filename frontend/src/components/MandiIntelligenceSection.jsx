import React, { useState, useEffect, useCallback } from 'react'
import {
  Building2,
  MapPin,
  Calendar,
  ArrowRight,
  Sparkles,
  Database,
  RefreshCw,
  Archive,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import { fetchMarkets } from '../services/api'
import { useLanguage } from '../localization'

const COMMODITY_OPTIONS = ['Tomato', 'Potato', 'Onion', 'Green Chilli', 'Maize', 'Carrot']

export default function MandiIntelligenceSection({ onExploreMarkets }) {
  const { t } = useLanguage()
  const [selectedCommodity, setSelectedCommodity] = useState('Tomato')
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState('agmarknet.gov.in')
  const [error, setError] = useState(null)

  const loadMarketData = useCallback(async (commodityName) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchMarkets({ commodity: commodityName, state: 'Karnataka', limit: 6 })
      if (res.available && Array.isArray(res.records)) {
        setRecords(res.records.slice(0, 6))
        setSource(res.source || 'agmarknet.gov.in')
      } else {
        setRecords([])
        if (res.error?.message) setError(res.error.message)
      }
    } catch {
      setError('Could not connect to mandi records server.')
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadMarketData(selectedCommodity) }, [selectedCommodity, loadMarketData])

  const renderSourceBadge = (record) => {
    const raw = (record.source_provider || source || '').toLowerCase()
    if (raw.includes('fallback') || raw.includes('demo'))
      return <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#A7A7A7]/20 text-[#5C5C5A] border border-[#A7A7A7]/40">{t('mandiSourceFallback')}</span>
    if (raw.includes('cached') || raw.includes('observations.db'))
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#9CAF88]/20 text-[#2A3B23] border border-[#9CAF88]/45"><Archive className="w-2.5 h-2.5" />{t('mandiSourceVerifiedCache')}</span>
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#9CAF88]/25 text-[#1E3019] border border-[#9CAF88]/55"><CheckCircle2 className="w-2.5 h-2.5" />{t('mandiSourceAgmarknet')}</span>
  }

  const renderFreshnessBadge = (record) => {
    const status = record.freshness_status || (record.is_stale ? 'stale' : 'within_acceptable_window')
    if (status === 'fresh')
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#9CAF88]/25 text-[#1E3019] border border-[#9CAF88]/45"><CheckCircle2 className="w-2.5 h-2.5" />{t('freshBadge')}</span>
    if (status === 'cached' || status === 'cached_acceptable')
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#A7A7A7]/20 text-[#4A5742] border border-[#A7A7A7]/40"><Archive className="w-2.5 h-2.5" />{t('cachedBadge')}</span>
    if (record.is_stale || status === 'stale')
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#A7A7A7]/25 text-[#5C5C5A] border border-[#A7A7A7]/50"><Clock className="w-2.5 h-2.5" />{t('staleBadge')}</span>
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#9CAF88]/18 text-[#2A3B23] border border-[#9CAF88]/35"><CheckCircle2 className="w-2.5 h-2.5" />{t('acceptableBadge')}</span>
  }

  return (
    <section className="py-10 md:py-14 botanical-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Stone-framed container */}
        <div className="rounded-3xl bg-[#F4F6F1] border border-[rgba(94,114,76,0.22)] shadow-lg overflow-hidden">
          {/* Sage top strip */}
          <div className="h-2 bg-gradient-to-r from-[#9CAF88] via-[#6E8459] to-[#CC5500]/70" />

          <div className="p-6 sm:p-8 md:p-10">
            {/* Header row */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 pb-6 border-b border-[rgba(94,114,76,0.15)]">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#9CAF88]/20 border border-[#9CAF88]/50 text-[#1E3019] text-xs font-bold tracking-widest uppercase mb-2.5">
                  <Database className="w-3.5 h-3.5 text-[#CC5500]" />
                  <span>{t('mandiIntelligenceBadge')}</span>
                </div>
                <h2 className="font-editorial text-2xl sm:text-3xl md:text-4xl font-medium text-[#1D201C] tracking-tight">
                  {t('mandiIntelligenceTitle')}
                </h2>
                <p className="mt-1.5 text-sm text-[#4A5742] max-w-xl leading-relaxed">
                  {t('mandiIntelligenceDesc')}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="px-3 py-1.5 rounded-xl bg-white border border-[rgba(94,114,76,0.22)] shadow-xs flex items-center gap-2 text-xs font-semibold text-[#2A3B23]">
                  <span className="w-2 h-2 rounded-full bg-[#CC5500] animate-pulse shrink-0" />
                  <span>{t('mandiViewingState')}</span>
                </div>
                <button
                  onClick={() => loadMarketData(selectedCommodity)}
                  disabled={loading}
                  title="Refresh"
                  className="p-2.5 rounded-xl bg-white hover:bg-[#E6EDE0] border border-[rgba(94,114,76,0.22)] text-[#2A3B23] transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Commodity filter pills */}
            <div className="py-5 flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#4A5742] mr-1">
                {t('mandiSelectCommodity')}:
              </span>
              {COMMODITY_OPTIONS.map((item) => {
                const isSel = selectedCommodity === item
                return (
                  <button
                    key={item}
                    onClick={() => setSelectedCommodity(item)}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all cursor-pointer ${
                      isSel
                        ? 'bg-[#192616] text-white border border-[#CC5500]/30 shadow-sm'
                        : 'bg-white text-[#2A3B23] border border-[rgba(94,114,76,0.28)] hover:bg-[#E6EDE0]'
                    }`}
                  >
                    {item}
                  </button>
                )
              })}
            </div>

            {/* Records grid */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="rounded-2xl p-5 bg-white border border-[rgba(94,114,76,0.15)] animate-pulse space-y-3">
                    <div className="h-3.5 bg-[#9CAF88]/25 rounded-md w-3/4" />
                    <div className="h-8 bg-[#A7A7A7]/18 rounded-md w-1/2" />
                    <div className="h-3 bg-[#A7A7A7]/15 rounded-md w-2/3" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="p-6 rounded-2xl bg-white border border-[#CC5500]/30 text-center space-y-2">
                <AlertTriangle className="w-6 h-6 text-[#CC5500] mx-auto" />
                <p className="text-sm font-semibold text-[#1D201C]">{error}</p>
                <p className="text-xs text-[#4A5742]">{t('officialDataRefreshing')}</p>
              </div>
            ) : records.length === 0 ? (
              <div className="p-8 rounded-2xl bg-white border border-[rgba(94,114,76,0.18)] text-center">
                <p className="text-sm text-[#4A5742]">{t('mandiNoRecords')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {records.map((item, idx) => {
                  const pricePerKg = item.recommendation_price_per_kg ?? item.modal_price ?? item.observation_price_per_kg
                  const qtlPrice   = pricePerKg ? pricePerKg * 100 : null

                  return (
                    <div
                      key={`${item.market}-${item.district}-${idx}`}
                      className="rounded-2xl p-5 bg-white border border-[rgba(94,114,76,0.18)] shadow-sm hover:shadow-md hover:border-[#9CAF88] transition-all flex flex-col justify-between group"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                          {renderSourceBadge(item)}
                          {renderFreshnessBadge(item)}
                        </div>
                        <div className="flex items-start gap-2.5 mb-3">
                          <div className="p-2 rounded-xl bg-[#9CAF88]/18 border border-[#9CAF88]/35 shrink-0">
                            <Building2 className="w-4 h-4 text-[#3B522E]" />
                          </div>
                          <div>
                            <h3 className="font-bold text-base text-[#1D201C] leading-snug">{item.market}</h3>
                            <div className="flex items-center gap-1 text-xs text-[#4A5742] mt-0.5">
                              <MapPin className="w-3 h-3 text-[#CC5500]" />
                              <span>{item.district}, {item.state}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-[rgba(94,114,76,0.12)] space-y-1.5">
                        <div className="flex items-baseline justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-[#5C5C5A]">
                            {t('mandiRecordedModal')}
                          </span>
                          <div className="text-right">
                            <span className="font-editorial text-2xl font-bold text-[#1D201C]">
                              ₹{pricePerKg ? Number(pricePerKg).toFixed(2) : '—'}
                            </span>
                            <span className="text-xs font-semibold text-[#4A5742] ml-1">/{t('unitKg')}</span>
                          </div>
                        </div>
                        {qtlPrice && (
                          <div className="flex justify-between text-xs text-[#5C5C5A]">
                            <span>{t('perQuintal')}</span>
                            <span className="font-medium text-[#2A3B23]">₹{Math.round(qtlPrice).toLocaleString('en-IN')}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-xs text-[#5C5C5A] pt-0.5">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-[#A7A7A7]" />
                            {t('mandiObservationDate')}
                          </span>
                          <span className="font-mono text-[11px] text-[#2A3B23]">{item.date || 'Recent'}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Footer */}
            <div className="mt-7 pt-5 border-t border-[rgba(94,114,76,0.15)] flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs text-[#4A5742] leading-relaxed text-center sm:text-left">
                Data sourced from official Karnataka APMC arrivals and verified state observation records.
              </p>
              <button
                onClick={onExploreMarkets}
                className="btn-secondary text-xs py-2.5 px-5 shrink-0"
              >
                <span>{t('mandiOpenFullExplorer')}</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#CC5500]" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
