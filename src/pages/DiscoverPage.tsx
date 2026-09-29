import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CandidateCard } from "../components/CandidateCard";
import { PageHeader } from "../components/PageHeader";
import { Icon } from "../components/Icon";
import { Poster } from "../components/Poster";
import { ReminderChoices } from "../components/ReminderMenu";
import { toast } from "../components/Toast";
import * as actions from "../lib/actions";
import { pickSeeds, savedKeys } from "../lib/discover";
import { regionName } from "../lib/cinemas";
import { onIntent, takeIntent } from "../lib/discoverIntent";
import { findExisting } from "../lib/editor";
import { displayTitle } from "../lib/rules";
import { useAppState } from "../lib/store";
import { browse, browseGenre, DISCOVER_CATEGORIES, genreHasShows, GENRES_LIST, IN_CINEMAS, recommendRows, searchTitles, TRENDING_SHOWS, upscale, type DiscoverCategory, type PersonMatch } from "../lib/tmdb";
import type { Candidate, KindFilter } from "../lib/types";

type Load =
  | { state: "loading" }
  | { state: "done"; items: Candidate[]; person?: PersonMatch; more?: boolean; rows?: { because: string; items: Candidate[] }[] }
  | { state: "error"; message: string };

const FOR_YOU = "for-you";

/**
 * Adding a title by hand. As the title is typed, matching titles from the
 * title service are offered, so a known film or show is saved with its poster
 * and details rather than as bare text; typing on still saves it by hand.
 */
function AddByHand({ onDone, onOpen, initialTitle = "" }: { onDone: () => void; onOpen: (id: string) => void; initialTitle?: string }) {
  const { library } = useAppState();
  const [title, setTitle] = useState(initialTitle);
  const [year, setYear] = useState("");
  const [mediaType, setMediaType] = useState("Movie");
  const [step, setStep] = useState<"form" | "remind">("form");
  const [picked, setPicked] = useState<Candidate | null>(null);
  const [matches, setMatches] = useState<Candidate[]>([]);
  const [looking, setLooking] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Opening it brings it to the top of the screen, leaving room for matches above the keyboard.
  useEffect(() => {
    box.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);

  const wanted = [title.trim(), year].filter(Boolean).join(" ");
  useEffect(() => {
    if (step !== "form" || title.trim().length < 2) {
      setMatches([]);
      setLooking(false);
      return;
    }
    let live = true;
    setLooking(true);
    const timer = setTimeout(() => {
      searchTitles(wanted)
        .then((result) => live && setMatches(result.titles.slice(0, 4)))
        .catch(() => live && setMatches([]))
        .finally(() => live && setLooking(false));
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [wanted, step]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (remind: number | null) => {
    const saved = picked ? actions.addCandidate(picked, remind) : actions.addManual(title, year, mediaType, remind);
    if (saved) onDone();
  };

  return (
    <div className="manual" ref={box}>
      {step === "form" ? (
        <form
          className="manual-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!title.trim()) return;
            setPicked(null);
            setStep("remind");
          }}
        >
          <label className="manual-title">
            <span className="eyebrow">Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              required
              autoFocus
              autoComplete="off"
              enterKeyHint="search"
              placeholder="Start typing a film or show"
            />
          </label>

          {/* Matches sit right under the title on phones, so what's typed stays in view above the keyboard. */}
          {title.trim().length >= 2 && (
            <div className="manual-matches" aria-live="polite">
              <p className="manual-matches-label">
                {looking && !matches.length ? "Looking for matches…" : matches.length ? "Is it one of these?" : "No matches. Add it by hand below."}
              </p>
              {matches.length > 0 && (
                <ul>
                  {matches.map((match) => {
                    const saved = findExisting(library, match);
                    return (
                      <li key={match.key}>
                        <button
                          type="button"
                          className="manual-match"
                          onClick={() => {
                            if (saved) return onOpen(saved.id);
                            setPicked(match);
                            setStep("remind");
                          }}
                        >
                          <Poster src={upscale(match.poster, "w185")} title={match.title} className="manual-match-poster" />
                          <span className="manual-match-text">
                            <b>{displayTitle(match)}</b>
                            <span>{[match.mediaType, match.year].filter(Boolean).join(" · ")}</span>
                          </span>
                          <span className={`manual-match-action ${saved ? "saved" : ""}`}>
                            {saved ? <><Icon name="check" size={13} /> {saved.watched ? "Watched" : "Saved"}</> : <><Icon name="plus" size={13} /> Save</>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <label className="manual-year">
            <span className="eyebrow">Year</span>
            <input value={year} onChange={(event) => setYear(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="Optional" />
          </label>
          <label className="manual-type">
            <span className="eyebrow">Type</span>
            <select value={mediaType} onChange={(event) => setMediaType(event.target.value)}>
              <option>Movie</option>
              <option>Show</option>
              <option>Documentary</option>
            </select>
          </label>
          <button type="submit" className="button button-ink manual-submit">Add to my queue</button>
        </form>
      ) : (
        <div>
          <p className="popover-label">Remind me about {picked ? displayTitle(picked) : title.trim()}…</p>
          <ReminderChoices releaseDate={picked?.releaseDate} onPick={save} onNone={() => save(null)} noneLabel="Just save it" />
          <button type="button" className="manual-back" onClick={() => setStep("form")}>Back</button>
        </div>
      )}
    </div>
  );
}

const matchesKindFilter = (item: Candidate, kind: KindFilter) => kind === "all" || item.tmdbType === kind;

function Results({ items, onOpen, showtimes = false, ranked = false }: { items: Candidate[]; onOpen: (id: string) => void; showtimes?: boolean; ranked?: boolean }) {
  return (
    <div className="grid">
      {items.map((item, index) => <CandidateCard key={item.key} candidate={item} onOpenSaved={onOpen} showtimes={showtimes} rank={ranked ? index + 1 : undefined} />)}
    </div>
  );
}

/** A sideways row of titles, with arrows for a mouse. */
function Row({ title, items, onOpen, onSeeAll, ranked = false, showtimes = false }: {
  title: string;
  items: Candidate[] | null;
  onOpen: (id: string) => void;
  onSeeAll?: () => void;
  ranked?: boolean;
  showtimes?: boolean;
}) {
  const row = useRef<HTMLDivElement>(null);
  const id = useId();
  const scroll = (direction: number) => row.current?.scrollBy({ left: direction * row.current.clientWidth * 0.85, behavior: "smooth" });
  return (
    <section className={`cinema-shelf ${ranked ? "ranked-shelf" : ""}`} aria-labelledby={id}>
      <div className="cinema-shelf-head">
        <h2 id={id}>{title}</h2>
        <div className="shelf-tools">
          <span className="shelf-arrows">
            <button type="button" className="shelf-arrow" aria-label={`Scroll ${title} back`} onClick={() => scroll(-1)}><Icon name="back" size={16} /></button>
            <button type="button" className="shelf-arrow flip" aria-label={`Scroll ${title} on`} onClick={() => scroll(1)}><Icon name="back" size={16} /></button>
          </span>
          {onSeeAll && <button type="button" className="link-button" onClick={onSeeAll}>See all</button>}
        </div>
      </div>
      <div className="cinema-row" ref={row} aria-busy={!items}>
        {items
          ? items.map((item, index) => <CandidateCard key={item.key} candidate={item} onOpenSaved={onOpen} showtimes={showtimes} rank={ranked ? index + 1 : undefined} />)
          : Array.from({ length: 6 }, (_, index) => <div key={index} className="skeleton-card" />)}
      </div>
    </section>
  );
}

/** A row fetched from one list: what's in cinemas here, or this week's top 10 shows. A failed or empty lookup leaves Discover as it was. */
function Shelf({ title, category, region, onOpen, onSeeAll, ranked = false, showtimes = false }: {
  title: string;
  category: DiscoverCategory;
  region: string;
  onOpen: (id: string) => void;
  onSeeAll: () => void;
  ranked?: boolean;
  showtimes?: boolean;
}) {
  const [items, setItems] = useState<Candidate[] | null>(null);
  useEffect(() => {
    let live = true;
    setItems(null);
    browse(category, 1, region)
      .then(({ items: found }) => live && setItems(found.slice(0, ranked ? 10 : 12)))
      .catch(() => live && setItems([]));
    return () => {
      live = false;
    };
  }, [category, region, ranked]);
  if (items && !items.length) return null;
  return <Row title={title} items={items} onOpen={onOpen} onSeeAll={onSeeAll} ranked={ranked} showtimes={showtimes} />;
}

const GENRE_PREFIX = "genre:";

export function DiscoverPage({ onOpen, query }: { onOpen: (id: string) => void; query: string }) {
  const { library, settings } = useAppState();
  const region = settings.region || "IN";
  const seeds = useMemo(() => pickSeeds(library.movies), [library.movies]);
  const saved = useMemo(() => savedKeys(library.movies), [library.movies]);
  // Recommendations follow the seeds, not every edit to the library.
  const seedKey = seeds.map((seed) => seed.tmdbId).join(",");
  const hasSeeds = seeds.length > 0;
  const home = hasSeeds ? FOR_YOU : DISCOVER_CATEGORIES[0].id;

  const [category, setCategory] = useState(home);
  const [kind, setKind] = useState<KindFilter>("all");
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [manual, setManual] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

  // A genre tapped in a title's details opens here on that genre.
  useEffect(() => onIntent(() => {
    const wanted = takeIntent("genre");
    if (wanted) setCategory(GENRE_PREFIX + wanted);
  }), []);

  const searching = query.trim().length >= 2;
  const forYou = !searching && category === FOR_YOU && hasSeeds;
  const genre = category.startsWith(GENRE_PREFIX) ? category.slice(GENRE_PREFIX.length) : "";
  const activeCategory = DISCOVER_CATEGORIES.find((item) => item.id === category) ?? DISCOVER_CATEGORIES[0];
  // A list of one kind shows that kind, fixed; a genre without shows is films only.
  const fixedKind: KindFilter | null = searching || forYou ? null : genre ? (genreHasShows(genre) ? null : "movie") : activeCategory.type ?? null;
  const shownKind = fixedKind ?? kind;
  const ranked = !searching && !genre && !forYou && Boolean(activeCategory.ranked);

  // A search starts clean: a half-filled "add by hand" form closes.
  useEffect(() => setManual(false), [searching]);

  const choose = (next: string) => {
    setCategory(next);
    // The new list starts at the top, under the bar.
    if (bar.current && bar.current.getBoundingClientRect().top < 80) bar.current.scrollIntoView({ block: "start" });
  };

  const fetchPage = (pageNumber: number) =>
    genre ? browseGenre(genre, kind === "all" ? "all" : kind, pageNumber) : browse(activeCategory, pageNumber, region);

  useEffect(() => {
    let live = true;
    setLoad({ state: "loading" });
    setPage(1);
    const timer = setTimeout(() => {
      const request: Promise<Load> = searching
        ? searchTitles(query.trim()).then((result) => ({ state: "done", items: result.titles, person: result.person }))
        : forYou
          ? recommendRows(seeds, saved).then((rows) => ({ state: "done", items: [], rows }))
          : fetchPage(1).then(({ items, more }) => ({ state: "done", items, more }));
      request
        .then((result) => live && setLoad(result))
        .catch((error) => live && setLoad({ state: "error", message: error.message }));
    }, searching ? 350 : 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [category, query, searching, forYou, seedKey, region, genre ? kind : ""]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = async () => {
    if (load.state !== "done") return;
    setLoadingMore(true);
    try {
      const next = await fetchPage(page + 1);
      const known = new Set(load.items.map((item) => item.key));
      setLoad({ ...load, items: [...load.items, ...next.items.filter((item) => !known.has(item.key))], more: next.more });
      setPage(page + 1);
    } catch (error) {
      toast((error as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  // Browsing is for finding something new, so saved titles drop out of the
  // lists; a search still shows them, marked "In your queue", and a chart
  // keeps them so its numbers stay true.
  const visible = load.state === "done"
    ? load.items.filter((item) => matchesKindFilter(item, shownKind) && (searching || ranked || !saved.has(item.key)))
    : [];
  const rows = load.state === "done" && load.rows
    ? load.rows.map((row) => ({ ...row, items: row.items.filter((item) => matchesKindFilter(item, kind)) })).filter((row) => row.items.length >= 3)
    : [];
  const person = load.state === "done" ? load.person : undefined;
  const personWork = person ? person.titles.filter((item) => matchesKindFilter(item, shownKind)) : [];
  const showShelves = !searching && category === home;
  const nothing = load.state === "done" && !visible.length && !rows.length && !personWork.length;

  return (
    <>
      <PageHeader title="Discover" meta={searching ? <>Results for “{query.trim()}”</> : undefined} />

      <section className="paper titles discover">
        <div className="wrap">
          {showShelves && (
            <>
              <Shelf title="Top 10 shows this week" category={TRENDING_SHOWS} region={region} onOpen={onOpen} onSeeAll={() => choose(TRENDING_SHOWS.id)} ranked />
              <Shelf title={`In cinemas in ${regionName(region)}`} category={IN_CINEMAS} region={region} onOpen={onOpen} onSeeAll={() => choose(IN_CINEMAS.id)} showtimes />
            </>
          )}

          {!searching && (
            <div className="discover-bar" ref={bar}>
              <div className="category-row" role="tablist" aria-label="Lists">
                {hasSeeds && (
                  <button type="button" role="tab" aria-selected={category === FOR_YOU} className="category" onClick={() => choose(FOR_YOU)}>
                    <Icon name="star" size={13} /> For you
                  </button>
                )}
                {DISCOVER_CATEGORIES.map((item) => (
                  <button key={item.id} type="button" role="tab" aria-selected={category === item.id} className="category" onClick={() => choose(item.id)}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="toolbar discover-toolbar">
            <div className="segmented" role="group" aria-label="Show">
              {(["all", "movie", "tv"] as KindFilter[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={shownKind === value}
                  disabled={Boolean(fixedKind) && fixedKind !== value}
                  onClick={() => setKind(value)}
                >
                  {value === "all" ? "All" : value === "movie" ? "Films" : "Shows"}
                </button>
              ))}
            </div>
            {!searching && (
              <label className={`select genre-select ${genre ? "active" : ""}`}>
                <span className="visually-hidden">Genre</span>
                <select value={genre} onChange={(event) => choose(event.target.value ? GENRE_PREFIX + event.target.value : home)}>
                  <option value="">Genre</option>
                  {GENRES_LIST.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
            )}
          </div>

          {load.state === "loading" && (
            <div className="grid" aria-busy="true">
              {Array.from({ length: 12 }, (_, index) => <div key={index} className="skeleton-card" />)}
            </div>
          )}
          {load.state === "error" && <p className="empty">{load.message}</p>}

          {person && personWork.length > 0 && (
            <div className="person-block">
              <div className="person-head">
                <Poster src={person.photo} title={person.name} className="person-photo" />
                <div>
                  <p className="eyebrow">{person.role} · best known for</p>
                  <h3>{person.name}</h3>
                </div>
              </div>
              <Results items={personWork} onOpen={onOpen} />
              {visible.length > 0 && <h3 className="subsection-title">Titles matching “{query.trim()}”</h3>}
            </div>
          )}

          {rows.map((row) => <Row key={row.because} title={`Because you saved ${row.because}`} items={row.items} onOpen={onOpen} />)}

          {visible.length > 0 && (
            <>
              <Results key={`${category}:${shownKind}`} items={visible} onOpen={onOpen} showtimes={!searching && category === IN_CINEMAS.id} ranked={ranked} />
              {!searching && !forYou && load.state === "done" && load.more && (
                <div className="load-more">
                  <button type="button" className="button button-quiet" onClick={() => void loadMore()} disabled={loadingMore}>
                    {loadingMore ? "Loading…" : "Show more"}
                  </button>
                </div>
              )}
            </>
          )}

          {nothing && (
            <p className="empty">
              {searching
                ? "Nothing found. Try another spelling, or add the year (“dune 2021”)."
                : forYou
                  ? "No new suggestions right now. Save a few more titles and check back."
                  : kind !== "all" && !fixedKind ? "Nothing of that kind in this list." : "You've already saved everything in this list."}
            </p>
          )}

          {/* The rarely needed way in, where it's needed: after a search, or at the end. */}
          {load.state !== "loading" && (manual ? (
            <AddByHand key={query} initialTitle={searching ? query.trim() : ""} onDone={() => setManual(false)} onOpen={onOpen} />
          ) : (
            <p className="add-by-hand-hint">
              {searching ? "Can't find it?" : "Missing something?"}{" "}
              <button type="button" className="link-button inline" onClick={() => setManual(true)}>Add it by hand</button>
            </p>
          ))}
        </div>
      </section>
    </>
  );
}
