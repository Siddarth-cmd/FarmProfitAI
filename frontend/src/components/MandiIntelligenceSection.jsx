import React, { useState, useEffect, useCallback } from 'react'
import {
  Building2,
  MapPin,
  Calendar,
  ArrowRight,
  Database,
  RefreshCw,
  Archive,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import { fetchMarkets } from '../services/api'
import { useLanguage, getCropDisplayName } from '../localization'

const COMMODITY_OPTIONS = ['Tomato', 'Onion', 'Potato', 'Green Chilli', 'Capsicum', 'Bengal Gram', 'Maize']

export default function MandiIntelligenceSection({ onExploreMarkets }) {
  const { language, t } = useLanguage()
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
      return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#E9DFCA] text-[#52604D] border border-[#286B43]/20">{t('mandiSourceFallback')}</span>
    if (raw.includes('cached') || raw.includes('observations.db'))
      return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#EAF4EE] text-[#173D2A] border border-[#286B43]/30"><Archive className="w-3 h-3 text-[#286B43]" />{t('mandiSourceVerifiedCache')}</span>
    return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#EAF4EE] text-[#173D2A] border border-[#286B43]/40"><CheckCircle2 className="w-3 h-3 text-[#286B43]" />{t('mandiSourceAgmarknet')}</span>
  }

  const renderFreshnessBadge = (record) => {
    const status = record.freshness_status || (record.is_stale ? 'stale' : 'within_acceptable_window')
    if (status === 'fresh')
      return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#FFF9E6] text-[#7A5F12] border border-[#E7C96B]/60"><CheckCircle2 className="w-3 h-3 text-[#7A5F12]" />{t('freshBadge')}</span>
    if (status === 'cached' || status === 'cached_acceptable')
      return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#EAF4EE] text-[#286B43] border border-[#286B43]/30"><Archive className="w-3 h-3" />{t('cachedBadge')}</span>
    if (record.is_stale || status === 'stale')
      return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#FFF4E6] text-[#C25E00] border border-[#C25E00]/30"><Clock className="w-3 h-3" />{t('staleBadge')}</span>
    return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#EAF4EE] text-[#173D2A] border border-[#286B43]/30"><CheckCircle2 className="w-3 h-3 text-[#286B43]" />{t('acceptableBadge')}</span>
  }

  return (
    <section className="py-12 md:py-16 botanical-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Soft White Container with Forest & Gold accents */}
        <div className="rounded-3xl bg-[#FFFDF7] border border-[#286B43]/20 shadow-md overflow-hidden">
          {/* Forest & Gold gradient top strip */}
          <div className="h-2 bg-gradient-to-r from-[#173D2A] via-[#286B43] to-[#E7C96B]" />

          <div className="p-6 sm:p-8 md:p-10">
            {/* Header row */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 pb-6 border-b border-[#286B43]/15">
              <div>
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#173D2A] text-[#E7C96B] text-xs font-bold tracking-widest uppercase mb-3 shadow-xs">
                  <Database className="w-3.5 h-3.5 text-[#E7C96B]" />
                  <span>{t('mandiIntelligenceBadge')}</span>
                </div>
                <h2 className="font-editorial text-2xl sm:text-3xl md:text-4xl font-bold text-[#173D2A] tracking-tight">
                  {t('mandiIntelligenceTitle')}
                </h2>
                <p className="mt-2 text-sm text-[#52604D] max-w-xl leading-relaxed">
                  {t('mandiIntelligenceDesc')}
                </p>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <div className="px-3.5 py-2 rounded-xl bg-[#FCFAF4] border border-[#286B43]/20 shadow-xs flex items-center gap-2 text-xs font-semibold text-[#173D2A]">
                  <span className="w-2 h-2 rounded-full bg-[#E7C96B] animate-pulse shrink-0" />
                  <span>{t('mandiViewingState')}</span>
                </div>
                <button
                  onClick={() => loadMarketData(selectedCommodity)}
                  disabled={loading}
                  title="Refresh"
                  className="p-2.5 rounded-xl bg-[#FFFDF7] hover:bg-[#EAF4EE] border border-[#286B43]/25 text-[#173D2A] transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Commodity filter pills */}
            <div className="py-5 flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#52604D] mr-1">
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
                        ? 'bg-[#173D2A] text-[#FFFDF7] border border-[#E7C96B]/50 shadow-sm'
                        : 'bg-[#FCFAF4] text-[#173D2A] border border-[#286B43]/20 hover:bg-[#EAF4EE]'
                    }`}
                  >
                    {getCropDisplayName(item, language)}
                  </button>
                )
              })}
            </div>

            {/* Records grid */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="rounded-2xl p-5 bg-[#FCFAF4] border border-[#286B43]/15 animate-pulse space-y-3">
                    <div className="h-4 bg-[#286B43]/15 rounded-md w-3/4" />
                    <div className="h-8 bg-[#E7C96B]/20 rounded-md w-1/2" />
                    <div className="h-3 bg-[#286B43]/10 rounded-md w-2/3" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="p-6 rounded-2xl bg-[#FFFDF7] border border-[#C25E00]/30 text-center space-y-2">
                <AlertTriangle className="w-6 h-6 text-[#C25E00] mx-auto" />
                <p className="text-sm font-semibold text-[#173D2A]">{error}</p>
                <p className="text-xs text-[#52604D]">{t('officialDataRefreshing')}</p>
              </div>
            ) : records.length === 0 ? (
              <div className="p-8 rounded-2xl bg-[#FCFAF4] border border-[#286B43]/20 text-center">
                <p className="text-sm text-[#52604D]">{t('mandiNoRecords')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {records.map((item, idx) => {
                  const pricePerKg = item.recommendation_price_per_kg ?? item.modal_price ?? item.observation_price_per_kg
                  const qtlPrice   = pricePerKg ? pricePerKg * 100 : null

                  return (
                    <div
                      key={`${item.market}-${item.district}-${idx}`}
                      className="rounded-2xl p-5 bg-[#FCFAF4] border border-[#286B43]/20 shadow-xs hover:shadow-md hover:border-[#286B43] transition-all flex flex-col justify-between group"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                          {renderSourceBadge(item)}
                          {renderFreshnessBadge(item)}
                        </div>
                        <div className="flex items-start gap-2.5 mb-3">
                          <div className="p-2.5 rounded-xl bg-[#173D2A] text-[#E7C96B] shrink-0 shadow-xs">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div>
                            <h3 className="font-bold text-base text-[#173D2A] leading-snug">{item.market}</h3>
                            <div className="flex items-center gap-1 text-xs text-[#52604D] mt-0.5">
                              <MapPin className="w-3.5 h-3.5 text-[#286B43]" />
                              <span>{item.district}, {item.state}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-[#286B43]/15 space-y-1.5">
                        <div className="flex items-baseline justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-[#52604D]">
                            {t('mandiRecordedModal')}
                          </span>
                          <div className="text-right">
                            <span className="font-editorial text-2xl font-bold text-[#173D2A]">
                              ₹{pricePerKg ? Number(pricePerKg).toFixed(2) : '—'}
                            </span>
                            <span className="text-xs font-semibold text-[#52604D] ml-1">/{t('unitKg')}</span>
                          </div>
                        </div>
                        {qtlPrice && (
                          <div className="flex justify-between text-xs text-[#52604D]">
                            <span>{t('perQuintal')}</span>
                            <span className="font-medium text-[#173D2A]">₹{Math.round(qtlPrice).toLocaleString('en-IN')}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-xs text-[#52604D] pt-0.5">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-[#286B43]" />
                            {t('mandiObservationDate')}
                          </span>
                          <span className="font-mono text-[11px] text-[#173D2A]">{item.date || 'Recent'}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Footer */}
            <div className="mt-8 pt-5 border-t border-[#286B43]/15 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs text-[#52604D] leading-relaxed text-center sm:text-left">
                Data sourced from official Karnataka APMC arrivals and verified state observation records.
              </p>
              <button
                onClick={onExploreMarkets}
                className="btn-secondary text-xs py-2.5 px-5 shrink-0"
              >
                <span>{t('mandiOpenFullExplorer')}</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#173D2A]" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
