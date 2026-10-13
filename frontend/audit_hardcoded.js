import fs from 'fs'
import path from 'path'

function scanDir(dir) {
  const files = fs.readdirSync(dir)
  let results = []
  for (const f of files) {
    const full = path.join(dir, f)
    if (fs.statSync(full).isDirectory()) {
      results = results.concat(scanDir(full))
    } else if (f.endsWith('.jsx')) {
      results.push(full)
    }
  }
  return results
}

const files = scanDir('src/components')
const textRegex = />([^<>{}\n]+)</g

console.log("=== HARDCODED TEXT AUDIT IN JSX COMPONENTS ===")
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8')
  const base = path.basename(file)
  const matches = []
  let m
  while ((m = textRegex.exec(content)) !== null) {
    const txt = m[1].trim()
    // Skip numbers, currency symbols, punctuations, empty, single letters
    if (!txt || txt.length < 2) continue
    if (/^[0-9₹\.\,\+\-\*\/\%\:\#\(\)\s\|\·\✦\—\→\←\•]+$/.test(txt)) continue
    // Skip if it looks like variable or already translated
    if (/^[\u0C80-\u0CFF\s]+$/.test(txt)) continue // Kannada text
    matches.push(txt)
  }
  if (matches.length > 0) {
    console.log(`\nFile: ${base} (${matches.length} matches):`)
    for (const txt of matches) {
      console.log(`  - "${txt}"`)
    }
  }
}
