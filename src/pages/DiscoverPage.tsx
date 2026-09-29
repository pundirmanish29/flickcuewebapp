import { useEffect, useMemo, useRef, useState } from "react";
import { CandidateCard } from "../components/CandidateCard";
import { PageHeader } from "../components/PageHeader";
import { Icon } from "../components/Icon";
import { Poster } from "../components/Poster";
import { ReminderChoices } from "../components/ReminderMenu";
import { toast } from "../components/Toast";
import * as actions from "../lib/actions";
import { pickSeeds, savedKeys } from "../lib/discover";
import { findExisting } from "../lib/editor";
import { displayTitle } from "../lib/rules";
import { useAppState } from "../lib/store";
import { browse, DISCOVER_CATEGORIES, IN_CINEMAS, recommendFrom, searchTitles, upscale, type PersonMatch } from "../lib/tmdb";
import type { Candidate, KindFilter } from "../lib/types";

type Load =
  | { state: "loading" }
  | { state: "done"; items: Candidate[]; person?: PersonMatch; more?: boolean }
  | { state: "error"; message: string };

const FOR_YOU = "for-you";

/**
 * Adding a title by hand. As the title is typed, matching titles from the
 * title service are offered, so a known film or show is saved with its poster
 * and details rather than as bare text; typing on still saves it by hand.
 */
function AddByHand({ onDone, onOpen }: { onDone: () => void; onOpen: (id: string) => void }) {
  const { library } = useAppState();
  const [title, setTitle] = useState("");
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
          <button type="submit" className="button button-ink manual-submit">Add by hand</button>
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

function Results({ items, onOpen }: { items: Candidate[]; onOpen: (id: string) => void }) {
  return (
    <div className="grid">
      {items.map((item) => <CandidateCard key={item.key} candidate={item} onOpenSaved={onOpen} />)}
    </div>
  );
}

/** "India", from a region code, for headings; the code itself when the browser can't name it. */
function regionName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) || code;
  } catch {
    return code;
  }
}

/** What's showing in cinemas in the reader's region, as a row above the lists. */
function CinemaShelf({ region, onOpen, onSeeAll }: { region: string; onOpen: (id: string) => void; onSeeAll: () => void }) {
  const [items, setItems] = useState<Candidate[] | null>(null);
  useEffect(() => {
    let live = true;
    setItems(null);
    browse(IN_CINEMAS, 1, region)
      .then(({ items: found }) => live && setItems(found.slice(0, 12)))
      .catch(() => live && setItems([]));
    return () => {
      live = false;
    };
  }, [region]);

  // A failed or empty lookup leaves the rest of Discover as it was.
  if (items && !items.length) return null;
  return (
    <section className="cinema-shelf" aria-labelledby="cinema-shelf-title">
      <div className="cinema-shelf-head">
        <h2 id="cinema-shelf-title">In cinemas in {regionName(region)}</h2>
        <button type="button" className="link-button" onClick={onSeeAll}>See all</button>
      </div>
      <div className="cinema-row" aria-busy={!items}>
        {items
          ? items.map((item) => <CandidateCard key={item.key} candidate={item} onOpenSaved={onOpen} />)
          : Array.from({ length: 6 }, (_, index) => <div key={index} className="skeleton-card" />)}
      </div>
    </section>
  );
}

export function DiscoverPage({ onOpen, query }: { onOpen: (id: string) => void; query: string }) {
  const { library, settings } = useAppState();
  const region = settings.region || "IN";
  const seeds = useMemo(() => pickSeeds(library.movies), [library.movies]);
  const saved = useMemo(() => savedKeys(library.movies), [library.movies]);
  // Recommendations follow the seeds, not every edit to the library.
  const seedKey = seeds.map((seed) => seed.tmdbId).join(",");
  const hasSeeds = seeds.length > 0;

  const [category, setCategory] = useState(() => (hasSeeds ? FOR_YOU : DISCOVER_CATEGORIES[0].id));
  const [kind, setKind] = useState<KindFilter>("all");
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [manual, setManual] = useState(false);

  const searching = query.trim().length >= 2;
  const forYou = !searching && category === FOR_YOU && hasSeeds;
  const activeCategory = DISCOVER_CATEGORIES.find((item) => item.id === category) ?? DISCOVER_CATEGORIES[0];

  useEffect(() => {
    let live = true;
    setLoad({ state: "loading" });
    setPage(1);
    const timer = setTimeout(() => {
      const request: Promise<Load> = searching
        ? searchTitles(query.trim()).then((result) => ({ state: "done", items: result.titles, person: result.person }))
        : forYou
          ? recommendFrom(seeds, saved).then((items) => ({ state: "done", items }))
          : browse(activeCategory, 1, region).then(({ items, more }) => ({ state: "done", items, more }));
      request
        .then((result) => live && setLoad(result))
        .catch((error) => live && setLoad({ state: "error", message: error.message }));
    }, searching ? 350 : 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [category, query, searching, forYou, seedKey, region]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = async () => {
    if (load.state !== "done") return;
    setLoadingMore(true);
    try {
      const next = await browse(activeCategory, page + 1, region);
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
  // lists; a search still shows them, marked "In your queue".
  const visible = load.state === "done"
    ? load.items.filter((item) => matchesKindFilter(item, kind) && (searching || !saved.has(item.key)))
    : [];
  const person = load.state === "done" ? load.person : undefined;
  const personWork = person ? person.titles.filter((item) => matchesKindFilter(item, kind)) : [];

  const showKind = searching || forYou || category === "trending";

  return (
    <>
      <PageHeader title="Discover" />

      <section className="paper titles">
        <div className="wrap">
          {!searching && category !== IN_CINEMAS.id && (
            <CinemaShelf region={region} onOpen={onOpen} onSeeAll={() => setCategory(IN_CINEMAS.id)} />
          )}

          {!searching && (
            <div className="category-row" role="tablist" aria-label="Lists">
              {hasSeeds && (
                <button type="button" role="tab" aria-selected={category === FOR_YOU} className="category" onClick={() => setCategory(FOR_YOU)}>
                  <Icon name="star" size={13} /> For you
                </button>
              )}
              {DISCOVER_CATEGORIES.map((item) => (
                <button key={item.id} type="button" role="tab" aria-selected={category === item.id} className="category" onClick={() => setCategory(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
          )}

          <div className="toolbar">
            {/* Browsing, the selected chip already names the list; only a search needs a heading. */}
            {searching && <h2 className="section-title">Results for “{query.trim()}”</h2>}
            <div className="toolbar-controls">
              {showKind && (
                <div className="segmented" role="group" aria-label="Show">
                  {(["all", "movie", "tv"] as KindFilter[]).map((value) => (
                    <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>
                      {value === "all" ? "All" : value === "movie" ? "Films" : "Shows"}
                    </button>
                  ))}
                </div>
              )}
              <button type="button" className="button button-quiet small" aria-expanded={manual} onClick={() => setManual((open) => !open)}>
                <Icon name="plus" size={15} /> Add by hand
              </button>
            </div>
          </div>
          {manual && <AddByHand onDone={() => setManual(false)} onOpen={onOpen} />}

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

          {load.state === "done" && (visible.length > 0 ? (
            <>
              <Results items={visible} onOpen={onOpen} />
              {!searching && !forYou && load.more && (
                <div className="load-more">
                  <button type="button" className="button button-quiet" onClick={() => void loadMore()} disabled={loadingMore}>
                    {loadingMore ? "Loading…" : "Show more"}
                  </button>
                </div>
              )}
            </>
          ) : personWork.length === 0 && (
            <p className="empty">
              {searching
                ? "Nothing found. Try another spelling, add the year (“dune 2021”), or add it by hand."
                : forYou
                  ? "No new suggestions right now. Save a few more titles and check back."
                  : kind !== "all" ? "Nothing of that kind in this list." : "You've already saved everything in this list."}
            </p>
          ))}
        </div>
      </section>
    </>
  );
}
