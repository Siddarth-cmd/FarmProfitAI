import React from 'react'
import { Sprout, Heart } from 'lucide-react'
import { useLanguage } from '../localization'

const COPYRIGHT_YEAR = new Date().getFullYear()

export default function Footer({ onNavigate }) {
  const { t } = useLanguage()
  return (
    <footer className="bg-[#1D201C] text-[#E6EDE0] border-t border-[#3A472E] py-12 md:py-16 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-10 border-b border-white/10">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-[#9CAF88] flex items-center justify-center text-[#1D201C] shadow-sm">
                <Sprout className="w-5 h-5 text-[#1D201C]" />
              </div>
              <span className="font-extrabold text-xl tracking-tight text-white">
                FarmProfit <span className="text-[#CC5500]">AI</span>
              </span>
            </div>
            <p className="text-sm text-[#A7A7A7] max-w-sm leading-relaxed">
              {t('footerTagline')}
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#9CAF88] mb-3">
              {t('platform')}
            </h4>
            <ul className="space-y-2 text-sm text-[#A7A7A7]">
              <li>
                <button
                  onClick={() => onNavigate('home')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  {t('profitEngine')}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('forecast')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  {t('navForecast') || 'AI Forecast'}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('markets')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  {t('marketExplorer')}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('how-it-works')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  {t('navHow')}
                </button>
              </li>
            </ul>
          </div>

          {/* Transparency & Data */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#9CAF88] mb-3">
              {t('dataSources')}
            </h4>
            <p className="text-xs text-[#A7A7A7] leading-relaxed mb-2">
              {t('dataSourceDesc')}
            </p>
            <span className="inline-block px-2.5 py-1 rounded-md bg-[#3A472E] text-[10px] text-[#9CAF88] font-mono border border-[#5E724C]">
              Karnataka APMC • Agmarknet
            </span>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#A7A7A7]">
          <div>
            © {COPYRIGHT_YEAR} FarmProfit AI. {t('footerBottom')}
          </div>
          <div className="flex items-center gap-1.5">
            <span>{t('builtFor')}</span>
            <Heart className="w-3.5 h-3.5 text-[#CC5500] fill-[#CC5500]" />
          </div>
        </div>
      </div>
    </footer>
  )
}
