import { useEffect, useState } from 'react';
import EventCard from './components/events/EventCard';
import EventDetailsModal from './components/events/EventDetailsModal';
import type { EventRow } from './components/events/types';
import { supabase } from './lib/supabase';

export default function EventSearch({query, season, exactCode}: {query: string; season: number; exactCode: boolean}) {
  const [rows,setRows] = useState<EventRow[]>([]);
  const [selected,setSelected] = useState<EventRow|null>(null);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');
  const [page,setPage] = useState(0);
  const [retry,setRetry] = useState(0);
  useEffect(() => {setPage(0); setSelected(null);},[query,season]);
  useEffect(() => {
    let active = true;
    setRows([]); setError(''); setSelected(null);
    if (!query.trim()) {setLoading(false); return;}
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        if (!supabase) throw new Error('Connect Supabase to search live events.');
        const {data,error} = await supabase.rpc('search_ftc_events',{p_query:query.trim(),p_season_year:season,p_limit:31,p_offset:page*30});
        if(error) throw new Error(error.message);
        if(!active) return;
        const matches = (data ?? []) as EventRow[];
        setRows(matches);
        if(exactCode && page===0) setSelected(matches.find(e=>e.event_code.toLowerCase()===query.trim().toLowerCase()) ?? null);
      } catch(e) {if(active) setError(e instanceof Error ? e.message : 'Event search failed.');}
      finally {if(active) setLoading(false);}
    },250);
    return () => {active=false; window.clearTimeout(timer);};
  },[query,season,page,retry,exactCode]);
  function renderResults() {
    if (!query.trim()) return <div className="start-state">Search by event code, name, city, state or venue.</div>;
    if (loading) return <div className="loading-state" role="status">Searching events…</div>;
    if (error) {
      return (
        <div
          className="empty-state"
          role="alert"
        >
          {error}
          <button
            className="text-button"
            onClick={() => setRetry(n => n + 1)}
          >
            Try again
          </button>
        </div>
      );
    }
    if (!rows.length) return <div className="empty-state">No matching events in the indexed directory.</div>;
    return (
      <div className="team-grid">
        {rows.slice(0, 30).map(event => (
          <EventCard
            key={event.season_year + ':' + event.event_code}
            event={event}
            onSelect={setSelected}
          />
        ))}
      </div>
    );
  }

  return (
    <section className="content-section">
      <div className="section-heading">
        <div>
          <div className="eyebrow dark">
            <b />
            EVENT EXPLORER
          </div>
          <h2>{query.trim() ? 'Events for “' + query.trim() + '”' : 'Find an event.'}</h2>
        </div>
      </div>
      {renderResults()}
      {!loading && !error && (page > 0 || rows.length > 30) && (
        <div className="event-pagination">
          <button
            disabled={page === 0}
            onClick={() => setPage(n => n - 1)}
          >
            Previous
          </button>
          <span>Page {page + 1}</span>
          <button
            disabled={rows.length <= 30}
            onClick={() => setPage(n => n + 1)}
          >
            Next
          </button>
        </div>
      )}
      {selected && (
        <EventDetailsModal
          key={selected.season_year + ':' + selected.event_code}
          event={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
