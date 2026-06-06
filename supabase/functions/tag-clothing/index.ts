/**
 * Spike 3: Google Cloud Vision clothing tagger
 *
 * PASS criteria (30-image batch):
 *   ✓ Each image returns ≥1 clothing-related label (shirt, dress, jeans, shoe, etc.)
 *   ✓ Top label confidence ≥ 0.7 on ≥ 20 of 30 photos
 *   ✓ Response in < 8 s total
 *
 * Required env vars:
 *   GOOGLE_VISION_API_KEY
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CLOTHING_KEYWORDS = new Set([
  'clothing', 'fashion', 'shirt', 't-shirt', 'dress', 'jeans', 'pants', 'trousers',
  'jacket', 'coat', 'skirt', 'blouse', 'sweater', 'hoodie', 'suit', 'shoe', 'boot',
  'sneaker', 'top', 'leggings', 'shorts', 'cardigan', 'vest', 'blazer', 'denim',
  'textile', 'apparel', 'garment', 'outerwear', 'footwear', 'sleeve', 'collar',
])

function isClothingLabel(desc: string) {
  return CLOTHING_KEYWORDS.has(desc.toLowerCase())
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { imageUrls } = await req.json() as { imageUrls: string[] }
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return new Response(JSON.stringify({ error: 'imageUrls array required' }), { status: 400, headers: CORS })
    }

    const apiKey = Deno.env.get('GOOGLE_VISION_API_KEY')
    if (!apiKey) return new Response(JSON.stringify({ error: 'GOOGLE_VISION_API_KEY not set' }), { status: 500, headers: CORS })

    const requests = imageUrls.slice(0, 30).map((url) => ({
      image: { source: { imageUri: url } },
      features: [{ type: 'LABEL_DETECTION', maxResults: 10 }],
    }))

    const t0 = Date.now()
    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests }),
      }
    )

    if (!visionRes.ok) {
      const errText = await visionRes.text()
      return new Response(JSON.stringify({ error: `vision: ${visionRes.status}`, detail: errText }), {
        status: visionRes.status,
        headers: CORS,
      })
    }

    const { responses } = await visionRes.json() as {
      responses: Array<{ labelAnnotations?: Array<{ description: string; score: number }> }>
    }
    const elapsedMs = Date.now() - t0

    const results = responses.map((r, i) => {
      const labels = r.labelAnnotations ?? []
      const clothingLabels = labels.filter((l) => isClothingLabel(l.description))
      return {
        imageUrl: imageUrls[i],
        topLabel: labels[0] ?? null,
        clothingLabels,
        hasClothingLabel: clothingLabels.length > 0,
        highConfidence: (labels[0]?.score ?? 0) >= 0.7,
      }
    })

    const passCount = results.filter((r) => r.hasClothingLabel && r.highConfidence).length

    return new Response(
      JSON.stringify({
        results,
        summary: {
          total: results.length,
          passCount,
          passRate: `${passCount}/${results.length}`,
          elapsedMs,
          // PASS = passCount >= 20 of 30
          spike3Pass: passCount >= Math.ceil(results.length * 0.67),
        },
      }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS })
  }
})
