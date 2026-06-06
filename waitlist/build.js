#!/usr/bin/env node
// Vercel build script: substitutes SUPABASE_URL + SUPABASE_ANON_KEY into index.html
// at build time so the static file never ships with placeholder strings.
const fs = require('fs')
const path = require('path')

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_ANON_KEY

if (!url || !key) {
  console.warn('WARNING: SUPABASE_URL / SUPABASE_ANON_KEY not set — form will show success without DB insert.')
}

const src  = path.join(__dirname, 'index.html')
const dist = path.join(__dirname, 'dist')
const out  = path.join(dist, 'index.html')

let html = fs.readFileSync(src, 'utf8')
html = html.replace('__SUPABASE_URL__',      url)
html = html.replace('__SUPABASE_ANON_KEY__', key)

fs.mkdirSync(dist, { recursive: true })
fs.writeFileSync(out, html)
console.log(`Built → dist/index.html (${Math.round(html.length / 1024)} KB)`)
