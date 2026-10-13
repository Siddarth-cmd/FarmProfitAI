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
          <div className="card-botanical rounded-3xl p-6 text-center text-[#646860]">
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
    <section id="what-if-simulator" className="py-10 md:py-16 botanical-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="card-botanical rounded-3xl p-6 sm:p-10 border border-[#E2DFD5] shadow-lg">
          <div className="flex items-start gap-3 mb-8">
            <div className="p-3 rounded-2xl bg-[#E6EDE0] text-[#3A472E] border border-[#9CAF88]/30">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#646860]">
                {t('whatIfBadge')}
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#1D201C] mt-1">
                {t('whatIfTitle')}
              </h2>
              <p className="mt-2 text-sm text-[#5C5C5A]">{t('whatIfDescription')}</p>
            </div>
          </div>

          <div className="mb-8 p-4 rounded-2xl bg-[#F5F5F3] border border-[#DEDEDA]">
            <span className="text-xs font-bold uppercase tracking-wider text-[#646860]">
              {t('originalRecommendation')}
            </span>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mt-1">
              <strong className="text-lg text-[#1D201C]">{originalWinner}</strong>
              <span className="font-bold text-[#3A472E]">
                ₹{formatINR(data.expected_net_return)}
              </span>
            </div>
          </div>

          <label htmlFor="simulator-quantity" className="block text-xs font-bold uppercase tracking-wider text-[#1D201C] mb-2">
            {t('simulatorQuantity')} ({t('unitKg')})
          </label>
          <input
            id="simulator-quantity"
            type="number"
            min="0"
            step="any"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className="w-full sm:max-w-xs px-4 py-3 rounded-xl bg-[#F4F6F1] border border-[rgba(94,114,76,0.22)] text-[#1D201C] font-semibold outline-hidden focus:border-[#9CAF88]"
          />
          {!quantityValid && (
            <p className="mt-2 text-sm text-red-700">{t('simulatorInvalidQuantity')}</p>
          )}

          <div className="mt-8 space-y-4">
            {markets.map((market) => (
              <div key={market.name} className="rounded-2xl border border-[rgba(94,114,76,0.18)] p-4 bg-[#F4F6F1]/50">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <h3 className="font-extrabold text-[#1D201C]">{market.name}</h3>
                  <span className="text-xs text-[#5C5C5A]">
                    {t('simulatorMarketDate')}: {dates[market.name] || t('simulatorDateUnavailable')}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    ['price_per_kg', t('simulatorPrice')],
                    ['transportation_cost', t('simulatorTransport')],
                    ['other_costs', t('simulatorOtherCosts')],
                  ].map(([field, label]) => (
                    <label key={field} className="text-xs font-semibold text-[#5C5C5A]">
                      {label}
                      <div className="relative mt-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-[#5C5C5A]">
                          ₹
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={market[field]}
                          onChange={(event) => updateMarket(market.name, field, event.target.value)}
                          className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-white border border-[rgba(94,114,76,0.20)] text-sm text-[#1D201C] outline-hidden focus:border-[#9CAF88]"
                        />
                      </div>
                    </label>
                  ))}
                </div>
                {simulated.find((item) => item.name === market.name) && (
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#5C5C5A]">
                    <span>{t('grossRevenue')}: ₹{formatINR(simulated.find((item) => item.name === market.name).grossRevenue)}</span>
                    <strong className="text-[#1D201C]">
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
            <div className="mt-8 rounded-2xl bg-[#192616] text-white p-6 border border-[#5E724C]/40">
              <div className="flex items-center gap-2 text-[#FEDEC7] text-xs font-bold uppercase tracking-wider">
                <TrendingUp className="w-4 h-4 text-[#CC5500]" />
                {t('simulatedBest')}
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-3 mt-2">
                <h3 className="text-2xl font-black">{best.name}</h3>
                <span className="text-2xl font-black">₹{formatINR(best.netReturn)}</span>
              </div>
              {runnerUp && (
                <p className="mt-3 text-sm text-[#E6EDE0]">
                  {t('simulatedDeltaText', {
                    market: best.name,
                    amount: formatINR(difference),
                    runnerUp: runnerUp.name,
                  })}
                </p>
              )}
              <p className="mt-2 text-sm text-[#E6EDE0]">
                {best.name === originalWinner
                  ? t('simulatedSameWinner', { market: best.name })
                  : t('simulatedChangeText', { market: best.name })}
              </p>
              <p className="mt-4 text-xs text-[#E6EDE0]/75">
                {t('simulatorSource')}: {meta?.source || 'data.gov.in'}
                {meta?.usingFallback && ` · ${t('simulatorFallbackWarning')}`}
                {hasStaleObservation && ` · ${t('staleObservation')}`}
              </p>
            </div>
          ) : (
            <p className="mt-6 p-4 rounded-xl bg-red-50 text-red-800 text-sm">
              {t('simulatorNoValidResults')}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
