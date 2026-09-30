import * as actions from "../lib/actions";
import { cardLine, displayTitle, formatRating, getShowStatus, gridBadge, isStartedShow, isUnreleased, yourTake } from "../lib/rules";
import { upscale } from "../lib/tmdb";
import type { Movie } from "../lib/types";
import { Icon } from "./Icon";
import { RatingScore } from "./RatingScore";
import { Poster } from "./Poster";

/** Stars out of five, halves as ½: "★★★★½". */
const stars = (value: number) => "★".repeat(Math.floor(value)) + (value % 1 ? "½" : "");

/** A saved title in the poster grid. Clicking opens its details; hover shows quick actions. */
export function TitleCard({ movie, onOpen, priority = false }: { movie: Movie; onOpen: (id: string) => void; priority?: boolean }) {
  const badge = gridBadge(movie);
  const status = getShowStatus(movie);
  const unreleased = isUnreleased(movie);
  const title = displayTitle(movie);
  // A show you follow says what's next; one you've finished, how you rated it.
  const following = movie.watched && isStartedShow(movie) && (status?.kind === "airing" || status?.kind === "season" || status?.kind === "new-episode");
  const statusLine = status && ((!movie.watched && !(Number(movie.remindAt) > Date.now())) || following) ? status.text : "";
  const take = movie.watched ? yourTake(movie) : { stars: 0, liked: false };
  // Nothing to say is said with nothing, not "No reminder".
  const line = statusLine || cardLine(movie);

  return (
    <article className="title-card">
      <button type="button" className="title-card-open" onClick={() => onOpen(movie.id)} aria-label={`Open ${title}`}>
        <div className="title-card-art">
          <Poster src={upscale(movie.poster, "w185")} retina={upscale(movie.poster, "w342")} priority={priority} title={movie.title} />
          {badge && <span className={`badge badge-${badge.tone}`}>{badge.text}</span>}
        </div>
        <div className="title-card-text">
          <h3>{title}</h3>
          {/* The rating sits here, not on the poster, where it would cover the title art. */}
          <p className="meta">
            {[movie.mediaType, movie.year].filter(Boolean).join(" · ")}
            {formatRating(movie.rating) && <>{" · "}<RatingScore value={movie.rating} /></>}
          </p>
          {(line || take.stars > 0 || take.liked) && (
            <p className={`meta ${statusLine ? `tone-${status!.tone}` : ""}`}>
              {line}
              {take.stars > 0 && <span className="your-take" aria-label={`You rated it ${take.stars} out of 5`}>{line ? " · " : ""}{stars(take.stars)}</span>}
              {take.liked && <span className="your-heart" aria-label="Liked"> <Icon name="heart" size={11} /></span>}
            </p>
          )}
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
