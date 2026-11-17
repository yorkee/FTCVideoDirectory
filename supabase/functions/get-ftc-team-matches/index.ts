import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const FIRST_BASE_URL = "https://ftc-api.firstinspires.org/v2.0";
const ALLOWED_SEASONS = new Set([2026]);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type FirstRecord = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const valueNumber = Number(value);
  return Number.isFinite(valueNumber) ? valueNumber : null;
}
function normalizeMatch(match: FirstRecord) {
  const teams = Array.isArray(match.teams) ? match.teams as FirstRecord[] : [];
  const redTeams = teams.filter(team => String(team.station ?? "").toLowerCase().startsWith("red"));
  const blueTeams = teams.filter(team => String(team.station ?? "").toLowerCase().startsWith("blue"));
  return {
    matchNumber: Number(match.matchNumber ?? match.matchNumber),
    description: typeof match.description === "string" ? match.description : "",
    tournamentLevel: typeof match.tournamentLevel === "string" ? match.tournamentLevel : "qual",
    startTime: typeof match.startTime === "string" ? match.startTime : null,
    scoreRedFinal: numberOrNull(match.scoreRedFinal),
    scoreBlueFinal: numberOrNull(match.scoreBlueFinal),
    redTeams,
    blueTeams,
  };
}
async function firstGet(path: string, headers: HeadersInit) {
  const response = await fetch(`${FIRST_BASE_URL}/${path}`, { headers });
  if (!response.ok) {
    const retryAfter = response.headers.get("Retry-After");
    throw new Error(`FIRST API returned HTTP ${response.status}${retryAfter ? ` (Retry-After: ${retryAfter})` : ""}.`);
  }
  return await response.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);

  try {
    const username = Deno.env.get("FIRST_API_USERNAME");
    const token = Deno.env.get("FIRST_API_TOKEN");
    if (!username || !token) throw new Error("FIRST API credentials are not configured on this Edge Function.");

    const body = await req.json();
    const teamNumber = Number(body.teamNumber);
    const seasonYear = Number(body.seasonYear);
    if (!Number.isInteger(teamNumber) || teamNumber < 1 || teamNumber > 99999) {
      return json({ success: false, error: "Enter a valid FTC team number." }, 400);
    }
    if (!ALLOWED_SEASONS.has(seasonYear)) {
      return json({ success: false, error: "Match history is not enabled for that season yet." }, 400);
    }

    const authorization = `Basic ${btoa(`${username}:${token}`)}`;
    const headers = { Authorization: authorization, Accept: "application/json" };
    const eventPayload = await firstGet(`${seasonYear}/events?teamNumber=${teamNumber}`, headers);
    if (!Array.isArray(eventPayload.events)) throw new Error("FIRST returned an unexpected events response.");

    const events = await Promise.all((eventPayload.events as FirstRecord[]).map(async event => {
      const eventCode = String(event.code ?? "");
      if (!eventCode) return { event, matches: [] };
      const [qualPayload, playoffPayload] = await Promise.all([
        firstGet(`${seasonYear}/schedule/${encodeURIComponent(eventCode)}?tournamentLevel=qual&teamNumber=${teamNumber}`, headers),
        firstGet(`${seasonYear}/schedule/${encodeURIComponent(eventCode)}?tournamentLevel=playoff&teamNumber=${teamNumber}`, headers),
      ]);
      const matches = [
        ...(Array.isArray(qualPayload.schedule) ? qualPayload.schedule : []),
        ...(Array.isArray(playoffPayload.schedule) ? playoffPayload.schedule : []),
      ].map((match: FirstRecord) => normalizeMatch(match))
        .filter((match: ReturnType<typeof normalizeMatch>) =>
          [...match.redTeams, ...match.blueTeams].some(team => Number(team.teamNumber) === teamNumber))
        .sort((a: ReturnType<typeof normalizeMatch>, b: ReturnType<typeof normalizeMatch>) =>
          (a.tournamentLevel === b.tournamentLevel ? a.matchNumber - b.matchNumber : a.tournamentLevel === "qual" ? -1 : 1));
      return { event, matches };
    }));

    return json({ success: true, season: seasonYear, teamNumber, events });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown FIRST API error.";
    console.error("FTC team match history failed:", message);
    return json({ success: false, error: message }, 502);
  }
});
