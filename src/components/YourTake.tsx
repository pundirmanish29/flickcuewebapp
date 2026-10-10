import { useState } from "react";
import * as actions from "../lib/actions";
import { ratingSources } from "../lib/ratingSources";
import { pop } from "../lib/motion";
import type { Movie } from "../lib/types";
import { Icon } from "./Icon";

const fill = (rating: number, star: number) => rating >= star ? "full" : rating >= star - 0.5 ? "half" : "";

/** Show both sources, even when their ratings agree. Only FlickCue is editable. */
export function YourTake({ movie }: { movie: Movie }) {
  const ratings = ratingSources(movie);
  const letterboxd = movie.letterboxd as { liked?: boolean; review?: string } | undefined;
  const liked = Boolean(movie.personal?.liked);
  const review = String(movie.personal?.review ?? "");
  const importedReview = String(letterboxd?.review || "").trim();
  const [reviewDraft, setReviewDraft] = useState<string | null>(null);
  const hasImported = Boolean(ratings.letterboxd || letterboxd?.liked || importedReview);
  if (!movie.watched && !ratings.flickcue && !liked && !review && !hasImported) return null;
  return (
    <section className="sheet-section" aria-labelledby="your-take-heading">
      <h2 className="section-label" id="your-take-heading">Your take</h2>
      <div className={`take-sources${hasImported ? " has-letterboxd" : ""}`}>
        <section className="take-source-panel" aria-label="FlickCue rating and review">
          <h3>FlickCue</h3>
          <div className="take" onClickCapture={event => pop((event.target as Element).closest("button"))}>
            <span className="take-stars-edit" role="group" aria-label="Your FlickCue rating">
              {[1, 2, 3, 4, 5].map(star => {
                const next = ratings.flickcue === star ? star - 0.5 : ratings.flickcue === star - 0.5 ? 0 : star;
                const state = fill(ratings.flickcue, star);
                return <button key={star} type="button" className={`star ${state}`} aria-label={`${star} star${star === 1 ? "" : "s"}`} aria-pressed={ratings.flickcue >= star - 0.5} onClick={() => actions.setTake(movie.id, { rating: next })}>
                  <Icon name="star" size={22} />
                  {state === "half" && <span className="star-half" aria-hidden="true"><Icon name="star" size={22} /></span>}
                </button>;
              })}
            </span>
            <b className="take-number" aria-label={ratings.flickcue ? `FlickCue: ${ratings.flickcue} out of 5 stars` : "Not rated on FlickCue"}>{ratings.flickcue ? `${ratings.flickcue}/5` : <span className="take-unrated">Not rated</span>}</b>
            <button type="button" className={`take-heart ${liked ? "on" : ""}`} aria-pressed={liked} aria-label="Liked on FlickCue" onClick={() => actions.setTake(movie.id, { liked: !liked })}><Icon name="heart" size={20} /></button>
          </div>
          <label className="visually-hidden" htmlFor="review">Your FlickCue review</label>
          <textarea id="review" className="note take-review-edit" rows={3} maxLength={4000} placeholder="Your review: what worked, what didn't…" value={reviewDraft ?? review}
            onFocus={() => setReviewDraft(review)} onChange={event => setReviewDraft(event.target.value)}
            onBlur={() => { if (reviewDraft !== null) actions.setReview(movie.id, reviewDraft); setReviewDraft(null); }} />
        </section>
        {hasImported && <section className="take-source-panel" aria-label="Letterboxd rating and review">
          <h3>Letterboxd <span className="take-source">Imported</span></h3>
          <div className="take">
            {ratings.letterboxd > 0 && <span className="take-stars-edit is-static" role="img" aria-label={`Letterboxd: ${ratings.letterboxd} out of 5 stars`}>
              {[1, 2, 3, 4, 5].map(star => <span key={star} className={`star ${fill(ratings.letterboxd, star)}`} aria-hidden="true">
                <Icon name="star" size={22} />
                {fill(ratings.letterboxd, star) === "half" && <span className="star-half"><Icon name="star" size={22} /></span>}
              </span>)}
            </span>}
            <b className="take-number">{ratings.letterboxd ? `${ratings.letterboxd}/5` : <span className="take-unrated">Not rated</span>}</b>
            {letterboxd?.liked && <span className="take-heart on is-static" role="img" aria-label="Liked on Letterboxd"><Icon name="heart" size={20} /></span>}
          </div>
          {importedReview && <blockquote className="take-review">{importedReview}</blockquote>}
        </section>}
      </div>
    </section>
  );
}
