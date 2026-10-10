import { TitleReminder } from "./TitleReminder";
import * as actions from "../lib/actions";
import { cardLine, displayTitle, formatRating, getShowStatus, isShow, gridBadge, isStartedShow, isUnreleased, yourTake } from "../lib/rules";
import { upscale } from "../lib/tmdb";
import type { Movie } from "../lib/types";
import { Icon } from "./Icon";
import { RatingScore } from "./RatingScore";
import { RatingChips } from "./RatingsPanel";
import { savedRatings } from "../lib/ratings";
import { SourceRatings } from "./SourceRatings";
import { CalendarMark } from "./CalendarMark";
import { Poster } from "./Poster";

/** A saved title in the poster grid. Clicking opens its details; hover shows quick actions. */
export function TitleCard({ movie, onOpen, priority = false, personalFocus = false }: { movie: Movie; onOpen: (id: string) => void; priority?: boolean; personalFocus?: boolean }) {
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
            {!personalFocus && formatRating(movie.rating) && <>{" · "}<RatingScore value={movie.rating} /></>}
          </p>
          {!personalFocus && <RatingChips ratings={savedRatings(movie)} />}
          <SourceRatings movie={movie} showNames={personalFocus} />
          {!personalFocus && (line || take.liked) && (
            <p className={`meta ${statusLine ? `tone-${status!.tone}` : ""}`}>
              {line}
              <CalendarMark movie={movie} />
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
          title={movie.watched ? "Move back to queue" : unreleased ? "Not released yet" : isShow(movie) ? "Mark series finished" : "Mark watched"}
          aria-label={movie.watched ? "Move back to queue" : isShow(movie) ? "Mark series finished" : "Mark watched"}
        >
          <Icon name={movie.watched ? "eyeOff" : "eye"} />
        </button>
        {!movie.watched && <TitleReminder movie={movie} />}
        <button type="button" className="icon-button danger" onClick={() => actions.removeTitle(movie.id)} title="Remove" aria-label="Remove">
          <Icon name="trash" />
        </button>
      </div>
    </article>
  );
}
