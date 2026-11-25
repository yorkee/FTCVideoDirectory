export type EventRow = {
  event_code: string;
  event_name: string;
  season_year: number;
  city: string | null;
  state_prov: string | null;
  country: string | null;
  venue: string | null;
  date_start: string | null;
  date_end: string | null;
  youtube_url: string | null;
  youtube_verified: boolean;
  official_livestream_url?: string | null;
  event_type: string | null;
};

export function eventLocation(event: EventRow): string {
  return [event.city, event.state_prov, event.country].filter(Boolean).join(', ');
}
