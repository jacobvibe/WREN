#!/usr/bin/env node
/**
 * Spike 2: Remove.bg direct API test
 * PASS: HTTP 200, returns a PNG with transparency (file size > 1 KB, valid PNG header)
 */
require('dotenv').config()
const fs = require('fs')
const https = require('https')
const path = require('path')

const API_KEY = process.env.REMOVE_BG_API_KEY
if (!API_KEY) { console.error('REMOVE_BG_API_KEY not set'); process.exit(1) }

// A clothing photo from Unsplash (CC0)
const IMAGE_URL = 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400'
const OUT_FILE = path.join(require('os').tmpdir(), 'spike2-cutout.png')

console.log('▶ Spike 2 — Remove.bg')
console.log('  Image URL:', IMAGE_URL)

const boundary = '----FormBoundary' + Math.random().toString(36).slice(2)
const body = [
  `--${boundary}`,
  'Content-Disposition: form-data; name="image_url"',
  '',
  IMAGE_URL,
  `--${boundary}`,
  'Content-Disposition: form-data; name="size"',
  '',
  'auto',
  `--${boundary}`,
  'Content-Disposition: form-data; name="format"',
  '',
  'png',
  `--${boundary}--`,
].join('\r\n')

const options = {
  hostname: 'api.remove.bg',
  path: '/v1.0/removebg',
  method: 'POST',
  headers: {
    'X-Api-Key': API_KEY,
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': Buffer.byteLength(body),
  },
}

const req = https.request(options, (res) => {
  const chunks = []
  res.on('data', c => chunks.push(c))
  res.on('end', () => {
    const buf = Buffer.concat(chunks)
    const status = res.statusCode

    if (status === 200) {
      // Verify it's a valid PNG (magic bytes: 89 50 4E 47)
      const isPNG = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47
      const sizeKB = (buf.length / 1024).toFixed(1)
      const creditsUsed = res.headers['x-credits-charged'] ?? 'unknown'
      const width = res.headers['x-width'] ?? '?'
      const height = res.headers['x-height'] ?? '?'

      fs.writeFileSync(OUT_FILE, buf)

      console.log(`  HTTP: ${status}`)
      console.log(`  Size: ${sizeKB} KB`)
      console.log(`  Valid PNG header: ${isPNG}`)
      console.log(`  Dimensions: ${width}×${height}`)
      console.log(`  Credits used: ${creditsUsed}`)
      console.log(`  Saved to: ${OUT_FILE}`)

      if (isPNG && buf.length > 1024) {
        console.log('\n✅ SPIKE 2 PASS — Remove.bg returned a valid cut-out PNG')
        process.exit(0)
      } else {
        console.log('\n❌ SPIKE 2 FAIL — Response not a valid PNG or too small')
        process.exit(1)
      }
    } else {
      const errText = buf.toString('utf8').slice(0, 300)
      console.log(`  HTTP: ${status}`)
      console.log(`  Error: ${errText}`)
      console.log('\n❌ SPIKE 2 FAIL — Non-200 response from Remove.bg')
      process.exit(1)
    }
  })
})

req.on('error', e => { console.error('Request error:', e.message); process.exit(1) })
req.write(body)
req.end()
