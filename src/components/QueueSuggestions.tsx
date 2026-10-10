import { useEffect, useMemo, useRef, useState } from "react";
import { queuedFilms, shuffled } from "../lib/libraryHighlights";
import type { Movie } from "../lib/types";
import { TitleCard } from "./TitleCard";
import { ScrollArrows } from "./ScrollArrows";
import { Icon } from "./Icon";

/** Random picks are saved queue entries, with no recommendation-service lookup. */
export function QueueSuggestions({ movies, onOpen }: { movies: Movie[]; onOpen: (id: string) => void }) {
  const [shuffle, setShuffle] = useState(0);
  const row = useRef<HTMLDivElement>(null);
  const queue = queuedFilms(movies);
  const queueKey = JSON.stringify(queue.map(movie => movie.id));
  // Reminder and metadata edits update the cards without changing their order.
  const order = useMemo(() => shuffled(JSON.parse(queueKey) as string[]), [queueKey, shuffle]);
  const byId = new Map(queue.map(movie => [movie.id, movie]));
  const picks = order.map(id => byId.get(id)!).filter(Boolean);
  useEffect(() => { row.current?.scrollTo({ left: 0, behavior: "instant" }); }, [order]);

  if (!picks.length) return null;
  return <section className="paper titles library-suggestions" aria-labelledby="queue-suggestions-title">
    <div className="wrap">
      <div className="library-section-head">
        <div><h2 id="queue-suggestions-title" className="section-title">From your queue</h2>
          <p className="muted small-print">A random mix of released movies you've saved.</p></div>
        <div className="shelf-tools">
          <ScrollArrows target={row} label="From your queue" watch={order} />
          {picks.length > 1 && <button type="button" className="button button-quiet" onClick={() => setShuffle(value => value + 1)}><Icon name="shuffle" size={16} /> Shuffle picks</button>}
        </div>
      </div>
      <div className="queue-picks-row" ref={row} role="group" aria-label="Random movies from your queue">
        {picks.map(movie => <TitleCard key={movie.id} movie={movie} onOpen={onOpen} />)}
      </div>
    </div>
  </section>;
}
