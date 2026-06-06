#!/usr/bin/env node
/**
 * Spike 3: Google Cloud Vision clothing tagger — 30-photo batch
 * PASS: ≥ 20/30 photos return ≥1 clothing-related label with confidence ≥ 0.7
 */
const fs = require('fs')
const path = require('path')
const https = require('https')
const crypto = require('crypto')

// ── Read .env with multi-line JSON support ───────────────────────────────────
function loadEnvWithMultilineJSON(envPath) {
  const content = fs.readFileSync(envPath, 'utf8')
  const result = {}
  let i = 0
  const lines = content.split('\n')
  while (i < lines.length) {
    const line = lines[i]
    const eq = line.indexOf('=')
    if (eq < 1 || line.startsWith('#')) { i++; continue }
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()

    // Detect multi-line JSON: value starts with { or [
    if (val === '{' || val === '[') {
      const closer = val === '{' ? '}' : ']'
      const jsonLines = [val]
      i++
      while (i < lines.length) {
        jsonLines.push(lines[i])
        if (lines[i].trim() === closer) { i++; break }
        i++
      }
      val = jsonLines.join('\n')
    } else {
      i++
    }
    result[key] = val
  }
  return result
}

const envPath = path.join(__dirname, '..', '.env')
const env = loadEnvWithMultilineJSON(envPath)

const CREDS_RAW = env.GOOGLE_VISION_CREDENTIALS
if (!CREDS_RAW) { console.error('GOOGLE_VISION_CREDENTIALS not in .env'); process.exit(1) }

let creds
try { creds = JSON.parse(CREDS_RAW) } catch (e) {
  console.error('JSON parse error:', e.message)
  console.error('First 80 chars of value:', CREDS_RAW.slice(0, 80))
  process.exit(1)
}

// ── JWT helpers ──────────────────────────────────────────────────────────────
function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function makeJWT(email, privateKey) {
  const now = Math.floor(Date.now() / 1000)
  const hdr = b64url(Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const pld = b64url(Buffer.from(JSON.stringify({
    iss: email, scope: 'https://www.googleapis.com/auth/cloud-vision',
    aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now,
  })))
  const sig = b64url(crypto.createSign('RSA-SHA256').update(`${hdr}.${pld}`).sign(privateKey))
  return `${hdr}.${pld}.${sig}`
}

function post(hostname, path, body, headers) {
  return new Promise((res, rej) => {
    const data = typeof body === 'string' ? body : JSON.stringify(body)
    const req = https.request(
      { hostname, path, method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(data) } },
      (r) => { const c = []; r.on('data', d => c.push(d)); r.on('end', () => res({ status: r.statusCode, body: Buffer.concat(c).toString() })) }
    )
    req.on('error', rej); req.write(data); req.end()
  })
}

// ── 30 Unsplash fashion photos ───────────────────────────────────────────────
const IMAGE_URLS = [
  'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=400',
  'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400',
  'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=400',
  'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400',
  'https://images.unsplash.com/photo-1485968579580-b6d095142e6e?w=400',
  'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=400',
  'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=400',
  'https://images.unsplash.com/photo-1445205170230-053b83016050?w=400',
  'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=400',
  'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=400',
  'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400',
  'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400',
  'https://images.unsplash.com/photo-1571945153237-4929e783af4a?w=400',
  'https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=400',
  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400',
  'https://images.unsplash.com/photo-1584735175315-9d5df23860e6?w=400',
  'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400',
  'https://images.unsplash.com/photo-1578932750294-f5075e85f44a?w=400',
  'https://images.unsplash.com/photo-1591195853828-11db59a44f43?w=400',
  'https://images.unsplash.com/photo-1586790170083-2f9ceadc732d?w=400',
  'https://images.unsplash.com/photo-1583744946564-b52ac1c389c8?w=400',
  'https://images.unsplash.com/photo-1600185365926-3a2ce3cdb9eb?w=400',
  'https://images.unsplash.com/photo-1595341888016-a392ef81b7de?w=400',
  'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=400',
  'https://images.unsplash.com/photo-1605348532760-6753d2c43329?w=400',
  'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=400',
  'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=400',
  'https://images.unsplash.com/photo-1556306535-0f09a537f0a3?w=400',
  'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=400',
  'https://images.unsplash.com/photo-1554412933-514a83d2f3c8?w=400',
]

const CLOTHING = new Set([
  'clothing','fashion','shirt','t-shirt','dress','jeans','pants','trousers',
  'jacket','coat','skirt','blouse','sweater','hoodie','suit','shoe','boot',
  'sneaker','top','leggings','shorts','cardigan','vest','blazer','denim',
  'textile','apparel','garment','outerwear','footwear','sleeve','collar',
  'jersey','jumper','pullover','sweatshirt','turtleneck','polo','uniform',
  'sportswear','walking shoe',
])

;(async () => {
  console.log('▶ Spike 3 — Google Cloud Vision (30 clothing photos)')
  console.log('  SA:', creds.client_email)

  // 1. Auth
  const jwt = makeJWT(creds.client_email, creds.private_key)
  const tok = await post('oauth2.googleapis.com', '/token',
    `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    { 'Content-Type': 'application/x-www-form-urlencoded' })

  if (tok.status !== 200) {
    console.error('  Auth failed:', tok.body.slice(0, 300))
    console.log('\n❌ SPIKE 3 FAIL — service account auth failed')
    process.exit(1)
  }
  const { access_token } = JSON.parse(tok.body)
  console.log('  Auth ✓')

  // 2. Vision batch — API limit is 16 images per request, so split into chunks
  const BATCH_SIZE = 16
  const chunks = []
  for (let i = 0; i < IMAGE_URLS.length; i += BATCH_SIZE) {
    chunks.push(IMAGE_URLS.slice(i, i + BATCH_SIZE))
  }

  const t0 = Date.now()
  const allResponses = []
  for (let c = 0; c < chunks.length; c++) {
    const res = await post('vision.googleapis.com', '/v1/images:annotate',
      { requests: chunks[c].map(url => ({ image: { source: { imageUri: url } }, features: [{ type: 'LABEL_DETECTION', maxResults: 10 }] })) },
      { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` })
    console.log(`  Batch ${c + 1}/${chunks.length} — HTTP ${res.status}`)
    if (res.status !== 200) {
      console.error('  Error:', res.body.slice(0, 400))
      console.log('\n❌ SPIKE 3 FAIL — Vision API error')
      process.exit(1)
    }
    allResponses.push(...JSON.parse(res.body).responses)
  }

  const elapsed = Date.now() - t0
  console.log(`  All batches done in ${elapsed}ms`)

  const responses = allResponses

  // 3. Score
  const results = responses.map((r, i) => {
    const labels = r.labelAnnotations ?? []
    const top = labels[0]
    const hits = labels.filter(l => CLOTHING.has(l.description.toLowerCase()))
    return { n: i + 1, top: top ? `${top.description}(${top.score.toFixed(2)})` : 'none', hits: hits.map(l => l.description).join(','), pass: hits.length > 0 && (top?.score ?? 0) >= 0.7 }
  })

  const passCount = results.filter(r => r.pass).length
  console.log('\n  Per-image results:')
  results.forEach(r => console.log(`  ${r.pass ? '✅' : '❌'} [${String(r.n).padStart(2)}] ${r.top} | clothing=${r.hits || 'none'}`))
  console.log(`\n  ${passCount}/30 passed | elapsed ${elapsed}ms`)

  if (passCount >= 20) {
    console.log('\n✅ SPIKE 3 PASS — Google Vision tagged ≥ 20/30 clothing photos accurately')
  } else {
    console.log(`\n❌ SPIKE 3 FAIL — Only ${passCount}/30 passed`)
    process.exit(1)
  }
})()
