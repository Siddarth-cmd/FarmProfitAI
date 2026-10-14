import React, { useMemo, useState } from 'react'
import { Calculator, TrendingUp } from 'lucide-react'
import { useLanguage } from '../localization'

function formatINR(value) {
  return Math.round(value).toLocaleString('en-IN')
}

function toNumber(value) {
  if (value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export default function WhatIfSimulator({ data, meta }) {
  const { t } = useLanguage()
  const [quantity, setQuantity] = useState(String(data?.quantity_kg ?? ''))
  const [markets, setMarkets] = useState(() =>
    (data?.ranked_markets ?? []).map((market) => ({
      ...market,
      price_per_kg: String(market.price_per_kg),
      transportation_cost: String(market.transportation_cost),
      other_costs: String(market.other_costs),
    })),
  )

  const quantityValue = toNumber(quantity)
  const quantityValid = quantityValue !== null && quantityValue > 0

  const simulated = useMemo(() => {
    if (!quantityValid) return []

    return markets
      .map((market) => {
        const price = toNumber(market.price_per_kg)
        const transport = toNumber(market.transportation_cost)
        const other = toNumber(market.other_costs)
        if (
          price === null ||
          price < 0 ||
          transport === null ||
          transport < 0 ||
          other === null ||
          other < 0
        ) {
          return null
        }

        const grossRevenue = quantityValue * price
        return {
          ...market,
          price,
          transport,
          other,
          grossRevenue,
          netReturn: grossRevenue - transport - other,
        }
      })
      .filter(Boolean)
      .sort((left, right) => right.netReturn - left.netReturn)
      .map((market, index) => ({ ...market, rank: index + 1 }))
  }, [markets, quantityValue, quantityValid])

  if (!data || !data.ranked_markets?.length) {
    return (
      <section className="py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="card-softwhite rounded-3xl p-8 text-center text-[#52604D] border border-[#286B43]/20">
            {t('simulatorNoData')}
          </div>
        </div>
      </section>
    )
  }

  const best = simulated[0]
  const runnerUp = simulated[1]
  const difference = best && runnerUp ? best.netReturn - runnerUp.netReturn : 0
  const originalWinner = data.recommended_market
  const dates = data.market_dates || {}
  const hasStaleObservation = markets.some((market) => market.is_stale)
  const hasInvalidMarkets = markets.some(
    (market) =>
      toNumber(market.price_per_kg) === null ||
      toNumber(market.price_per_kg) < 0 ||
      toNumber(market.transportation_cost) === null ||
      toNumber(market.transportation_cost) < 0 ||
      toNumber(market.other_costs) === null ||
      toNumber(market.other_costs) < 0,
  )

  const updateMarket = (name, field, value) => {
    setMarkets((current) =>
      current.map((market) =>
        market.name === name ? { ...market, [field]: value } : market,
      ),
    )
  }

  return (
    <section id="what-if-simulator" className="py-12 md:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="card-softwhite rounded-3xl p-6 sm:p-10 border border-[#286B43]/20 shadow-md">
          <div className="flex items-start gap-4 mb-8">
            <div className="p-3.5 rounded-2xl bg-[#173D2A] text-[#E7C96B] shadow-xs">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#286B43]">
                {t('whatIfBadge')}
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#20291F] mt-1 font-editorial">
                {t('whatIfTitle')}
              </h2>
              <p className="mt-2 text-sm text-[#52604D]">{t('whatIfDescription')}</p>
            </div>
          </div>

          <div className="mb-8 p-4 rounded-2xl bg-[#F6F0E1]/70 border border-[#286B43]/20">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#52604D]">
                {t('originalRecommendation')}
              </span>
              {data.transport_mode === 'shared_load' && (
                <span className="text-[11px] font-semibold text-[#173D2A] bg-[#EAF4EE] px-2.5 py-0.5 rounded-full border border-[#286B43]/30">
                  {t('simulatorTransportNote')}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mt-1">
              <strong className="text-lg text-[#173D2A] font-editorial">{originalWinner}</strong>
              <span className="font-bold text-lg text-[#173D2A] font-editorial">
                ₹{formatINR(data.expected_net_return)}
              </span>
            </div>
          </div>

          <label htmlFor="simulator-quantity" className="block text-xs font-bold uppercase tracking-wider text-[#20291F] mb-2">
            {t('simulatorQuantity')} ({t('unitKg')})
          </label>
          <input
            id="simulator-quantity"
            type="number"
            min="0"
            step="any"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className="w-full sm:max-w-xs px-4 py-3 rounded-xl bg-[#FFFDF7] border border-[#286B43]/30 text-[#20291F] font-semibold outline-hidden focus:border-[#173D2A] focus:ring-1 focus:ring-[#173D2A]"
          />
          {!quantityValid && (
            <p className="mt-2 text-sm text-red-700">{t('simulatorInvalidQuantity')}</p>
          )}

          <div className="mt-8 space-y-4">
            {markets.map((market) => (
              <div key={market.name} className="rounded-2xl border border-[#286B43]/15 p-5 bg-[#F6F0E1]/40 hover:bg-[#F6F0E1]/70 transition-colors">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <h3 className="font-extrabold text-[#20291F] text-base font-editorial">{market.name}</h3>
                  <span className="text-xs text-[#52604D]">
                    {t('simulatorMarketDate')}: {dates[market.name] || t('simulatorDateUnavailable')}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    ['price_per_kg', t('simulatorPrice')],
                    ['transportation_cost', t('simulatorTransport')],
                    ['other_costs', t('simulatorOtherCosts')],
                  ].map(([field, label]) => (
                    <label key={field} className="text-xs font-semibold text-[#52604D]">
                      {label}
                      <div className="relative mt-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-[#52604D]">
                          ₹
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={market[field]}
                          onChange={(event) => updateMarket(market.name, field, event.target.value)}
                          className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-[#FFFDF7] border border-[#286B43]/20 text-sm text-[#20291F] outline-hidden focus:border-[#173D2A]"
                        />
                      </div>
                    </label>
                  ))}
                </div>
                {simulated.find((item) => item.name === market.name) && (
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#52604D]">
                    <span>{t('grossRevenue')}: ₹{formatINR(simulated.find((item) => item.name === market.name).grossRevenue)}</span>
                    <strong className="text-[#173D2A] font-bold">
                      {t('netReturn')}: ₹{formatINR(simulated.find((item) => item.name === market.name).netReturn)}
                    </strong>
                  </div>
                )}
              </div>
            ))}
          </div>

          {(hasInvalidMarkets || !quantityValid) && (
            <p className="mt-5 text-sm text-red-700">{t('simulatorInvalidValue')}</p>
          )}

          {best ? (
            <div className="mt-8 rounded-2xl bg-[#173D2A] text-[#FFFDF7] p-6 sm:p-8 border border-[#286B43] shadow-md">
              <div className="flex items-center gap-2 text-[#E7C96B] text-xs font-bold uppercase tracking-wider">
                <TrendingUp className="w-4 h-4 text-[#E7C96B]" />
                {t('simulatedBest')}
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-3 mt-2">
                <h3 className="text-2xl font-black font-editorial text-[#FFFDF7]">{best.name}</h3>
                <span className="text-3xl font-black font-editorial text-[#E7C96B]">₹{formatINR(best.netReturn)}</span>
              </div>
              {runnerUp && (
                <p className="mt-3 text-sm text-[#F6F0E1]/90">
                  {t('simulatedDeltaText', {
                    market: best.name,
                    amount: formatINR(difference),
                    runnerUp: runnerUp.name,
                  })}
                </p>
              )}
              <p className="mt-2 text-sm text-[#F6F0E1]/90">
                {best.name === originalWinner
                  ? t('simulatedSameWinner', { market: best.name })
                  : t('simulatedChangeText', { market: best.name })}
              </p>
              <p className="mt-4 text-xs text-[#F6F0E1]/70">
                {t('simulatorSource')}: {meta?.source || 'agmarknet.gov.in'}
                {meta?.usingFallback && ` · ${t('simulatorFallbackWarning')}`}
                {hasStaleObservation && ` · ${t('staleObservation')}`}
              </p>
            </div>
          ) : (
            <p className="mt-6 p-4 rounded-xl bg-amber-50 text-amber-900 border border-amber-300 text-sm">
              {t('simulatorNoValidResults')}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
