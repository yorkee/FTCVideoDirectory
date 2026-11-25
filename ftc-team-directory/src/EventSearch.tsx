import { useEffect, useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { supabase } from './lib/supabase';

type EventRow = { event_code: string; event_name: string; season_year: number; city: string | null; state_prov: string | null; country: string | null; venue: string | null; date_start: string | null; date_end: string | null; youtube_url: string | null; youtube_verified: boolean; event_type: string | null };
const location = (e: EventRow) => [e.city,e.state_prov,e.country].filter(Boolean).join(', ');
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
  useEffect(()=>{if(!selected)return; const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setSelected(null);};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[selected]);
  return <section className="content-section">
    <div className="section-heading"><div><div className="eyebrow dark"><b/>EVENT EXPLORER</div><h2>{query.trim() ? 'Events for “'+query.trim()+'”' : 'Find an event.'}</h2></div></div>
    {!query.trim() ? <div className="start-state">Search by event code, name, city, state or venue.</div> : loading ? <div className="loading-state" role="status">Searching events…</div> : error ? <div className="empty-state" role="alert">{error}<button className="text-button" onClick={()=>setRetry(n=>n+1)}>Try again</button></div> : !rows.length ? <div className="empty-state">No matching events in the indexed directory.</div> : <div className="team-grid">{rows.slice(0,30).map(e=><button className="team-card" key={e.season_year+':'+e.event_code} onClick={()=>setSelected(e)}><div className="card-top"><span className="team-number">{e.event_code}</span><ArrowRight size={16}/></div><div className="team-identity"><h3>{e.event_name}</h3><span>{location(e)}</span></div><div className="card-bottom"><span>{e.date_start ?? 'Date unavailable'}</span><span>VIEW EVENT</span></div></button>)}</div>}
    {!loading && !error && (page>0 || rows.length>30) && <div className="event-pagination"><button disabled={page===0} onClick={()=>setPage(n=>n-1)}>Previous</button><span>Page {page+1}</span><button disabled={rows.length<=30} onClick={()=>setPage(n=>n+1)}>Next</button></div>}
    {selected && <div className="modal-backdrop" onClick={()=>setSelected(null)}><div className="team-modal" role="dialog" aria-modal="true" aria-labelledby="event-title" onClick={e=>e.stopPropagation()}><button autoFocus className="modal-close" aria-label="Close" onClick={()=>setSelected(null)}><X size={19}/></button><span className="modal-kicker">FTC EVENT · {selected.season_year}</span><div className="modal-number">{selected.event_code}</div><h2 id="event-title">{selected.event_name}</h2><p>{location(selected)}</p><p>{selected.venue}</p><p>{[selected.date_start,selected.date_end].filter(Boolean).join(' – ')}</p><p><a href={'https://ftc-events.firstinspires.org/'+selected.season_year+'/'+encodeURIComponent(selected.event_code)} target="_blank" rel="noreferrer">Official event details and teams</a></p>{selected.youtube_url && /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(selected.youtube_url) ? <p><a href={selected.youtube_url} target="_blank" rel="noreferrer">Watch event video{selected.youtube_verified?'':' (unverified)'}</a></p>:<p>No event video indexed yet.</p>}<button className="modal-done" onClick={()=>setSelected(null)}>Back to search</button></div></div>}
  </section>;
}
