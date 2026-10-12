import React, { useState } from 'react'
import { Sprout, Menu, X, ArrowUpRight } from 'lucide-react'
import { useLanguage } from '../localization'

export default function Navbar({ activeTab, setActiveTab, onGetStarted }) {
  const { language, setLanguage, t } = useLanguage()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const navLinks = [
    { id: 'home', label: t('navHome') },
    { id: 'forecast', label: 'AI Forecast' },
    { id: 'markets', label: t('navMarkets') },
    { id: 'how-it-works', label: t('navHow') },
  ]

  const handleNavClick = (id) => {
    setActiveTab(id)
    setMobileMenuOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <header className="sticky top-0 z-50 bg-[#FFFDF7]/92 backdrop-blur-md border-b border-[#E4E1D7] transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <div
            onClick={() => handleNavClick('home')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-[#173F2A] flex items-center justify-center text-[#DCE8D5] shadow-sm transition-transform duration-300 group-hover:scale-105">
              <Sprout className="w-5 h-5 text-[#DCE8D5]" />
            </div>
            <div>
              <span className="font-extrabold text-xl tracking-tight text-[#173F2A] block leading-tight">
                FarmProfit <span className="text-[#C9A227] font-semibold">AI</span>
              </span>
              <span className="text-[10px] uppercase tracking-widest text-[#68736B] font-medium block">
                {t('tagline')}
              </span>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => handleNavClick(link.id)}
              className={`text-sm font-medium transition-colors py-2 relative cursor-pointer ${
                  activeTab === link.id
                    ? 'text-[#173F2A] font-semibold'
                    : 'text-[#68736B] hover:text-[#173F2A]'
                }`}
              >
                {link.label}
                {activeTab === link.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#173F2A] rounded-full animate-in fade-in duration-200" />
                )}
              </button>
            ))}
          </nav>

          {/* CTA Action */}
          <div className="hidden md:flex items-center gap-4">
            <div className="flex items-center rounded-full border border-[#E4E1D7] bg-[#F7F3E8] p-1 text-xs font-bold">
              <button type="button" onClick={() => setLanguage('kn')} className={`rounded-full px-2.5 py-1.5 cursor-pointer ${language === 'kn' ? 'bg-[#173F2A] text-[#FFFDF7]' : 'text-[#68736B]'}`}>ಕನ್ನಡ</button>
              <button type="button" onClick={() => setLanguage('en')} className={`rounded-full px-2.5 py-1.5 cursor-pointer ${language === 'en' ? 'bg-[#173F2A] text-[#FFFDF7]' : 'text-[#68736B]'}`}>English</button>
            </div>
            <button
              onClick={() => {
                setActiveTab('home')
                onGetStarted?.()
              }}
              className="px-5 py-2.5 rounded-full text-sm font-semibold text-[#FFFDF7] bg-[#173F2A] hover:bg-[#24543A] active:scale-95 transition-all shadow-sm hover:shadow flex items-center gap-2 cursor-pointer"
            >
              <span>{t('getStarted')}</span>
              <ArrowUpRight className="w-4 h-4 text-[#DCE8D5]" />
            </button>
          </div>

          {/* Mobile Hamburger Button */}
          <div className="flex md:hidden">
            <div className="flex items-center mr-2 rounded-full border border-[#E4E1D7] bg-[#F7F3E8] p-1 text-[10px] font-bold">
              <button type="button" onClick={() => setLanguage('kn')} className={`rounded-full px-2 py-1 cursor-pointer ${language === 'kn' ? 'bg-[#173F2A] text-[#FFFDF7]' : 'text-[#68736B]'}`}>ಕನ್ನಡ</button>
              <button type="button" onClick={() => setLanguage('en')} className={`rounded-full px-2 py-1 cursor-pointer ${language === 'en' ? 'bg-[#173F2A] text-[#FFFDF7]' : 'text-[#68736B]'}`}>English</button>
            </div>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg text-[#1E2921] hover:bg-[#EFEADB] transition-colors cursor-pointer"
            aria-label={t('menuToggle')}
            aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-[#E4E1D7] bg-[#FFFDF7] px-4 pt-3 pb-6 space-y-3 shadow-lg reveal-soft">
          {navLinks.map((link) => (
            <button
              key={link.id}
              onClick={() => handleNavClick(link.id)}
              className={`block w-full text-left px-4 py-3 rounded-lg text-base font-medium transition-colors ${
                activeTab === link.id
                  ? 'bg-[#DCE8D5]/50 text-[#173F2A] font-semibold'
                  : 'text-[#68736B] hover:bg-[#F7F3E8]'
              }`}
            >
              {link.label}
            </button>
          ))}
          <div className="pt-2">
            <div className="flex items-center justify-center gap-1 mb-3 rounded-full border border-[#E4E1D7] bg-[#F7F3E8] p-1 text-xs font-bold">
              <button type="button" onClick={() => setLanguage('kn')} className={`rounded-full px-3 py-1.5 cursor-pointer ${language === 'kn' ? 'bg-[#173F2A] text-[#FFFDF7]' : 'text-[#68736B]'}`}>ಕನ್ನಡ</button>
              <button type="button" onClick={() => setLanguage('en')} className={`rounded-full px-3 py-1.5 cursor-pointer ${language === 'en' ? 'bg-[#173F2A] text-[#FFFDF7]' : 'text-[#68736B]'}`}>English</button>
            </div>
            <button
              onClick={() => {
                handleNavClick('home')
                setTimeout(() => onGetStarted?.(), 100)
              }}
              className="w-full py-3 rounded-xl text-center text-sm font-semibold text-[#FFFDF7] bg-[#173F2A] hover:bg-[#24543A] transition-all shadow flex items-center justify-center gap-2"
            >
              <span>{t('getStarted')}</span>
              <ArrowUpRight className="w-4 h-4 text-[#DCE8D5]" />
            </button>
          </div>
        </div>
      )}
    </header>
  )
}
