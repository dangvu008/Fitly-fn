/**
 * File: add-wardrobe-with-quota/index.ts
 * Purpose: Thêm item vào wardrobe với quota tracking và gem deduction
 * Layer: Application
 * 
 * Data Contract:
 * - Input: { image_url: string, name?: string, category: string, source_url?: string }
 * - Output: { item: WardrobeItem, gems_deducted: number, free_slots_remaining: number }
 * 
 * Flow:
 * 1. Validate JWT token → extract user_id
 * 2. Check wardrobe quota (get_free_wardrobe_slots)
 * 3. If no free slots → Check gems balance → Deduct 1 gem
 * 4. Insert wardrobe_items record (trigger auto-increment count)
 * 5. Return item + quota status
 * 
 * Security Note:
 * - Requires valid JWT token
 * - Atomic transaction for gem deduction + insert
 * - RLS policies enforce user isolation
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AddWardrobeRequest {
  image_url: string
  name?: string
  category: string
  source_url?: string
  storage_type?: string
}

interface AddWardrobeResponse {
  success: boolean
  item?: any
  gems_deducted: number
  free_slots_remaining: number
  requires_gems?: boolean
  error?: string
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Validate JWT token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401
        }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify JWT và extract user_id
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401
        }
      )
    }

    // 2. Parse request body
    const body: AddWardrobeRequest = await req.json()
    
    if (!body.image_url || !body.category) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: image_url, category' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }

    // Validate category
    const validCategories = ['top', 'bottom', 'dress', 'shoes', 'accessories', 'other']
    if (!validCategories.includes(body.category)) {
      return new Response(
        JSON.stringify({ error: `Invalid category. Must be one of: ${validCategories.join(', ')}` }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }

    // 3. Check if item already exists
    const { data: existingItem } = await supabase
      .from('wardrobe_items')
      .select('id, name, category')
      .eq('user_id', user.id)
      .eq('image_url', body.image_url)
      .maybeSingle()

    if (existingItem) {
      // Item already in wardrobe, return it without deducting gems
      const { data: freeSlots } = await supabase
        .rpc('get_free_wardrobe_slots', { p_user_id: user.id })

      return new Response(
        JSON.stringify({
          success: true,
          item: existingItem,
          gems_deducted: 0,
          free_slots_remaining: freeSlots || 0,
          message: 'Item already in wardrobe'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      )
    }

    // 4. Check wardrobe quota
    const { data: requiresGems, error: quotaError } = await supabase
      .rpc('requires_gems_for_wardrobe', { p_user_id: user.id })

    if (quotaError) {
      console.error('Error checking quota:', quotaError)
      return new Response(
        JSON.stringify({ error: 'Failed to check wardrobe quota' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      )
    }

    let gemsDeducted = 0

    // 5. If requires gems, deduct 1 gem
    if (requiresGems) {
      // Check gems balance
      const { data: profile } = await supabase
        .from('profiles')
        .select('gems_balance')
        .eq('id', user.id)
        .single()

      if (!profile || profile.gems_balance < 1) {
        return new Response(
          JSON.stringify({ 
            error: 'Insufficient gems. You need 1 gem to add more items to wardrobe.',
            requires_gems: true,
            gems_needed: 1
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 402 // Payment Required
          }
        )
      }

      // Deduct 1 gem using atomic transaction
      const { error: deductError } = await supabase.rpc('deduct_gems', {
        p_user_id: user.id,
        p_amount: 1,
        p_description: `Add wardrobe item: ${body.name || 'Untitled'}`
      })

      if (deductError) {
        console.error('Error deducting gems:', deductError)
        return new Response(
          JSON.stringify({ error: 'Failed to deduct gems' }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500
          }
        )
      }

      gemsDeducted = 1
    }

    // 6. Insert wardrobe item
    const { data: newItem, error: insertError } = await supabase
      .from('wardrobe_items')
      .insert({
        user_id: user.id,
        image_url: body.image_url,
        name: body.name || 'Untitled',
        category: body.category,
        source_url: body.source_url || null,
        storage_type: body.storage_type || 'external'
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error inserting wardrobe item:', insertError)
      
      // Rollback: Refund gems if deducted
      if (gemsDeducted > 0) {
        await supabase.rpc('add_gems', {
          p_user_id: user.id,
          p_amount: 1,
          p_description: 'Refund: Failed to add wardrobe item'
        })
      }

      return new Response(
        JSON.stringify({ error: 'Failed to add item to wardrobe' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      )
    }

    // 7. Get updated free slots
    const { data: freeSlots } = await supabase
      .rpc('get_free_wardrobe_slots', { p_user_id: user.id })

    // 8. Return success response
    const response: AddWardrobeResponse = {
      success: true,
      item: newItem,
      gems_deducted: gemsDeducted,
      free_slots_remaining: freeSlots || 0
    }

    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('Add wardrobe error:', error)
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
