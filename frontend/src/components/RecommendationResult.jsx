import React from 'react'
import {
  Sparkles,
  TrendingUp,
  CheckCircle,
  RotateCcw,
} from 'lucide-react'
import { localizeBackendText, useLanguage } from '../localization'

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
  if (!data) return null
  const {
    crop,
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

  return (
    <section id="recommendation-result" className="py-12 md:py-20 relative reveal-soft">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#DCE8D5]/60 text-[#173F2A] text-xs font-bold uppercase tracking-wider mb-2">
            <Sparkles className="w-3.5 h-3.5 text-[#C9A227]" />
            <span>{t('recommendation')}</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-[#173F2A] tracking-tight">
            {t('sellAt', { market: recommended_market })}
          </h2>
          <p className="mt-2 text-base text-[#68736B]">
            {t('calculatedFor', { quantity: quantity_kg.toLocaleString('en-IN'), crop, location: farmer_location })}
          </p>
          {meta?.usingFallback && (
            <p className="mt-3 inline-flex rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-800">
              {t('sourceFallback')} · {t('staleDataWarning')}
            </p>
          )}
          {usesObservation && (
            <p className={`mt-3 text-xs ${bestMarket.is_stale ? 'font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2' : 'text-[#68736B]'}`}>
              {t('observationPriceNote')}
              {bestMarket.is_stale && bestMarketDate
                ? ` ${t('staleObservationWithDate', { date: bestMarketDate })}`
                : ''}
            </p>
          )}
        </div>

        {/* Visually Dominant Dark Forest-Green Hero Card */}
        <div className="rounded-3xl bg-[#173F2A] text-[#FFFDF7] p-8 sm:p-12 shadow-2xl relative overflow-hidden mb-12 border border-[#24543A]">
          <svg className="absolute inset-0 w-full h-full text-[#DCE8D5]/10 pointer-events-none" viewBox="0 0 900 420" fill="none" aria-hidden="true">
            <path d="M-80 120 C 150 42, 298 210, 510 110 C 668 36, 790 92, 980 40" stroke="currentColor" strokeWidth="1.4" />
            <path d="M-90 292 C 178 220, 334 378, 560 260 C 710 182, 808 254, 980 198" stroke="currentColor" strokeWidth="1.1" strokeDasharray="5 7" />
          </svg>

          <div className="relative z-10">
            {/* Top Badge */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#C9A227]/20 border border-[#C9A227]/40 text-[#F7EFCF] text-xs font-extrabold tracking-wider uppercase">
                <span className="text-[#C9A227]">✦</span> {t('recommendedMarket')}
              </div>

              {advantage > 0 && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#DCE8D5]/20 text-[#DCE8D5] text-xs font-semibold">
                  <TrendingUp className="w-3.5 h-3.5 text-[#C9A227]" />
                  <span>{t('moreThanNext', { amount: formatINR(advantage) })}</span>
                </div>
              )}
            </div>

            {/* Main Market Title & Net Return */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end pb-8 border-b border-[#DCE8D5]/20">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-xs uppercase tracking-widest text-[#DCE8D5]/70 font-semibold block">
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
                  <span className="px-2 py-0.5 rounded-full bg-white/10 text-[#DCE8D5] text-[10px] font-medium border border-white/10">
                    {bestMarket?.transport_mode === 'shared_load' ? t('sharedLoad') : t('dedicatedVehicle')}
                  </span>
                </div>
                <h3 className="text-4xl sm:text-6xl font-black tracking-tight text-[#FFFDF7] uppercase">
                  {recommended_market}
                </h3>
                <p className="text-sm text-[#DCE8D5]/80 mt-2">
                  {t('maximizesNet')}
                </p>
              </div>

              <div className="md:text-right">
                <span className="text-xs uppercase tracking-widest text-[#C9A227] font-bold block mb-1">
                  {t('expectedNet')}
                </span>
                <div className="text-4xl sm:text-6xl font-black text-[#FFFDF7] tracking-tight">
                  ₹{formatINR(expected_net_return)}
                </div>
                <span className="text-xs text-[#DCE8D5]/70 block mt-1">
                  {quantity_kg.toLocaleString('en-IN')} {t('unitKg')} • {crop}
                </span>
              </div>
            </div>

            {/* Summary metrics bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 text-xs sm:text-sm">
              <div>
                <span className="text-[#DCE8D5]/70 block">{usesObservation ? t('observedPrice') : t('marketPrice')}</span>
                <span className="font-bold text-base text-[#FFFDF7] mt-0.5 block">
                  ₹{formatPricePerKg(bestMarket?.price_per_kg)}/{t('unitKg')}
                </span>
              </div>
              <div>
                <span className="text-[#DCE8D5]/70 block">{t('grossRevenue')}</span>
                <span className="font-bold text-base text-[#FFFDF7] mt-0.5 block">
                  ₹{formatINR(expected_gross_revenue)}
                </span>
              </div>
              <div>
                <span className="text-[#DCE8D5]/70 block">{t('transportation')}</span>
                <span className="font-bold text-base text-[#DCE8D5] mt-0.5 block">
                  -₹{formatINR(transportation_cost)}
                </span>
                <span className="text-[10px] text-[#DCE8D5]/60 block mt-0.5">
                  {bestMarket?.transport_cost_basis === 'actual_quote' ? t('rateBasisQuote') : t('rateBasisEstimated')}
                </span>
              </div>
              <div>
                <span className="text-[#DCE8D5]/70 block">{t('otherExpenses')}</span>
                <span className="font-bold text-base text-[#DCE8D5] mt-0.5 block">
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

        {/* Feature 3: Multi-Commodity Crop-by-Crop Breakdown Table (if multi-crop present) */}
        {bestMarket?.crop_breakdowns?.length > 1 && (
          <div className="premium-card rounded-3xl p-6 sm:p-8 mb-10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#68736B] block">
                  {t('multiCropHarvest')}
                </span>
                <h3 className="text-xl font-extrabold text-[#173F2A]">
                  {t('cropBreakdownTitle')}
                </h3>
              </div>
              <span className="text-xs font-semibold text-[#173F2A] bg-[#DCE8D5] px-3 py-1 rounded-full">
                {t('jointFreightNotice')}
              </span>
            </div>

            <div className="divide-y divide-[#E4E1D7] text-sm">
              {bestMarket.crop_breakdowns.map((cb, idx) => (
                <div key={idx} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="font-bold text-[#173F2A]">
                    {cb.crop}
                    <span className="text-xs text-[#68736B] font-normal block">
                      {cb.saleable_quantity_kg} {t('unitKg')} saleable @ ₹{Number(cb.price_per_kg).toFixed(2)}/{t('unitKg')}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-extrabold text-[#173F2A] text-base">
                      ₹{formatINR(cb.gross_revenue)}
                    </span>
                    <span className="text-xs text-[#68736B] block">
                      {t('confidenceLabel') || 'Confidence'}: {cb.confidence_level}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="premium-card rounded-3xl p-6 sm:p-8 mb-10">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#68736B]">
                {t('financialReconciliation')}
              </span>
              <h3 className="text-2xl font-extrabold text-[#173F2A] mt-1">
                {t('realizableBreakdown')}
              </h3>
            </div>
            <div className="text-right text-xs text-[#68736B]">
              <div>{t('dataSource')}: {meta?.source || t('sourceUnavailable')}</div>
              {meta?.usingFallback && (
                <div className="mt-1 font-semibold text-amber-800">{t('fallbackUsed')}</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-xs text-[#68736B] block">{t('harvestQuantity')}</span>
              <strong className="text-[#173F2A]">{quantity_kg} {t('unitKg')}</strong>
            </div>
            <div>
              <span className="text-xs text-[#68736B] block">{t('estimatedLoss')}</span>
              <strong className="text-[#173F2A]">{estimated_loss_kg} {t('unitKg')}</strong>
            </div>
            <div>
              <span className="text-xs text-[#68736B] block">{t('saleableQuantity')}</span>
              <strong className="text-[#173F2A]">{saleable_quantity_kg} {t('unitKg')}</strong>
            </div>
            <div>
              <span className="text-xs text-[#68736B] block">{t('lossPercentage')}</span>
              <strong className="text-[#173F2A]">
                {losses_provided && loss_percentage !== null ? `${loss_percentage}%` : t('lossOmitted')}
              </strong>
            </div>
          </div>

          <div className="mt-5 p-4 rounded-2xl bg-[#F7F3E8] border border-[#E4E1D7] text-sm text-[#1E2921]">
            <strong className="text-[#173F2A]">
              {losses_provided ? t('lossProvided') : t('lossOmitted')}
            </strong>
            <p className="mt-1 text-[#68736B]">
              {t('lossDataSharedAcrossMarkets')}
            </p>
          </div>
        </div>

        {/* "Why [Market]?" Explanation Card */}
        <div className="premium-card rounded-3xl p-6 sm:p-10 mb-10">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#68736B]">
              {t('decisionExplanation')}
            </span>
          </div>

          <h3 className="text-2xl sm:text-3xl font-extrabold text-[#173F2A] mb-4">
            {t('whyMarket', { market: recommended_market })}
          </h3>

          <p className="text-base sm:text-lg text-[#1E2921] leading-relaxed mb-8 bg-[#F7F3E8] p-4 sm:p-6 rounded-2xl border border-[#E4E1D7]">
            {localizeBackendText(language, explanation)}
          </p>

          {/* Visual Side-by-Side Comparison if alternative exists */}
          {runnerUpMarket && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#68736B] mb-4">
                {t('sideComparison')}
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Winning Market Column */}
                <div className="p-5 rounded-2xl bg-[#DCE8D5]/45 border-2 border-[#173F2A] relative lift-card">
                  <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-[#173F2A] text-[#FFFDF7] text-[10px] font-bold uppercase tracking-wide">
                    {t('winner')}
                  </div>
                  <div className="font-extrabold text-xl text-[#173F2A] mb-3">
                    {bestMarket.name}
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-1 border-b border-[#6F8F72]/20">
                      <span className="text-[#68736B]">{bestMarket.price_type === 'market_price_lastweek_observation' ? t('observedPrice') : t('marketPrice')}</span>
                      <span className="font-semibold text-[#1E2921]">
                        ₹{formatPricePerKg(bestMarket.price_per_kg)}/{t('unitKg')}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#6F8F72]/20">
                      <span className="text-[#68736B]">{t('transportation')}</span>
                      <span className="font-semibold text-emerald-800">
                        ₹{formatINR(bestMarket.transportation_cost)}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#6F8F72]/20">
                      <span className="text-[#68736B]">{t('grossRevenue')}</span>
                      <span className="font-semibold text-[#1E2921]">
                        ₹{formatINR(bestMarket.gross_revenue)}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2">
                      <span className="font-bold text-[#173F2A]">{t('netReturn')}</span>
                      <span className="font-extrabold text-lg text-[#173F2A]">
                        ₹{formatINR(bestMarket.net_return)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Runner-up Market Column */}
                <div className="p-5 rounded-2xl bg-[#FFFDF7] border border-[#E4E1D7] lift-card">
                  <div className="font-extrabold text-xl text-[#68736B] mb-3">
                    {runnerUpMarket.name}
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-1 border-b border-[#E4E1D7]">
                      <span className="text-[#68736B]">{runnerUpMarket.price_type === 'market_price_lastweek_observation' ? t('observedPrice') : t('marketPrice')}</span>
                      <span className="font-semibold text-[#1E2921]">
                        ₹{formatPricePerKg(runnerUpMarket.price_per_kg)}/{t('unitKg')}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#E4E1D7]">
                      <span className="text-[#68736B]">{t('transportation')}</span>
                      <span className="font-semibold text-[#68736B]">
                        ₹{formatINR(runnerUpMarket.transportation_cost)}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#E4E1D7]">
                      <span className="text-[#68736B]">{t('grossRevenue')}</span>
                      <span className="font-semibold text-[#1E2921]">
                        ₹{formatINR(runnerUpMarket.gross_revenue)}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2">
                      <span className="font-bold text-[#68736B]">{t('netReturn')}</span>
                      <span className="font-extrabold text-lg text-[#68736B]">
                        ₹{formatINR(runnerUpMarket.net_return)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Highlight callout */}
              {advantage > 0 && (
                <div className="mt-5 p-4 rounded-xl bg-[#DCE8D5]/60 border border-[#6F8F72]/30 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-[#173F2A] shrink-0" />
                    <span className="text-sm font-bold text-[#173F2A]">
                      {t('youEarnMore', { amount: formatINR(advantage), market: recommended_market })}
                    </span>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#173F2A] shrink-0">
                    {t('netProfitAdvantage')}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Profit Breakdown Card */}
        <div className="premium-card rounded-3xl p-6 sm:p-10 mb-10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#68736B] block">
                {t('financialReconciliation')}
              </span>
              <h3 className="text-2xl font-extrabold text-[#173F2A] mt-0.5">
                {t('profitBreakdown')}
              </h3>
            </div>
            <div className="px-3 py-1 rounded-full bg-[#F7F3E8] border border-[#E4E1D7] text-xs font-semibold text-[#68736B]">
              {crop} • {quantity_kg} {t('unitKg')}
            </div>
          </div>

          <div className="divide-y divide-[#E4E1D7] text-sm">
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-[#DCE8D5]/60 flex items-center justify-center text-[#173F2A] font-bold text-xs">
                  +
                </div>
                <div>
                  <span className="font-bold text-[#173F2A] block">{t('grossRevenue')}</span>
                  <span className="text-xs text-[#68736B]">
                    {saleable_quantity_kg} {t('unitKg')} × ₹{formatPricePerKg(bestMarket?.price_per_kg)}/{t('unitKg')}
                  </span>
                </div>
              </div>
              <span className="font-bold text-base text-[#1E2921]">
                ₹{formatINR(expected_gross_revenue)}
              </span>
            </div>

            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center text-red-700 font-bold text-xs">
                  -
                </div>
                <div>
                  <span className="font-bold text-[#173F2A] block">{t('transportation')}</span>
                  <span className="text-xs text-[#68736B]">
                    {t('freightFromTo', { from: farmer_location, to: recommended_market })}
                  </span>
                </div>
              </div>
                <span className="font-bold text-base text-red-800">
                  -₹{formatINR(transportation_cost)}
              </span>
            </div>

            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center text-amber-800 font-bold text-xs">
                  -
                </div>
                <div>
                  <span className="font-bold text-[#173F2A] block">{t('otherCost')}</span>
                  <span className="text-xs text-[#68736B]">
                    {t('mandiCosts')}
                  </span>
                </div>
              </div>
                <span className="font-bold text-base text-[#68736B]">
                  -₹{formatINR(other_costs)}
              </span>
            </div>

            <div className="flex items-center justify-between pt-4">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-[#173F2A] flex items-center justify-center text-[#FFFDF7] font-bold text-xs">
                  =
                </div>
                <div>
                  <span className="font-extrabold text-lg text-[#173F2A] block">
                    {t('expectedNet')}
                  </span>
                  <span className="text-xs text-[#68736B]">
                    {t('actualProfit')}
                  </span>
                </div>
              </div>
              <span className="font-black text-2xl text-[#173F2A]">
                ₹{formatINR(expected_net_return)}
              </span>
            </div>
          </div>
        </div>

        {/* Market Comparison Section */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#68736B] block">
                {t('fullRanking')}
              </span>
              <h3 className="text-2xl font-extrabold text-[#173F2A] mt-0.5">
                {t('marketComparison')}
              </h3>
            </div>
            <span className="text-xs text-[#68736B]">
              {t('sortedByReturn')}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ranked_markets.map((m) => {
              const isWinner = m.rank === 1
              return (
                <div
                  key={m.name}
                    className={`rounded-2xl p-6 lift-card ${
                    isWinner
                      ? 'bg-[#DCE8D5]/60 border-2 border-[#173F2A] shadow-md scale-102'
                      : 'bg-[#FFFDF7] border border-[#E4E1D7] hover:border-[#6F8F72] shadow-xs'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="text-xs font-bold text-[#68736B] uppercase tracking-wider">
                        {t('rank')} #{m.rank}
                      </div>
                      {incomplete_markets.length > 0 && (
                        <div className="mt-6 rounded-2xl bg-amber-50 border border-amber-200 p-4">
                          <h4 className="text-sm font-bold text-amber-900">{t('incompleteMarkets')}</h4>
                          <p className="text-xs text-amber-800 mt-1">{t('incompleteMarketsHelp')}</p>
                          <div className="mt-3 space-y-2">
                            {incomplete_markets.map((market) => (
                              <div key={market.name} className="flex flex-wrap justify-between gap-2 text-xs text-amber-900">
                                <span className="font-semibold">{market.name}</span>
                                <span>{market.transport_error || t('distanceUnavailable')}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <h4 className="text-xl font-extrabold text-[#173F2A]">
                        {m.name}
                      </h4>
                    </div>
                    {isWinner && (
                      <span className="px-2.5 py-1 rounded-full bg-[#173F2A] text-[#FFFDF7] text-[10px] font-bold uppercase tracking-wide">
                        {t('recommended')}
                      </span>
                    )}
                  </div>

                  <div className="space-y-2 text-xs mb-4">
                    <div className="flex justify-between py-1 border-b border-[#E4E1D7]/60">
                      <span className="text-[#68736B]">{m.price_type === 'market_price_lastweek_observation' ? t('observedPrice') : t('marketPrice')}</span>
                      <span className="font-semibold text-[#1E2921]">
                        ₹{formatPricePerKg(m.price_per_kg)}/{t('unitKg')}
                      </span>
                    </div>

                    <div className="pt-3 border-t border-[#E4E1D7] grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[#68736B] block">{t('harvestQuantity')}</span>
                        <span className="font-semibold text-[#1E2921]">{m.harvest_quantity_kg ?? quantity_kg} {t('unitKg')}</span>
                      </div>
                      <div>
                        <span className="text-[#68736B] block">{t('estimatedLoss')}</span>
                        <span className="font-semibold text-[#1E2921]">{m.estimated_loss_kg ?? 0} {t('unitKg')}</span>
                      </div>
                      <div>
                        <span className="text-[#68736B] block">{t('saleableQuantity')}</span>
                        <span className="font-semibold text-[#1E2921]">{m.saleable_quantity_kg ?? quantity_kg} {t('unitKg')}</span>
                      </div>
                      <div>
                        <span className="text-[#68736B] block">{t('pricePerKg')}</span>
                        <span className="font-semibold text-[#1E2921]">₹{formatPricePerKg(m.price_per_kg)}/{t('unitKg')}</span>
                      </div>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#E4E1D7]/60">
                      <span className="text-[#68736B]">{t('transportation')}</span>
                      <span className="font-semibold text-[#1E2921]">
                        {m.transport_cost_basis === 'unavailable'
                          ? t('transportCostUnknown')
                          : `₹${formatINR(m.transportation_cost)}`}
                      </span>
                    </div>
                    {m.transport_cost_basis === 'actual_quote' && (
                      <div className="text-[11px] text-[#68736B]">{t('actualQuoteUsed')}</div>
                    )}
                    <div className="flex justify-between py-1 border-b border-[#E4E1D7]/60">
                      <span className="text-[#68736B]">{t('grossRevenue')}</span>
                      <span className="font-semibold text-[#1E2921]">
                        ₹{formatINR(m.gross_revenue)}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#E4E1D7]/60">
                      <span className="text-[#68736B]">{t('otherCost')}</span>
                      <span className="font-semibold text-[#1E2921]">
                        ₹{formatINR(m.other_costs)}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#E4E1D7] flex items-baseline justify-between">
                    <span className="text-xs font-bold text-[#68736B] uppercase">
                      {t('netReturn')}
                    </span>
                    <span
                      className={`font-black text-xl ${
                        isWinner ? 'text-[#173F2A]' : 'text-[#68736B]'
                      }`}
                    >
                      ₹{formatINR(m.net_return)}
                    </span>
                  </div>
                  <div className="mt-3 text-xs text-[#68736B]">
                    {t('marketDate')}: {market_dates[m.name] || t('sourceUnavailable')}
                    {m.is_stale && (
                      <span className="block mt-1 font-bold text-amber-800">
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
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <button
            onClick={onReset}
            className="w-full sm:w-auto px-6 py-3.5 rounded-full bg-[#FFFDF7] hover:bg-[#F7F3E8] border border-[#E4E1D7] text-[#173F2A] font-semibold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <RotateCcw className="w-4 h-4 text-[#6F8F72]" />
            <span>{t('reset')}</span>
          </button>
        </div>
      </div>
    </section>
  )
}
