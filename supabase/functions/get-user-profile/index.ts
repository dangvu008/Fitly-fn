/**
 * File: get-user-profile/index.ts
 * Purpose: Trả về profile đầy đủ của user (gems, models, info)
 * Layer: Application
 *
 * Data Contract:
 * - Input: JWT Authorization header
 * - Output: { profile: { gems_balance, full_name, email, avatar_url }, user_models: [] }
 *
 * Flow:
 * 1. Validate JWT
 * 2. Query profiles table
 * 3. Query user_models table
 * 4. Return combined profile data
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_ANON_KEY')!,
            { global: { headers: { Authorization: authHeader } } }
        )

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Query profile + user models in parallel
        const [profileResult, modelsResult] = await Promise.all([
            supabase
                .from('profiles')
                .select('id, email, full_name, display_name, avatar_url, gems_balance, model_image_url, created_at')
                .eq('id', user.id)
                .single(),
            supabase
                .from('user_models')
                .select('id, image_url, is_default, source, created_at')
                .eq('user_id', user.id)
                .order('is_default', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(20)
        ])

        if (profileResult.error) {
            console.error('Profile query error:', profileResult.error)
            return new Response(JSON.stringify({ error: 'Failed to fetch profile' }), {
                status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        return new Response(JSON.stringify({
            profile: profileResult.data,
            user_models: modelsResult.data || []
        }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

    } catch (error) {
        console.error('get-user-profile error:', error)
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
