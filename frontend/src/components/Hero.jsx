import React from 'react'
import { ArrowRight, Sparkles, ShieldCheck, Route, Scale, Sprout, Compass, CheckCircle2 } from 'lucide-react'
import { useLanguage } from '../localization'

export default function Hero({ onFindMarket, onExploreMarkets }) {
  const { language, t } = useLanguage()
  const isKn = language === 'kn'

  return (
    <section className="relative overflow-hidden pt-14 pb-20 md:pt-20 md:pb-28 hero-botanical-sage">
      {/* Soft directional sunlight atmosphere */}
      <div className="absolute inset-0 pointer-events-none hero-sunlight-overlay" aria-hidden="true" />

      {/* Subtle botanical leaf silhouettes and topography contours */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden" aria-hidden="true">
        <svg
          className="absolute top-0 left-0 w-full h-full"
          viewBox="0 0 1440 640"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid slice"
        >
          {/* Top-left leaf cluster */}
          <path
            d="M-30 90 C 60 20, 180 60, 200 160 C 110 180, 40 150, -30 90 Z"
            fill="#3A472E"
            opacity="0.16"
          />
          <path
            d="M10 210 C 80 140, 180 160, 190 260 C 100 285, 30 255, 10 210 Z"
            fill="#2A3B23"
            opacity="0.10"
          />
          {/* Top-right leaf cluster */}
          <path
            d="M1280 50 C 1360 -20, 1460 30, 1470 130 C 1380 155, 1290 115, 1280 50 Z"
            fill="#3A472E"
            opacity="0.14"
          />
          {/* Horizontal contour lines */}
          <path
            d="M0 360 C 320 290, 680 430, 1060 310 C 1220 265, 1380 330, 1440 300"
            stroke="#3A472E"
            strokeWidth="1"
            opacity="0.18"
            fill="none"
          />
          {/* Subtle amber accent dot */}
          <circle cx="1060" cy="300" r="4" fill="#CC5500" opacity="0.45" />
        </svg>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Recomposed Editorial Hero Container: Focused, intentional, centered layout */}
        <div className="max-w-4xl mx-auto text-center reveal-soft mb-16" lang={language}>
          {/* Category badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#F4F6F1]/85 border border-[#A7A7A7]/40 text-[#1E3019] text-xs font-bold tracking-widest uppercase mb-6 backdrop-blur-sm shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-[#CC5500] shrink-0" />
            <span>{t('heroBadge')}</span>
          </div>

          {/* Main headline */}
          <h1
            className="hero-headline text-[#0F1E0C] mb-6 tracking-tight"
            style={{
              fontFamily: isKn ? "'Noto Sans Kannada', 'Tunga', sans-serif" : "'Newsreader', Georgia, serif",
            }}
          >
            {t('heroTitle')}{' '}
            <span
              className={`${isKn ? '' : 'italic font-normal'} text-[#1A2F17] inline-block`}
              style={{
                textDecoration: 'underline',
                textDecorationColor: 'rgba(204,85,0,0.65)',
                textDecorationStyle: 'wavy',
                textUnderlineOffset: '8px',
              }}
            >
              {t('heroTitleAccent')}
            </span>
          </h1>

          {/* Supporting description */}
          <p className={`text-[#1A2F17] leading-relaxed mb-8 max-w-2xl mx-auto ${isKn ? 'text-base sm:text-lg font-medium' : 'text-lg sm:text-xl'}`}>
            {t('heroDescription')}
          </p>

          {/* Dual Action CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <button
              id="hero-find-market-btn"
              onClick={onFindMarket}
              className="btn-primary w-full sm:w-auto"
            >
              <Sprout className="w-4 h-4 text-[#9CAF88] shrink-0" />
              <span>{t('findMarket')}</span>
              <ArrowRight className="w-4 h-4 opacity-75 shrink-0" />
            </button>

            <button
              id="hero-explore-markets-btn"
              onClick={onExploreMarkets}
              className="btn-secondary w-full sm:w-auto"
            >
              <Compass className="w-4 h-4 text-[#CC5500] shrink-0" />
              <span>{t('exploreMarkets')}</span>
              <ArrowRight className="w-4 h-4 text-[#CC5500] shrink-0" />
            </button>
          </div>

          {/* Live System Trust Signals Ribbon */}
          <div className="inline-flex flex-wrap items-center justify-center gap-3 px-5 py-2.5 rounded-2xl bg-[#F4F6F1]/70 border border-[#A7A7A7]/40 text-xs text-[#1E3019] backdrop-blur-sm shadow-xs">
            <div className="flex items-center gap-1.5 font-bold text-[#5E724C]">
              <span className="w-2 h-2 rounded-full bg-[#5E724C] animate-pulse" />
              <span>7 Database Crops</span>
            </div>
            <span className="text-[#A7A7A7]">•</span>
            <span className="inline-flex items-center gap-1 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#5E724C]" />
              Agmarknet Verified Mandi Rates
            </span>
            <span className="text-[#A7A7A7]">•</span>
            <span className="font-medium">Karnataka PWD Highway Routes</span>
          </div>
        </div>

        {/* Value Proposition Highlights: 3 Refined Botanical Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-10 border-t border-[#3A472E]/25 text-left">
          {[
            { icon: Scale,       titleKey: 'netReturnFirst',  descKey: 'netReturnFirstDesc' },
            { icon: ShieldCheck, titleKey: 'validatedData',   descKey: 'validatedDataDesc' },
            { icon: Route,       titleKey: 'explainable',     descKey: 'explainableDesc' },
          ].map(({ icon: Icon, titleKey, descKey }) => (
            <div
              key={titleKey}
              className="flex items-start gap-3.5 p-5 rounded-2xl bg-[#F4F6F1]/80 border border-[#A7A7A7]/35 backdrop-blur-sm hover:border-[#9CAF88] hover:bg-[#F4F6F1]/95 transition-all shadow-xs"
            >
              <div className="p-2.5 rounded-xl bg-[#5E724C] text-white shrink-0 shadow-xs">
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#0F1E0C] uppercase tracking-wider">{t(titleKey)}</h4>
                <p className="text-xs sm:text-sm text-[#1E3019] mt-1 leading-snug">{t(descKey)}</p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  )
}
