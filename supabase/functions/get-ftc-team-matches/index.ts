import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const FIRST_BASE_URL = "https://ftc-api.firstinspires.org/v2.0";
const ALLOWED_SEASONS = new Set([2026]);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type FirstRecord = Record<string, unknown>;
type EventRow = {
  event_code: string;
  season_year: number;
  event_name: string;
  date_start: string | null;
  date_end: string | null;
  venue: string | null;
  city: string | null;
  state_prov: string | null;
  country: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function normalizeMatch(match: FirstRecord) {
  const teams = Array.isArray(match.teams) ? match.teams as FirstRecord[] : [];
  return {
    matchNumber: Number(match.matchNumber ?? 0),
    description: typeof match.description === "string" ? match.description : "",
    tournamentLevel: typeof match.tournamentLevel === "string" ? match.tournamentLevel : "qual",
    startTime: typeof match.startTime === "string" ? match.startTime : null,
    scoreRedFinal: numberOrNull(match.scoreRedFinal),
    scoreBlueFinal: numberOrNull(match.scoreBlueFinal),
    redTeams: teams.filter(team => String(team.station ?? "").toLowerCase().startsWith("red")),
    blueTeams: teams.filter(team => String(team.station ?? "").toLowerCase().startsWith("blue")),
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
function matchMergeKey(match: FirstRecord): string {
  const teams = Array.isArray(match.teams) ? (match.teams as FirstRecord[])
    .map(team => `${String(team.station ?? "").toLowerCase()}:${String(team.teamNumber ?? team.team ?? "")}`)
    .sort()
    .join(",") : "";
  const description = text(match.description)?.toLowerCase() ?? "";
  // Match numbers can repeat in playoff brackets. Alliance assignments distinguish
  // those matches while still matching the scheduled row to its result row.
  const fallback = `${description}:${String(match.field ?? "")}:${String(match.startTime ?? "")}`;
  return [String(match.matchNumber ?? ""), teams || fallback].join("|");
}
function mergeScheduleAndResults(schedulePayload: FirstRecord, resultPayload: FirstRecord, level: string): FirstRecord[] {
  const scheduled = Array.isArray(schedulePayload.schedule) ? schedulePayload.schedule as FirstRecord[] : [];
  const results = Array.isArray(resultPayload.matches) ? resultPayload.matches as FirstRecord[] : [];
  const merged = new Map<string, FirstRecord>();
  for (const match of scheduled) {
    const key = matchMergeKey(match);
    merged.set(key, { ...match, tournamentLevel: match.tournamentLevel ?? level });
  }
  for (const match of results) {
    const key = matchMergeKey(match);
    merged.set(key, { ...(merged.get(key) ?? {}), ...match, tournamentLevel: match.tournamentLevel ?? level });
  }
  return [...merged.values()];
}
function toEventRow(event: FirstRecord, seasonYear: number): EventRow | null {
  const eventCode = text(event.code);
  const eventName = text(event.name);
  if (!eventCode || !eventName) return null;
  return {
    event_code: eventCode,
    season_year: seasonYear,
    event_name: eventName,
    date_start: text(event.dateStart),
    date_end: text(event.dateEnd),
    venue: text(event.venue),
    city: text(event.city),
    state_prov: text(event.stateprov),
    country: text(event.country),
  };
}
function meaningfulTokens(value: string): string[] {
  const ignored = new Set(["first", "tech", "challenge", "ftc", "robotics", "robot", "2026", "2027", "2026-2027", "event", "qualifier", "qualification", "tournament", "the", "and"]);
  return [...new Set(value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(token => token.length > 2 && !ignored.has(token)))];
}
async function discoverFirstEventYoutubeUrl(event: EventRow): Promise<string | null> {
  const eventPageUrl = `https://ftc-events.firstinspires.org/${event.season_year}/${encodeURIComponent(event.event_code)}`;
  const response = await fetch(eventPageUrl);
  if (!response.ok) return null;

  const html = await response.text();
  const hrefs = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)];
  for (const match of hrefs) {
    try {
      const candidate = new URL(match[1].replace(/&amp;/g, "&"), eventPageUrl);
      const host = candidate.hostname.toLowerCase();
      const isYoutube = host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be";
      const isVideo = candidate.pathname.startsWith("/live/") ||
        (candidate.pathname === "/watch" && candidate.searchParams.has("v")) ||
        (candidate.pathname === "/playlist" && candidate.searchParams.has("list"));
      if (isYoutube && isVideo) return candidate.toString();
    } catch {
      // Ignore malformed or unrelated links in the FIRST event page.
    }
  }
  return null;
}

async function discoverYoutubeUrl(event: EventRow, apiKey: string): Promise<string | null> {
  // Qualifier/tournament are intentionally ignored, so city and state provide
  // useful matching tokens for events such as "Athens Qualifier".
  const eventTokens = meaningfulTokens([event.event_name, event.city, event.state_prov].filter(Boolean).join(" "));
  if (!eventTokens.length) return null;

  const query = [event.event_name, event.city, event.state_prov, "FIRST Tech Challenge FTC"].filter(Boolean).join(" ");
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.search = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoDuration: "long",
    maxResults: "25",
    q: query,
    key: apiKey,
  }).toString();

  const searchResponse = await fetch(searchUrl);
  if (!searchResponse.ok) throw new Error(`YouTube search returned HTTP ${searchResponse.status}.`);
  const searchPayload = await searchResponse.json();
  const ids = (Array.isArray(searchPayload.items) ? searchPayload.items : [])
    .map((item: FirstRecord) => text((item.id as FirstRecord | undefined)?.videoId))
    .filter((id: string | null): id is string => Boolean(id));
  if (!ids.length) return null;

  const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  videosUrl.search = new URLSearchParams({
    part: "snippet,contentDetails",
    id: ids.join(","),
    key: apiKey,
  }).toString();
  const videosResponse = await fetch(videosUrl);
  if (!videosResponse.ok) throw new Error(`YouTube video lookup returned HTTP ${videosResponse.status}.`);
  const videosPayload = await videosResponse.json();
  const candidates = (Array.isArray(videosPayload.items) ? videosPayload.items : [])
    .map((video: FirstRecord) => {
      const snippet = (video.snippet ?? {}) as FirstRecord;
      const title = text(snippet.title) ?? "";
      const description = text(snippet.description) ?? "";
      const content = (video.contentDetails ?? {}) as FirstRecord;
      const duration = parseIsoDuration(String(content.duration ?? ""));
      const titleTokens = new Set(meaningfulTokens(title));
      const descriptionTokens = new Set(meaningfulTokens(description));
      const titleOverlap = eventTokens.filter(token => titleTokens.has(token)).length;
      const descriptionOverlap = eventTokens.filter(token => descriptionTokens.has(token)).length;
      // Prefer event names in the title, but allow a match in the description
      // when a video title is generic (for example, "FTC Match Replay").
      const score = titleOverlap / eventTokens.length + (descriptionOverlap / eventTokens.length) * 0.25;
      return { id: text(video.id), score, titleOverlap, duration };
    })
    .filter((video: { id: string | null; score: number; titleOverlap: number; duration: number }) =>
      video.id && video.duration >= 7200 && (video.titleOverlap > 0 || video.score >= 0.5))
    .sort((a: { score: number }, b: { score: number }) => b.score - a.score);

  return candidates.length ? `https://www.youtube.com/watch?v=${candidates[0].id}` : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);

  try {
    const username = Deno.env.get("FIRST_API_USERNAME");
    const token = Deno.env.get("FIRST_API_TOKEN");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (!username || !token) throw new Error("FIRST API credentials are not configured on this Edge Function.");
    if (!supabaseUrl || !secretKeysRaw) throw new Error("Supabase server environment configuration is missing.");

    const secretKeys = JSON.parse(secretKeysRaw);
    const serviceKey = secretKeys["default"];
    if (!serviceKey) throw new Error("Default Supabase secret key is unavailable to this function.");
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

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

    const events: Array<{ event: FirstRecord; matches: ReturnType<typeof normalizeMatch>[] }> = [];
    const eventRows = (eventPayload.events as FirstRecord[])
      .map(event => toEventRow(event, seasonYear))
      .filter((event): event is EventRow => Boolean(event));

    if (eventRows.length) {
      const { error: eventUpsertError } = await supabase.from("ftc_events").upsert(eventRows, { onConflict: "season_year,event_code" });
      if (eventUpsertError) throw new Error(`Could not save FIRST events: ${eventUpsertError.message}`);

      const mappings = eventRows.map(event => ({ team_number: teamNumber, season_year: seasonYear, event_code: event.event_code }));
      const { error: mappingError } = await supabase.from("ftc_team_events").upsert(mappings, {
        onConflict: "team_number,season_year,event_code",
        ignoreDuplicates: true,
      });
      if (mappingError) throw new Error(`Could not save team/event relationships: ${mappingError.message}`);
    }

    const youtubeApiKey = Deno.env.get("YOUTUBE_API_KEY");
    const enrichedEvents: Array<{ event: FirstRecord; matches: ReturnType<typeof normalizeMatch>[] }> = [];

    // Fetch the team's schedule/results and attach the persisted event record.
    for (const event of eventPayload.events as FirstRecord[]) {
      const eventCode = String(event.code ?? "");
      if (!eventCode) {
        enrichedEvents.push({ event, matches: [] });
        continue;
      }

      let storedEvent: FirstRecord | null = null;
      const { data: eventRecord, error: eventReadError } = await supabase
        .from("ftc_events")
        .select("youtube_url,youtube_verified,youtube_last_searched_at,event_name")
        .eq("season_year", seasonYear).eq("event_code", eventCode)
        .maybeSingle();
      if (eventReadError) throw new Error(`Could not load saved event link: ${eventReadError.message}`);
      storedEvent = eventRecord as FirstRecord | null;

      if (storedEvent && (!storedEvent.youtube_verified || !text(storedEvent.youtube_url))) {
        const row = eventRows.find(item => item.event_code === eventCode);
        if (row) {
          try {
            // FIRST's event page is authoritative. Check it even when an older
            // YouTube URL is already saved, and replace that URL if FIRST now
            // publishes a different official event video.
            const officialUrl = await discoverFirstEventYoutubeUrl(row);
            if (officialUrl && officialUrl !== text(storedEvent.youtube_url)) {
              const { error: officialUpdateError } = await supabase.from("ftc_events")
                .update({ youtube_url: officialUrl, youtube_verified: true, updated_at: new Date().toISOString() })
                .eq("season_year", seasonYear).eq("event_code", eventCode);
              if (officialUpdateError) console.error("Could not save official FIRST event video URL:", officialUpdateError.message);
            } else if (!text(storedEvent.youtube_url) && !officialUrl && youtubeApiKey) {
              // Search for event videos, not just long livestreams. Respect the
              // seven-day cooldown because this search consumes YouTube API quota.
              const lastSearched = storedEvent.youtube_last_searched_at ? new Date(String(storedEvent.youtube_last_searched_at)).getTime() : 0;
              const sevenDays = 7 * 24 * 60 * 60 * 1000;
              if (!lastSearched || Date.now() - lastSearched >= sevenDays) {
                await supabase.from("ftc_events").update({ youtube_last_searched_at: new Date().toISOString() })
                  .eq("season_year", seasonYear).eq("event_code", eventCode);
                const discoveredUrl = await discoverYoutubeUrl(row, youtubeApiKey);
                if (discoveredUrl) {
                  const { error: youtubeUpdateError } = await supabase.from("ftc_events")
                    .update({ youtube_url: discoveredUrl, youtube_verified: false, updated_at: new Date().toISOString() })
                    .eq("season_year", seasonYear).eq("event_code", eventCode)
                    .is("youtube_url", null);
                  if (youtubeUpdateError) console.error("Could not save discovered YouTube URL:", youtubeUpdateError.message);
                }
              }
            }
          } catch (youtubeError) {
            console.error("Event video discovery failed:", youtubeError instanceof Error ? youtubeError.message : youtubeError);
          }
        }
        const { data: refreshed } = await supabase.from("ftc_events")
          .select("youtube_url,youtube_verified,youtube_last_searched_at,event_name")
          .eq("season_year", seasonYear).eq("event_code", eventCode).maybeSingle();
        storedEvent = refreshed as FirstRecord | null;
      }

      const eventWithVideo = {
        ...event,
        youtubeUrl: text(storedEvent?.youtube_url),
        youtubeVerified: Boolean(storedEvent?.youtube_verified),
      };

      const levels = ["qual", "playoff"];
      const matchesForEvent: FirstRecord[] = [];
      for (const level of levels) {
        const [schedulePayload, resultPayload] = await Promise.all([
          firstGet(`${seasonYear}/schedule/${encodeURIComponent(eventCode)}?tournamentLevel=${level}&teamNumber=${teamNumber}`, headers),
          firstGet(`${seasonYear}/matches/${encodeURIComponent(eventCode)}?tournamentLevel=${level}&teamNumber=${teamNumber}`, headers),
        ]);
        matchesForEvent.push(...mergeScheduleAndResults(schedulePayload, resultPayload, level));
      }
      const matches = matchesForEvent.map(match => normalizeMatch(match))
        .filter(match => [...match.redTeams, ...match.blueTeams].some(team => Number(team.teamNumber) === teamNumber))
        .sort((a, b) => a.tournamentLevel === b.tournamentLevel
          ? a.matchNumber - b.matchNumber
          : a.tournamentLevel === "qual" ? -1 : 1);
      enrichedEvents.push({ event: eventWithVideo, matches });
    }

    return json({ success: true, season: seasonYear, teamNumber, events: enrichedEvents });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown FIRST API error.";
    console.error("FTC team match history failed:", message);
    return json({ success: false, error: message }, 502);
  }
});
