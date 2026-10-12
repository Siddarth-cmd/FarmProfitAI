import React, { useState, useEffect } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Clock,
  ShieldAlert,
  Sparkles,
  Info,
  CheckCircle2,
  ChevronRight,
  Activity,
  ArrowRight,
  RefreshCw,
} from 'lucide-react'
import { fetchPriceForecast, fetchTimingAdvice, fetchMarketVolatility } from '../services/api'
import { useLanguage } from '../localization'

function formatINR(val) {
  if (val === undefined || val === null || isNaN(val)) return '0'
  return Math.round(val).toLocaleString('en-IN')
}

export default function AITimingForecast({
  commodity = 'Tomato',
  market = 'Binny Mill (FF&V) Bengaluru APMC',
  district = null,
  quantityKg = 1000,
  transportCost = 0,
}) {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [forecastData, setForecastData] = useState(null)
  const [timingData, setTimingData] = useState(null)
  const [volatilityData, setVolatilityData] = useState(null)
  const [error, setError] = useState(null)
  const [hoveredPoint, setHoveredPoint] = useState(null)

  const loadAIData = async () => {
    if (!commodity || !market) return
    setLoading(true)
    setError(null)

    try {
      const [forecastRes, timingRes, volRes] = await Promise.all([
        fetchPriceForecast(commodity, market, district, 7),
        fetchTimingAdvice({
          commodity,
          market,
          quantity_kg: Number(quantityKg) || 1000,
          transport_cost: Number(transportCost) || 0,
          days_ahead: 7,
        }),
        fetchMarketVolatility(commodity, market, district),
      ])

      if (forecastRes.available) {
        setForecastData(forecastRes)
      }
      if (timingRes.available) {
        setTimingData(timingRes)
      }
      if (volRes.available) {
        setVolatilityData(volRes)
      }

      if (!forecastRes.available && !timingRes.available) {
        setError(forecastRes.error?.message || timingRes.error?.message || 'Market data unavailable for AI timing.')
      }
    } catch {
      setError('Could not reach forecasting service.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAIData()
  }, [commodity, market, quantityKg, transportCost])

  if (loading) {
    return (
      <div className="bg-[#FFFDF7] rounded-3xl p-8 border border-[#E4E1D7] shadow-sm animate-pulse my-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-xl bg-[#DCE8D5] flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-[#173F2A] animate-spin" />
          </div>
          <div>
            <div className="h-5 w-48 bg-[#E4E1D7] rounded-md mb-1.5" />
            <div className="h-3 w-64 bg-[#E4E1D7]/60 rounded-md" />
          </div>
        </div>
        <div className="h-40 bg-[#F7F3E8] rounded-2xl mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-[#F7F3E8] rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (error && !timingData) {
    return null // Graceful degradation if external API stream has no records for this market
  }

  const isHold = timingData?.recommendation === 'HOLD'
  const points = forecastData?.forecast_points || []
  const latestPrice = forecastData?.latest_real_price_per_kg || timingData?.breakdown_by_day?.[0]?.expected_price_per_kg

  // Build SVG Chart Geometry
  const chartPoints = [
    {
      day: 0,
      label: 'Today',
      price: latestPrice,
      lower: latestPrice,
      upper: latestPrice,
    },
    ...points.map((pt) => ({
      day: pt.day_offset,
      label: `+${pt.day_offset}d`,
      price: pt.predicted_price_per_kg,
      lower: pt.lower_bound,
      upper: pt.upper_bound,
    })),
  ]

  const pricesAll = chartPoints.map((p) => p.price)
  const minP = Math.max(0, Math.min(...chartPoints.map((p) => p.lower || p.price)) * 0.9)
  const maxP = Math.max(...chartPoints.map((p) => p.upper || p.price)) * 1.1 || 1
  const chartW = 540
  const chartH = 160
  const padX = 35
  const padY = 25

  const getX = (idx) => padX + (idx / (chartPoints.length - 1)) * (chartW - 2 * padX)
  const getY = (price) => chartH - padY - ((price - minP) / (maxP - minP)) * (chartH - 2 * padY)

  const linePath = chartPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(pt.price)}`).join(' ')
  
  // Upper & Lower bound filled confidence band
  const upperPath = chartPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(pt.upper || pt.price)}`).join(' ')
  const lowerPathReversed = chartPoints
    .slice()
    .reverse()
    .map((pt, i) => `L ${getX(chartPoints.length - 1 - i)} ${getY(pt.lower || pt.price)}`)
    .join(' ')
  const confidenceBandPath = `${upperPath} ${lowerPathReversed} Z`

  return (
    <div className="bg-[#FFFDF7] rounded-3xl p-6 sm:p-8 border border-[#E4E1D7] shadow-sm my-8 transition-all">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#E4E1D7]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#173F2A] flex items-center justify-center text-[#DCE8D5] shadow-sm">
            <Sparkles className="w-5 h-5 text-[#C9A227]" />
          </div>
          <div>
            <h3 className="font-extrabold text-xl text-[#173F2A] tracking-tight">
              AI Market Timing & Price Forecast
            </h3>
            <p className="text-xs text-[#68736B]">
              Real-time APMC feed for <span className="font-semibold text-[#173F2A]">{commodity}</span> at{' '}
              <span className="font-semibold text-[#173F2A]">{market}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {volatilityData && (
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                volatilityData.risk_level === 'STABLE'
                  ? 'bg-emerald-100 text-emerald-800'
                  : volatilityData.risk_level === 'MODERATE'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-rose-100 text-rose-800'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              {volatilityData.risk_level} Volatility
            </span>
          )}
          <button
            onClick={loadAIData}
            title="Refresh with live Agmarknet data"
            className="p-2 rounded-xl border border-[#E4E1D7] text-[#68736B] hover:text-[#173F2A] hover:bg-[#F7F3E8] transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Timing Recommendation Callout */}
      {timingData && (
        <div
          className={`mt-6 p-6 rounded-2xl border transition-all ${
            isHold
              ? 'bg-[#EBF5E9] border-emerald-300 text-[#173F2A]'
              : 'bg-[#FDF8E8] border-amber-300 text-amber-950'
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider ${
                    isHold ? 'bg-[#173F2A] text-[#DCE8D5]' : 'bg-[#C9A227] text-white'
                  }`}
                >
                  Decision: {isHold ? 'HOLD PRODUCE' : 'SELL TODAY'}
                </span>
                <span className="text-xs font-semibold opacity-75">
                  {isHold
                    ? `Optimal sell window: in ${timingData.optimal_sell_day_offset} days (${timingData.optimal_sell_date})`
                    : 'Lock in current market price immediately'}
                </span>
              </div>
              <p className="text-sm md:text-base font-medium leading-relaxed pt-1">
                {timingData.explanation}
              </p>
            </div>

            {isHold && (
              <div className="shrink-0 text-left md:text-right bg-white/70 backdrop-blur-sm p-4 rounded-xl border border-emerald-200">
                <div className="text-[11px] uppercase font-bold text-[#68736B] tracking-wider">
                  Estimated Net Upside
                </div>
                <div className="text-2xl font-black text-emerald-800">
                  +₹{formatINR(timingData.net_gain_amount)}
                </div>
                <div className="text-xs font-bold text-emerald-700">
                  (+{timingData.net_gain_percentage}%)
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 7-Day Forecast Chart Section */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-sm text-[#173F2A]">7-Day Projected Mandi Price Path</h4>
            {forecastData?.trend_direction && (
              <span
                className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md ${
                  forecastData.trend_direction === 'RISING'
                    ? 'text-emerald-700 bg-emerald-100'
                    : forecastData.trend_direction === 'FALLING'
                      ? 'text-rose-700 bg-rose-100'
                      : 'text-slate-700 bg-slate-100'
                }`}
              >
                {forecastData.trend_direction === 'RISING' ? (
                  <TrendingUp className="w-3.5 h-3.5" />
                ) : forecastData.trend_direction === 'FALLING' ? (
                  <TrendingDown className="w-3.5 h-3.5" />
                ) : (
                  <Clock className="w-3.5 h-3.5" />
                )}
                {forecastData.trend_direction}
              </span>
            )}
          </div>
          <span className="text-[11px] text-[#68736B]">95% Confidence Band shown in green tint</span>
        </div>

        {/* SVG Interactive Chart */}
        <div className="bg-[#F7F3E8] p-4 rounded-2xl border border-[#E4E1D7] overflow-x-auto">
          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-44 select-none">
            {/* Grid horizontal guidelines */}
            {[0.25, 0.5, 0.75].map((ratio) => {
              const yVal = padY + ratio * (chartH - 2 * padY)
              return (
                <line
                  key={ratio}
                  x1={padX}
                  y1={yVal}
                  x2={chartW - padX}
                  y2={yVal}
                  stroke="#E4E1D7"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
              )
            })}

            {/* Confidence Band Area */}
            <path d={confidenceBandPath} fill="#173F2A" fillOpacity="0.08" />

            {/* Main Predicted Line */}
            <path
              d={linePath}
              fill="none"
              stroke="#173F2A"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Data Points */}
            {chartPoints.map((pt, i) => {
              const cx = getX(i)
              const cy = getY(pt.price)
              const isSelected = hoveredPoint?.day === pt.day
              const isBest = timingData && pt.day === timingData.optimal_sell_day_offset

              return (
                <g
                  key={pt.day}
                  onMouseEnter={() => setHoveredPoint(pt)}
                  onMouseLeave={() => setHoveredPoint(null)}
                  className="cursor-pointer"
                >
                  {isBest && (
                    <circle cx={cx} cy={cy} r="10" fill="#C9A227" fillOpacity="0.3" className="animate-ping" />
                  )}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isSelected || isBest ? '6' : '4.5'}
                    fill={isBest ? '#C9A227' : '#173F2A'}
                    stroke="#FFFDF7"
                    strokeWidth="2"
                  />
                  {/* Price Tag Label above point */}
                  <text
                    x={cx}
                    y={cy - 10}
                    textAnchor="middle"
                    className="text-[10px] font-bold fill-[#173F2A]"
                  >
                    ₹{pt.price.toFixed(1)}
                  </text>
                  {/* Day label below */}
                  <text
                    x={cx}
                    y={chartH - 6}
                    textAnchor="middle"
                    className="text-[10px] font-medium fill-[#68736B]"
                  >
                    {pt.label}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
      </div>

      {/* Day-by-Day Financial Return Table */}
      {timingData?.breakdown_by_day && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-bold text-sm text-[#173F2A]">
              Daily Net Profit & Spoilage Breakdown
            </h4>
            <span className="text-[11px] text-[#68736B]">Accounts for weight loss & ambient spoilage</span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[#E4E1D7]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F3E8] border-b border-[#E4E1D7] text-[#68736B] uppercase font-semibold tracking-wider">
                <tr>
                  <th className="py-3 px-3.5">Day</th>
                  <th className="py-3 px-3.5">Date</th>
                  <th className="py-3 px-3.5">Expected Price</th>
                  <th className="py-3 px-3.5">Saleable Qty</th>
                  <th className="py-3 px-3.5">Expected Net Return</th>
                  <th className="py-3 px-3.5">Diff vs Now</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E1D7] bg-white">
                {timingData.breakdown_by_day.map((row) => {
                  const isOpt = row.day_offset === timingData.optimal_sell_day_offset
                  return (
                    <tr
                      key={row.day_offset}
                      className={`transition-colors ${
                        isOpt
                          ? 'bg-[#EBF5E9]/80 font-semibold text-[#173F2A]'
                          : 'hover:bg-[#F7F3E8]/50 text-[#1E2921]'
                      }`}
                    >
                      <td className="py-2.5 px-3.5">
                        <div className="flex items-center gap-1.5">
                          {isOpt && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />}
                          <span>{row.day_offset === 0 ? 'Today' : `+${row.day_offset} Days`}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5 text-[#68736B]">{row.date}</td>
                      <td className="py-2.5 px-3.5 font-bold">₹{row.expected_price_per_kg.toFixed(2)}/kg</td>
                      <td className="py-2.5 px-3.5">{formatINR(row.effective_quantity_kg)} kg</td>
                      <td className="py-2.5 px-3.5 font-bold text-[#173F2A]">₹{formatINR(row.expected_net_return)}</td>
                      <td className="py-2.5 px-3.5 font-bold">
                        {row.net_return_diff_vs_now > 0 ? (
                          <span className="text-emerald-700">+₹{formatINR(row.net_return_diff_vs_now)}</span>
                        ) : row.net_return_diff_vs_now < 0 ? (
                          <span className="text-rose-700">-₹{formatINR(Math.abs(row.net_return_diff_vs_now))}</span>
                        ) : (
                          <span className="text-[#68736B]">Baseline</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Provenance note */}
      <div className="mt-6 pt-4 border-t border-[#E4E1D7] flex flex-col sm:flex-row items-center justify-between text-[11px] text-[#68736B] gap-2">
        <div className="flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-[#173F2A]" />
          <span>
            Anchored on {forecastData?.historical_observations_count || 'live'} APMC observations from{' '}
            <strong className="text-[#173F2A]">Agmarknet</strong>. No synthetic prices invented.
          </span>
        </div>
        <span className="font-semibold text-[#173F2A]">
          Forecast Confidence: {forecastData?.confidence_level || 'MEDIUM'}
        </span>
      </div>
    </div>
  )
}
