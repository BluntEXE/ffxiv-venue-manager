#!/bin/bash
# test-room-workflow.sh — Simulate the full plugin → XVM server room workflow
# Usage: ./test-room-workflow.sh

set -e
BASE="http://localhost:3000/api/plugin"
VENUE_ID="cmsu8soi70002oxy5x8l6qdp4"
ROOM_ID="cmszpoe1r00004cy5630oklfo"

API_KEY="${PLUGIN_API_KEY:-}"

if [ -z "$API_KEY" ]; then
  echo "Set PLUGIN_API_KEY first:"
  echo "  export PLUGIN_API_KEY='vm_...'"
  echo ""
  echo "Get a key from: http://localhost:3000/dashboard/local-test-venue/settings"
  exit 1
fi

echo "=== 1. GET rooms (poll) ==="
curl -s -H "x-api-key: $API_KEY" "$BASE/rooms?venueId=$VENUE_ID" | jq .

echo ""
echo "=== 2. Reserve room (30min) ==="
curl -s -X POST -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d "{\"venueId\":\"$VENUE_ID\",\"roomId\":\"$ROOM_ID\",\"durationMinutes\":30}" \
  "$BASE/rooms/reserve" | jq .

echo ""
echo "=== 3. GET rooms (verify occupied) ==="
curl -s -H "x-api-key: $API_KEY" "$BASE/rooms?venueId=$VENUE_ID" | jq .

echo ""
echo "=== 4. Release room ==="
curl -s -X POST -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d "{\"venueId\":\"$VENUE_ID\",\"roomId\":\"$ROOM_ID\"}" \
  "$BASE/rooms/release" | jq .

echo ""
echo "=== 5. GET rooms (verify free) ==="
curl -s -H "x-api-key: $API_KEY" "$BASE/rooms?venueId=$VENUE_ID" | jq .

echo ""
echo "=== Done ==="
