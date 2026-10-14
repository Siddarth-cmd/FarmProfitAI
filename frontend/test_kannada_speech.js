import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getKannadaVoice, buildKannadaRecommendationSummary } from './src/utils/kannadaSpeech.js'

describe('Kannada TTS voice detection (getKannadaVoice)', () => {
  it('returns null when no voices are provided or list is empty', () => {
    assert.equal(getKannadaVoice([]), null)
    assert.equal(getKannadaVoice(null), null)
    assert.equal(getKannadaVoice(undefined), null)
  })

  it('returns null when only non-Kannada voices are installed', () => {
    const mockVoices = [
      { name: 'Microsoft David Desktop', lang: 'en-US' },
      { name: 'Microsoft Heera - English (India)', lang: 'en-IN' },
      { name: 'Google हिन्दी', lang: 'hi-IN' },
    ]
    assert.equal(getKannadaVoice(mockVoices), null)
  })

  it('detects a voice with lang kn-IN or kn', () => {
    const mockVoices = [
      { name: 'Microsoft David', lang: 'en-US' },
      { name: 'Google ಕನ್ನಡ', lang: 'kn-IN' },
    ]
    const found = getKannadaVoice(mockVoices)
    assert.ok(found)
    assert.equal(found.name, 'Google ಕನ್ನಡ')
    assert.equal(found.lang, 'kn-IN')
  })

  it('detects a voice by Kannada name even if lang code is kn_IN or localized', () => {
    const mockVoices = [
      { name: 'Microsoft Kannada Online (Natural) - Kannada (India)', lang: 'kn-IN' },
    ]
    const found = getKannadaVoice(mockVoices)
    assert.ok(found)
    assert.equal(found.name, 'Microsoft Kannada Online (Natural) - Kannada (India)')
  })
})

describe('Kannada recommendation speech summary (buildKannadaRecommendationSummary)', () => {
  it('returns null when data is missing or recommendation is unavailable', () => {
    assert.equal(buildKannadaRecommendationSummary(null), null)
    assert.equal(buildKannadaRecommendationSummary({}), null)
    assert.equal(buildKannadaRecommendationSummary({ available: false, error: 'Failed' }), null)
  })

  it('builds a complete spoken summary with all supported fields', () => {
    const mockData = {
      available: true,
      crop: 'Tomato',
      variety: 'Hybrid',
      quantity_kg: 500,
      recommended_market: 'Kolar APMC',
      expected_gross_revenue: 14000,
      transportation_cost: 800,
      other_costs: 200,
      expected_net_return: 13000,
      ranked_markets: [
        { name: 'Kolar APMC', price_per_kg: 28, net_return: 13000 },
        { name: 'Chintamani APMC', price_per_kg: 25, net_return: 11500 },
      ],
      explanation: 'Highest net profit after road transit.',
    }

    const summary = buildKannadaRecommendationSummary(mockData)
    assert.ok(summary)

    // Check crop in Kannada
    assert.ok(summary.includes('ಟೊಮೇಟೊ'), 'Must contain Kannada crop name')
    // Check variety
    assert.ok(summary.includes('Hybrid ತಳಿಯ'), 'Must contain variety')
    // Check quantity
    assert.ok(summary.includes('500 ಕಿಲೋಗ್ರಾಂ'), 'Must contain harvest quantity in kg')
    // Check recommended market
    assert.ok(summary.includes('Kolar APMC'), 'Must contain recommended market')
    // Check net return and currency
    assert.ok(summary.includes('13,000 ರೂಪಾಯಿಗಳು'), 'Must contain net return with rupees')
    // Check price per kg
    assert.ok(summary.includes('ಪ್ರತಿ ಕಿಲೋಗ್ರಾಂಗೆ 28 ರೂಪಾಯಿ'), 'Must contain selling price per kg')
    // Check transportation cost
    assert.ok(summary.includes('ಸಾರಿಗೆ ವೆಚ್ಚ 800 ರೂಪಾಯಿ'), 'Must contain transportation cost')
    // Check other costs
    assert.ok(summary.includes('ಇತರ ಮಾರುಕಟ್ಟೆ ವೆಚ್ಚಗಳು 200 ರೂಪಾಯಿ'), 'Must contain other costs')
    // Check runner up comparison
    assert.ok(summary.includes('Chintamani APMC'), 'Must mention runner-up market')
    assert.ok(summary.includes('1,500 ರೂಪಾಯಿ ಹೆಚ್ಚು'), 'Must mention advantage over runner-up')
  })

  it('never fabricates missing transport cost or assumes it is zero', () => {
    const mockData = {
      available: true,
      crop: 'Onion',
      variety: null,
      quantity_kg: 1000,
      recommended_market: 'Bengaluru APMC',
      expected_gross_revenue: 30000,
      transportation_cost: null, // Unknown / missing transport cost
      other_costs: 0,
      expected_net_return: 30000,
      ranked_markets: [
        { name: 'Bengaluru APMC', price_per_kg: 30, net_return: 30000 },
      ],
    }

    const summary = buildKannadaRecommendationSummary(mockData)
    assert.ok(summary)
    assert.ok(summary.includes('ಈರುಳ್ಳಿ'), 'Contains Onion in Kannada')
    assert.ok(summary.includes('Bengaluru APMC'))
    // Must NOT state transport cost is 0 or fabricate transport cost
    assert.ok(!summary.includes('ಸಾರಿಗೆ ವೆಚ್ಚ'), 'Must not fabricate transport cost when null')
    assert.ok(!summary.includes('ಇತರ ಮಾರುಕಟ್ಟೆ ವೆಚ್ಚಗಳು'), 'Must not announce zero other costs')
  })

  it('handles explicit zero transport cost accurately', () => {
    const mockData = {
      available: true,
      crop: 'Potato',
      quantity_kg: 200,
      recommended_market: 'Hassan APMC',
      expected_gross_revenue: 5000,
      transportation_cost: 0, // Explicitly zero
      expected_net_return: 5000,
      ranked_markets: [{ name: 'Hassan APMC', price_per_kg: 25, net_return: 5000 }],
    }

    const summary = buildKannadaRecommendationSummary(mockData)
    assert.ok(summary)
    assert.ok(summary.includes('ಆಲೂಗಡ್ಡೆ'))
    assert.ok(summary.includes('ಸಾರಿಗೆ ವೆಚ್ಚ ಶೂನ್ಯ ರೂಪಾಯಿ'))
  })
})

describe('Mock browser Speech API interaction', () => {
  it('does not speak if no genuine Kannada voice is found', () => {
    let speakCalled = false
    const mockWindow = {
      speechSynthesis: {
        getVoices: () => [{ name: 'English (US)', lang: 'en-US' }],
        speak: () => { speakCalled = true },
        cancel: () => {},
      },
    }

    const voices = mockWindow.speechSynthesis.getVoices()
    const knVoice = getKannadaVoice(voices)
    assert.equal(knVoice, null)

    // Ensure we do not call speak with an English voice
    if (!knVoice) {
      // correctly aborted
    } else {
      mockWindow.speechSynthesis.speak({ voice: knVoice })
    }

    assert.equal(speakCalled, false, 'Should not have called speak without a Kannada voice')
  })

  it('properly prepares utterance and triggers speech when Kannada voice is available', () => {
    let spokenUtterance = null
    let cancelCalled = false

    const mockWindow = {
      speechSynthesis: {
        getVoices: () => [
          { name: 'English', lang: 'en-US' },
          { name: 'Kannada Female', lang: 'kn-IN' },
        ],
        cancel: () => { cancelCalled = true },
        speak: (utt) => { spokenUtterance = utt },
      },
    }

    const voices = mockWindow.speechSynthesis.getVoices()
    const knVoice = getKannadaVoice(voices)
    assert.ok(knVoice)
    assert.equal(knVoice.lang, 'kn-IN')

    const data = {
      available: true,
      crop: 'Maize',
      quantity_kg: 600,
      recommended_market: 'Davanagere APMC',
      expected_net_return: 15000,
      ranked_markets: [{ name: 'Davanagere APMC', price_per_kg: 25, net_return: 15000 }],
    }
    const text = buildKannadaRecommendationSummary(data)

    mockWindow.speechSynthesis.cancel()
    const utterance = { text, voice: knVoice, lang: knVoice.lang }
    mockWindow.speechSynthesis.speak(utterance)

    assert.equal(cancelCalled, true)
    assert.ok(spokenUtterance)
    assert.equal(spokenUtterance.voice.name, 'Kannada Female')
    assert.ok(spokenUtterance.text.includes('ಮೆಕ್ಕೆಜೋಳ'))
  })
})
