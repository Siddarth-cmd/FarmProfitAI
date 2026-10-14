import React from 'react'
import { Sprout, Heart } from 'lucide-react'
import { useLanguage } from '../localization'

const COPYRIGHT_YEAR = new Date().getFullYear()

export default function Footer({ onNavigate }) {
  const { t } = useLanguage()
  const handleLinkClick = (tab) => {
    onNavigate?.(tab)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <footer className="bg-[#173D2A] text-[#F6F0E1] border-t border-[#286B43]/30 py-12 md:py-16 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-10 border-b border-[#286B43]/30">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-[#E7C96B] flex items-center justify-center text-[#173D2A] shadow-sm">
                <Sprout className="w-5 h-5 text-[#173D2A]" />
              </div>
              <span className="font-extrabold text-xl tracking-tight text-[#FFFDF7] font-editorial">
                FarmProfit <span className="text-[#E7C96B]">AI</span>
              </span>
            </div>
            <p className="text-sm text-[#F6F0E1]/70 max-w-sm leading-relaxed">
              {t('footerTagline')}
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#E7C96B] mb-3">
              {t('platform')}
            </h4>
            <ul className="space-y-2 text-sm text-[#F6F0E1]/80">
              <li>
                <button
                  type="button"
                  onClick={() => handleLinkClick('home')}
                  className="hover:text-[#E7C96B] transition-colors cursor-pointer"
                >
                  {t('profitEngine')}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLinkClick('forecast')}
                  className="hover:text-[#E7C96B] transition-colors cursor-pointer"
                >
                  {t('navForecast') || 'AI Forecast'}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLinkClick('markets')}
                  className="hover:text-[#E7C96B] transition-colors cursor-pointer"
                >
                  {t('marketExplorer')}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => handleLinkClick('how-it-works')}
                  className="hover:text-[#E7C96B] transition-colors cursor-pointer"
                >
                  {t('navHow')}
                </button>
              </li>
            </ul>
          </div>

          {/* Transparency & Data */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#E7C96B] mb-3">
              {t('dataSources')}
            </h4>
            <p className="text-xs text-[#F6F0E1]/70 leading-relaxed mb-2">
              {t('dataSourceDesc')}
            </p>
            <span className="inline-block px-2.5 py-1 rounded-md bg-[#286B43]/40 text-[10px] text-[#E7C96B] font-mono border border-[#286B43]">
              Karnataka APMC • Agmarknet
            </span>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#F6F0E1]/60">
          <div>
            © {COPYRIGHT_YEAR} FarmProfit AI. {t('footerBottom')}
          </div>
          <div className="flex items-center gap-1.5">
            <span>{t('builtFor')}</span>
            <Heart className="w-3.5 h-3.5 text-[#E7C96B] fill-[#E7C96B]" />
          </div>
        </div>
      </div>
    </footer>
  )
}
