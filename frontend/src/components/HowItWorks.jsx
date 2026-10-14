import React from 'react'
import {
  Wheat,
  Database,
  Calculator,
  Award,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import { useLanguage } from '../localization'

export default function HowItWorks({ onGetStarted }) {
  const { t } = useLanguage()
  const steps = [
    {
      num: '01',
      title: t('yourHarvest'),
      desc: t('enterSelling'),
      detail: t('harvestDetail'),
      icon: Wheat,
    },
    {
      num: '02',
      title: t('marketData'),
      desc: t('compareMarkets'),
      detail: t('marketDetail'),
      icon: Database,
    },
    {
      num: '03',
      title: t('profit'),
      desc: t('calculateReturn'),
      detail: t('profitDetail'),
      icon: Calculator,
    },
    {
      num: '04',
      title: t('recommendationStep'),
      desc: t('findEarnMore'),
      detail: t('recommendationDetail'),
      icon: Award,
    },
  ]

  return (
    <section className="py-12 md:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto mb-16">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#173D2A] text-[#E7C96B] text-xs font-bold uppercase tracking-wider mb-3 shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-[#E7C96B]" />
          <span>{t('philosophy')}</span>
        </div>
        <h2 className="text-3xl sm:text-5xl font-extrabold text-[#20291F] tracking-tight font-editorial">
          {t('howWorks')}
        </h2>
        <p className="mt-3 text-base sm:text-lg text-[#52604D]">
          {t('philosophyDesc')}
        </p>
      </div>

      {/* Feature Banner: Price isn't Profit */}
      <div className="bg-gradient-to-br from-[#173D2A] via-[#286B43] to-[#173D2A] text-white rounded-3xl p-8 sm:p-14 mb-20 shadow-2xl relative overflow-hidden border border-[#286B43]/40">
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <span className="text-xs font-bold uppercase tracking-widest text-[#E7C96B] block mb-2">
            {t('coreInsight')}
          </span>
          <h3 className="text-4xl sm:text-6xl font-black tracking-tight mb-6 text-white font-editorial italic">
            {t('priceIsntProfit')}
          </h3>
          <p className="text-base sm:text-lg text-[#F6F0E1]/90 leading-relaxed mb-10 max-w-2xl mx-auto">
            {t('insightDesc')}
          </p>

          <div className="bg-white/10 border border-white/20 rounded-2xl p-6 backdrop-blur-md">
            <div className="grid grid-cols-2 md:grid-cols-7 gap-3 items-center text-center">
              <div className="p-3 rounded-xl bg-[#173D2A] border border-white/15">
                <span className="text-[10px] text-[#F6F0E1]/70 uppercase block font-semibold">{t('step')} 1</span>
                <span className="text-sm font-bold text-white block mt-0.5">{t('marketPrice')}</span>
                <span className="text-[10px] text-[#F6F0E1]/60 block mt-0.5">(₹/{t('unitKg')})</span>
              </div>

              <div className="text-xl font-bold text-[#E7C96B] hidden md:block">-</div>

              <div className="p-3 rounded-xl bg-[#173D2A] border border-white/15">
                <span className="text-[10px] text-[#F6F0E1]/70 uppercase block font-semibold">{t('costLabel')} 1</span>
                <span className="text-sm font-bold text-amber-200 block mt-0.5">{t('freight')}</span>
                <span className="text-[10px] text-[#F6F0E1]/60 block mt-0.5">({t('freightUnit')})</span>
              </div>

              <div className="text-xl font-bold text-[#E7C96B] hidden md:block">-</div>

              <div className="p-3 rounded-xl bg-[#173D2A] border border-white/15">
                <span className="text-[10px] text-[#F6F0E1]/70 uppercase block font-semibold">{t('costLabel')} 2</span>
                <span className="text-sm font-bold text-amber-200 block mt-0.5">{t('otherCost')}</span>
                <span className="text-[10px] text-[#F6F0E1]/60 block mt-0.5">({t('otherCostUnit')})</span>
              </div>

              <div className="text-xl font-bold text-[#E7C96B] hidden md:block">=</div>

              <div className="p-3 rounded-xl bg-[#E7C96B] text-[#173D2A] font-extrabold shadow-lg col-span-2 md:col-span-1">
                <span className="text-[10px] text-[#173D2A]/80 uppercase block font-bold">{t('outcome')}</span>
                <span className="text-sm font-black block mt-0.5">{t('trueProfit')}</span>
                <span className="text-[10px] text-[#173D2A]/70 block mt-0.5">({t('trueProfitUnit')})</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Four Steps Section */}
      <div className="mb-20">
        <div className="text-center mb-12">
          <span className="text-xs font-bold uppercase tracking-wider text-[#286B43]">
            {t('stepProcess')}
          </span>
          <h3 className="text-2xl sm:text-4xl font-extrabold text-[#20291F] mt-1 font-editorial">
            {t('fourSteps')}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((st) => {
            const Icon = st.icon
            return (
              <div
                key={st.num}
                className="card-softwhite rounded-3xl p-6 sm:p-8 flex flex-col justify-between group border border-[#286B43]/20 shadow-md hover:shadow-lg transition-all"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <span className="font-mono text-3xl font-black text-[#286B43]/40 group-hover:text-[#286B43] transition-colors">
                      {st.num}
                    </span>
                    <div className="w-11 h-11 rounded-2xl bg-[#173D2A] flex items-center justify-center text-[#E7C96B] shadow-xs">
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>

                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#52604D] mb-1">
                    {st.title}
                  </h4>
                  <h5 className="text-lg font-bold text-[#20291F] mb-3 font-editorial">
                    {st.desc}
                  </h5>
                  <p className="text-sm text-[#52604D] leading-relaxed">
                    {st.detail}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* CTA Box */}
      <div className="text-center bg-[#F6F0E1] border border-[#286B43]/25 rounded-3xl p-8 sm:p-12 shadow-sm">
        <h3 className="text-2xl sm:text-3xl font-extrabold text-[#20291F] mb-3 font-editorial">
          {t('readyTitle')}
        </h3>
        <p className="text-sm sm:text-base text-[#52604D] max-w-xl mx-auto mb-6">
          {t('readyDesc')}
        </p>
        <button
          onClick={onGetStarted}
          className="btn-gold px-9 py-3.5 text-sm sm:text-base inline-flex items-center gap-2 cursor-pointer shadow-md"
        >
          <span>{t('calculateHarvest')}</span>
          <ArrowRight className="w-4 h-4 text-[#173D2A]" />
        </button>
      </div>
      </div>
    </section>
  )
}
