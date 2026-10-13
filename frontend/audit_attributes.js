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
const attrRegex = /(placeholder|title|aria-label)=["']([^"']+)["']/g

console.log("=== ATTRIBUTE TEXT AUDIT (placeholder, title, aria-label) ===")
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8')
  const base = path.basename(file)
  const matches = []
  let m
  while ((m = attrRegex.exec(content)) !== null) {
    const attr = m[1]
    const val = m[2].trim()
    if (!val || val.length < 2) continue
    if (/^[0-9₹\.\,\+\-\*\/\%\:\#\(\)\s\|\·\✦\—\→\←\•]+$/.test(val)) continue
    if (/^[\u0C80-\u0CFF\s]+$/.test(val)) continue
    matches.push(`${attr}="${val}"`)
  }
  if (matches.length > 0) {
    console.log(`\nFile: ${base} (${matches.length} matches):`)
    for (const txt of matches) {
      console.log(`  - ${txt}`)
    }
  }
}
