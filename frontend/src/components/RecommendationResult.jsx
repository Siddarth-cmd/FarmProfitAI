import React, { useState, useEffect } from 'react'
import {
  Sparkles,
  TrendingUp,
  CheckCircle,
  RotateCcw,
  AlertCircle,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Square,
} from 'lucide-react'
import { localizeBackendText, useLanguage, getCropDisplayName } from '../localization'
import { getKannadaVoice, buildKannadaRecommendationSummary } from '../utils/kannadaSpeech'
import AITimingForecast from './AITimingForecast'

function formatINR(val) {
  if (val === undefined || val === null || isNaN(val)) return '0'
  return Math.round(val).toLocaleString('en-IN')
}

function formatPricePerKg(val) {
  if (val === undefined || val === null || isNaN(val)) return '0'
  return Number(val).toFixed(2)
}

export default function RecommendationResult({ data, meta, onReset }) {
  const { language, t } = useLanguage()
  const [speechStatus, setSpeechStatus] = useState('idle') // 'idle' | 'playing' | 'paused'
  const [voiceNotice, setVoiceNotice] = useState(null)
  const [kannadaVoice, setKannadaVoice] = useState(null)

  // Voice detection and lifecycle cleanup
  useEffect(() => {
    const detectVoice = () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices()
        const voice = getKannadaVoice(voices)
        setKannadaVoice(voice)
      }
    }

    detectVoice()
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = detectVoice
    }

    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
        window.speechSynthesis.onvoiceschanged = null
      }
    }
  }, [])

  // Cancel speech if recommendation changes
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setSpeechStatus('idle')
    setVoiceNotice(null)
  }, [data?.recommended_market, data?.crop])

  if (!data) return null
  const {
    crop,
    variety = null,
    quantity_kg,
    farmer_location,
    recommended_market,
    expected_gross_revenue,
    transportation_cost,
    other_costs,
    expected_net_return,
    ranked_markets = [],
    incomplete_markets = [],
    explanation = '',
    market_dates = {},
    loss_percentage = null,
    losses_provided = false,
    estimated_loss_kg = 0,
    saleable_quantity_kg = quantity_kg,
  } = data

  const bestMarket = ranked_markets.length > 0 ? ranked_markets[0] : null
  const runnerUpMarket = ranked_markets.length > 1 ? ranked_markets[1] : null
  const usesObservation = bestMarket?.price_type === 'market_price_lastweek_observation'
  const bestMarketDate = bestMarket ? market_dates[bestMarket.name] : null

  const advantage =
    bestMarket && runnerUpMarket ? bestMarket.net_return - runnerUpMarket.net_return : 0

  const cropDisplayName = getCropDisplayName(crop, language)
  const fullCropLabel = variety ? `${cropDisplayName} (${variety})` : cropDisplayName

  const handlePlayKannada = () => {
    setVoiceNotice(null)
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setVoiceNotice(t('kannadaVoiceUnavailable'))
      return
    }

    const availableVoices = window.speechSynthesis.getVoices()
    const voice = getKannadaVoice(availableVoices) || kannadaVoice

    if (!voice) {
      // Must not silently read Kannada text using an English voice
      setVoiceNotice(t('kannadaVoiceUnavailable'))
      return
    }

    const summary = buildKannadaRecommendationSummary(data, { crop, variety, quantity_kg })
    if (!summary) {
      setVoiceNotice(t('kannadaVoiceUnavailable'))
      return
    }

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(summary)
    utterance.voice = voice
    utterance.lang = voice.lang || 'kn-IN'
    utterance.rate = 0.9

    utterance.onstart = () => {
      setSpeechStatus('playing')
      setVoiceNotice(null)
    }
    utterance.onend = () => {
      setSpeechStatus('idle')
    }
    utterance.onerror = (e) => {
      if (e.error !== 'canceled' && e.error !== 'interrupted') {
        setVoiceNotice(t('kannadaVoiceUnavailable'))
      }
      setSpeechStatus('idle')
    }

    setSpeechStatus('playing')
    window.speechSynthesis.speak(utterance)
  }

  const handlePauseAudio = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.pause()
      setSpeechStatus('paused')
    }
  }

  const handleResumeAudio = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.resume()
      setSpeechStatus('playing')
    }
  }

  const handleStopAudio = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      setSpeechStatus('idle')
    }
  }

  return (
    <section id="recommendation-result" className="py-12 md:py-20 relative reveal-soft botanical-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#173D2A] text-[#E7C96B] text-xs font-bold uppercase tracking-wider mb-2 shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-[#E7C96B]" />
            <span>{t('recommendation')}</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-[#173D2A] tracking-tight font-editorial">
            {t('sellAt', { market: recommended_market })}
          </h2>
          <p className="mt-2 text-base text-[#52604D]">
            {t('calculatedFor', { quantity: quantity_kg.toLocaleString('en-IN'), crop: fullCropLabel, location: farmer_location })}
          </p>
          {meta?.usingFallback && (
            <p className="mt-3 inline-flex rounded-full bg-[#FFF4E6] border border-[#C25E00]/30 px-3.5 py-1 text-xs font-semibold text-[#8B3800] shadow-2xs">
              {t('sourceFallback')} · {t('staleDataWarning')}
            </p>
          )}
          {usesObservation && (
            <p className={`mt-3 text-xs ${bestMarket.is_stale ? 'font-bold text-[#8B3800] bg-[#FFF4E6] border border-[#C25E00]/30 rounded-xl px-3 py-2' : 'text-[#52604D]'}`}>
              {t('observationPriceNote')}
              {bestMarket.is_stale && bestMarketDate
                ? ` ${t('staleObservationWithDate', { date: bestMarketDate })}`
                : ''}
            </p>
          )}
        </div>

        {/* Deep Forest Green & Harvest Gold Winner Card */}
        <div className="rounded-3xl bg-gradient-to-br from-[#173D2A] via-[#112F20] to-[#173D2A] text-white p-8 sm:p-12 shadow-2xl relative overflow-hidden mb-12 border border-[#E7C96B]/40">
          <svg className="absolute inset-0 w-full h-full text-white/5 pointer-events-none" viewBox="0 0 900 420" fill="none" aria-hidden="true">
            <path d="M-80 120 C 150 42, 298 210, 510 110 C 668 36, 790 92, 980 40" stroke="#E7C96B" strokeWidth="1.2" opacity="0.15" />
            <path d="M-90 292 C 178 220, 334 378, 560 260 C 710 182, 808 254, 980 198" stroke="#E7C96B" strokeWidth="1" strokeDasharray="5 7" opacity="0.12" />
          </svg>

          <div className="relative z-10">
            {/* Top Badge */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#E7C96B] text-[#173D2A] text-xs font-black tracking-wider uppercase shadow-md">
                <span>✦</span> {t('recommendedMarket')}
              </div>

              {advantage > 0 && (
                <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#E7C96B]/20 border border-[#E7C96B]/40 text-[#FFFDF7] text-xs font-bold backdrop-blur-xs">
                  <TrendingUp className="w-3.5 h-3.5 text-[#E7C96B]" />
                  <span>{t('moreThanNext', { amount: formatINR(advantage) })}</span>
                </div>
              )}
            </div>

            {/* Main Market Title & Net Return */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end pb-8 border-b border-[#286B43]/50">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-xs uppercase tracking-widest text-[#E7C96B] font-bold block">
                    {t('optimalMandi')}
                  </span>
                  {/* Feature 2: Confidence Rating Badge */}
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    bestMarket?.confidence_level === 'high'
                      ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30'
                      : bestMarket?.confidence_level === 'medium'
                      ? 'bg-amber-500/20 text-amber-200 border border-amber-400/30'
                      : 'bg-rose-500/20 text-rose-200 border border-rose-400/30'
                  }`}>
                    {bestMarket?.confidence_level === 'high'
                      ? t('confidenceHigh')
                      : bestMarket?.confidence_level === 'medium'
                      ? t('confidenceMedium')
                      : t('confidenceLow')}
                  </span>
                  {/* Feature 1: Transport Mode Indicator */}
                  <span className="px-2 py-0.5 rounded-full bg-white/10 text-[#F6F0E1] text-[10px] font-medium border border-white/15">
                    {bestMarket?.transport_mode === 'shared_load' ? t('sharedLoad') : t('dedicatedVehicle')}
                  </span>
                </div>
                <h3 className="text-4xl sm:text-6xl font-black tracking-tight text-[#FFFDF7] uppercase">
                  {recommended_market}
                </h3>
                <p className="text-sm text-[#F6F0E1]/80 mt-2">
                  {t('maximizesNet')}
                </p>
              </div>

              <div className="md:text-right">
                <span className="text-xs uppercase tracking-widest text-[#E7C96B] font-bold block mb-1">
                  {t('expectedNet')}
                </span>
                <div className="text-4xl sm:text-6xl font-black text-[#E7C96B] tracking-tight font-editorial">
                  ₹{formatINR(expected_net_return)}
                </div>
                <span className="text-xs text-[#F6F0E1]/70 block mt-1">
                  {quantity_kg.toLocaleString('en-IN')} {t('unitKg')} • {crop}
                </span>
              </div>
            </div>

            {/* Summary metrics bar */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-6 text-xs sm:text-sm">
              <div>
                <span className="text-[#F6F0E1]/70 block">{usesObservation ? t('observedPrice') : t('marketPrice')}</span>
                <span className="font-bold text-base text-[#FFFDF7] mt-0.5 block">
                  ₹{formatPricePerKg(bestMarket?.price_per_kg)}/{t('unitKg')}
                </span>
              </div>
              <div>
                <span className="text-[#F6F0E1]/70 block">{t('grossRevenue')}</span>
                <span className="font-bold text-base text-[#FFFDF7] mt-0.5 block">
                  ₹{formatINR(expected_gross_revenue)}
                </span>
              </div>
              <div>
                <span className="text-[#F6F0E1]/70 block">{t('roadDistance')}</span>
                <span className="font-bold text-base text-[#E7C96B] mt-0.5 block">
                  {bestMarket?.distance_km != null ? `${bestMarket.distance_km} km` : t('distanceUnavailable')}
                </span>
                <span className="text-[10px] text-[#F6F0E1]/60 block mt-0.5">
                  {bestMarket?.rate_applied != null
                    ? `₹${bestMarket.rate_applied} ${bestMarket.rate_unit || ''} ${bestMarket.rate_is_estimate ? `(${t('defaultEstimate')})` : `(${t('customRate')})`}`
                    : bestMarket?.transport_cost_basis === 'actual_quote' ? t('rateBasisQuote') : ''}
                </span>
              </div>
              <div>
                <span className="text-[#F6F0E1]/70 block">{t('transportation')}</span>
                <span className="font-bold text-base text-[#F6F0E1] mt-0.5 block">
                  -₹{formatINR(transportation_cost)}
                </span>
                <span className="text-[10px] text-[#F6F0E1]/60 block mt-0.5">
                  {bestMarket?.transport_cost_basis === 'actual_quote' ? t('rateBasisQuote') : t('rateBasisEstimated')}
                </span>
              </div>
              <div>
                <span className="text-[#F6F0E1]/70 block">{t('otherExpenses')}</span>
                <span className="font-bold text-base text-[#F6F0E1] mt-0.5 block">
                  -₹{formatINR(other_costs)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Feature 2: Stale/Fallback Warning Notice if confidence is low */}
        {(bestMarket?.confidence_level === 'low' || meta?.usingFallback) && (
          <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 mb-8 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-sm text-amber-900">
                {t('confidenceLow')}: {t('staleWarningNotice')}
              </h4>
              <p className="text-xs text-amber-800 mt-1">
                {t('confidenceLowDesc')} (Source: {meta?.source || bestMarket?.source_provider || 'Local dataset'}).
              </p>
            </div>
          </div>
        )}

        {/* Why This Market Recommendation Card */}
        <div className="card-softwhite rounded-3xl p-6 sm:p-8 mb-10 border border-[#286B43]/20 shadow-md relative overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#173D2A] text-[#F6F0E1] text-xs font-bold uppercase tracking-wider shadow-xs">
                <Sparkles className="w-3.5 h-3.5 text-[#E7C96B]" />
                <span>{t('whyThisMarketTitle')}</span>
              </div>

              {/* Feature 2: Kannada Text-to-Speech Controls */}
              {speechStatus === 'idle' ? (
                <button
                  id="kannada-tts-button"
                  type="button"
                  onClick={handlePlayKannada}
                  aria-label={t('listenInKannada')}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer shadow-xs bg-[#F6F0E1] hover:bg-[#E7C96B]/30 text-[#173D2A] border border-[#286B43]/30"
                  title={t('listenInKannada')}
                >
                  <Volume2 className="w-3.5 h-3.5 text-[#286B43]" />
                  <span>{t('listenInKannada')}</span>
                  {language !== 'kn' && (
                    <span className="text-[10px] font-normal text-[#52604D]">(ಕನ್ನಡ)</span>
                  )}
                </button>
              ) : speechStatus === 'playing' ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#173D2A] border border-[#E7C96B]/50 shadow-xs">
                  <span className="inline-flex items-center gap-1.5 pr-2 text-xs font-bold text-[#E7C96B]">
                    <Volume2 className="w-3.5 h-3.5 animate-pulse text-[#E7C96B]" />
                    <span>{t('voiceSpeaking')}</span>
                  </span>
                  <button
                    type="button"
                    onClick={handlePauseAudio}
                    aria-label={t('pauseAudio')}
                    title={t('pauseAudio')}
                    className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-[#FFFDF7] cursor-pointer"
                  >
                    <Pause className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={handleStopAudio}
                    aria-label={t('stopAudio')}
                    title={t('stopAudio')}
                    className="p-1.5 rounded-full bg-red-600/80 hover:bg-red-600 text-white cursor-pointer"
                  >
                    <Square className="w-2.5 h-2.5 fill-current" />
                  </button>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#173D2A] border border-[#E7C96B]/50 shadow-xs">
                  <span className="inline-flex items-center gap-1.5 pr-2 text-xs font-bold text-[#F6F0E1]">
                    <VolumeX className="w-3.5 h-3.5 text-[#E7C96B]" />
                    <span>{t('pauseAudio')}</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleResumeAudio}
                    aria-label={t('resumeAudio')}
                    title={t('resumeAudio')}
                    className="p-1.5 rounded-full bg-[#E7C96B] hover:bg-[#d8b857] text-[#173D2A] cursor-pointer"
                  >
                    <Play className="w-3 h-3 fill-current" />
                  </button>
                  <button
                    type="button"
                    onClick={handleStopAudio}
                    aria-label={t('stopAudio')}
                    title={t('stopAudio')}
                    className="p-1.5 rounded-full bg-red-600/80 hover:bg-red-600 text-white cursor-pointer"
                  >
                    <Square className="w-2.5 h-2.5 fill-current" />
                  </button>
                </div>
              )}
            </div>

            {advantage > 0 && runnerUpMarket && (
              <span className="text-xs font-extrabold text-[#173D2A] bg-[#E7C96B]/25 px-3.5 py-1.5 rounded-full border border-[#E7C96B]/60 shadow-2xs">
                +₹{formatINR(advantage)} {t('moreThanNextRunnerUp')}
              </span>
            )}
          </div>

          {/* Accessible Notice Banner if Kannada Voice is Unavailable */}
          {voiceNotice && (
            <div
              role="alert"
              className="mb-5 text-xs flex items-center justify-between gap-3 p-3 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 shadow-2xs animate-in fade-in duration-200"
            >
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                <span className="font-semibold leading-relaxed">{voiceNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setVoiceNotice(null)}
                aria-label="Dismiss notice"
                className="text-amber-800 hover:text-amber-950 font-bold p-1 cursor-pointer shrink-0"
              >
                ✕
              </button>
            </div>
          )}

          <p className="text-base sm:text-lg font-bold text-[#20291F] leading-relaxed mb-6 font-sans">
            {explanation || t('whyMarket', { market: recommended_market })}
          </p>

          {/* 4 Financial Columns */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="p-4 rounded-2xl bg-[#F6F0E1]/70 border border-[#286B43]/20 shadow-2xs">
              <span className="text-xs font-bold text-[#52604D] block uppercase tracking-wide">
                {t('grossRevenue')}
              </span>
              <div className="text-lg sm:text-2xl font-black text-[#20291F] mt-1 font-editorial">
                ₹{formatINR(expected_gross_revenue)}
              </div>
              <span className="text-[11px] text-[#52604D] font-medium">
                ₹{formatPricePerKg(bestMarket?.price_per_kg)}/kg
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#F6F0E1]/70 border border-[#286B43]/20 shadow-2xs">
              <span className="text-xs font-bold text-[#52604D] block uppercase tracking-wide">
                {t('transportation')}
              </span>
              <div className="text-lg sm:text-2xl font-black text-[#B45309] mt-1 font-editorial">
                -₹{formatINR(transportation_cost)}
              </div>
              <span className="text-[11px] text-[#52604D] font-medium block">
                {bestMarket?.transport_cost_basis === 'actual_quote' ? t('actualQuoteUsedShort') : t('estimatedFreight')}
                {bestMarket?.transport_mode === 'shared_load' && (
                  <span className="block text-[10px] text-[#286B43] font-semibold mt-0.5">
                    {t('sharedLoad')} {bestMarket?.shared_units_count ? `(${bestMarket.shared_units_count} units)` : ''}
                  </span>
                )}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#F6F0E1]/70 border border-[#286B43]/20 shadow-2xs">
              <span className="text-xs font-bold text-[#52604D] block uppercase tracking-wide">
                {t('otherCosts') || 'Other Costs'}
              </span>
              <div className="text-lg sm:text-2xl font-black text-[#52604D] mt-1 font-editorial">
                -₹{formatINR(other_costs)}
              </div>
              <span className="text-[11px] text-[#52604D] font-medium">
                {t('mandiCosts')}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#173D2A] text-[#FFFDF7] border border-[#286B43] shadow-sm">
              <span className="text-xs font-bold text-[#E7C96B] block uppercase tracking-wide">
                {t('expectedNet')}
              </span>
              <div className="text-lg sm:text-2xl font-black text-[#E7C96B] mt-1 font-editorial">
                ₹{formatINR(expected_net_return)}
              </div>
              <span className="text-[11px] text-[#F6F0E1]/80 font-bold">
                {t('actualProfit')}
              </span>
            </div>
          </div>

          {/* Direct Alternative Comparison */}
          {runnerUpMarket && (
            <div className="mt-5 p-4 rounded-2xl bg-[#F6F0E1]/60 border border-[#286B43]/20 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
              <div className="flex flex-wrap items-center gap-2 text-[#20291F]">
                <span className="font-extrabold text-[#173D2A]">vs. #2 {runnerUpMarket.name}:</span>
                <span className="text-[#52604D]">
                  Net return ₹{formatINR(runnerUpMarket.net_return)} (Price: ₹{formatPricePerKg(runnerUpMarket.price_per_kg)}/kg, Freight: ₹{formatINR(runnerUpMarket.transportation_cost)})
                </span>
              </div>
              <div className="inline-flex items-center gap-1 font-bold text-[#173D2A] bg-[#E7C96B]/30 px-3 py-1 rounded-xl border border-[#E7C96B]/60 shadow-2xs">
                <TrendingUp className="w-3.5 h-3.5 text-[#286B43]" />
                <span>+₹{formatINR(advantage)} {t('profitAdvantage')}</span>
              </div>
            </div>
          )}
        </div>

        {/* Feature 3: Multi-Commodity Crop-by-Crop Breakdown Table (if multi-crop present) */}
        {bestMarket?.crop_breakdowns?.length > 1 && (
          <div className="card-softwhite rounded-3xl p-6 sm:p-8 mb-10 border border-[#286B43]/20 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#286B43] block">
                  {t('multiCropHarvest')}
                </span>
                <h3 className="text-xl font-extrabold text-[#20291F] font-editorial">
                  {t('cropBreakdownTitle')}
                </h3>
              </div>
              <span className="text-xs font-semibold text-[#173D2A] bg-[#F6F0E1] px-3 py-1 rounded-full border border-[#286B43]/20">
                {t('jointFreightNotice')}
              </span>
            </div>

            <div className="divide-y divide-[#286B43]/15 text-sm">
              {bestMarket.crop_breakdowns.map((cb, idx) => (
                <div key={idx} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="font-bold text-[#20291F]">
                    {getCropDisplayName(cb.crop, language)}
                    <span className="text-xs text-[#52604D] font-normal block">
                      {cb.saleable_quantity_kg} {t('unitKg')} saleable @ ₹{Number(cb.price_per_kg).toFixed(2)}/{t('unitKg')}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-right">
                    <div>
                      <span className="text-[10px] text-[#52604D] block uppercase tracking-wider">{t('grossRevenue')}</span>
                      <span className="font-bold text-[#20291F] text-sm">₹{formatINR(cb.gross_revenue)}</span>
                    </div>
                    {cb.allocated_transport != null && (
                      <div>
                        <span className="text-[10px] text-[#B45309] block uppercase tracking-wider">{t('allocatedFreight')}</span>
                        <span className="font-bold text-[#B45309] text-sm">-₹{formatINR(cb.allocated_transport)}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-[10px] text-[#173D2A] block uppercase tracking-wider">{t('netContribution')}</span>
                      <span className="font-extrabold text-[#173D2A] text-base font-editorial">
                        ₹{formatINR(cb.net_return ?? (cb.gross_revenue - (cb.allocated_transport || 0)))}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card-softwhite rounded-3xl p-6 sm:p-8 mb-10 border border-[#286B43]/20 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#286B43]">
                {t('financialReconciliation')}
              </span>
              <h3 className="text-2xl font-extrabold text-[#20291F] mt-1 font-editorial">
                {t('realizableBreakdown')}
              </h3>
            </div>
            <div className="text-right text-xs text-[#52604D]">
              <div>{t('dataSource')}: {meta?.source || t('sourceUnavailable')}</div>
              {meta?.usingFallback && (
                <div className="mt-1 font-semibold text-amber-800">{t('fallbackUsed')}</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div className="p-3 rounded-xl bg-[#F6F0E1]/50 border border-[#286B43]/15">
              <span className="text-xs text-[#52604D] block">{t('harvestQuantity')}</span>
              <strong className="text-[#20291F] font-bold text-base">{quantity_kg} {t('unitKg')}</strong>
            </div>
            <div className="p-3 rounded-xl bg-[#F6F0E1]/50 border border-[#286B43]/15">
              <span className="text-xs text-[#52604D] block">{t('estimatedLoss')}</span>
              <strong className="text-[#20291F] font-bold text-base">{estimated_loss_kg} {t('unitKg')}</strong>
            </div>
            <div className="p-3 rounded-xl bg-[#F6F0E1]/50 border border-[#286B43]/15">
              <span className="text-xs text-[#52604D] block">{t('saleableQuantity')}</span>
              <strong className="text-[#173D2A] font-bold text-base">{saleable_quantity_kg} {t('unitKg')}</strong>
            </div>
            <div className="p-3 rounded-xl bg-[#F6F0E1]/50 border border-[#286B43]/15">
              <span className="text-xs text-[#52604D] block">{t('lossPercentage')}</span>
              <strong className="text-[#20291F] font-bold text-base">
                {losses_provided && loss_percentage !== null ? `${loss_percentage}%` : t('lossOmitted')}
              </strong>
            </div>
          </div>

          <div className="mt-5 p-4 rounded-2xl bg-[#F6F0E1]/60 border border-[#286B43]/20 text-sm text-[#20291F]">
            <strong className="text-[#173D2A]">
              {losses_provided ? t('lossProvided') : t('lossOmitted')}
            </strong>
            <p className="mt-1 text-[#52604D]">
              {t('lossDataSharedAcrossMarkets')}
            </p>
          </div>
        </div>

        {/* "Why [Market]?" Explanation Card */}
        <div className="card-softwhite rounded-3xl p-6 sm:p-10 mb-10 border border-[#286B43]/20 shadow-md">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#286B43]">
              {t('decisionExplanation')}
            </span>
          </div>

          <h3 className="text-2xl sm:text-3xl font-extrabold text-[#20291F] mb-4 font-editorial">
            {t('whyMarket', { market: recommended_market })}
          </h3>

          <p className="text-base sm:text-lg text-[#20291F] leading-relaxed mb-8 bg-[#F6F0E1]/70 p-4 sm:p-6 rounded-2xl border border-[#286B43]/20">
            {localizeBackendText(language, explanation)}
          </p>

          {/* Visual Side-by-Side Comparison if alternative exists */}
          {runnerUpMarket && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#286B43] mb-4">
                {t('sideComparison')}
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Winning Market Column */}
                <div className="p-5 rounded-2xl bg-[#173D2A] text-[#FFFDF7] border-2 border-[#E7C96B] relative shadow-md">
                  <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-[#E7C96B] text-[#173D2A] text-[10px] font-bold uppercase tracking-wide">
                    {t('winner')}
                  </div>
                  <div className="font-extrabold text-xl text-[#FFFDF7] mb-3 font-editorial">
                    {bestMarket.name}
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-1 border-b border-[#286B43]/40">
                      <span className="text-[#F6F0E1]/70">{bestMarket.price_type === 'market_price_lastweek_observation' ? t('observedPrice') : t('marketPrice')}</span>
                      <span className="font-semibold text-[#FFFDF7]">
                        ₹{formatPricePerKg(bestMarket.price_per_kg)}/{t('unitKg')}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#286B43]/40">
                      <span className="text-[#F6F0E1]/70">{t('transportation')}</span>
                      <span className="font-semibold text-[#E7C96B]">
                        ₹{formatINR(bestMarket.transportation_cost)}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#286B43]/40">
                      <span className="text-[#F6F0E1]/70">{t('grossRevenue')}</span>
                      <span className="font-semibold text-[#FFFDF7]">
                        ₹{formatINR(bestMarket.gross_revenue)}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2">
                      <span className="font-bold text-[#E7C96B]">{t('netReturn')}</span>
                      <span className="font-extrabold text-xl text-[#E7C96B] font-editorial">
                        ₹{formatINR(bestMarket.net_return)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Runner-up Market Column */}
                <div className="p-5 rounded-2xl bg-[#F6F0E1]/50 border border-[#286B43]/20">
                  <div className="font-extrabold text-xl text-[#52604D] mb-3 font-editorial">
                    {runnerUpMarket.name}
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-1 border-b border-[#286B43]/15">
                      <span className="text-[#52604D]">{runnerUpMarket.price_type === 'market_price_lastweek_observation' ? t('observedPrice') : t('marketPrice')}</span>
                      <span className="font-semibold text-[#20291F]">
                        ₹{formatPricePerKg(runnerUpMarket.price_per_kg)}/{t('unitKg')}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#286B43]/15">
                      <span className="text-[#52604D]">{t('transportation')}</span>
                      <span className="font-semibold text-[#52604D]">
                        ₹{formatINR(runnerUpMarket.transportation_cost)}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#286B43]/15">
                      <span className="text-[#52604D]">{t('grossRevenue')}</span>
                      <span className="font-semibold text-[#20291F]">
                        ₹{formatINR(runnerUpMarket.gross_revenue)}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2">
                      <span className="font-bold text-[#52604D]">{t('netReturn')}</span>
                      <span className="font-extrabold text-lg text-[#52604D] font-editorial">
                        ₹{formatINR(runnerUpMarket.net_return)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Highlight callout */}
              {advantage > 0 && (
                <div className="mt-5 p-4 rounded-xl bg-[#E7C96B]/20 border border-[#E7C96B]/60 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-[#286B43] shrink-0" />
                    <span className="text-sm font-bold text-[#173D2A]">
                      {t('youEarnMore', { amount: formatINR(advantage), market: recommended_market })}
                    </span>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#173D2A] shrink-0">
                    {t('netProfitAdvantage')}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* AI Real-Time Timing Advisor & 7-Day Price Forecast */}
        <AITimingForecast
          commodity={crop}
          market={recommended_market}
          district={bestMarket?.district || null}
          quantityKg={quantity_kg}
          transportCost={transportation_cost}
        />

        {/* Profit Breakdown Card */}
        <div className="card-softwhite rounded-3xl p-6 sm:p-10 mb-10 border border-[#286B43]/20 shadow-md">
          <div className="flex items-center justify-between mb-6">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#286B43] block">
                {t('financialReconciliation')}
              </span>
              <h3 className="text-2xl font-extrabold text-[#20291F] mt-0.5 font-editorial">
                {t('profitBreakdown')}
              </h3>
            </div>
            <div className="px-3 py-1 rounded-full bg-[#F6F0E1] border border-[#286B43]/20 text-xs font-semibold text-[#173D2A]">
              {crop} • {quantity_kg} {t('unitKg')}
            </div>
          </div>

          <div className="divide-y divide-[#286B43]/15 text-sm">
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-[#286B43]/15 flex items-center justify-center text-[#286B43] font-bold text-xs">
                  +
                </div>
                <div>
                  <span className="font-bold text-[#20291F] block">{t('grossRevenue')}</span>
                  <span className="text-xs text-[#52604D]">
                    {saleable_quantity_kg} {t('unitKg')} × ₹{formatPricePerKg(bestMarket?.price_per_kg)}/{t('unitKg')}
                  </span>
                </div>
              </div>
              <span className="font-bold text-base text-[#20291F] font-editorial">
                ₹{formatINR(expected_gross_revenue)}
              </span>
            </div>

            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center text-amber-800 font-bold text-xs">
                  -
                </div>
                <div>
                  <span className="font-bold text-[#20291F] block">{t('transportation')}</span>
                  <span className="text-xs text-[#52604D]">
                    {t('freightFromTo', { from: farmer_location, to: recommended_market })}
                  </span>
                </div>
              </div>
              <span className="font-bold text-base text-[#B45309] font-editorial">
                -₹{formatINR(transportation_cost)}
              </span>
            </div>

            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-[#F6F0E1] flex items-center justify-center text-[#52604D] font-bold text-xs">
                  -
                </div>
                <div>
                  <span className="font-bold text-[#20291F] block">{t('otherCost')}</span>
                  <span className="text-xs text-[#52604D]">
                    {t('mandiCosts')}
                  </span>
                </div>
              </div>
              <span className="font-bold text-base text-[#52604D] font-editorial">
                -₹{formatINR(other_costs)}
              </span>
            </div>

            <div className="flex items-center justify-between pt-4">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-[#173D2A] flex items-center justify-center text-[#E7C96B] font-bold text-xs">
                  =
                </div>
                <div>
                  <span className="font-extrabold text-lg text-[#173D2A] block">
                    {t('expectedNet')}
                  </span>
                  <span className="text-xs text-[#52604D]">
                    {t('actualProfit')}
                  </span>
                </div>
              </div>
              <span className="font-black text-2xl text-[#173D2A] font-editorial">
                ₹{formatINR(expected_net_return)}
              </span>
            </div>
          </div>
        </div>

        {/* Market Comparison Section */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#286B43] block">
                {t('fullRanking')}
              </span>
              <h3 className="text-2xl font-extrabold text-[#20291F] mt-0.5 font-editorial">
                {t('marketComparison')}
              </h3>
            </div>
            <span className="text-xs text-[#52604D]">
              {t('sortedByReturn')}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ranked_markets.map((m) => {
              const isWinner = m.rank === 1
              return (
                <div
                  key={m.name}
                  className={`rounded-2xl p-6 transition-all ${
                    isWinner
                      ? 'bg-[#173D2A] text-[#FFFDF7] border-2 border-[#E7C96B] shadow-md'
                      : 'card-softwhite border border-[#286B43]/20 hover:border-[#286B43]/50 shadow-xs'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className={`text-xs font-bold uppercase tracking-wider ${isWinner ? 'text-[#E7C96B]' : 'text-[#52604D]'}`}>
                        {t('rank')} #{m.rank}
                      </div>
                      <h4 className={`text-xl font-extrabold font-editorial ${isWinner ? 'text-[#FFFDF7]' : 'text-[#20291F]'}`}>
                        {m.name}
                      </h4>
                    </div>
                    {isWinner && (
                      <span className="px-2.5 py-1 rounded-full bg-[#E7C96B] text-[#173D2A] text-[10px] font-bold uppercase tracking-wide">
                        {t('recommended')}
                      </span>
                    )}
                  </div>

                  <div className="space-y-2 text-xs mb-4">
                    <div className={`flex justify-between py-1 border-b ${isWinner ? 'border-[#286B43]/40' : 'border-[#286B43]/15'}`}>
                      <span className={isWinner ? 'text-[#F6F0E1]/70' : 'text-[#52604D]'}>
                        {m.price_type === 'market_price_lastweek_observation' ? t('observedPrice') : t('marketPrice')}
                      </span>
                      <span className={`font-semibold ${isWinner ? 'text-[#FFFDF7]' : 'text-[#20291F]'}`}>
                        ₹{formatPricePerKg(m.price_per_kg)}/{t('unitKg')}
                      </span>
                    </div>

                    <div className={`pt-3 border-t ${isWinner ? 'border-[#286B43]/40' : 'border-[#286B43]/15'} grid grid-cols-2 gap-2 text-xs`}>
                      <div>
                        <span className={`block ${isWinner ? 'text-[#F6F0E1]/70' : 'text-[#52604D]'}`}>{t('harvestQuantity')}</span>
                        <span className={`font-semibold ${isWinner ? 'text-[#FFFDF7]' : 'text-[#20291F]'}`}>{m.harvest_quantity_kg ?? quantity_kg} {t('unitKg')}</span>
                      </div>
                      <div>
                        <span className={`block ${isWinner ? 'text-[#F6F0E1]/70' : 'text-[#52604D]'}`}>{t('estimatedLoss')}</span>
                        <span className={`font-semibold ${isWinner ? 'text-[#FFFDF7]' : 'text-[#20291F]'}`}>{m.estimated_loss_kg ?? 0} {t('unitKg')}</span>
                      </div>
                      <div>
                        <span className={`block ${isWinner ? 'text-[#F6F0E1]/70' : 'text-[#52604D]'}`}>{t('saleableQuantity')}</span>
                        <span className={`font-semibold ${isWinner ? 'text-[#FFFDF7]' : 'text-[#20291F]'}`}>{m.saleable_quantity_kg ?? quantity_kg} {t('unitKg')}</span>
                      </div>
                      <div>
                        <span className={`block ${isWinner ? 'text-[#F6F0E1]/70' : 'text-[#52604D]'}`}>{t('pricePerKg')}</span>
                        <span className={`font-semibold ${isWinner ? 'text-[#FFFDF7]' : 'text-[#20291F]'}`}>₹{formatPricePerKg(m.price_per_kg)}/{t('unitKg')}</span>
                      </div>
                    </div>

                    {/* Road Distance */}
                    <div className={`flex justify-between py-1 border-b ${isWinner ? 'border-[#286B43]/40' : 'border-[#286B43]/15'}`}>
                      <span className={isWinner ? 'text-[#F6F0E1]/70' : 'text-[#52604D]'}>{t('roadDistance')}</span>
                      <span className={`font-semibold ${isWinner ? 'text-[#E7C96B]' : 'text-[#20291F]'}`}>
                        {m.distance_km != null ? `${m.distance_km} km` : t('distanceUnavailable')}
                      </span>
                    </div>

                    {/* Rate Applied */}
                    {m.rate_applied != null && (
                      <div className={`flex justify-between py-1 border-b ${isWinner ? 'border-[#286B43]/40' : 'border-[#286B43]/15'}`}>
                        <span className={isWinner ? 'text-[#F6F0E1]/70' : 'text-[#52604D]'}>{t('rateApplied')}</span>
                        <span className={`font-semibold ${isWinner ? 'text-[#FFFDF7]' : 'text-[#20291F]'}`}>
                          ₹{m.rate_applied} {m.rate_unit || ''}{' '}
                          <span className={`text-[10px] font-normal ${isWinner ? 'text-[#F6F0E1]/60' : 'text-[#52604D]'}`}>
                            {m.rate_is_estimate ? `(${t('defaultEstimate')})` : `(${t('customRate')})`}
                          </span>
                        </span>
                      </div>
                    )}

                    <div className={`flex justify-between py-1 border-b ${isWinner ? 'border-[#286B43]/40' : 'border-[#286B43]/15'}`}>
                      <span className={isWinner ? 'text-[#F6F0E1]/70' : 'text-[#52604D]'}>{t('transportation')}</span>
                      <span className={`font-semibold ${isWinner ? 'text-[#E7C96B]' : 'text-[#20291F]'}`}>
                        {m.transport_cost_basis === 'unavailable'
                          ? t('transportCostUnknown')
                          : `₹${formatINR(m.transportation_cost)}`}
                      </span>
                    </div>
                    {m.transport_cost_basis === 'actual_quote' && (
                      <div className={`text-[11px] ${isWinner ? 'text-[#F6F0E1]/70' : 'text-[#52604D]'}`}>{t('actualQuoteUsed')}</div>
                    )}
                    {m.transport_error && (
                      <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 font-medium">
                        {m.transport_error}
                      </div>
                    )}
                    {m.load_capacity_warning && (
                      <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 font-medium">
                        ⚠️ {m.load_capacity_warning}
                      </div>
                    )}

                    <div className={`flex justify-between py-1 border-b ${isWinner ? 'border-[#286B43]/40' : 'border-[#286B43]/15'}`}>
                      <span className={isWinner ? 'text-[#F6F0E1]/70' : 'text-[#52604D]'}>{t('grossRevenue')}</span>
                      <span className={`font-semibold ${isWinner ? 'text-[#FFFDF7]' : 'text-[#20291F]'}`}>
                        ₹{formatINR(m.gross_revenue)}
                      </span>
                    </div>
                    <div className={`flex justify-between py-1 border-b ${isWinner ? 'border-[#286B43]/40' : 'border-[#286B43]/15'}`}>
                      <span className={isWinner ? 'text-[#F6F0E1]/70' : 'text-[#52604D]'}>{t('otherCost')}</span>
                      <span className={`font-semibold ${isWinner ? 'text-[#FFFDF7]' : 'text-[#20291F]'}`}>
                        ₹{formatINR(m.other_costs)}
                      </span>
                    </div>
                  </div>

                  <div className={`pt-2 border-t ${isWinner ? 'border-[#286B43]/40' : 'border-[#286B43]/15'} flex items-baseline justify-between`}>
                    <span className={`text-xs font-bold uppercase ${isWinner ? 'text-[#E7C96B]' : 'text-[#52604D]'}`}>
                      {t('netReturn')}
                    </span>
                    <span
                      className={`font-black text-xl font-editorial ${
                        isWinner ? 'text-[#E7C96B]' : 'text-[#20291F]'
                      }`}
                    >
                      ₹{formatINR(m.net_return)}
                    </span>
                  </div>
                  <div className={`mt-3 text-xs ${isWinner ? 'text-[#F6F0E1]/70' : 'text-[#52604D]'}`}>
                    {t('marketDate')}: {market_dates[m.name] || t('sourceUnavailable')}
                    {m.is_stale && (
                      <span className="block mt-1 font-bold text-amber-600">
                        {t('staleObservationWithDate', {
                          date: market_dates[m.name] || t('sourceUnavailable'),
                        })}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {incomplete_markets.length > 0 && (
            <div className="mt-8 rounded-2xl bg-amber-50 border border-amber-300 p-6">
              <h4 className="text-sm font-bold text-amber-900">{t('incompleteMarkets')}</h4>
              <p className="text-xs text-amber-800 mt-1">{t('incompleteMarketsHelp')}</p>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {incomplete_markets.map((market) => (
                  <div key={market.name} className="p-3.5 rounded-xl bg-white border border-amber-200 text-xs text-[#20291F] flex flex-col justify-between">
                    <span className="font-bold text-sm text-[#20291F]">{market.name}</span>
                    <span className="text-amber-800 mt-1">{market.transport_error || t('distanceUnavailable')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <button
            onClick={onReset}
            className="btn-secondary"
          >
            <RotateCcw className="w-4 h-4 text-[#286B43]" />
            <span>{t('reset')}</span>
          </button>
        </div>
      </div>
    </section>
  )
}
