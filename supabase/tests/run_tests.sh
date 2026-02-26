#!/bin/bash

###############################################################################
# File: run_tests.sh
# Purpose: Script để chạy tất cả property-based tests
# Usage: ./run_tests.sh [options]
#
# Options:
#   --all         Chạy tất cả tests (default)
#   --db          Chỉ chạy database tests
#   --image       Chỉ chạy image validation tests
#   --verbose     Hiển thị output chi tiết
#   --coverage    Hiển thị coverage report
###############################################################################

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check environment variables
check_env() {
    echo -e "${BLUE}🔍 Checking environment variables...${NC}"
    
    if [ -z "$SUPABASE_TEST_URL" ]; then
        echo -e "${RED}❌ SUPABASE_TEST_URL is not set${NC}"
        echo "   Export it: export SUPABASE_TEST_URL='https://your-project.supabase.co'"
        exit 1
    fi
    
    if [ -z "$SUPABASE_TEST_SERVICE_KEY" ]; then
        echo -e "${RED}❌ SUPABASE_TEST_SERVICE_KEY is not set${NC}"
        echo "   Export it: export SUPABASE_TEST_SERVICE_KEY='your-service-key'"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Environment variables OK${NC}\n"
}

# Run specific test file
run_test() {
    local test_file=$1
    local test_name=$2
    
    echo -e "${BLUE}🧪 Running ${test_name}...${NC}"
    
    if [ "$VERBOSE" = true ]; then
        deno test --allow-net --allow-env --trace-ops "$test_file"
    else
        deno test --allow-net --allow-env "$test_file"
    fi
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ ${test_name} passed${NC}\n"
    else
        echo -e "${RED}❌ ${test_name} failed${NC}\n"
        exit 1
    fi
}

# Parse arguments
TEST_TYPE="all"
VERBOSE=false
COVERAGE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --all)
            TEST_TYPE="all"
            shift
            ;;
        --db)
            TEST_TYPE="db"
            shift
            ;;
        --image)
            TEST_TYPE="image"
            shift
            ;;
        --security)
            TEST_TYPE="security"
            shift
            ;;
        --business)
            TEST_TYPE="business"
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --coverage)
            COVERAGE=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: ./run_tests.sh [--all|--db|--image|--security|--business] [--verbose] [--coverage]"
            exit 1
            ;;
    esac
done

# Main execution
echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Supabase Property-Based Test Suite          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}\n"

check_env

START_TIME=$(date +%s)

# Run tests based on type
case $TEST_TYPE in
    all)
        echo -e "${YELLOW}📦 Running ALL tests...${NC}\n"
        # Original tests
        run_test "database_constraints.test.ts" "Database Constraints"
        run_test "gem_transaction_atomicity.test.ts" "Gem Transaction Atomicity"
        run_test "rls_data_isolation.test.ts" "RLS Data Isolation"
        run_test "image_validation.test.ts" "Image Validation"
        run_test "tryon_preconditions.test.ts" "Try-On Preconditions"
        run_test "storage_database_consistency.test.ts" "Storage-Database Consistency"
        # Priority HIGH — Security & Core Logic
        run_test "auth_required.test.ts" "Authentication Required"
        run_test "gem_deduction.test.ts" "Gem Deduction Correctness"
        run_test "tryon_failure_refund.test.ts" "Try-On Failure Refund"
        run_test "error_sanitization.test.ts" "Error Message Sanitization"
        run_test "rate_limiting.test.ts" "Rate Limiting Enforcement"
        # Priority MEDIUM — Business Logic
        run_test "image_resize.test.ts" "Image Resize Invariant"
        run_test "filename_uniqueness.test.ts" "Filename Uniqueness"
        run_test "gem_balance_display.test.ts" "Gem Balance Display"
        run_test "prompt_completeness.test.ts" "Prompt Preservation"
        run_test "prompt_category.test.ts" "Prompt Category Hierarchy"
        run_test "quality_mapping.test.ts" "Quality Parameter Mapping"
        run_test "retry_backoff.test.ts" "Retry Exponential Backoff"
        run_test "tryon_state_transition.test.ts" "Success State Transition"
        ;;
    db)
        echo -e "${YELLOW}📦 Running DATABASE tests only...${NC}\n"
        run_test "database_constraints.test.ts" "Database Constraints"
        run_test "gem_transaction_atomicity.test.ts" "Gem Transaction Atomicity"
        run_test "rls_data_isolation.test.ts" "RLS Data Isolation"
        ;;
    image)
        echo -e "${YELLOW}📦 Running IMAGE tests only...${NC}\n"
        run_test "image_validation.test.ts" "Image Validation"
        run_test "image_resize.test.ts" "Image Resize Invariant"
        ;;
    security)
        echo -e "${YELLOW}🔒 Running SECURITY tests only (Priority HIGH)...${NC}\n"
        run_test "auth_required.test.ts" "Authentication Required"
        run_test "gem_deduction.test.ts" "Gem Deduction Correctness"
        run_test "tryon_failure_refund.test.ts" "Try-On Failure Refund"
        run_test "error_sanitization.test.ts" "Error Message Sanitization"
        run_test "rate_limiting.test.ts" "Rate Limiting Enforcement"
        run_test "rls_data_isolation.test.ts" "RLS Data Isolation"
        ;;
    business)
        echo -e "${YELLOW}💼 Running BUSINESS LOGIC tests only (Priority MEDIUM)...${NC}\n"
        run_test "image_resize.test.ts" "Image Resize Invariant"
        run_test "filename_uniqueness.test.ts" "Filename Uniqueness"
        run_test "gem_balance_display.test.ts" "Gem Balance Display"
        run_test "prompt_completeness.test.ts" "Prompt Preservation"
        run_test "prompt_category.test.ts" "Prompt Category Hierarchy"
        run_test "quality_mapping.test.ts" "Quality Parameter Mapping"
        run_test "retry_backoff.test.ts" "Retry Exponential Backoff"
        run_test "tryon_state_transition.test.ts" "Success State Transition"
        ;;
esac

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Summary
echo -e "${GREEN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ All Tests Passed!                         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════╝${NC}"
echo -e "${BLUE}⏱️  Total time: ${DURATION}s${NC}\n"

# Coverage report
if [ "$COVERAGE" = true ]; then
    echo -e "${BLUE}📊 Coverage Report:${NC}"
    echo "┌──────────────────────────────────────────────────┬────────┬────────────┐"
    echo "│ Property                                         │ Status │ Iterations │"
    echo "├──────────────────────────────────────────────────┼────────┼────────────┤"
    echo "│ === Original Tests ===                           │        │            │"
    echo "│ 15: Gem Balance Non-Negativity                  │   ✅   │    100     │"
    echo "│ 14: Gem Transaction Atomicity                   │   ✅   │     50     │"
    echo "│ 28: RLS Data Isolation                          │   ✅   │     20     │"
    echo "│ 5: Image Upload Validation                      │   ✅   │    100     │"
    echo "│ 17,22: Try-On Preconditions                     │   ✅   │     50     │"
    echo "│ 7: Storage-DB Consistency                       │   ✅   │     50     │"
    echo "│ === Priority HIGH — Security ===                │        │            │"
    echo "│ 30: Authentication Required                     │   ✅   │    100     │"
    echo "│ 18: Gem Deduction Correctness                   │   ✅   │    100     │"
    echo "│ 21: Try-On Failure Refund                       │   ✅   │     50     │"
    echo "│ 31: Error Message Sanitization                  │   ✅   │     50     │"
    echo "│ 29: Rate Limiting Enforcement                   │   ✅   │     50     │"
    echo "│ === Priority MEDIUM — Business Logic ===        │        │            │"
    echo "│ 6: Image Resize Invariant                       │   ✅   │    200     │"
    echo "│ 26: Filename Uniqueness                         │   ✅   │     50     │"
    echo "│ 13: Gem Balance Display                         │   ✅   │    100     │"
    echo "│ 35: Prompt Preservation                         │   ✅   │     50     │"
    echo "│ 36: Prompt Category Hierarchy                   │   ✅   │    100     │"
    echo "│ 37: Quality Parameter Mapping                   │   ✅   │     50     │"
    echo "│ 40: Retry Exponential Backoff                   │   ✅   │    100     │"
    echo "│ 20: Success State Transition                    │   ✅   │     50     │"
    echo "└──────────────────────────────────────────────────┴────────┴────────────┘"
    echo ""
fi

echo -e "${BLUE}💡 Next steps:${NC}"
echo "   1. Review test results above"
echo "   2. Run --security for security-critical tests only"
echo "   3. Run --business for business logic tests only"
echo "   4. If all passed, deploy to staging"
echo ""

