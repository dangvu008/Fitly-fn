/**
 * File: ENVIRONMENT_CONFIG.js
 * Purpose: Lưu trữ các cấu hình tĩnh, flag tính năng tự đồng bộ và dữ liệu giả (Mock) cho chế độ Demo
 * Layer: Infrastructure (Config)
 * * Data Contract:
 * - Constant outputs cho các state cơ bản và default demo
 */


// Set true để bypass auth check (chỉ dùng cho development/testing)
export const DEMO_MODE_OVERRIDE = false;

export const FEATURES = {
    SYNC_TO_CLOUD: true,
    OFFLINE_FALLBACK: true,
    AUTO_SYNC_INTERVAL: 5 * 60 * 1000,
    USE_LOCAL_API: false,
};

export const SUPABASE_AUTH_URL = 'https://lluidqwmyxuonvmcansp.supabase.co';
export const SUPABASE_AUTH_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdWlkcXdteXh1b252bWNhbnNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5ODkxNjMsImV4cCI6MjA4NDU2NTE2M30.mXg9_pJ4igSn4LeVwcvT4tlEMoRFY54nSdNbEnzp734';

export const MOCK_USER = {
    id: 'mock-user-001',
    email: 'demo@fitly.app',
};

export const MOCK_PROFILE = {
    id: 'mock-user-001',
    email: 'demo@fitly.app',
    full_name: 'Demo User',
    display_name: 'Demo User',
    avatar_url: null,
    gems_balance: 50,
    model_image_url: null,
    created_at: new Date().toISOString(),
};

export const MOCK_WARDROBE = [
    {
        id: 'wardrobe-001',
        image_url: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400',
        name: 'Áo thun trắng basic',
        category: 'top',
    },
    {
        id: 'wardrobe-002',
        image_url: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400',
        name: 'Quần jeans xanh',
        category: 'bottom',
    },
    {
        id: 'wardrobe-003',
        image_url: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400',
        name: 'Áo khoác denim',
        category: 'outerwear',
    },
];

export const MOCK_OUTFITS = [
    {
        id: 'outfit-001',
        name: 'Casual Friday',
        result_image_url: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600',
        created_at: new Date().toISOString(),
    },
];

export const MOCK_TRYON_RESULTS = [
    'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800',
    'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=800',
    'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=800',
    'https://images.unsplash.com/photo-1581044777550-4cfa60707c03?w=800',
    'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800',
    'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=800',
    'https://images.unsplash.com/photo-1475180098004-ca77a66827be?w=800',
    'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800',
    'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=800',
    'https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?w=800',
    'https://images.unsplash.com/photo-1487222477894-8943e31ef7b2?w=800',
    'https://images.unsplash.com/photo-1479064555552-3ef4979f8908?w=800',
    'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=800',
    'https://images.unsplash.com/photo-1502716119720-b23a93e5fe1b?w=800',
    'https://images.unsplash.com/photo-1488716820149-c88a428d37e8?w=800',
    'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800',
    'https://images.unsplash.com/photo-1488161628813-04466f872be2?w=800',
    'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=800',
    'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800',
    'https://images.unsplash.com/photo-1492447166138-50c3889fccb1?w=800',
];

export let demoState = {
    gemsBalance: 50,
    wardrobe: [...MOCK_WARDROBE],
    outfits: [...MOCK_OUTFITS],
    modelImage: null,
    recentClothing: [],
    userModels: [],
    defaultModelId: null,
};
