import { useState } from "react";
import * as actions from "../lib/actions";
import { findExisting } from "../lib/editor";
import { displayTitle, formatRating, isUnreleased } from "../lib/rules";
import { useAppState } from "../lib/store";
import { upscale } from "../lib/tmdb";
import type { Candidate } from "../lib/types";
import { Icon } from "./Icon";
import { RatingScore } from "./RatingScore";
import { Poster } from "./Poster";
import { SourceRatings } from "./SourceRatings";
import { Popover, ReminderChoices } from "./ReminderMenu";
import { ShowtimeLinks } from "./Showtimes";
import { useWhere } from "../lib/useCinemas";
import { openPreview } from "../lib/preview";
import { openTitle as openWithMotion, pop } from "../lib/motion";

/**
 * A search or Discover result. Saving asks when to be reminded first, as the
 * extension's on-page card does, so nothing lands carrying a time nobody chose.
 */
export function CandidateCard({ candidate, onOpenSaved, showtimes = false, rank, compact = false }: {
  candidate: Candidate;
  onOpenSaved: (id: string) => void;
  /** Its place in a top-10 list, drawn large on the poster. */
  rank?: number;
  /** In cinemas: offer where to see its showtimes. */
  showtimes?: boolean;
  /** Two lines under the poster: its name, then a rating and one short reason, with no summary. */
  compact?: boolean;
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
      <div className="candidate-art-wrap" onClickCapture={(event) => pop((event.target as Element).closest(".candidate-quick"))}>
        {/* The poster and name open its full details, saved or not. */}
        <button
          type="button"
          className="title-card-open"
          onClick={() => (saved ? onOpenSaved(saved.id) : openWithMotion(() => openPreview(candidate)))}
          aria-label={`Details for ${title}`}
        >
          <div className="title-card-art">
            <Poster src={upscale(candidate.poster, "w342")} title={candidate.title} />
            {rank && <span className="rank-number" aria-label={`Number ${rank}`}>{rank}</span>}
            {isUnreleased(candidate) && <span className="badge badge-amber">SOON</span>}
          </div>
        </button>
        {/* Saving sits on the poster, so a row of results isn't a row of buttons. */}
        {saved ? (
          <button type="button" className="candidate-quick saved" onClick={() => onOpenSaved(saved.id)} aria-label={`${title}: ${saved.watched ? "watched" : "in your queue"}`} title={saved.watched ? "Watched" : "In your queue"}>
            <Icon name="check" size={17} />
          </button>
        ) : (
          <button type="button" className="candidate-quick" onClick={() => setAsking(true)} aria-expanded={asking} aria-label={`Save ${title}`} title="Save">
            <Icon name="plus" size={18} />
          </button>
        )}
      </div>
      <button type="button" className="title-card-open title-card-text" onClick={() => (saved ? onOpenSaved(saved.id) : openWithMotion(() => openPreview(candidate)))} tabIndex={-1} aria-hidden="true">
        <h3>{title}</h3>
        {/* The rating sits here, not on the poster, where it would cover the title art. */}
        {compact ? (
          <p className="meta">
            {formatRating(candidate.rating) && <><RatingScore value={candidate.rating} />{" · "}</>}
            {candidate.reason || (rank ? candidate.genre || candidate.mediaType : [candidate.mediaType, candidate.year].filter(Boolean).join(" · "))}
          </p>
        ) : (
          <>
            <p className="meta">
              {[rank ? candidate.genre || candidate.mediaType : candidate.mediaType, candidate.year].filter(Boolean).join(" · ")}
              {formatRating(candidate.rating) && <>{" · "}<RatingScore value={candidate.rating} /></>}
            </p>
            {candidate.reason
              ? <p className="candidate-reason">{candidate.reason}</p>
              : candidate.overview && <p className="candidate-overview">{candidate.overview}</p>}
          </>
        )}
      </button>
      {saved && <SourceRatings movie={saved} />}
      <div className="candidate-save">
        {showtimes && (
          <button type="button" className="showtimes-button" onClick={() => setShowing((open) => !open)} aria-expanded={showing}>
            <Icon name="clock" size={14} /> Showtimes
          </button>
        )}
        {showing && <div className="reminder-scrim" aria-hidden="true" />}
        <Popover open={showing} onClose={() => setShowing(false)} label={`Showtimes for ${title}`} title={<><b>{title}</b> · showtimes in {place}</>} modal>
          <ShowtimeLinks title={candidate.title} year={candidate.year} />
        </Popover>
        {asking && <div className="reminder-scrim" aria-hidden="true" />}
        <Popover open={asking} onClose={() => setAsking(false)} label={`Remind me about ${title}`} title={<>Save <b>{title}</b> and remind me…</>} modal>
          <ReminderChoices releaseDate={candidate.releaseDate} onPick={save} onNone={() => save(null)} noneLabel="Just save it" />
        </Popover>
      </div>
    </article>
  );
}
