import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-queue-admin-token",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function safeEqual(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ success: false, error: "Method not allowed." }, 405);

  try {
    const expectedToken = Deno.env.get("FTC_QUEUE_ADMIN_TOKEN");
    if (!expectedToken) {
      console.error("FTC_QUEUE_ADMIN_TOKEN is not configured.");
      return json({ success: false, error: "Queue endpoint is not configured." }, 503);
    }

    const suppliedToken = req.headers.get("x-queue-admin-token") ?? "";
    if (!suppliedToken || !(await safeEqual(suppliedToken, expectedToken))) {
      return json({ success: false, error: "Unauthorized." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (!supabaseUrl || !secretKeysRaw) {
      throw new Error("Supabase server environment configuration is missing.");
    }

    const secretKeys = JSON.parse(secretKeysRaw);
    const serviceKey = secretKeys["default"] ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) throw new Error("Supabase secret key is unavailable.");

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const params = new URL(req.url).searchParams;
    const requestedLimit = Number(params.get("limit") ?? 50);
    const requestedOffset = Number(params.get("offset") ?? 0);
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
    const offset = Number.isInteger(requestedOffset) ? Math.max(requestedOffset, 0) : 0;
    const status = params.get("status");
    const allowedStatuses = new Set(["pending", "processing", "completed", "failed"]);
    if (status && !allowedStatuses.has(status)) {
      return json({ success: false, error: "Invalid status filter.", allowedStatuses: [...allowedStatuses] }, 400);
    }

    let jobsQuery = supabase
      .from("ftc_video_processing_jobs")
      .select("id,season_year,event_code,event_name,video_url,status,attempts,locked_by,locked_at,last_error,created_at,updated_at", { count: "exact" })
      .order("created_at", { ascending: true })
      .range(offset, offset + limit - 1);

    if (status) jobsQuery = jobsQuery.eq("status", status);

    const [jobsResult, countsResult] = await Promise.all([
      jobsQuery,
      supabase.from("ftc_video_processing_jobs").select("status"),
    ]);

    if (jobsResult.error) throw new Error(`Could not read queue jobs: ${jobsResult.error.message}`);
    if (countsResult.error) throw new Error(`Could not read queue counts: ${countsResult.error.message}`);

    const counts = { pending: 0, processing: 0, completed: 0, failed: 0, total: 0 };
    for (const row of countsResult.data ?? []) {
      const key = row.status as keyof typeof counts;
      if (key in counts && key !== "total") counts[key]++;
      counts.total++;
    }

    return json({
      success: true,
      filters: { status, limit, offset },
      counts,
      totalMatching: jobsResult.count ?? 0,
      jobs: jobsResult.data ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown queue error.";
    console.error("FTC video queue lookup failed:", message);
    return json({ success: false, error: "Could not load the video queue." }, 500);
  }
});
