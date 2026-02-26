/**
 * File: create-polar-checkout/index.ts
 * Purpose: Tạo URL thanh toán Polar.sh cho người dùng mua Gems
 * Layer: Application
 * 
 * Input: { package_id: string }
 * Output: { url: string } - Checkout URL từ Polar
 * 
 * Flow:
 * 1. Lấy thông tin người dùng từ JWT (Authorization header).
 * 2. Join `gem_packages` để tìm `gateway_price_id` (Product/Price ID) của Polar.
 * 3. Gửi request đến Polar API tạo Checkout Session kèm theo metadata (user_id).
 * 4. Trả về Checkout URL cho Frontend.
 * 
 * Security Note:
 * - Yêu cầu xác thực JWT qua middleware Supabase.
 * - API Key Polar lấy từ môi trường `POLAR_API_KEY`.
 */

// @ts-nocheck — Deno runtime file: deno.land và Deno.env không được VS Code TS server nhận dạng

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Xử lý CORS cho trình duyệt
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            {
                global: {
                    headers: { Authorization: req.headers.get('Authorization')! },
                },
            }
        )

        // 1. Xác thực user
        const {
            data: { user },
        } = await supabaseClient.auth.getUser()

        if (!user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        const { package_id } = await req.json()

        if (!package_id) {
            return new Response(JSON.stringify({ error: 'Missing package_id' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // 2. Tìm ID biến thể trong database
        // Bỏ qua RLS policy để đọc gateway_price_id nếu cần
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const { data: gemPackage, error: pkgError } = await supabaseAdmin
            .from('gem_packages')
            .select('*')
            .eq('id', package_id)
            .single()

        if (pkgError || !gemPackage) {
            console.error('Package fetch error:', pkgError);
            return new Response(JSON.stringify({ error: 'Invalid package' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        const priceId = gemPackage.gateway_price_id;

        if (!priceId) {
            return new Response(JSON.stringify({ error: 'Package not configured for payment gateway' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // 3. Gửi request tạo Checkout đến Polar
        const apiKey = Deno.env.get('POLAR_API_KEY')
        const polarUrl = Deno.env.get('POLAR_API_URL') || 'https://api.polar.sh/v1/checkouts/custom/'

        if (!apiKey) {
            return new Response(JSON.stringify({ error: 'Payment gateway missing configuration' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // Tạo custom checkout session trên Polar
        const polarResponse = await fetch(polarUrl, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                product_price_id: priceId,
                success_url: "http://localhost:3000/profile?payment=success",
                metadata: {
                    user_id: user.id
                }
            })
        });

        if (!polarResponse.ok) {
            const errorText = await polarResponse.text();
            console.error('Polar error:', errorText);
            return new Response(JSON.stringify({ error: 'Failed to create checkout session' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        const polarData = await polarResponse.json();
        const checkoutUrl = polarData.url;

        // 4. Trả về URLs cho Frontend
        return new Response(JSON.stringify({ url: checkoutUrl }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error: unknown) {
        const err = error as Error
        console.error('Internal server error:', err.message)
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
