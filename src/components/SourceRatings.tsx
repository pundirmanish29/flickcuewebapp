import { ratingSources } from "../lib/ratingSources";
import type { TakeSource } from "../lib/libraryHighlights";
import type { Movie } from "../lib/types";

export const SOURCE_NAMES = { flickcue: "FlickCue", letterboxd: "Letterboxd" };

/** Source names remain available to screen readers and in the logo's tooltip. */
export function SourceLogo({ source }: { source: TakeSource }) {
  return <span className={`rating-source-logo source-${source}`} role="img" aria-label={SOURCE_NAMES[source]} title={SOURCE_NAMES[source]}>
    {source === "flickcue" ? <img src="./icon.svg" width={24} height={24} alt="" />
      : <svg viewBox="0 0 64 32" width={34} height={20} aria-hidden="true"><circle cx="16" cy="16" r="14" fill="#ff8000" /><circle cx="32" cy="16" r="14" fill="#00e054" /><circle cx="48" cy="16" r="14" fill="#40bcf4" /></svg>}
  </span>;
}

export function SourceRatings({ movie, showNames = false }: { movie: Movie; showNames?: boolean }) {
  const ratings = ratingSources(movie);
  const sources = (["flickcue", "letterboxd"] as const).filter(source => ratings[source] > 0);
  if (!sources.length) return null;
  return <div className={`card-personal-ratings${showNames ? " named-ratings" : ""}`} role="group" aria-label="Your ratings">
    {sources.map(source => <span key={source} className="card-source-rating" role="img" aria-label={`${SOURCE_NAMES[source]}: ${ratings[source]} out of 5 stars`} title={`${SOURCE_NAMES[source]}: ${ratings[source]}/5`}>
      <SourceLogo source={source} />{showNames && <span aria-hidden="true">{SOURCE_NAMES[source]}</span>}<b aria-hidden="true">★ {ratings[source]}/5</b>
    </span>)}
  </div>;
}
