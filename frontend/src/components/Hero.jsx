import React from 'react'
import { ArrowRight, Sparkles, ShieldCheck, Route, Scale, Sprout, Compass, CheckCircle2 } from 'lucide-react'
import { useLanguage } from '../localization'

export default function Hero({ onFindMarket, onExploreMarkets }) {
  const { language, t } = useLanguage()
  const isKn = language === 'kn'

  return (
    <section className="relative overflow-hidden pt-16 pb-20 md:pt-24 md:pb-32 hero-cinematic-farmland">
      {/* Golden hour sunlight diffusion overlay */}
      <div className="absolute inset-0 pointer-events-none hero-golden-hour-overlay" aria-hidden="true" />

      {/* Subtle organic botanical topography contours */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden" aria-hidden="true">
        <svg
          className="absolute top-0 left-0 w-full h-full opacity-20"
          viewBox="0 0 1440 640"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid slice"
        >
          <path
            d="M0 420 C 320 340, 680 480, 1060 360 C 1220 315, 1380 380, 1440 350"
            stroke="#E7C96B"
            strokeWidth="1.5"
            strokeDasharray="6 6"
            fill="none"
          />
          <circle cx="1060" cy="360" r="5" fill="#E7C96B" />
        </svg>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Editorial Hero Container: Centered, high-contrast typography */}
        <div className="max-w-4xl mx-auto text-center reveal-soft mb-16" lang={language}>
          {/* Category badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#112F20]/80 border border-[#E7C96B]/50 text-[#E7C96B] text-xs font-bold tracking-widest uppercase mb-6 backdrop-blur-md shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-[#E7C96B] shrink-0" />
            <span>{t('heroBadge')}</span>
          </div>

          {/* Main headline */}
          <h1
            className="hero-headline mb-6 tracking-tight drop-shadow-sm"
            style={{
              fontFamily: isKn ? "'Noto Sans Kannada', 'Tunga', sans-serif" : "'Newsreader', Georgia, serif",
            }}
          >
            {t('heroTitle')}{' '}
            <span
              className={`${isKn ? '' : 'italic font-normal'} text-[#E7C96B] inline-block`}
              style={{
                textDecoration: 'underline',
                textDecorationColor: '#E7C96B',
                textDecorationStyle: 'wavy',
                textUnderlineOffset: '8px',
              }}
            >
              {t('heroTitleAccent')}
            </span>
          </h1>

          {/* Supporting description */}
          <p className={`text-[#F6F0E1]/90 leading-relaxed mb-8 max-w-2xl mx-auto ${isKn ? 'text-base sm:text-lg font-medium' : 'text-lg sm:text-xl'}`}>
            {t('heroDescription')}
          </p>

          {/* Dual Action CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-9">
            <button
              id="hero-find-market-btn"
              onClick={onFindMarket}
              className="btn-gold w-full sm:w-auto text-base px-7 py-3.5 shadow-md"
            >
              <Sprout className="w-5 h-5 text-[#173D2A] shrink-0" />
              <span>{t('findMarket')}</span>
              <ArrowRight className="w-5 h-5 text-[#173D2A] shrink-0" />
            </button>

            <button
              id="hero-explore-markets-btn"
              onClick={onExploreMarkets}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full font-bold text-sm sm:text-base text-[#FFFDF7] bg-[#173D2A]/70 hover:bg-[#286B43] border border-[#E7C96B]/40 hover:border-[#E7C96B] transition-all shadow-xs backdrop-blur-sm w-full sm:w-auto cursor-pointer"
            >
              <Compass className="w-5 h-5 text-[#E7C96B] shrink-0" />
              <span>{t('exploreMarkets')}</span>
              <ArrowRight className="w-4 h-4 text-[#E7C96B] shrink-0" />
            </button>
          </div>

          {/* Live System Trust Signals Ribbon */}
          <div className="inline-flex flex-wrap items-center justify-center gap-3 px-5 py-2.5 rounded-2xl bg-[#0E261A]/80 border border-[#286B43] text-xs text-[#F6F0E1] backdrop-blur-md shadow-xs">
            <div className="flex items-center gap-1.5 font-bold text-[#E7C96B]">
              <span className="w-2 h-2 rounded-full bg-[#E7C96B] animate-pulse" />
              <span>{t('trustDatabaseCrops')}</span>
            </div>
            <span className="text-[#286B43]">•</span>
            <span className="inline-flex items-center gap-1 font-medium text-[#FFFDF7]">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#E7C96B]" />
              {t('trustAgmarknetRates')}
            </span>
            <span className="text-[#286B43]">•</span>
            <span className="font-medium text-[#F6F0E1]/80">{t('trustHighwayRoutes')}</span>
          </div>
        </div>

        {/* Value Proposition Highlights: 3 Refined Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-10 border-t border-[#286B43]/50 text-left">
          {[
            { icon: Scale,       titleKey: 'netReturnFirst',  descKey: 'netReturnFirstDesc' },
            { icon: ShieldCheck, titleKey: 'validatedData',   descKey: 'validatedDataDesc' },
            { icon: Route,       titleKey: 'explainable',     descKey: 'explainableDesc' },
          ].map(({ icon: Icon, titleKey, descKey }) => (
            <div
              key={titleKey}
              className="flex items-start gap-3.5 p-5 rounded-2xl bg-[#FFFDF7]/95 border border-[#286B43]/20 hover:border-[#E7C96B] hover:shadow-md transition-all text-[#20291F] shadow-sm"
            >
              <div className="p-2.5 rounded-xl bg-[#173D2A] text-[#E7C96B] shrink-0 shadow-xs">
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#173D2A] uppercase tracking-wider">{t(titleKey)}</h4>
                <p className="text-xs sm:text-sm text-[#52604D] mt-1 leading-snug">{t(descKey)}</p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  )
}
