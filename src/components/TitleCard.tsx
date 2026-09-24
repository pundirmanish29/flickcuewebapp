import * as actions from "../lib/actions";
import { displayTitle, getShowStatus, gridBadge, isUnreleased, reminderText } from "../lib/rules";
import { upscale } from "../lib/tmdb";
import type { Movie } from "../lib/types";
import { Icon } from "./Icon";
import { Poster } from "./Poster";

/** A saved title in the poster grid. Clicking opens its details; hover shows quick actions. */
export function TitleCard({ movie, onOpen }: { movie: Movie; onOpen: (id: string) => void }) {
  const badge = gridBadge(movie);
  const status = getShowStatus(movie);
  const unreleased = isUnreleased(movie);
  const title = displayTitle(movie);

  return (
    <article className="title-card">
      <button type="button" className="title-card-open" onClick={() => onOpen(movie.id)} aria-label={`Open ${title}`}>
        <div className="title-card-art">
          <Poster src={upscale(movie.poster, "w342")} title={movie.title} />
          {badge && <span className={`badge badge-${badge.tone}`}>{badge.text}</span>}
          {movie.rating && Number(movie.rating) > 0 && (
            <span className="title-card-rating"><Icon name="star" size={11} /> {movie.rating}</span>
          )}
        </div>
        <div className="title-card-text">
          <h3>{title}</h3>
          <p className="meta">
            {[movie.mediaType, movie.year].filter(Boolean).join(" · ")}
          </p>
          <p className={`meta ${status ? `tone-${status.tone}` : ""}`}>
            {status && !movie.watched && !(Number(movie.remindAt) > Date.now()) ? status.text : reminderText(movie)}
          </p>
        </div>
      </button>
      <div className="title-card-actions">
        <button
          type="button"
          className="icon-button"
          onClick={() => actions.toggleWatched(movie.id)}
          disabled={!movie.watched && unreleased}
          title={movie.watched ? "Move back to queue" : unreleased ? "Not released yet" : "Mark watched"}
          aria-label={movie.watched ? "Move back to queue" : "Mark watched"}
        >
          <Icon name={movie.watched ? "eyeOff" : "eye"} />
        </button>
        {!movie.watched && (
          <button
            type="button"
            className="icon-button"
            onClick={() => (Number(movie.remindAt) > Date.now() ? actions.clearReminder(movie.id) : actions.snooze(movie.id))}
            title={Number(movie.remindAt) > Date.now() ? "Clear reminder" : unreleased ? "Remind on release day" : "Remind tomorrow"}
            aria-label={Number(movie.remindAt) > Date.now() ? "Clear reminder" : "Set reminder"}
          >
            <Icon name="clock" />
          </button>
        )}
        <button type="button" className="icon-button danger" onClick={() => actions.removeTitle(movie.id)} title="Remove" aria-label="Remove">
          <Icon name="trash" />
        </button>
      </div>
    </article>
  );
}
