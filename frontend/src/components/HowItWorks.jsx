import React from 'react'
import {
  Wheat,
  Database,
  Calculator,
  Award,
  ArrowRight,
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
    <section className="py-12 md:py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 reveal-soft">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#DCE8D5]/60 text-[#173F2A] text-xs font-semibold uppercase tracking-wider mb-3">
          <span>{t('philosophy')}</span>
        </div>
        <h2 className="text-3xl sm:text-5xl font-extrabold text-[#173F2A] tracking-tight">
          {t('howWorks')}
        </h2>
        <p className="mt-3 text-base sm:text-lg text-[#68736B]">
          {t('philosophyDesc')}
        </p>
      </div>

      {/* Feature Banner: Price isn't Profit */}
      <div className="bg-[#173F2A] text-[#FFFDF7] rounded-3xl p-8 sm:p-14 mb-20 shadow-xl relative overflow-hidden border border-[#24543A]">
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <span className="text-xs font-bold uppercase tracking-widest text-[#C9A227] block mb-2">
            {t('coreInsight')}
          </span>
          <h3 className="text-4xl sm:text-6xl font-black tracking-tight mb-6 text-[#FFFDF7]">
            {t('priceIsntProfit')}
          </h3>
          <p className="text-base sm:text-lg text-[#DCE8D5] leading-relaxed mb-10 max-w-2xl mx-auto">
            {t('insightDesc')}
          </p>

          <div className="bg-[#24543A]/80 border border-[#6F8F72]/30 rounded-2xl p-6 backdrop-blur-xs">
            <div className="grid grid-cols-2 md:grid-cols-7 gap-3 items-center text-center">
              <div className="p-3 rounded-xl bg-[#173F2A] border border-[#6F8F72]/30">
                <span className="text-[10px] text-[#DCE8D5]/70 uppercase block font-semibold">{t('step')} 1</span>
                <span className="text-sm font-bold text-[#FFFDF7] block mt-0.5">{t('marketPrice')}</span>
                <span className="text-[10px] text-[#DCE8D5]/60 block mt-0.5">(₹/{t('unitKg')})</span>
              </div>

              <div className="text-xl font-bold text-[#C9A227] hidden md:block">+</div>

              <div className="p-3 rounded-xl bg-[#173F2A] border border-[#6F8F72]/30">
                <span className="text-[10px] text-[#DCE8D5]/70 uppercase block font-semibold">{t('costLabel')} 1</span>
                <span className="text-sm font-bold text-red-300 block mt-0.5">{t('freight')}</span>
                <span className="text-[10px] text-[#DCE8D5]/60 block mt-0.5">({t('freightUnit')})</span>
              </div>

              <div className="text-xl font-bold text-[#C9A227] hidden md:block">+</div>

              <div className="p-3 rounded-xl bg-[#173F2A] border border-[#6F8F72]/30">
                <span className="text-[10px] text-[#DCE8D5]/70 uppercase block font-semibold">{t('costLabel')} 2</span>
                <span className="text-sm font-bold text-amber-200 block mt-0.5">{t('otherCost')}</span>
                <span className="text-[10px] text-[#DCE8D5]/60 block mt-0.5">({t('otherCostUnit')})</span>
              </div>

              <div className="text-xl font-bold text-[#C9A227] hidden md:block">=</div>

              <div className="p-3 rounded-xl bg-[#C9A227] text-[#173F2A] font-extrabold shadow-sm col-span-2 md:col-span-1">
                <span className="text-[10px] text-[#173F2A]/80 uppercase block font-bold">{t('outcome')}</span>
                <span className="text-sm font-black block mt-0.5">{t('trueProfit')}</span>
                <span className="text-[10px] text-[#173F2A]/70 block mt-0.5">({t('trueProfitUnit')})</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Four Steps Section */}
      <div className="mb-20">
        <div className="text-center mb-12">
          <span className="text-xs font-bold uppercase tracking-wider text-[#68736B]">
            {t('stepProcess')}
          </span>
          <h3 className="text-2xl sm:text-3xl font-extrabold text-[#173F2A] mt-1">
            {t('fourSteps')}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((st) => {
            const Icon = st.icon
            return (
              <div
                key={st.num}
                className="premium-card lift-card rounded-3xl p-6 sm:p-8 flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <span className="font-mono text-2xl font-black text-[#DCE8D5] group-hover:text-[#6F8F72] transition-colors">
                      {st.num}
                    </span>
                    <div className="w-10 h-10 rounded-xl bg-[#DCE8D5]/60 flex items-center justify-center text-[#173F2A]">
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>

                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#68736B] mb-1">
                    {st.title}
                  </h4>
                  <h5 className="text-lg font-bold text-[#173F2A] mb-3">
                    {st.desc}
                  </h5>
                  <p className="text-sm text-[#68736B] leading-relaxed">
                    {st.detail}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* CTA Box */}
      <div className="text-center bg-[#DCE8D5]/50 border border-[#6F8F72]/30 rounded-3xl p-8 sm:p-12 shadow-sm">
        <h3 className="text-2xl sm:text-3xl font-extrabold text-[#173F2A] mb-3">
          {t('readyTitle')}
        </h3>
        <p className="text-sm sm:text-base text-[#68736B] max-w-xl mx-auto mb-6">
          {t('readyDesc')}
        </p>
        <button
          onClick={onGetStarted}
          className="px-8 py-4 rounded-full bg-[#173F2A] hover:bg-[#24543A] text-[#FFFDF7] font-bold text-sm sm:text-base transition-all shadow-md hover:shadow-lg inline-flex items-center gap-2 cursor-pointer"
        >
          <span>{t('calculateHarvest')}</span>
          <ArrowRight className="w-4 h-4 text-[#DCE8D5]" />
        </button>
      </div>
    </section>
  )
}
