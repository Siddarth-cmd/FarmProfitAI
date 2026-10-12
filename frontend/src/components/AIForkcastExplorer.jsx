import React, { useState, useEffect } from 'react'
import {
  Sparkles,
  TrendingUp,
  Search,
  MapPin,
  Calendar,
  Layers,
  ArrowRight,
} from 'lucide-react'
import AITimingForecast from './AITimingForecast'
import { fetchMarketFilters } from '../services/api'
import { useLanguage } from '../localization'

const DEFAULT_CROPS = [
  'Tomato',
  'Onion',
  'Potato',
  'Maize',
  'Green Chilli',
  'Cabbage',
  'Carrot',
  'Capsicum',
]

const DEFAULT_MARKETS = [
  'Binny Mill (FF&V) Bengaluru APMC',
  'Bengaluru APMC',
  'Mysuru APMC',
  'Kolar APMC',
  'Hassan APMC',
  'Mandya APMC',
  'APMC Hubballi',
  'Belagavi APMC',
]

export default function AIForkcastExplorer() {
  const { t } = useLanguage()
  const [selectedCrop, setSelectedCrop] = useState('Tomato')
  const [selectedMarket, setSelectedMarket] = useState('Binny Mill (FF&V) Bengaluru APMC')
  const [quantityKg, setQuantityKg] = useState(1000)
  const [transportCost, setTransportCost] = useState(400)
  const [marketOptions, setMarketOptions] = useState(DEFAULT_MARKETS)
  const [cropOptions, setCropOptions] = useState(DEFAULT_CROPS)

  useEffect(() => {
    async function loadOptions() {
      try {
        const filters = await fetchMarketFilters()
        if (filters?.commodities?.length > 0) {
          const names = filters.commodities.map((c) => c.name).filter(Boolean)
          setCropOptions(Array.from(new Set([...DEFAULT_CROPS, ...names])).slice(0, 30))
        }
      } catch {
        // use fallback defaults
      }
    }
    loadOptions()
  }, [])

  return (
    <section className="py-12 md:py-16 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Title */}
      <div className="text-center max-w-2xl mx-auto mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#DCE8D5] text-[#173F2A] text-xs font-bold uppercase tracking-wider mb-3">
          <Sparkles className="w-3.5 h-3.5 text-[#C9A227]" />
          <span>Real-Time APMC Mandi Intelligence</span>
        </div>
        <h2 className="text-3xl sm:text-5xl font-black text-[#173F2A] tracking-tight">
          AI Price Forecast & Timing
        </h2>
        <p className="mt-3 text-sm sm:text-base text-[#68736B]">
          Track live Karnataka APMC arrivals, forecast prices up to 14 days ahead, and calculate
          whether to sell immediately or hold produce for higher net returns.
        </p>
      </div>

      {/* Control Selector Card */}
      <div className="bg-[#FFFDF7] p-6 sm:p-8 rounded-3xl border border-[#E4E1D7] shadow-sm mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {/* Crop Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#68736B] mb-1.5">
              Crop / Commodity
            </label>
            <select
              value={selectedCrop}
              onChange={(e) => setSelectedCrop(e.target.value)}
              className="w-full bg-[#F7F3E8] border border-[#E4E1D7] rounded-xl px-3.5 py-2.5 text-sm font-semibold text-[#173F2A] focus:outline-none focus:ring-2 focus:ring-[#173F2A]/30 cursor-pointer"
            >
              {cropOptions.map((crop) => (
                <option key={crop} value={crop}>
                  {crop}
                </option>
              ))}
            </select>
          </div>

          {/* Market Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#68736B] mb-1.5">
              APMC Market
            </label>
            <select
              value={selectedMarket}
              onChange={(e) => setSelectedMarket(e.target.value)}
              className="w-full bg-[#F7F3E8] border border-[#E4E1D7] rounded-xl px-3.5 py-2.5 text-sm font-semibold text-[#173F2A] focus:outline-none focus:ring-2 focus:ring-[#173F2A]/30 cursor-pointer"
            >
              {marketOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Quantity Input */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#68736B] mb-1.5">
              Harvest Quantity (kg)
            </label>
            <input
              type="number"
              min="1"
              value={quantityKg}
              onChange={(e) => setQuantityKg(Math.max(1, Number(e.target.value)))}
              className="w-full bg-[#F7F3E8] border border-[#E4E1D7] rounded-xl px-3.5 py-2.5 text-sm font-semibold text-[#173F2A] focus:outline-none focus:ring-2 focus:ring-[#173F2A]/30"
            />
          </div>

          {/* Transport Quote */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#68736B] mb-1.5">
              Est. Transport Cost (₹)
            </label>
            <input
              type="number"
              min="0"
              value={transportCost}
              onChange={(e) => setTransportCost(Math.max(0, Number(e.target.value)))}
              className="w-full bg-[#F7F3E8] border border-[#E4E1D7] rounded-xl px-3.5 py-2.5 text-sm font-semibold text-[#173F2A] focus:outline-none focus:ring-2 focus:ring-[#173F2A]/30"
            />
          </div>
        </div>
      </div>

      {/* Main AI Forecast & Timing Component */}
      <AITimingForecast
        commodity={selectedCrop}
        market={selectedMarket}
        quantityKg={quantityKg}
        transportCost={transportCost}
      />
    </section>
  )
}
