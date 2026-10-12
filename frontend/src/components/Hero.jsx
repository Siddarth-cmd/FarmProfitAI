import React from 'react'
import { ArrowRight, Sparkles, ShieldCheck, Route, Scale, Sprout } from 'lucide-react'

import { useLanguage } from '../localization'

export default function Hero({ onFindMarket, onExploreMarkets }) {
  const { t } = useLanguage()
  return (
    <section className="field-shell relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28">
      <div className="absolute inset-0 pointer-events-none opacity-55 select-none overflow-hidden">
        <svg
          className="w-full h-full text-[#6F8F72]/25"
          viewBox="0 0 1440 600"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M-100 200 C 300 120, 600 350, 1000 180 C 1200 100, 1400 250, 1600 200"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="4 6"
          />
          <path
            d="M-50 350 C 350 250, 700 480, 1100 320 C 1300 240, 1500 380, 1700 320"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M0 480 C 400 380, 800 580, 1200 420 C 1400 340, 1600 460, 1800 420"
            stroke="currentColor"
            strokeWidth="1"
          />
          <circle cx="950" cy="180" r="4" fill="#C9A227" />
          <circle cx="1100" cy="320" r="4" fill="#173F2A" />
          <circle cx="450" cy="300" r="3" fill="#6F8F72" />
          <path
            d="M1010 430 C1080 380 1175 390 1238 455 C1160 486 1078 482 1010 430Z"
            fill="#DCE8D5"
            opacity="0.42"
          />
          <path
            d="M168 138 C224 100 296 112 338 170 C274 192 215 183 168 138Z"
            fill="#DCE8D5"
            opacity="0.34"
          />
        </svg>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="max-w-4xl mx-auto text-center reveal-soft">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#DCE8D5]/70 border border-[#6F8F72]/30 text-[#173F2A] text-xs font-semibold tracking-wider uppercase mb-6 shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-[#C9A227]" />
            <span>{t('heroBadge')}</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold text-[#173F2A] tracking-tight leading-[1.06] mb-6">
            {t('heroTitle')} <br className="hidden sm:inline" />
            <span className="text-[#24543A] decoration-[#C9A227]/50 underline decoration-wavy decoration-2 underline-offset-8">
              {t('heroTitleAccent')}
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-[#68736B] leading-relaxed mb-10 max-w-2xl mx-auto font-normal">
            {t('heroDescription')}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <button
              onClick={onFindMarket}
              className="w-full sm:w-auto px-8 py-4 rounded-full text-base font-semibold text-[#FFFDF7] bg-[#173F2A] hover:bg-[#24543A] active:scale-98 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-3 cursor-pointer group"
            >
              <Sprout className="w-4 h-4 text-[#DCE8D5]" />
              <span>{t('findMarket')}</span>
              <ArrowRight className="w-4 h-4 text-[#DCE8D5] group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              onClick={onExploreMarkets}
              className="w-full sm:w-auto px-7 py-4 rounded-full text-base font-medium text-[#173F2A] bg-[#FFFDF7] hover:bg-[#EFEADB] border border-[#E4E1D7] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <span>{t('exploreMarkets')}</span>
              <span className="text-[#C9A227] font-bold">→</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-[#E4E1D7]/70 text-left">
            <div className="lift-card flex items-start gap-3 p-4 rounded-2xl bg-[#FFFDF7]/82 border border-[#E4E1D7]/70 backdrop-blur-xs">
              <div className="p-2 rounded-lg bg-[#DCE8D5]/60 text-[#173F2A] shrink-0">
                <Scale className="w-4 h-4 text-[#173F2A]" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#173F2A] uppercase tracking-wide">{t('netReturnFirst')}</h4>
                <p className="text-xs text-[#68736B] mt-0.5 leading-normal">
                  {t('netReturnFirstDesc')}
                </p>
              </div>
            </div>

            <div className="lift-card flex items-start gap-3 p-4 rounded-2xl bg-[#FFFDF7]/82 border border-[#E4E1D7]/70 backdrop-blur-xs">
              <div className="p-2 rounded-lg bg-[#DCE8D5]/60 text-[#173F2A] shrink-0">
                <ShieldCheck className="w-4 h-4 text-[#173F2A]" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#173F2A] uppercase tracking-wide">{t('validatedData')}</h4>
                <p className="text-xs text-[#68736B] mt-0.5 leading-normal">
                  {t('validatedDataDesc')}
                </p>
              </div>
            </div>

            <div className="lift-card flex items-start gap-3 p-4 rounded-2xl bg-[#FFFDF7]/82 border border-[#E4E1D7]/70 backdrop-blur-xs">
              <div className="p-2 rounded-lg bg-[#DCE8D5]/60 text-[#173F2A] shrink-0">
                <Route className="w-4 h-4 text-[#173F2A]" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#173F2A] uppercase tracking-wide">{t('explainable')}</h4>
                <p className="text-xs text-[#68736B] mt-0.5 leading-normal">
                  {t('explainableDesc')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
