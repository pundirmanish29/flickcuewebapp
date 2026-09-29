import { useMemo, useState } from "react";
import { TitleCard } from "../components/TitleCard";
import { knownWatchedAt, matchesKind, matchesSearch, watchedGroups } from "../lib/rules";
import { PageHeader } from "../components/PageHeader";
import { useAppState } from "../lib/store";
import type { KindFilter } from "../lib/types";

const PAGE = 60;

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
      // Only real viewing dates count, so a Letterboxd import doesn't read as a binge.
      month: watched.filter((movie) => knownWatchedAt(movie) >= monthStart).length,
      year: watched.filter((movie) => knownWatchedAt(movie) >= yearStart).length,
      hours: Math.round(minutes / 60)
    };
  }, [watched]);

  const [limit, setLimit] = useState(PAGE);
  const visible = watched.filter((movie) => matchesKind(movie, kind) && matchesSearch(movie, query));
  // Month by month, a page at a time: a long history shouldn't all load at once.
  const groups = useMemo(() => {
    let left = limit;
    return watchedGroups(visible)
      .map((group) => {
        const movies = group.movies.slice(0, Math.max(0, left));
        left -= movies.length;
        return { ...group, total: group.movies.length, movies };
      })
      .filter((group) => group.movies.length);
  }, [visible, limit]);

  return (
    <>
      <PageHeader
        title="Watched"
        meta={[
          `${watched.length} in all`,
          stats.month ? `${stats.month} this month` : "",
          stats.year ? `${stats.year} this year` : "",
          // Hours only count titles with a known runtime, so they wait until there are some.
          stats.hours ? `${stats.hours} hours` : ""
        ].filter(Boolean).join(" · ")}
      />

      <section className="paper titles">
        <div className="wrap">
          <div className="toolbar watched-toolbar">
            <div className="segmented" role="group" aria-label="Show">
              {(["all", "movie", "tv"] as KindFilter[]).map((value) => (
                <button key={value} type="button" aria-pressed={kind === value} onClick={() => { setKind(value); setLimit(PAGE); }}>
                  {value === "all" ? "All" : value === "movie" ? "Films" : "Shows"}
                </button>
              ))}
            </div>
          </div>
          {groups.length ? (
            <>
              {groups.map((group) => (
                <section key={group.key} className="watched-month" aria-labelledby={`month-${group.key}`}>
                  <h2 id={`month-${group.key}`} className="watched-month-title">
                    {group.label} <span className="count">{group.total}</span>
                  </h2>
                  {group.key === "undated" && <p className="muted small-print watched-undated-note">Imported without a watch date, mostly from Letterboxd.</p>}
                  <div className="grid">
                    {group.movies.map((movie) => <TitleCard key={movie.id} movie={movie} onOpen={onOpen} />)}
                  </div>
                </section>
              ))}
              {visible.length > limit && (
                <div className="load-more">
                  <button type="button" className="button button-quiet" onClick={() => setLimit(limit + PAGE)}>
                    Show more · {visible.length - limit} left
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="empty">{query ? `Nothing watched matches “${query}”.` : "Titles you mark watched show up here."}</p>
          )}
        </div>
      </section>
    </>
  );
}
