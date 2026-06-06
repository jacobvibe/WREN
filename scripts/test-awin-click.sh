#!/usr/bin/env bash
# Spike 4: AWIN server-side click + deep link test
# Usage: SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=xxx bash scripts/test-awin-click.sh
#
# PASS:
#   ✓ HTTP 200 from Edge Function
#   ✓ clickRecorded=true (AWIN returned 2xx or 3xx to the server-side ping)
#   ✓ trackingUrl is a valid awin1.com deep link
#   ✓ Following trackingUrl manually redirects to merchant site (verify in browser)

set -euo pipefail

URL="${SUPABASE_URL:-${EXPO_PUBLIC_SUPABASE_URL:?set SUPABASE_URL}}"
KEY="${SUPABASE_ANON_KEY:-${EXPO_PUBLIC_SUPABASE_ANON_KEY:?set SUPABASE_ANON_KEY}}"

# Example: ASOS merchant on AWIN (merchant ID 14184 is ASOS UK — replace with real merchant)
MERCHANT_ID="${AWIN_TEST_MERCHANT_ID:-14184}"
PRODUCT_URL="https://www.asos.com/men/t-shirts-polos/cat/?cid=7616"

echo "▶ Calling awin-click Edge Function..."
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -X POST "${URL}/functions/v1/awin-click" \
  -H "Authorization: Bearer ${KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"merchantId\":\"${MERCHANT_ID}\",\"productUrl\":\"${PRODUCT_URL}\"}")

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_STATUS:")

CLICK_RECORDED=$(echo "$BODY" | grep -o '"clickRecorded":[a-z]*' | cut -d: -f2)
TRACKING_URL=$(echo "$BODY" | grep -o '"trackingUrl":"[^"]*"' | cut -d'"' -f4)
AWIN_STATUS=$(echo "$BODY" | grep -o '"awinStatus":[0-9]*' | cut -d: -f2)

echo "  HTTP status:     ${HTTP_STATUS}"
echo "  clickRecorded:   ${CLICK_RECORDED}"
echo "  awinStatus:      ${AWIN_STATUS}"
echo "  trackingUrl:     ${TRACKING_URL}"

if [[ "$HTTP_STATUS" == "200" ]] && [[ "$CLICK_RECORDED" == "true" ]] && echo "$TRACKING_URL" | grep -q "awin1.com"; then
  echo ""
  echo "✅ SPIKE 4 PASS — Server-side click recorded, deep link is valid awin1.com URL"
  echo ""
  echo "  ⚠️  Manual check required: open this URL in a browser and verify"
  echo "  it redirects to the merchant site with AWIN cookie set:"
  echo "  ${TRACKING_URL}"
else
  echo ""
  echo "❌ SPIKE 4 FAIL — HTTP ${HTTP_STATUS}, clickRecorded=${CLICK_RECORDED}"
  echo "  Full response: ${BODY}"
  exit 1
fi
