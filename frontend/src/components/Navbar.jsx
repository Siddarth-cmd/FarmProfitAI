import React, { useState } from 'react'
import { Sprout, Menu, X, ArrowUpRight } from 'lucide-react'
import { useLanguage } from '../localization'

export default function Navbar({ activeTab, setActiveTab, onGetStarted }) {
  const { language, setLanguage, t } = useLanguage()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const navLinks = [
    { id: 'home',         label: t('navHome') },
    { id: 'forecast',     label: t('navForecast') || 'AI Forecast' },
    { id: 'markets',      label: t('navMarkets') },
    { id: 'how-it-works', label: t('navHow') },
  ]

  const handleNavClick = (id) => {
    setActiveTab(id)
    setMobileMenuOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <header className="sticky top-0 z-50 bg-[#EBF0E6]/95 backdrop-blur-md border-b border-[rgba(94,114,76,0.22)] transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-18 py-3">

          {/* Logo */}
          <div
            id="nav-logo"
            onClick={() => handleNavClick('home')}
            className="flex items-center gap-3 cursor-pointer group shrink-0"
          >
            <div className="w-10 h-10 rounded-xl bg-[#9CAF88] flex items-center justify-center shadow-sm border border-[#7D9870] transition-transform duration-200 group-hover:scale-105">
              <Sprout className="w-5 h-5 text-[#192616]" />
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight text-[#1D201C] block leading-tight">
                FarmProfit <span className="text-[#CC5500]">AI</span>
              </span>
              <span className="text-[10px] uppercase tracking-widest text-[#4A5742] font-semibold block">
                {t('tagline')}
              </span>
            </div>
          </div>

          {/* Desktop Navigation — four labels with enough gap */}
          <nav className="hidden md:flex items-center gap-6 lg:gap-8" aria-label="Main navigation">
            {navLinks.map((link) => (
              <button
                key={link.id}
                id={`nav-${link.id}`}
                onClick={() => handleNavClick(link.id)}
                className={`text-sm font-semibold transition-colors py-2 relative cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-[#9CAF88] ${
                  activeTab === link.id
                    ? 'text-[#1D201C]'
                    : 'text-[#4A5742] hover:text-[#1D201C]'
                }`}
              >
                {link.label}
                {activeTab === link.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#9CAF88] rounded-full" />
                )}
              </button>
            ))}
          </nav>

          {/* Language switcher + Get Started CTA */}
          <div className="hidden md:flex items-center gap-3 shrink-0">
            {/* Segmented language control */}
            <div className="flex items-center rounded-full border border-[rgba(94,114,76,0.30)] bg-[#F4F6F1] p-0.5">
              <button
                type="button"
                id="lang-kn"
                onClick={() => setLanguage('kn')}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  language === 'kn'
                    ? 'bg-[#9CAF88] text-[#192616] shadow-sm'
                    : 'text-[#4A5742] hover:text-[#1D201C]'
                }`}
              >
                ಕನ್ನಡ
              </button>
              <button
                type="button"
                id="lang-en"
                onClick={() => setLanguage('en')}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  language === 'en'
                    ? 'bg-[#9CAF88] text-[#192616] shadow-sm'
                    : 'text-[#4A5742] hover:text-[#1D201C]'
                }`}
              >
                EN
              </button>
            </div>

            <button
              id="nav-get-started"
              onClick={() => { setActiveTab('home'); onGetStarted?.() }}
              className="btn-primary text-sm px-5 py-2.5"
            >
              <span>{t('getStarted')}</span>
              <ArrowUpRight className="w-4 h-4 opacity-80 shrink-0" />
            </button>
          </div>

          {/* Mobile: language + hamburger */}
          <div className="flex md:hidden items-center gap-2">
            <div className="flex items-center rounded-full border border-[rgba(94,114,76,0.25)] bg-[#F4F6F1] p-0.5">
              <button
                type="button"
                onClick={() => setLanguage('kn')}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer ${
                  language === 'kn' ? 'bg-[#9CAF88] text-[#192616]' : 'text-[#4A5742]'
                }`}
              >
                ಕನ್ನಡ
              </button>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer ${
                  language === 'en' ? 'bg-[#9CAF88] text-[#192616]' : 'text-[#4A5742]'
                }`}
              >
                EN
              </button>
            </div>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl text-[#1D201C] hover:bg-[#E6EDE0] transition-colors cursor-pointer border border-[rgba(94,114,76,0.22)]"
              aria-label={t('menuToggle') || 'Toggle menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[rgba(94,114,76,0.18)] bg-[#EBF0E6] px-4 pt-3 pb-6 space-y-1 shadow-md reveal-soft">
          {navLinks.map((link) => (
            <button
              key={link.id}
              onClick={() => handleNavClick(link.id)}
              className={`block w-full text-left px-4 py-3 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                activeTab === link.id
                  ? 'bg-[#9CAF88]/30 text-[#1D201C]'
                  : 'text-[#4A5742] hover:bg-[#9CAF88]/15 hover:text-[#1D201C]'
              }`}
            >
              {link.label}
            </button>
          ))}
          <div className="pt-2">
            <button
              onClick={() => { setActiveTab('home'); setMobileMenuOpen(false); onGetStarted?.() }}
              className="btn-primary w-full py-3 text-sm"
            >
              <span>{t('getStarted')}</span>
              <ArrowUpRight className="w-4 h-4 opacity-80 shrink-0" />
            </button>
          </div>
        </div>
      )}
    </header>
  )
}
