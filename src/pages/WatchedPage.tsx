import { useMemo, useRef, useState } from "react";
import { TitleCard } from "../components/TitleCard";
import { WatchedHighlights } from "../components/WatchedHighlights";
import { importDays, knownWatchedAt, matchesKind, matchesSearch, watchedGroups } from "../lib/rules";
import { PageHeader } from "../components/PageHeader";
import { EmptyStart } from "../components/EmptyStart";
import { Icon } from "../components/Icon";
import { useAppState } from "../lib/store";
import { useSwap } from "../lib/motion";
import type { KindFilter } from "../lib/types";

const PAGE = 60;

export function WatchedPage({ onOpen, query }: { onOpen: (id: string) => void; query: string }) {
  const { library } = useAppState();
  const [kind, setKind] = useState<KindFilter>("all");
  const months = useRef<HTMLDivElement>(null);
  useSwap(months, kind);

  const watched = useMemo(() => library.movies.filter((movie) => movie.watched), [library.movies]);
  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
    const imports = importDays(watched);
    const minutes = watched.reduce((sum, movie) => sum + (Number(movie.runtimeMinutes) || 0), 0);
    return {
      // Only real viewing dates count, so a Letterboxd import doesn't read as a binge.
      month: watched.filter((movie) => knownWatchedAt(movie, imports) >= monthStart).length,
      year: watched.filter((movie) => knownWatchedAt(movie, imports) >= yearStart).length,
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
        className="watched-head"
        stats={watched.length ? [
          { value: watched.length, label: "in all" },
          ...(stats.month ? [{ value: stats.month, label: "this month" }] : []),
          ...(stats.year ? [{ value: stats.year, label: "this year" }] : []),
          // Hours only count titles with a known runtime, so they wait until there are some.
          ...(stats.hours ? [{ value: stats.hours, label: "estimated hours" }] : [])
        ] : undefined}
      />

      <section className="paper titles">
        <div className="wrap">
          {stats.hours > 0 && <p className="muted small-print">Time is estimated from titles with a known runtime; individual episodes and missing runtimes aren't included.</p>}
          {!watched.length ? (
            <EmptyStart lead="Nothing watched yet." text="Titles you mark watched gather here, month by month, with your verdict on each.">
              <a className="button button-ink" href="#/"><Icon name="queue" size={16} /> Go to your queue</a>
              <a className="button button-quiet" href="#/settings">Bring in your Letterboxd diary</a>
            </EmptyStart>
          ) : <>
          <div className="toolbar watched-toolbar">
            <div className="segmented" role="group" aria-label="Show">
              {(["all", "movie", "tv"] as KindFilter[]).map((value) => (
                <button key={value} type="button" aria-pressed={kind === value} onClick={() => { setKind(value); setLimit(PAGE); }}>
                  {value === "all" ? "All" : value === "movie" ? "Films" : "Shows"}
                </button>
              ))}
            </div>
          </div>
          <WatchedHighlights movies={visible} onOpen={onOpen} />
          <h2 className="section-title watched-history-title">Your watch history</h2>
          {groups.length ? (
            <>
              <div ref={months}>
              {groups.map((group) => (
                <section key={group.key} className="watched-month" aria-labelledby={`month-${group.key}`}>
                  <h2 id={`month-${group.key}`} className="watched-month-title">
                    {group.label} <span className="count">· {group.total} {group.total === 1 ? "title" : "titles"}</span>
                  </h2>
                  {group.key === "undated" && <p className="muted small-print watched-undated-note">Imported without a watch date, mostly from Letterboxd.</p>}
                  <div className="grid">
                    {group.movies.map((movie) => <TitleCard key={movie.id} movie={movie} onOpen={onOpen} />)}
                  </div>
                </section>
              ))}
              </div>
              {visible.length > limit && (
                <div className="load-more">
                  <button type="button" className="button button-quiet" onClick={() => setLimit(limit + PAGE)}>
                    Show more · {visible.length - limit} left
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="empty">{query ? `Nothing watched matches “${query}”.` : "Nothing of that kind watched yet."}</p>
          )}
          </>}
        </div>
      </section>
    </>
  );
}
