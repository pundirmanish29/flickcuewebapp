import { useState } from "react";
import * as actions from "../lib/actions";
import { findExisting } from "../lib/editor";
import { displayTitle, isUnreleased } from "../lib/rules";
import { useAppState } from "../lib/store";
import { upscale } from "../lib/tmdb";
import type { Candidate } from "../lib/types";
import { Icon } from "./Icon";
import { Poster } from "./Poster";
import { Popover, ReminderChoices } from "./ReminderMenu";

/**
 * A search or Discover result. Saving asks when to be reminded first, as the
 * extension's on-page card does, so nothing lands carrying a time nobody chose.
 */
export function CandidateCard({ candidate, onOpenSaved }: { candidate: Candidate; onOpenSaved: (id: string) => void }) {
  const { library } = useAppState();
  const saved = findExisting(library, candidate);
  const [asking, setAsking] = useState(false);
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
        {candidate.rating && (
          <span className="title-card-rating"><Icon name="star" size={11} /> {candidate.rating}</span>
        )}
      </div>
      <div className="title-card-text">
        <h3>{title}</h3>
        <p className="meta">{[candidate.mediaType, candidate.year].filter(Boolean).join(" · ")}</p>
        {candidate.overview && <p className="candidate-overview">{candidate.overview}</p>}
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
        <Popover open={asking} onClose={() => setAsking(false)} label={`Remind me about ${title}`}>
          <p className="popover-label">Remind me…</p>
          <ReminderChoices releaseDate={candidate.releaseDate} onPick={save} onNone={() => save(null)} noneLabel="Just save it" />
        </Popover>
      </div>
    </article>
  );
}
