#!/bin/bash

# Test script cho upload-image Edge Function
# Usage: ./test.sh [local|production]

MODE=${1:-local}

if [ "$MODE" = "local" ]; then
  BASE_URL="http://localhost:54321/functions/v1"
  echo "Testing LOCAL function..."
else
  BASE_URL="https://YOUR_PROJECT_REF.supabase.co/functions/v1"
  echo "Testing PRODUCTION function..."
fi

# Get JWT token (you need to replace this with actual token)
JWT_TOKEN=${SUPABASE_JWT_TOKEN:-"your_jwt_token_here"}

if [ "$JWT_TOKEN" = "your_jwt_token_here" ]; then
  echo "Error: Please set SUPABASE_JWT_TOKEN environment variable"
  echo "Example: export SUPABASE_JWT_TOKEN=eyJhbGc..."
  exit 1
fi

echo "Endpoint: $BASE_URL/upload-image"
echo ""

# Test 1: Valid JPEG upload
echo "Test 1: Valid JPEG upload to 'models' bucket"
curl -X POST "$BASE_URL/upload-image" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d @test_payload.example.json \
  -w "\nHTTP Status: %{http_code}\n" \
  -s | jq .

echo ""
echo "---"
echo ""

# Test 2: Missing auth header
echo "Test 2: Missing authorization header (should fail with 401)"
curl -X POST "$BASE_URL/upload-image" \
  -H "Content-Type: application/json" \
  -d @test_payload.example.json \
  -w "\nHTTP Status: %{http_code}\n" \
  -s | jq .

echo ""
echo "---"
echo ""

# Test 3: Invalid bucket type
echo "Test 3: Invalid bucket_type (should fail with 400)"
curl -X POST "$BASE_URL/upload-image" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD...",
    "bucket_type": "invalid_type"
  }' \
  -w "\nHTTP Status: %{http_code}\n" \
  -s | jq .

echo ""
echo "---"
echo ""

# Test 4: Missing required fields
echo "Test 4: Missing required fields (should fail with 400)"
curl -X POST "$BASE_URL/upload-image" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' \
  -w "\nHTTP Status: %{http_code}\n" \
  -s | jq .

echo ""
echo "All tests completed!"
