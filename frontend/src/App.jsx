import React, { useEffect, useState, useRef } from 'react'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import FarmerInput from './components/FarmerInput'
import RecommendationResult from './components/RecommendationResult'
import WhatIfSimulator from './components/WhatIfSimulator'
import MarketExplorer from './components/MarketExplorer'
import AIForkcastExplorer from './components/AIForkcastExplorer'
import HowItWorks from './components/HowItWorks'
import Footer from './components/Footer'
import { getRecommendation } from './services/api'
import { AlertCircle } from 'lucide-react'
import { LanguageProvider, localizeBackendText, useLanguage } from './localization'

function FarmProfitApp() {
  const { language, t } = useLanguage()
  const [activeTab, setActiveTab] = useState('home')
  const [isLoading, setIsLoading] = useState(false)
  const [recommendation, setRecommendation] = useState(null)
  const [recommendationMeta, setRecommendationMeta] = useState(null)
  const [errorMessage, setErrorMessage] = useState(null)

  const resultRef = useRef(null)

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  // Scroll helpers
  const scrollToInput = () => {
    setActiveTab('home')
    setTimeout(() => {
      const el = document.getElementById('farmer-input')
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' })
      }
    }, 100)
  }

  const handleRecommendationSubmit = async (payload) => {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const res = await getRecommendation(payload)

      if (res.available && res.recommendation) {
        setRecommendation(res.recommendation)
        setRecommendationMeta({ source: res.source, usingFallback: res.using_fallback })
        setTimeout(() => {
          const resEl = document.getElementById('recommendation-result')
          if (resEl) {
            resEl.scrollIntoView({ behavior: 'smooth' })
          }
        }, 150)
      } else {
        setErrorMessage(res.error?.message || 'No market data is available for this crop to generate a recommendation.')
      }
    } catch {
      setErrorMessage('Could not reach the recommendation engine. Check that backend is running.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    setRecommendation(null)
    setRecommendationMeta(null)
    setErrorMessage(null)
    scrollToInput()
  }

  return (
    <div className="min-h-screen bg-[#F7F3E8] text-[#1E2921] flex flex-col font-sans selection:bg-[#DCE8D5] selection:text-[#173F2A]">
      {/* Main Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onGetStarted={scrollToInput}
      />

      {/* Main Tab Content */}
      <main className="flex-1">
        {activeTab === 'home' && (
          <>
            <Hero
              onFindMarket={scrollToInput}
              onExploreMarkets={() => {
                setActiveTab('markets')
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            />

            {/* Error banner if recommendation failed */}
            {errorMessage && (
              <div className="max-w-4xl mx-auto px-4 mb-6">
                <div className="p-4 sm:p-5 rounded-2xl bg-[#FFFDF7] border border-amber-200 text-amber-900 flex items-start gap-3 shadow-sm">
                  <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <div className="flex items-start gap-3">
                    <div>
                      <h4 className="font-bold text-sm">{t('marketDataNotice')}</h4>
                      <p className="text-xs sm:text-sm text-amber-800 mt-0.5">
                      {localizeBackendText(language, errorMessage)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Farmer Input Section */}
            <FarmerInput
              onSubmit={handleRecommendationSubmit}
              isLoading={isLoading}
            />

            {/* Recommendation Result Section */}
            {recommendation && (
              <div ref={resultRef}>
                <RecommendationResult
                  data={recommendation}
                  meta={recommendationMeta}
                  onReset={handleReset}
                />
                <WhatIfSimulator
                  data={recommendation}
                  meta={recommendationMeta}
                />
              </div>
            )}
          </>
        )}

        {activeTab === 'forecast' && (
          <AIForkcastExplorer />
        )}

        {activeTab === 'markets' && (
          <MarketExplorer />
        )}

        {activeTab === 'how-it-works' && (
          <HowItWorks onGetStarted={scrollToInput} />
        )}
      </main>

      {/* Footer */}
      <Footer onNavigate={setActiveTab} />
    </div>
  )
}

export default function App() {
  return (
    <LanguageProvider>
      <FarmProfitApp />
    </LanguageProvider>
  )
}
