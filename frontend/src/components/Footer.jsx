import React from 'react'
import { Sprout, Heart } from 'lucide-react'
import { useLanguage } from '../localization'

const COPYRIGHT_YEAR = new Date().getFullYear()

export default function Footer({ onNavigate }) {
  const { t } = useLanguage()
  return (
    <footer className="bg-[#173F2A] text-[#FFFDF7] border-t border-[#24543A] py-12 md:py-16 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-10 border-b border-[#DCE8D5]/10">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[#24543A] flex items-center justify-center text-[#DCE8D5]">
                <Sprout className="w-4 h-4 text-[#DCE8D5]" />
              </div>
              <span className="font-extrabold text-lg tracking-tight text-[#FFFDF7]">
                FarmProfit <span className="text-[#C9A227]">AI</span>
              </span>
            </div>
            <p className="text-sm text-[#DCE8D5]/70 max-w-sm leading-relaxed">
              {t('footerTagline')}
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#C9A227] mb-3">
              {t('platform')}
            </h4>
            <ul className="space-y-2 text-sm text-[#DCE8D5]/80">
              <li>
                <button
                  onClick={() => onNavigate('home')}
                  className="hover:text-[#FFFDF7] transition-colors cursor-pointer"
                >
                  {t('profitEngine')}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('markets')}
                  className="hover:text-[#FFFDF7] transition-colors cursor-pointer"
                >
                  {t('marketExplorer')}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('how-it-works')}
                  className="hover:text-[#FFFDF7] transition-colors cursor-pointer"
                >
                  {t('navHow')}
                </button>
              </li>
            </ul>
          </div>

          {/* Transparency & Data */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#C9A227] mb-3">
              {t('dataSources')}
            </h4>
            <p className="text-xs text-[#DCE8D5]/70 leading-relaxed mb-2">
              {t('dataSourceDesc')}
            </p>
            <span className="inline-block px-2.5 py-1 rounded-md bg-[#24543A] text-[10px] text-[#DCE8D5] font-mono">
              v0.1.0 MVP
            </span>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#DCE8D5]/60">
          <div>
            © {COPYRIGHT_YEAR} FarmProfit AI. {t('footerBottom')}
          </div>
          <div className="flex items-center gap-1">
            <span>{t('builtFor')}</span>
            <Heart className="w-3.5 h-3.5 text-[#C9A227] fill-[#C9A227]" />
          </div>
        </div>
      </div>
    </footer>
  )
}
