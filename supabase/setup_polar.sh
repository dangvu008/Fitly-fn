#!/bin/bash

###############################################################################
# File: setup_polar.sh
# Purpose: Tự động setup Polar.sh payment gateway cho Supabase
# Usage: ./setup_polar.sh
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PROJECT_REF="lluidqwmyxuonvmcansp"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Polar.sh Setup Script for Fitly${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}Error: Supabase CLI is not installed${NC}"
    echo "Install it with: brew install supabase/tap/supabase"
    exit 1
fi

echo -e "${YELLOW}Step 1: Collecting Polar.sh credentials${NC}"
echo ""

# Prompt for POLAR_API_KEY
read -p "Enter your POLAR_API_KEY (from Polar.sh Dashboard > Settings > Developer): " POLAR_API_KEY
if [ -z "$POLAR_API_KEY" ]; then
    echo -e "${RED}Error: POLAR_API_KEY is required${NC}"
    exit 1
fi

# Prompt for POLAR_WEBHOOK_SECRET
read -p "Enter your POLAR_WEBHOOK_SECRET (from Polar.sh Dashboard > Settings > Webhooks): " POLAR_WEBHOOK_SECRET
if [ -z "$POLAR_WEBHOOK_SECRET" ]; then
    echo -e "${RED}Error: POLAR_WEBHOOK_SECRET is required${NC}"
    exit 1
fi

# Set POLAR_API_URL (default)
POLAR_API_URL="https://api.polar.sh/v1/checkouts/custom/"

echo ""
echo -e "${YELLOW}Step 2: Setting secrets in Supabase${NC}"
echo ""

# Set secrets
echo "Setting POLAR_API_KEY..."
supabase secrets set POLAR_API_KEY="$POLAR_API_KEY" --project-ref "$PROJECT_REF"

echo "Setting POLAR_WEBHOOK_SECRET..."
supabase secrets set POLAR_WEBHOOK_SECRET="$POLAR_WEBHOOK_SECRET" --project-ref "$PROJECT_REF"

echo "Setting POLAR_API_URL..."
supabase secrets set POLAR_API_URL="$POLAR_API_URL" --project-ref "$PROJECT_REF"

echo -e "${GREEN}✓ Secrets set successfully${NC}"
echo ""

# Verify secrets
echo -e "${YELLOW}Step 3: Verifying secrets${NC}"
echo ""
supabase secrets list --project-ref "$PROJECT_REF"
echo ""

echo -e "${YELLOW}Step 4: Deploying Edge Functions${NC}"
echo ""

# Deploy create-polar-checkout
echo "Deploying create-polar-checkout..."
supabase functions deploy create-polar-checkout --project-ref "$PROJECT_REF"
echo -e "${GREEN}✓ create-polar-checkout deployed${NC}"
echo ""

# Deploy polar-webhook (without JWT verification)
echo "Deploying polar-webhook..."
supabase functions deploy polar-webhook --project-ref "$PROJECT_REF" --no-verify-jwt
echo -e "${GREEN}✓ polar-webhook deployed${NC}"
echo ""

# List functions
echo -e "${YELLOW}Step 5: Verifying deployment${NC}"
echo ""
supabase functions list --project-ref "$PROJECT_REF"
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Update gem_packages table with Polar Price IDs"
echo "2. Test checkout flow: https://$PROJECT_REF.supabase.co/functions/v1/create-polar-checkout"
echo "3. Verify webhook URL in Polar Dashboard:"
echo "   https://$PROJECT_REF.supabase.co/functions/v1/polar-webhook"
echo ""
echo -e "${YELLOW}For detailed instructions, see:${NC}"
echo "supabase/POLAR_SETUP_GUIDE.md"
echo ""
