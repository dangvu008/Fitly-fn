#!/bin/bash

# Script: generate_extension_key.sh
# Purpose: Tạo key cố định cho Chrome Extension để Extension ID không đổi
# 
# Usage: ./generate_extension_key.sh

echo "🔑 Generating Chrome Extension Key..."
echo ""

# Tạo private key
openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -out key.pem

if [ ! -f key.pem ]; then
    echo "❌ Failed to generate key.pem"
    exit 1
fi

echo "✅ Private key generated: key.pem"

# Tạo public key (base64)
PUBLIC_KEY=$(openssl rsa -in key.pem -pubout -outform DER 2>/dev/null | base64 | tr -d '\n')

if [ -z "$PUBLIC_KEY" ]; then
    echo "❌ Failed to generate public key"
    exit 1
fi

echo "✅ Public key generated"
echo ""
echo "================================================"
echo "📋 Add this to manifest.json:"
echo "================================================"
echo ""
echo "{"
echo "  \"manifest_version\": 3,"
echo "  \"name\": \"Fitly - Virtual Try-On\","
echo "  \"version\": \"1.0.0\","
echo "  \"key\": \"$PUBLIC_KEY\","
echo "  ..."
echo "}"
echo ""
echo "================================================"
echo "📋 TO GET EXTENSION ID:"
echo "================================================"
echo ""
echo "1. Add the key above to manifest.json"
echo "2. Reload extension in Chrome (chrome://extensions)"
echo "3. Copy the Extension ID from the extension card"
echo ""
echo "OR run this in extension console:"
echo "  console.log('Extension ID:', chrome.runtime.id);"
echo "  console.log('Redirect URL:', chrome.identity.getRedirectURL());"
echo ""
echo "================================================"
echo "📋 OAUTH CONFIGURATION URLS:"
echo "================================================"
echo ""
echo "After getting Extension ID, configure these URLs:"
echo ""
echo "🔹 Supabase Dashboard (Authentication > URL Configuration):"
echo "   https://<extension-id>.chromiumapp.org/"
echo "   https://<extension-id>.chromiumapp.org/**"
echo ""
echo "🔹 Google Cloud Console (Credentials > OAuth 2.0 Client):"
echo "   https://lluidqwmyxuonvmcansp.supabase.co/auth/v1/callback"
echo "   https://<extension-id>.chromiumapp.org/"
echo ""
echo "================================================"
echo "⚠️  IMPORTANT:"
echo "================================================"
echo ""
echo "1. DO NOT commit key.pem to Git!"
echo "2. Add 'key.pem' to .gitignore"
echo "3. Keep key.pem safe - you'll need it to maintain the same Extension ID"
echo ""
echo "📖 See SUPABASE_REDIRECT_URL_SETUP.md for detailed instructions"
echo "🧪 Run check_oauth_config.js in console to verify configuration"
echo ""
echo "✅ Setup complete!"
echo ""
