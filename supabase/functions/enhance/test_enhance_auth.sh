#!/bin/bash

# Set these variables before running
echo "Please edit this script to set your SUPABASE_URL and JWTs before running."
SUPABASE_URL="http://127.0.0.1:54321/functions/v1/enhance"
VALID_JWT_WITH_KEY="<your_valid_jwt_with_api_key>"
VALID_JWT_NO_KEY="<your_valid_jwt_without_api_key>"

# Test payload
data='{"model":"gpt-4.1-mini","messages":[{"role":"user","content":"Test"}]}'

# 1. No Auth Header
echo "\n=== Test: No Auth Header ==="
curl -i -X POST "$SUPABASE_URL" \
  -H "Content-Type: application/json" \
  -d "$data"

# 2. Invalid JWT
echo "\n=== Test: Invalid JWT ==="
curl -i -X POST "$SUPABASE_URL" \
  -H "Authorization: Bearer invalidtoken" \
  -H "Content-Type: application/json" \
  -d "$data"

# 3. Valid JWT, No User API Key
echo "\n=== Test: Valid JWT, No User API Key ==="
curl -i -X POST "$SUPABASE_URL" \
  -H "Authorization: Bearer $VALID_JWT_NO_KEY" \
  -H "Content-Type: application/json" \
  -d "$data"

# 4. Valid JWT, User Has API Key
echo "\n=== Test: Valid JWT, User Has API Key ==="
curl -i -X POST "$SUPABASE_URL" \
  -H "Authorization: Bearer $VALID_JWT_WITH_KEY" \
  -H "Content-Type: application/json" \
  -d "$data" 