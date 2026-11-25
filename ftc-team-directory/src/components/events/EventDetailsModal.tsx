import { useEffect } from 'react';
import { X } from 'lucide-react';
import { eventLocation, type EventRow } from './types';
import EventVideos from './EventVideos';

export default function EventDetailsModal({ event, onClose }: {
  event: EventRow;
  onClose: () => void;
}) {
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);

  const officialUrl = 'https://ftc-events.firstinspires.org/' +
    event.season_year + '/' + encodeURIComponent(event.event_code);

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
    >
      <div
        className="team-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-title"
        onClick={e => e.stopPropagation()}
      >
        <button
          autoFocus
          className="modal-close"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={19} />
        </button>
        <span className="modal-kicker">FTC EVENT · {event.season_year}</span>
        <div className="modal-number">{event.event_code}</div>
        <h2 id="event-title">{event.event_name}</h2>
        <p>{eventLocation(event)}</p>
        <p>{event.venue}</p>
        <p>{[event.date_start, event.date_end].filter(Boolean).join(' – ')}</p>
        <p>
          <a
            href={officialUrl}
            target="_blank"
            rel="noreferrer"
          >
            Official event details and teams
          </a>
        </p>
        <EventVideos event={event} />
        <button
          className="modal-done"
          onClick={onClose}
        >
          Back to search
        </button>
      </div>
    </div>
  );
}
