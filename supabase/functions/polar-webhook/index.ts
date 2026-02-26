/**
 * File: polar-webhook/index.ts
 * Purpose: Nhận webhook từ Polar để nạp Gems cho người dùng
 * Layer: Application
 * 
 * Input: Payload Webhook từ Polar.sh (chứa meta data và thông tin order)
 * Output: 200 OK (nếu xử lý thành công)
 * 
 * Flow:
 * 1. Lọc điều kiện sự kiện Webhook (chỉ quan tâm `order.created`).
 * 2. Xác thực Webhook Signature bằng `POLAR_WEBHOOK_SECRET`.
 * 3. Trích xuất `user_id` từ `metadata` của Order và `gateway_transaction_id`.
 * 4. Dùng Supabase Service Role (admin) để gọi hàm `add_gems` tăng Gems.
 * 
 * Security Note:
 * - KHÔNG YÊU CẦU JWT vì là API public cho Polar gọi vào.
 * - NGHIÊM NGẶT KIỂM TRA CHỮ KÝ WEBHOOK.
 */

// @ts-nocheck — Deno runtime file: deno.land và Deno.env không được VS Code TS server nhận dạng

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as crypto from 'https://deno.land/std@0.168.0/crypto/mod.ts'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, polar-webhook-signature',
}

// Hàm xác thực chữ ký Webhook (HMAC SHA-256)
async function verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
    );

    const signatureBytes = new Uint8Array(signature.match(/[\da-f]{2}/gi)!.map(h => parseInt(h, 16)));

    return await crypto.subtle.verify(
        'HMAC',
        key,
        signatureBytes,
        encoder.encode(payload)
    );
}

serve(async (req) => {
    // Xử lý CORS (nếu Polar có gửi preflight, dù thường là POST trực tiếp)
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const payloadText = await req.text()
        const signature = req.headers.get('polar-webhook-signature')
        const webhookSecret = Deno.env.get('POLAR_WEBHOOK_SECRET')

        if (!signature || !webhookSecret) {
            console.error('Missing signature or secret');
            return new Response('Invalid configuration', { status: 400 })
        }

        // 1. Xác thực chữ ký
        const isValid = await verifySignature(payloadText, signature, webhookSecret);
        if (!isValid) {
            console.error('Invalid signature');
            return new Response('Invalid signature', { status: 401 })
        }

        const payload = JSON.parse(payloadText)

        // 2. Chỉ quan tâm khi một Order được thanh toán xong (tương tự charge.succeeded hoặc order.created)
        if (payload.type !== 'order.created') {
            return new Response('Event ignored', { status: 200 })
        }

        const data = payload.data
        const userId = data.metadata?.user_id
        const gatewayTransactionId = data.id // Order ID
        const priceId = data.product_price_id

        if (!userId || !priceId) {
            console.error('Missing userId or priceId in webhook payload:', data);
            return new Response('Missing info in webhook', { status: 400 })
        }

        // 3. Kết nối Supabase bằng Service Role để thao tác DB bỏ qua RLS
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Lấy thông tin gói Gems từ DB để biết cần nạp bao nhiêu
        const { data: pkgData, error: pkgError } = await supabaseAdmin
            .from('gem_packages')
            .select('gems, name')
            .eq('gateway_price_id', priceId)
            .single()

        if (pkgError || !pkgData) {
            console.error('Cannot find gem package with priceId:', priceId);
            return new Response('Package not found', { status: 400 })
        }

        // 4. Gọi function nạp thẻ tích hợp sẵn (từ migration 00_complete_setup)
        // add_gems(p_user_id UUID, p_amount INT, p_type TEXT, p_description TEXT, p_stripe_id TEXT)
        const { error: rpcError } = await supabaseAdmin.rpc('add_gems', {
            p_user_id: userId,
            p_amount: pkgData.gems,
            p_type: 'purchase',
            p_description: `Purchased package: ${pkgData.name}`,
            p_stripe_id: gatewayTransactionId // Cột tên cũ nhưng chứa ID Polar mới
        });

        if (rpcError) {
            console.error('Error adding gems:', rpcError);
            return new Response('Database error', { status: 500 })
        }

        return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })

    } catch (error: unknown) {
        const err = error as Error
        console.error('Webhook error:', err.message)
        return new Response('Webhook handling failed', { status: 500 })
    }
})
