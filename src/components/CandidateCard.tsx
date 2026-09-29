import { useState } from "react";
import * as actions from "../lib/actions";
import { findExisting } from "../lib/editor";
import { displayTitle, formatRating, isUnreleased } from "../lib/rules";
import { useAppState } from "../lib/store";
import { upscale } from "../lib/tmdb";
import type { Candidate } from "../lib/types";
import { Icon } from "./Icon";
import { Poster } from "./Poster";
import { Popover, ReminderChoices } from "./ReminderMenu";
import { ShowtimeLinks } from "./Showtimes";
import { useWhere } from "../lib/useCinemas";

/**
 * A search or Discover result. Saving asks when to be reminded first, as the
 * extension's on-page card does, so nothing lands carrying a time nobody chose.
 */
export function CandidateCard({ candidate, onOpenSaved, showtimes = false }: {
  candidate: Candidate;
  onOpenSaved: (id: string) => void;
  /** In cinemas: offer where to see its showtimes. */
  showtimes?: boolean;
}) {
  const { library } = useAppState();
  const saved = findExisting(library, candidate);
  const [asking, setAsking] = useState(false);
  const [showing, setShowing] = useState(false);
  const { place } = useWhere();
  const title = displayTitle(candidate);

  const save = (remind: number | null) => {
    setAsking(false);
    actions.addCandidate(candidate, remind);
  };

  return (
    <article className="title-card candidate-card">
      <div className="title-card-art">
        <Poster src={upscale(candidate.poster, "w342")} title={candidate.title} />
        {isUnreleased(candidate) && <span className="badge badge-amber">SOON</span>}
        {formatRating(candidate.rating) && (
          <span className="title-card-rating"><Icon name="star" size={11} /> {formatRating(candidate.rating)}</span>
        )}
      </div>
      <div className="title-card-text">
        <h3>{title}</h3>
        <p className="meta">{[candidate.mediaType, candidate.year].filter(Boolean).join(" · ")}</p>
        {candidate.reason
          ? <p className="candidate-reason">{candidate.reason}</p>
          : candidate.overview && <p className="candidate-overview">{candidate.overview}</p>}
      </div>
      <div className="candidate-save">
        {saved ? (
          <button type="button" className="button button-quiet small" onClick={() => onOpenSaved(saved.id)}>
            <Icon name="check" size={15} /> {saved.watched ? "Watched" : "In your queue"}
          </button>
        ) : (
          <button type="button" className="button button-ink small" onClick={() => setAsking(true)} aria-expanded={asking}>
            <Icon name="plus" size={15} /> Save
          </button>
        )}
        {showtimes && (
          <button type="button" className="showtimes-button" onClick={() => setShowing((open) => !open)} aria-expanded={showing}>
            <Icon name="clock" size={14} /> Showtimes
          </button>
        )}
        <Popover open={showing} onClose={() => setShowing(false)} label={`Showtimes for ${title}`}>
          <p className="popover-label">{title} · showtimes in {place}</p>
          <ShowtimeLinks title={candidate.title} year={candidate.year} />
        </Popover>
        <Popover open={asking} onClose={() => setAsking(false)} label={`Remind me about ${title}`}>
          <p className="popover-label">Remind me…</p>
          <ReminderChoices releaseDate={candidate.releaseDate} onPick={save} onNone={() => save(null)} noneLabel="Just save it" />
        </Popover>
      </div>
    </article>
  );
}
