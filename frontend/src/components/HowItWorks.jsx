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
    <section className="py-12 md:py-24 botanical-bg reveal-soft">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto mb-16">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#E6EDE0] border border-[#9CAF88]/50 text-[#3A472E] text-xs font-bold uppercase tracking-wider mb-3 shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-[#CC5500]" />
          <span>{t('philosophy')}</span>
        </div>
        <h2 className="text-3xl sm:text-5xl font-extrabold text-[#1D201C] tracking-tight">
          {t('howWorks')}
        </h2>
        <p className="mt-3 text-base sm:text-lg text-[#5C5C5A]">
          {t('philosophyDesc')}
        </p>
      </div>

      {/* Feature Banner: Price isn't Profit */}
      <div className="bg-gradient-to-br from-[#3A472E] via-[#5E724C] to-[#3A472E] text-white rounded-3xl p-8 sm:p-14 mb-20 shadow-2xl relative overflow-hidden border border-[#8EA07A]/40">
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <span className="text-xs font-bold uppercase tracking-widest text-[#FEDEC7] block mb-2">
            {t('coreInsight')}
          </span>
          <h3 className="text-4xl sm:text-6xl font-black tracking-tight mb-6 text-white font-editorial italic">
            {t('priceIsntProfit')}
          </h3>
          <p className="text-base sm:text-lg text-[#E6EDE0] leading-relaxed mb-10 max-w-2xl mx-auto">
            {t('insightDesc')}
          </p>

          <div className="bg-white/10 border border-white/20 rounded-2xl p-6 backdrop-blur-md">
            <div className="grid grid-cols-2 md:grid-cols-7 gap-3 items-center text-center">
              <div className="p-3 rounded-xl bg-[#3A472E] border border-white/10">
                <span className="text-[10px] text-[#E6EDE0]/70 uppercase block font-semibold">{t('step')} 1</span>
                <span className="text-sm font-bold text-white block mt-0.5">{t('marketPrice')}</span>
                <span className="text-[10px] text-[#E6EDE0]/60 block mt-0.5">(₹/{t('unitKg')})</span>
              </div>

              <div className="text-xl font-bold text-[#FEDEC7] hidden md:block">-</div>

              <div className="p-3 rounded-xl bg-[#3A472E] border border-white/10">
                <span className="text-[10px] text-[#E6EDE0]/70 uppercase block font-semibold">{t('costLabel')} 1</span>
                <span className="text-sm font-bold text-red-200 block mt-0.5">{t('freight')}</span>
                <span className="text-[10px] text-[#E6EDE0]/60 block mt-0.5">({t('freightUnit')})</span>
              </div>

              <div className="text-xl font-bold text-[#FEDEC7] hidden md:block">-</div>

              <div className="p-3 rounded-xl bg-[#3A472E] border border-white/10">
                <span className="text-[10px] text-[#E6EDE0]/70 uppercase block font-semibold">{t('costLabel')} 2</span>
                <span className="text-sm font-bold text-amber-200 block mt-0.5">{t('otherCost')}</span>
                <span className="text-[10px] text-[#E6EDE0]/60 block mt-0.5">({t('otherCostUnit')})</span>
              </div>

              <div className="text-xl font-bold text-[#FEDEC7] hidden md:block">=</div>

              <div className="p-3 rounded-xl bg-[#CC5500] text-white font-extrabold shadow-lg col-span-2 md:col-span-1">
                <span className="text-[10px] text-white/80 uppercase block font-bold">{t('outcome')}</span>
                <span className="text-sm font-black block mt-0.5">{t('trueProfit')}</span>
                <span className="text-[10px] text-white/70 block mt-0.5">({t('trueProfitUnit')})</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Four Steps Section */}
      <div className="mb-20">
        <div className="text-center mb-12">
          <span className="text-xs font-bold uppercase tracking-wider text-[#646860]">
            {t('stepProcess')}
          </span>
          <h3 className="text-2xl sm:text-4xl font-extrabold text-[#1D201C] mt-1">
            {t('fourSteps')}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((st) => {
            const Icon = st.icon
            return (
              <div
                key={st.num}
                className="card-botanical card-botanical-lift rounded-3xl p-6 sm:p-8 flex flex-col justify-between group border border-[rgba(94,114,76,0.18)]"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <span className="font-mono text-3xl font-black text-[#9CAF88] group-hover:text-[#5E724C] transition-colors">
                      {st.num}
                    </span>
                    <div className="w-11 h-11 rounded-2xl bg-[#E6EDE0] flex items-center justify-center text-[#3A472E] border border-[#9CAF88]/30">
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>

                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#646860] mb-1">
                    {st.title}
                  </h4>
                  <h5 className="text-lg font-bold text-[#1D201C] mb-3">
                    {st.desc}
                  </h5>
                  <p className="text-sm text-[#4A5742] leading-relaxed">
                    {st.detail}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* CTA Box */}
      <div className="text-center bg-[#9CAF88]/18 border border-[rgba(94,114,76,0.30)] rounded-3xl p-8 sm:p-12">
        <h3 className="text-2xl sm:text-3xl font-extrabold text-[#1D201C] mb-3">
          {t('readyTitle')}
        </h3>
        <p className="text-sm sm:text-base text-[#4A5742] max-w-xl mx-auto mb-6">
          {t('readyDesc')}
        </p>
        <button
          onClick={onGetStarted}
          className="btn-accent px-9 py-3.5 text-sm sm:text-base inline-flex items-center gap-2 cursor-pointer"
        >
          <span>{t('calculateHarvest')}</span>
          <ArrowRight className="w-4 h-4 text-white" />
        </button>
      </div>
      </div>
    </section>
  )
}
