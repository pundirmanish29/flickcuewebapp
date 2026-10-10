import { useState } from "react";
import { sourceReviews, watchedHighlights, type HighlightView } from "../lib/libraryHighlights";
import type { Movie } from "../lib/types";
import { TitleCard } from "./TitleCard";
import { SourceLogo, SOURCE_NAMES } from "./SourceRatings";

export function WatchedHighlights({ movies, onOpen }: { movies: Movie[]; onOpen: (id: string) => void }) {
  const [view, setView] = useState<HighlightView>("rated");
  const [limit, setLimit] = useState(6);
  const items = watchedHighlights(movies, view);
  return <section className="watched-highlights" aria-labelledby="watched-highlights-title">
    <div className="library-section-head">
      <div><h2 id="watched-highlights-title" className="section-title">Your ratings & reviews</h2>
        <p className="muted small-print">{view === "rated" ? "Your highest-rated watched titles. If you rated a title on both apps, the higher score sets its place." : "Watched titles you've reviewed on FlickCue or Letterboxd. Each review keeps its source."}</p></div>
    </div>
    <div className="segmented highlights-tabs" role="group" aria-label="Watched highlights">
      <button type="button" aria-pressed={view === "rated"} onClick={() => { setView("rated"); setLimit(6); }}>Top rated</button>
      <button type="button" aria-pressed={view === "reviewed"} onClick={() => { setView("reviewed"); setLimit(6); }}>Reviewed</button>
    </div>
    {items.length ? <><div className="grid">{items.slice(0, limit).map(movie => <div key={movie.id} className="highlight-card"><TitleCard movie={movie} onOpen={onOpen} personalFocus />
      {view === "reviewed" && sourceReviews(movie).map(review => <div key={review.source} className="highlight-review-source">
        <div className="highlight-review-label"><SourceLogo source={review.source} /><span>Your {SOURCE_NAMES[review.source]} review</span></div>
        <blockquote className="highlight-review" aria-label={`Your ${SOURCE_NAMES[review.source]} review`}>{review.text}</blockquote>
      </div>)}
    </div>)}</div>
      {items.length > limit && <div className="load-more"><button type="button" className="button button-quiet" onClick={() => setLimit(value => value + 6)}>Show more {view === "rated" ? "rated" : "reviewed"} titles · {items.length - limit} left</button></div>}</>
      : <p className="highlight-empty" role="status">{view === "rated" ? "No personal ratings in this selection yet." : "No personal reviews in this selection yet."} Open a watched title to add yours, or import your Letterboxd profile in Settings.</p>}
  </section>;
}
