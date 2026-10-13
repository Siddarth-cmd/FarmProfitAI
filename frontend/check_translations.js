import fs from 'fs'
import path from 'path'

const content = fs.readFileSync('src/localization.js', 'utf8')
const match = content.match(/const translations = (\{[\s\S]*?\n\})/m)
const fn = new Function(`return ${match[1]}`)
const translations = fn()

const enKeys = new Set(Object.keys(translations.en))
const knKeys = new Set(Object.keys(translations.kn))

// 1. Check consistency between en and kn
const missingInKn = [...enKeys].filter(k => !knKeys.has(k) || !translations.kn[k])
const missingInEn = [...knKeys].filter(k => !enKeys.has(k) || !translations.en[k])

if (missingInKn.length > 0) {
  console.error("Missing in KN:", missingInKn)
} else {
  console.log("✓ All EN keys exist in KN dictionary!")
}

if (missingInEn.length > 0) {
  console.warn("Keys in KN but missing in EN:", missingInEn)
}

// 2. Scan all JSX files for t('...') usages
function scanDir(dir) {
  const files = fs.readdirSync(dir)
  let results = []
  for (const f of files) {
    const full = path.join(dir, f)
    if (fs.statSync(full).isDirectory()) {
      results = results.concat(scanDir(full))
    } else if (f.endsWith('.jsx') || f.endsWith('.js')) {
      results.push(full)
    }
  }
  return results
}

const jsFiles = scanDir('src')
const usedKeys = new Set()
const keyRegex = /\bt\(\s*['"]([a-zA-Z0-9_]+)['"]/g

for (const f of jsFiles) {
  if (f.endsWith('localization.js') || f.endsWith('check_translations.js')) continue
  const fileContent = fs.readFileSync(f, 'utf8')
  let m
  while ((m = keyRegex.exec(fileContent)) !== null) {
    usedKeys.add(m[1])
  }
}

console.log(`Total unique t('...') keys used in JSX components: ${usedKeys.size}`)

const undefinedKeys = [...usedKeys].filter(k => !enKeys.has(k) || !knKeys.has(k))
if (undefinedKeys.length > 0) {
  console.error("❌ Keys used in code but NOT defined in dictionary:", undefinedKeys)
} else {
  console.log("✓ All keys used in JSX exist in both EN and KN dictionaries!")
}
