import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bot, ChevronRight, CircleHelp, Compass, Database, ExternalLink, Film, Search, ShieldCheck, Sparkles, X } from 'lucide-react';
import { hasSupabaseConfig, supabase } from './lib/supabase';
import { demoTeams } from './data/demoTeams';
import type { Team } from './types';
import EventSearch from './EventSearch';
import TeamMatchHistory from './TeamMatchHistory';

const seasonYear = 2026;
const demoMode = import.meta.env.VITE_DEMO_MODE === 'true';

export default function App() {
  const [mode, setMode] = useState<'teams'|'events'>(() => {const p=new URLSearchParams(window.location.search);return p.has('event_code')||p.has('event_search')?'events':'teams';});
  const [eventQuery,setEventQuery] = useState(()=>{const p=new URLSearchParams(window.location.search);return p.get('event_code') ?? p.get('event_search') ?? '';});
  const [exactCode,setExactCode] = useState(()=>new URLSearchParams(window.location.search).has('event_code'));
  const eventSeason = Number(new URLSearchParams(window.location.search).get('season')) || seasonYear;
  const [query, setQuery] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('team_number')?.trim() || params.get('team_name')?.trim() || '';
  });
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const term = query.trim();
  const isNumber = /^\d+$/.test(term);

  useEffect(() => {
    if (mode !== 'teams') return;
    if (!term) { setTeams([]); setError(''); setLoading(false); return; }
    const timer = window.setTimeout(async () => {
      setLoading(true); setError('');
      try {
        if (hasSupabaseConfig && supabase) {
          let request = supabase.from('ftc_teams').select('team_number, team_name, season_year').eq('season_year', seasonYear).limit(30);
          request = isNumber ? request.eq('team_number', Number(term)) : request.ilike('team_name', `%${term}%`);
          const { data, error: queryError } = await request.order('team_number', { ascending: true });
          if (queryError) throw queryError;
          const matches = (data ?? []) as Team[];
          setTeams(matches);
          const exactMatch = matches.length === 1 && (
            isNumber
              ? matches[0].team_number === Number(term)
              : (matches[0].team_name ?? '').trim().toLowerCase() === term.toLowerCase()
          );
          setSelectedTeam(exactMatch ? matches[0] : null);
        } else if (demoMode) {
          const matches = demoTeams.filter(team => isNumber ? String(team.team_number).includes(term) : (team.team_name ?? '').toLowerCase().includes(term.toLowerCase()));
          setTeams(matches);
          const exactMatch = matches.length === 1 && (
            isNumber
              ? matches[0].team_number === Number(term)
              : (matches[0].team_name ?? '').trim().toLowerCase() === term.toLowerCase()
          );
          setSelectedTeam(exactMatch ? matches[0] : null);
        } else setTeams([]);
      } catch (e) { setTeams([]); setError(e instanceof Error ? e.message : 'Search failed. Please try again.'); }
      finally { setLoading(false); }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [term, isNumber, mode]);

  const heading = useMemo(() => !term ? 'Find your team.' : isNumber ? `Team number ${term}` : `Results for “${term}”`, [term, isNumber]);
  const clear = () => { setQuery(''); setSelectedTeam(null); };
  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="/"><span className="brand-mark"><Bot size={22} /></span><span className="brand-copy"><strong>FTC DIRECTORY</strong><small>THE COMPETITION VIDEO INDEX</small></span></a>
      <div className="topbar-right"><span className="season-pill"><i />2026–27 SEASON</span><a className="first-link" href="https://www.firstinspires.org/robotics/ftc" target="_blank" rel="noreferrer">About FTC <ExternalLink size={13} /></a></div>
    </header>
    <main>
      <section className="hero"><div className="hero-grid"><div className="hero-copy"><div className="eyebrow"><b />BUILT FOR THE FTC COMMUNITY</div><h1>Every team.<br /><em>Every match.</em></h1><p className="hero-description">Find a FIRST Tech Challenge team or event and discover the competition videos, matches, and moments behind their season.</p><div className="hero-note"><ShieldCheck size={15} /> A growing directory for the global FTC community</div></div>
        <div className="orbit-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit-core"><Bot size={68} /></div><span className="orbit-tag tag-one">TEAMWORK</span><span className="orbit-tag tag-two">INNOVATION</span><span className="orbit-tag tag-three">COMPETITION</span><span className="orbit-star star-one">✳</span><span className="orbit-star star-two">✦</span></div></div>
        <div className="search-panel"><div className="search-modes" aria-label="Search mode"><button aria-pressed={mode==='teams'} onClick={()=>{setMode('teams');setSelectedTeam(null);}}>Teams</button><button aria-pressed={mode==='events'} onClick={()=>{setMode('events');setSelectedTeam(null);}}>Events</button></div>{mode==='events' ? <><div className="search-label"><span>EVENT DIRECTORY</span><span className="search-hint">Search by code, name or location</span></div><div className="search-box"><Search size={21}/><input value={eventQuery} onChange={e=>{setExactCode(false);setEventQuery(e.target.value);}} placeholder="Try Michigan Qualifier or USMIROQ" aria-label="Search FTC events"/>{eventQuery && <button className="clear-button" aria-label="Clear event search" onClick={()=>{setExactCode(false);setEventQuery('');}}><X size={18}/></button>}</div></> : <><div className="search-label"><span>TEAM DIRECTORY</span><span className="search-hint">Search by team name or number</span></div><div className="search-box"><Search size={21} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Try “11115” or “RoboLions”" aria-label="Search by FTC team name or number" />{query && <button className="clear-button" onClick={clear} aria-label="Clear search"><X size={18} /></button>}<span className="search-shortcut">↵</span></div><div className="search-foot"><span><Sparkles size={13} /> Search across the current season</span><span>{term ? (isNumber ? 'TEAM NUMBER' : 'TEAM NAME') : 'START TYPING TO SEARCH'}</span></div></>}</div>
      </section>
      {mode==='events' ? <EventSearch query={eventQuery} season={eventSeason} exactCode={exactCode}/> : <section className="content-section"><div className="section-heading"><div><div className="eyebrow dark"><b />TEAM EXPLORER</div><h2>{heading}</h2></div>{term && <span className="result-count">{loading ? 'SEARCHING…' : `${teams.length} MATCH${teams.length === 1 ? '' : 'ES'}`}</span>}</div>
        {!term ? <div className="start-state"><div className="start-icon"><Compass size={25} /></div><div><strong>Your next match starts here.</strong><p>Enter a team name or number above to explore the directory.</p></div><div className="start-decoration">FTC<span>✳</span></div></div>
          : loading ? <div className="loading-state"><span className="spinner" />Searching teams…</div>
            : error ? <div className="empty-state"><div className="empty-icon"><CircleHelp size={25} /></div><h3>We couldn't complete that search.</h3><p>{error}</p><button className="text-button" onClick={() => setQuery(query)}>Try again <ArrowRight size={15} /></button></div>
              : teams.length ? <>{demoMode && !hasSupabaseConfig && <div className="demo-banner">DEMO PREVIEW <span>Sample teams are illustrative, not live FIRST records.</span></div>}<div className="team-grid">{teams.map(team => <button className="team-card" key={team.team_number} onClick={() => setSelectedTeam(team)}><div className="card-top"><span className="team-number">#{team.team_number}</span><span className="card-arrow"><ArrowRight size={16} /></span></div>
                <div className="team-identity">
                  <h3>#{team.team_number}</h3>
                  <h3>{team.team_name || `FTC Team ${team.team_number}`}</h3>
                </div>
                <div className="card-bottom"><span><Film size={14} /> Competition videos</span><span className="view-link">VIEW TEAM <ChevronRight size={13} /></span></div></button>)}</div></>
                : <div className="empty-state"><div className="empty-icon"><Database size={25} /></div><h3>{hasSupabaseConfig ? 'No teams found yet.' : 'The directory is getting ready.'}</h3><p>{hasSupabaseConfig ? 'No matching teams are in the current-season directory. Team data will appear here once the FIRST sync is complete.' : 'Connect the Supabase project to search the live team directory. You can still explore the interface in demo mode.'}</p>{hasSupabaseConfig && <button className="text-button" onClick={clear}>Clear search <ArrowRight size={15} /></button>}</div>}
      </section>}
      <section className="feature-strip"><div className="feature"><span className="feature-icon"><Search size={18} /></span><div><strong>Find any team</strong><small>Search by name or number</small></div></div><div className="feature"><span className="feature-icon"><Film size={18} /></span><div><strong>Watch the season</strong><small>Competition videos in one place</small></div></div><div className="feature"><span className="feature-icon"><Database size={18} /></span><div><strong>Built to grow</strong><small>Teams and videos, worldwide</small></div></div></section>
    </main>
    <footer className="footer"><span>FTC DIRECTORY <i>·</i> COMMUNITY BUILT</span><span>FIRST® Tech Challenge is a program of FIRST. This is an independent community project.</span></footer>
    {mode==='teams' && selectedTeam && <div className="modal-backdrop" onClick={() => setSelectedTeam(null)}><div className="team-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setSelectedTeam(null)} aria-label="Close"><X size={19} /></button><span className="modal-kicker">FTC TEAM · 2026–2027</span><div className="modal-number">#{selectedTeam.team_number}</div><h2 id="modal-title">{selectedTeam.team_name || `FTC Team ${selectedTeam.team_number}`}</h2><div className="modal-divider" /><TeamMatchHistory team={selectedTeam} /><button className="modal-done" onClick={() => setSelectedTeam(null)}>Back to search</button></div></div>}
  </div>;
}
