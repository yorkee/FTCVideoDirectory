import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { EventRow } from './types';

type Recording = {
  youtube_url: string;
  recording_type: string;
};

export default function EventVideos({ event }: { event: EventRow }) {
  const [videos, setVideos] = useState<Recording[]>([]);

  const [discoveredProvider, setDiscoveredProvider] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);

  useEffect(() => {
    let active = true;
    setVideos([]);
    setDiscoveredProvider(null);
    const client = supabase;
    if (client) {
      const refresh = async () => {
        const { data } = await client
          .from('ftc_event_videos')
          .select('youtube_url,recording_type')
          .eq('season_year', event.season_year)
          .eq('event_code', event.event_code);
        if (active) setVideos(data ?? []);
      };
      void (async () => {
        await refresh();
        if (!active) return;
        setDiscovering(true);
        try {
          const { data, error } = await client.functions.invoke('discover-ftc-event-videos', {
            body: { seasonYear: event.season_year, eventCode: event.event_code },
          });
          if (!error && active) {
            setDiscoveredProvider(data?.official_livestream_url ?? null);
            await refresh();
          }
        } finally {
          if (active) setDiscovering(false);
        }
      })().catch(console.error);
    }
    return () => { active = false; };
  }, [event.season_year, event.event_code]);

  const provider = discoveredProvider ?? event.official_livestream_url;
  const hasProvider = provider && /^https:\/\/fimav\.us\/live\//.test(provider);
  const recordings = videos.filter(video =>
    /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/.test(video.youtube_url)
  );
  const legacyUrl = event.youtube_url;

  function renderRecordings() {
    if (recordings.length) {
      return recordings.map(video => (
        <p key={video.youtube_url}>
          <a
            href={video.youtube_url}
            target="_blank"
            rel="noreferrer"
          >
            Watch {video.recording_type === 'unknown' ? 'event recording' : video.recording_type}
          </a>
        </p>
      ));
    }
    if (legacyUrl && /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(legacyUrl)) {
      return (
        <p>
          <a
            href={legacyUrl}
            target="_blank"
            rel="noreferrer"
          >
            Watch event video{event.youtube_verified ? '' : ' (unverified)'}
          </a>
        </p>
      );
    }
    return <p>{hasProvider ? 'Direct recording not indexed yet.' : 'No event video indexed yet.'}</p>;
  }

  return (
    <>
      {hasProvider && (
        <p>
          <a
            href={provider}
            target="_blank"
            rel="noreferrer"
          >
            Official livestream
          </a>
        </p>
      )}
      {renderRecordings()}
      {discovering && <p role="status">Checking official livestream sources…</p>}
    </>
  );
}
