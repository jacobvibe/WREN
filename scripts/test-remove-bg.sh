#!/usr/bin/env bash
# Spike 2: Remove.bg Edge Function test
# Usage: SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=xxx bash scripts/test-remove-bg.sh
#
# PASS: HTTP 200, response contains "cutout" key with data:image/png;base64, prefix
# FAIL: non-200, or cutout key missing, or API key error

set -euo pipefail

URL="${SUPABASE_URL:-${EXPO_PUBLIC_SUPABASE_URL:?set SUPABASE_URL}}"
KEY="${SUPABASE_ANON_KEY:-${EXPO_PUBLIC_SUPABASE_ANON_KEY:?set SUPABASE_ANON_KEY}}"

# A known clothing photo from Unsplash (CC0)
IMAGE_URL="https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=400"

echo "▶ Calling remove-bg Edge Function..."
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -X POST "${URL}/functions/v1/remove-bg" \
  -H "Authorization: Bearer ${KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"imageUrl\":\"${IMAGE_URL}\"}")

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_STATUS:")

echo "  HTTP status: ${HTTP_STATUS}"
echo "  Response (first 200 chars): ${BODY:0:200}"

if [[ "$HTTP_STATUS" == "200" ]] && echo "$BODY" | grep -q '"cutout":"data:image/png;base64,'; then
  echo ""
  echo "✅ SPIKE 2 PASS — Remove.bg returned a clean cut-out PNG"
else
  echo ""
  echo "❌ SPIKE 2 FAIL — HTTP ${HTTP_STATUS} or cutout key missing"
  exit 1
fi
