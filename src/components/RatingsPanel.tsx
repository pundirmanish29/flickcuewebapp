import { formatCount, type RatingSet } from "../lib/ratings";
import { formatRating } from "../lib/rules";
import { Icon } from "./Icon";

/** A Tomatometer score of 60 or more is fresh (a red tomato); under that it's rotten (a green splat). */
const FRESH = 60;

export function TomatoMark({ score, size = 28 }: { score: number; size?: number }) {
  return score >= FRESH ? (
    <svg className="rating-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 6.5c-6.4 0-11.5 4.2-11.5 9.6S9.6 26 16 26s11.5-4.5 11.5-9.9S22.4 6.5 16 6.5Z" fill="#fa320a" />
      <path d="M16 6.5c-6.4 0-11.5 4.2-11.5 9.6 0 .8.1 1.5.3 2.2 2.4-3.5 6.5-5.8 11.2-5.8s8.8 2.3 11.2 5.8c.2-.7.3-1.4.3-2.2 0-5.4-5.1-9.6-11.5-9.6Z" fill="#ff5a36" />
      <path d="M16 6.5c-1.8-.2-3.4.4-4.5 1.6 1.3.1 2.5.7 3.3 1.7-1.9-.5-3.8.1-5.1 1.6 1.6.2 2.9.9 3.8 2 .7-1.7 2.2-3 3.9-3.5.8-.2 1.7-.1 2.5.3-.5-1.1-1.4-1.9-2.6-2.2 1.2-.3 2.4 0 3.5.8-.9-1.7-2.7-2.7-4.8-2.3Z" fill="#2fa14a" />
    </svg>
  ) : (
    <svg className="rating-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M9 10c1.6-3.5 5.5-5 8.5-3.5 2.2-2 6-1.5 7 1.5 2.7.8 4.5 3.5 3.5 6.5 1.5 2.5.2 6-3 6.5-1 3-4.5 4.5-7.5 3-2.5 1.8-6.5.6-7.5-2.5-3.2-.5-4.5-4-3-6.5-1.5-2.2-.5-4.7 2-5Z" fill="#6fbf3f" />
      <circle cx="12" cy="14" r="1.8" fill="#3d7d22" opacity=".55" />
      <circle cx="21" cy="19" r="2.2" fill="#3d7d22" opacity=".55" />
    </svg>
  );
}

export function PopcornMark({ score, size = 28 }: { score: number; size?: number }) {
  return (
    <svg className="rating-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <g fill={score >= FRESH ? "#fff1c9" : "#d6d0c2"} stroke="#e0a93a" strokeWidth="0.9">
        <circle cx="10" cy="9" r="3.6" />
        <circle cx="16" cy="7" r="4" />
        <circle cx="22" cy="9" r="3.6" />
        <circle cx="13" cy="11" r="3.2" />
        <circle cx="19" cy="11" r="3.2" />
      </g>
      <g fill="#f5a623" opacity=".55">
        <circle cx="11" cy="8" r="1" />
        <circle cx="21" cy="8" r="1" />
        <circle cx="16" cy="6" r="1" />
      </g>
      <path d="M7 12.5h18l-2.2 15a1.5 1.5 0 0 1-1.5 1.3H10.7a1.5 1.5 0 0 1-1.5-1.3Z" fill="#fff" stroke="#e5302f" strokeWidth="1" strokeLinejoin="round" />
      <path d="M11.5 12.5h3l-.4 16.3h-3.1ZM17.4 12.5h3l-.7 16.3h-3.1Z" fill="#e5302f" />
      <path d="M7 12.5h18l-.3 2H7.3Z" fill="#e5302f" />
    </svg>
  );
}

const imdbText = (value: number) => value.toFixed(1);

/**
 * A title's scores as a column of rows, each with its icon, a large value,
 * a label and how many reviews or votes stand behind it: Tomatometer and
 * Audience as percentages, IMDb out of 10 (linking to IMDb's page when its id
 * is known), and TMDB's score as a star.
 */
export function RatingsPanel({ ratings, tmdb, imdbId }: { ratings: RatingSet; tmdb?: unknown; imdbId?: string }) {
  const tmdbText = formatRating(tmdb);
  if (!ratings.critic && !ratings.audience && !ratings.imdb && !tmdbText) return null;
  return (
    <ul className="ratings" aria-label="Ratings">
      {ratings.critic && (
        <li className="rating-row" aria-label={`Tomatometer ${ratings.critic.value} percent${ratings.critic.count ? `, ${formatCount(ratings.critic.count)} reviews` : ""}`}>
          <TomatoMark score={ratings.critic.value} />
          <b className="rating-value">{ratings.critic.value}%</b>
          <span className="rating-meta">
            <span className="rating-label">Tomatometer</span>
            {ratings.critic.count && <span className="rating-count"><i aria-hidden="true">·</i> {formatCount(ratings.critic.count)} reviews</span>}
          </span>
        </li>
      )}
      {ratings.audience && (
        <li className="rating-row" aria-label={`Audience ${ratings.audience.value} percent${ratings.audience.count ? `, ${formatCount(ratings.audience.count)} ratings` : ""}`}>
          <PopcornMark score={ratings.audience.value} />
          <b className="rating-value">{ratings.audience.value}%</b>
          <span className="rating-meta">
            <span className="rating-label">Audience</span>
            {ratings.audience.count && <span className="rating-count is-audience"><i aria-hidden="true">·</i> {formatCount(ratings.audience.count)} ratings</span>}
          </span>
        </li>
      )}
      {(ratings.imdb || imdbId) && (
        <li className="rating-row">
          {(() => {
            const body = (
              <>
                <span className="imdb-badge" aria-hidden="true">IMDb</span>
                {ratings.imdb && (
                  <>
                    <b className="rating-value">{imdbText(ratings.imdb.value)}<small>/10</small></b>
                    {ratings.imdb.count && <span className="rating-count"><Icon name="star" size={13} className="rating-star" /> {formatCount(ratings.imdb.count)}</span>}
                  </>
                )}
              </>
            );
            return imdbId ? (
              <a className="rating-link" href={`https://www.imdb.com/title/${imdbId}/`} target="_blank" rel="noreferrer" title="Open on IMDb"
                aria-label={ratings.imdb ? `IMDb ${imdbText(ratings.imdb.value)} out of 10${ratings.imdb.count ? `, ${formatCount(ratings.imdb.count)} votes` : ""}, open on IMDb` : "Open on IMDb"}>
                {body}
              </a>
            ) : (
              <span className="rating-link" aria-label={`IMDb ${imdbText(ratings.imdb!.value)} out of 10`}>{body}</span>
            );
          })()}
        </li>
      )}
      {tmdbText && (
        <li className="rating-row" aria-label={`TMDB ${tmdbText} out of 10`}>
          <span className="rating-mark tmdb-mark" aria-hidden="true"><Icon name="star" size={18} /></span>
          <b className="rating-value">{tmdbText}<small>/10</small></b>
          <span className="rating-label">TMDB</span>
        </li>
      )}
    </ul>
  );
}

/** The same scores as small icons in a line, for a card; nothing when it has none. */
export function RatingChips({ ratings }: { ratings: RatingSet }) {
  if (!ratings.critic && !ratings.audience && !ratings.imdb) return null;
  return (
    <p className="rating-chips" aria-label="Ratings">
      {ratings.imdb && (
        <span className="rating-chip" aria-label={`IMDb ${imdbText(ratings.imdb.value)}`}>
          <span className="imdb-badge is-small" aria-hidden="true">IMDb</span>
          {imdbText(ratings.imdb.value)}
        </span>
      )}
      {ratings.critic && (
        <span className="rating-chip" aria-label={`Tomatometer ${ratings.critic.value} percent`}>
          <TomatoMark score={ratings.critic.value} size={15} />
          {ratings.critic.value}%
        </span>
      )}
      {ratings.audience && (
        <span className="rating-chip" aria-label={`Audience ${ratings.audience.value} percent`}>
          <PopcornMark score={ratings.audience.value} size={15} />
          {ratings.audience.value}%
        </span>
      )}
    </p>
  );
}
