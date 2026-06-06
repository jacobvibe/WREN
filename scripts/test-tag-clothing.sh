#!/usr/bin/env bash
# Spike 3: Google Vision clothing tagger — 30-photo batch test
# Usage: SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=xxx bash scripts/test-tag-clothing.sh
#
# PASS: spike3Pass=true in summary (≥ 20 of 30 photos return a high-confidence clothing label)

set -euo pipefail

URL="${SUPABASE_URL:-${EXPO_PUBLIC_SUPABASE_URL:?set SUPABASE_URL}}"
KEY="${SUPABASE_ANON_KEY:-${EXPO_PUBLIC_SUPABASE_ANON_KEY:?set SUPABASE_ANON_KEY}}"

# 30 Unsplash fashion photos (stable IDs, CC0)
IMAGES=$(cat <<'EOF'
[
  "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=400",
  "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400",
  "https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=400",
  "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400",
  "https://images.unsplash.com/photo-1485968579580-b6d095142e6e?w=400",
  "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=400",
  "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=400",
  "https://images.unsplash.com/photo-1445205170230-053b83016050?w=400",
  "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=400",
  "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=400",
  "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400",
  "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400",
  "https://images.unsplash.com/photo-1571945153237-4929e783af4a?w=400",
  "https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=400",
  "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400",
  "https://images.unsplash.com/photo-1584735175315-9d5df23860e6?w=400",
  "https://images.unsplash.com/photo-1611010344444-5f9e4d86a6d5?w=400",
  "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400",
  "https://images.unsplash.com/photo-1578932750294-f5075e85f44a?w=400",
  "https://images.unsplash.com/photo-1564859228273-274232fdb516?w=400",
  "https://images.unsplash.com/photo-1591195853828-11db59a44f43?w=400",
  "https://images.unsplash.com/photo-1586790170083-2f9ceadc732d?w=400",
  "https://images.unsplash.com/photo-1583744946564-b52ac1c389c8?w=400",
  "https://images.unsplash.com/photo-1600185365926-3a2ce3cdb9eb?w=400",
  "https://images.unsplash.com/photo-1595341888016-a392ef81b7de?w=400",
  "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=400",
  "https://images.unsplash.com/photo-1605348532760-6753d2c43329?w=400",
  "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=400",
  "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=400",
  "https://images.unsplash.com/photo-1556306535-0f09a537f0a3?w=400"
]
EOF
)

echo "▶ Calling tag-clothing Edge Function with 30 fashion photos..."
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -X POST "${URL}/functions/v1/tag-clothing" \
  -H "Authorization: Bearer ${KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"imageUrls\":${IMAGES}}")

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_STATUS:")

PASS_RATE=$(echo "$BODY" | grep -o '"passRate":"[^"]*"' | cut -d'"' -f4)
ELAPSED=$(echo "$BODY" | grep -o '"elapsedMs":[0-9]*' | cut -d: -f2)
SPIKE_PASS=$(echo "$BODY" | grep -o '"spike3Pass":[a-z]*' | cut -d: -f2)

echo "  HTTP status:  ${HTTP_STATUS}"
echo "  Pass rate:    ${PASS_RATE} (need ≥ 20/30)"
echo "  Elapsed:      ${ELAPSED}ms"

if [[ "$HTTP_STATUS" == "200" ]] && [[ "$SPIKE_PASS" == "true" ]]; then
  echo ""
  echo "✅ SPIKE 3 PASS — Google Vision tagged ≥ 20/30 clothing photos accurately"
else
  echo ""
  echo "❌ SPIKE 3 FAIL — HTTP ${HTTP_STATUS}, pass rate ${PASS_RATE}"
  echo "  Full response: ${BODY:0:500}"
  exit 1
fi
