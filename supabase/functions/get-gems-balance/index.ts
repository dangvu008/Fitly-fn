/**
 * File: get-gems-balance/index.ts
 * Purpose: Query gems balance của user hiện tại
 * Layer: Application
 * 
 * Data Contract:
 * - Input: None (sử dụng JWT token từ Authorization header)
 * - Output: { gems_balance: number }
 * 
 * Flow:
 * 1. Validate JWT token (tự động bởi Supabase Edge Runtime)
 * 2. Extract user_id từ token đã xác thực
 * 3. Query profiles.gems_balance cho user_id
 * 4. Return gems_balance
 * 
 * Security Note: 
 * - RLS policy đảm bảo user chỉ xem được balance của chính mình
 * - verify_jwt = true được set khi deploy function
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Chỉ chấp nhận GET request
    if (req.method !== "GET") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Lấy JWT token từ Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Tạo Supabase client với auth token
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Lấy user từ token
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Query gems_balance từ profiles table
    // RLS policy tự động đảm bảo chỉ query được profile của user hiện tại
    const { data: profile, error: queryError } = await supabase
      .from("profiles")
      .select("gems_balance")
      .eq("id", user.id)
      .single();

    if (queryError) {
      console.error("Database query error:", queryError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch gems balance" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Nếu profile không tồn tại, trả về balance = 0 (default)
    const gemsBalance = profile?.gems_balance ?? 0;

    return new Response(
      JSON.stringify({ gems_balance: gemsBalance }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
