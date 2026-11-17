import { useEffect, useState } from 'react';
import { CalendarDays, Clock3, ExternalLink, MapPin, RefreshCw, Trophy } from 'lucide-react';
import { hasSupabaseConfig, supabase } from './lib/supabase';
import type { Team } from './types';

type FirstRecord = Record<string, unknown>;
type Match = {
  matchNumber: number;
  description: string;
  tournamentLevel: string;
  startTime: string | null;
  scoreRedFinal: number | null;
  scoreBlueFinal: number | null;
  redTeams: FirstRecord[];
  blueTeams: FirstRecord[];
};
type TeamEvent = { event: FirstRecord; matches: Match[] };
type HistoryResponse = { success: boolean; season: number; teamNumber: number; events: TeamEvent[]; error?: string };

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
function dateRange(event: FirstRecord): string {
  const start = text(event.dateStart);
  const end = text(event.dateEnd);
  if (!start) return '';
  const format = (value: string) => new Date(value + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return end && end !== start ? `${format(start)} – ${format(end)}` : format(start);
}
function teamList(teams: FirstRecord[], teamNumber: number): string {
  return teams.map(team => {
    const number = Number(team.teamNumber ?? team.team ?? 0);
    return number ? `#${number}${number === teamNumber ? ' (this team)' : ''}` : '';
  }).filter(Boolean).join(' · ') || 'Alliance details pending';
}
function isPlayed(match: Match): boolean {
  return match.scoreRedFinal !== null && match.scoreBlueFinal !== null;
}

export default function TeamMatchHistory({ team }: { team: Team }) {
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadHistory() {
    if (!hasSupabaseConfig || !supabase) {
      setLoading(false);
      setError('Connect the live Supabase project to load FIRST match history.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('get-ftc-team-matches', {
        body: { teamNumber: team.team_number, seasonYear: team.season_year },
      });
      if (invokeError) throw invokeError;
      const result = data as HistoryResponse;
      if (!result?.success) throw new Error(result?.error || 'FIRST match history could not be loaded.');
      setHistory(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Match history could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadHistory(); }, [team.team_number, team.season_year]);

  if (loading) return <div className="match-history-state"><span className="spinner" />Loading events and matches from FIRST…</div>;
  if (error) return <div className="match-history-state"><p>{error}</p><button className="match-retry" onClick={() => void loadHistory()}><RefreshCw size={14} /> Try again</button></div>;

  const events = history?.events ?? [];
  const matchesCount = events.reduce((count, item) => count + item.matches.length, 0);

  return <section className="match-history">
    <div className="match-history-heading">
      <div><strong>Season match history</strong><small>{events.length} event{events.length === 1 ? '' : 's'} · {matchesCount} match{matchesCount === 1 ? '' : 'es'}</small></div>
      <button className="match-refresh" onClick={() => void loadHistory()} aria-label="Refresh match history"><RefreshCw size={14} /></button>
    </div>
    {!events.length ? <div className="match-history-empty">FIRST has not published event or match data for this team and season yet.</div> :
      events.map(({ event, matches }) => {
        const eventName = text(event.name, text(event.code, 'FTC Event'));
        const location = [text(event.venue), [text(event.city), text(event.stateprov), text(event.country)].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
        return <article className="event-history-card" key={text(event.code, eventName)}>
          <div className="event-history-top">
            <div><span className="event-code">{text(event.code, 'EVENT')}</span><h3>{eventName}</h3></div>
            <span className="event-match-count">{matches.length} MATCH{matches.length === 1 ? '' : 'ES'}</span>
          </div>
          <div className="event-meta">
            {dateRange(event) && <span><CalendarDays size={13} />{dateRange(event)}</span>}
            {location && <span><MapPin size={13} />{location}</span>}
          </div>
          {!matches.length ? <p className="event-no-matches">No published matches for this team at this event yet.</p> :
            <div className="match-list">{matches.map((match, index) => {
              const played = isPlayed(match);
              const redWon = match.scoreRedFinal !== null && match.scoreBlueFinal !== null && match.scoreRedFinal > match.scoreBlueFinal;
              const blueWon = match.scoreRedFinal !== null && match.scoreBlueFinal !== null && match.scoreBlueFinal > match.scoreRedFinal;
              const thisTeamRed = match.redTeams.some(item => Number(item.teamNumber ?? item.team) === team.team_number);
              const thisTeamBlue = match.blueTeams.some(item => Number(item.teamNumber ?? item.team) === team.team_number);
              return <div className="match-row" key={`${match.tournamentLevel}-${match.matchNumber}-${index}`}>
                <div className="match-label"><strong>{match.description || `${match.tournamentLevel === 'playoff' ? 'Playoff' : 'Qualification'} ${match.matchNumber}`}</strong><small>{match.tournamentLevel === 'playoff' ? 'PLAYOFF' : 'QUALIFICATION'}{match.startTime ? ` · ${new Date(match.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</small></div>
                <div className={`match-alliance red ${thisTeamRed ? 'team-alliance' : ''} `}><span>RED</span><small>{teamList(match.redTeams, team.team_number)}</small><b>{played ? match.scoreRedFinal : '—'}</b>{redWon && <Trophy size={13} />}</div>
                <div className={`match-alliance blue ${thisTeamBlue ? 'team-alliance' : ''}`}><span>BLUE</span><small>{teamList(match.blueTeams, team.team_number)}</small><b>{played ? match.scoreBlueFinal : '—'}</b>{blueWon && <Trophy size={13} />}</div>
                {!played && <span className="match-upcoming"><Clock3 size={12} /> UPCOMING</span>}
              </div>;
            })}</div>}
        </article>;
      })}
    <p className="first-attribution">Match and event data provided by <a href="https://ftc-events.firstinspires.org/services/API" target="_blank" rel="noreferrer">FIRST Tech Challenge Events API <ExternalLink size={11} /></a>.</p>
  </section>;
}
