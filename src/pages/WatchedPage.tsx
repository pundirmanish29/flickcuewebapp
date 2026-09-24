import { useMemo, useState } from "react";
import { TitleCard } from "../components/TitleCard";
import * as actions from "../lib/actions";
import { matchesKind, matchesSearch, sortMovies } from "../lib/rules";
import { useAppState } from "../lib/store";
import type { KindFilter } from "../lib/types";

export function WatchedPage({ onOpen, query }: { onOpen: (id: string) => void; query: string }) {
  const { library } = useAppState();
  const [kind, setKind] = useState<KindFilter>("all");

  const watched = useMemo(() => library.movies.filter((movie) => movie.watched), [library.movies]);
  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
    const minutes = watched.reduce((sum, movie) => sum + (Number(movie.runtimeMinutes) || 0), 0);
    return {
      month: watched.filter((movie) => Number(movie.watchedAt) >= monthStart).length,
      year: watched.filter((movie) => Number(movie.watchedAt) >= yearStart).length,
      hours: Math.round(minutes / 60)
    };
  }, [watched]);

  const visible = sortMovies(watched.filter((movie) => matchesKind(movie, kind) && matchesSearch(movie, query)), "added", true);

  return (
    <>
      <section className="intro paper compact">
        <div className="wrap">
          <p className="eyebrow">Your viewing history</p>
          <h1 className="display">
            Watched.
            <em>Every one of them.</em>
          </h1>
        </div>
      </section>

      <section className="band stats-band">
        <div className="wrap stats">
          <div><b>{watched.length}</b><span>watched in all</span></div>
          <div><b>{stats.month}</b><span>this month</span></div>
          <div><b>{stats.year}</b><span>this year</span></div>
          <div><b>{stats.hours}</b><span>hours of films and episodes with a known runtime</span></div>
        </div>
      </section>

      <section className="paper titles">
        <div className="wrap">
          <div className="toolbar">
            <h2 className="section-title">Newest first <span className="count">{visible.length}</span></h2>
            <div className="toolbar-controls">
              <div className="segmented" role="group" aria-label="Show">
                {(["all", "movie", "tv"] as KindFilter[]).map((value) => (
                  <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>
                    {value === "all" ? "All" : value === "movie" ? "Films" : "Shows"}
                  </button>
                ))}
              </div>
              {watched.length > 0 && (
                <button type="button" className="button button-quiet small" onClick={() => actions.clearWatched()}>Clear watched</button>
              )}
            </div>
          </div>
          {visible.length ? (
            <div className="grid">
              {visible.map((movie) => <TitleCard key={movie.id} movie={movie} onOpen={onOpen} />)}
            </div>
          ) : (
            <p className="empty">{query ? `Nothing watched matches “${query}”.` : "Titles you mark watched show up here."}</p>
          )}
        </div>
      </section>
    </>
  );
}
