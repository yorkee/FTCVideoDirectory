import { ArrowRight } from 'lucide-react';
import { eventLocation, type EventRow } from './types';

export default function EventCard({ event, onSelect }: {
  event: EventRow;
  onSelect: (event: EventRow) => void;
}) {
  return (
    <button
      className="team-card"
      onClick={() => onSelect(event)}
    >
      <div className="card-top">
        <span className="team-number">{event.event_code}</span>
        <ArrowRight size={16} />
      </div>
      <div className="team-identity">
        <h3>{event.event_name}</h3>
        <span>{eventLocation(event)}</span>
      </div>
      <div className="card-bottom">
        <span>{event.date_start ?? 'Date unavailable'}</span>
        <span>VIEW EVENT</span>
      </div>
    </button>
  );
}
