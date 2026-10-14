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
    <header className="sticky top-0 z-50 bg-[#173D2A]/95 backdrop-blur-md border-b border-[#286B43]/35 shadow-sm transition-all text-[#FFFDF7]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-18 py-3">

          {/* Logo */}
          <div
            id="nav-logo"
            onClick={() => handleNavClick('home')}
            className="flex items-center gap-3 cursor-pointer group shrink-0"
          >
            <div className="w-10 h-10 rounded-xl bg-[#286B43] border border-[#E7C96B]/40 flex items-center justify-center shadow-xs transition-transform duration-200 group-hover:scale-105">
              <Sprout className="w-5 h-5 text-[#E7C96B]" />
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight text-[#FFFDF7] block leading-tight">
                FarmProfit <span className="text-[#E7C96B]">AI</span>
              </span>
              <span className="text-[10px] uppercase tracking-widest text-[#F6F0E1]/70 font-semibold block">
                {t('tagline')}
              </span>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6 lg:gap-8" aria-label="Main navigation">
            {navLinks.map((link) => (
              <button
                key={link.id}
                id={`nav-${link.id}`}
                onClick={() => handleNavClick(link.id)}
                className={`text-sm font-semibold transition-colors py-2 relative cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-[#E7C96B] ${
                  activeTab === link.id
                    ? 'text-[#FFFDF7]'
                    : 'text-[#F6F0E1]/75 hover:text-[#FFFDF7]'
                }`}
              >
                {link.label}
                {activeTab === link.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#E7C96B] rounded-full" />
                )}
              </button>
            ))}
          </nav>

          {/* Language switcher + Get Started CTA */}
          <div className="hidden md:flex items-center gap-3 shrink-0">
            {/* Segmented language control */}
            <div className="flex items-center rounded-full border border-[#286B43] bg-[#0E261A]/80 p-0.5 shadow-inner">
              <button
                type="button"
                id="lang-kn"
                onClick={() => setLanguage('kn')}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  language === 'kn'
                    ? 'bg-[#E7C96B] text-[#173D2A] shadow-xs'
                    : 'text-[#F6F0E1]/70 hover:text-[#FFFDF7]'
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
                    ? 'bg-[#E7C96B] text-[#173D2A] shadow-xs'
                    : 'text-[#F6F0E1]/70 hover:text-[#FFFDF7]'
                }`}
              >
                EN
              </button>
            </div>

            <button
              id="nav-get-started"
              onClick={() => { setActiveTab('home'); onGetStarted?.() }}
              className="btn-gold text-sm px-5 py-2.5 shadow-xs"
            >
              <span>{t('getStarted')}</span>
              <ArrowUpRight className="w-4 h-4 shrink-0 text-[#173D2A]" />
            </button>
          </div>

          {/* Mobile: language + hamburger */}
          <div className="flex md:hidden items-center gap-2">
            <div className="flex items-center rounded-full border border-[#286B43] bg-[#0E261A]/80 p-0.5">
              <button
                type="button"
                onClick={() => setLanguage('kn')}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer ${
                  language === 'kn' ? 'bg-[#E7C96B] text-[#173D2A]' : 'text-[#F6F0E1]/70'
                }`}
              >
                ಕನ್ನಡ
              </button>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer ${
                  language === 'en' ? 'bg-[#E7C96B] text-[#173D2A]' : 'text-[#F6F0E1]/70'
                }`}
              >
                EN
              </button>
            </div>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl text-[#FFFDF7] hover:bg-[#286B43]/50 transition-colors cursor-pointer border border-[#286B43]"
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
        <div className="md:hidden border-t border-[#286B43]/40 bg-[#173D2A] px-4 pt-3 pb-6 space-y-1 shadow-lg reveal-soft">
          {navLinks.map((link) => (
            <button
              key={link.id}
              onClick={() => handleNavClick(link.id)}
              className={`block w-full text-left px-4 py-3 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                activeTab === link.id
                  ? 'bg-[#286B43] text-[#FFFDF7]'
                  : 'text-[#F6F0E1]/80 hover:bg-[#286B43]/40 hover:text-[#FFFDF7]'
              }`}
            >
              {link.label}
            </button>
          ))}
          <div className="pt-2">
            <button
              onClick={() => { setActiveTab('home'); setMobileMenuOpen(false); onGetStarted?.() }}
              className="btn-gold w-full py-3 text-sm justify-center"
            >
              <span>{t('getStarted')}</span>
              <ArrowUpRight className="w-4 h-4 shrink-0 text-[#173D2A]" />
            </button>
          </div>
        </div>
      )}
    </header>
  )
}
