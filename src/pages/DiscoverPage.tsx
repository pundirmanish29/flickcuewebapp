import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { lookupErrorText } from "../lib/friendlyError";
import { CandidateCard } from "../components/CandidateCard";
import { HeadingMenu } from "../components/HeadingMenu";
import { PageHeader } from "../components/PageHeader";
import { Icon } from "../components/Icon";
import { Poster } from "../components/Poster";
import { ReminderChoices } from "../components/ReminderMenu";
import { ScrollArrows } from "../components/ScrollArrows";
import { toast } from "../components/Toast";
import * as actions from "../lib/actions";
import { pickSeeds, savedKeys } from "../lib/discover";
import { onIntent, takeIntent } from "../lib/discoverIntent";
import { findExisting } from "../lib/editor";
import { useSwap } from "../lib/motion";
import { displayTitle } from "../lib/rules";
import { useAppState } from "../lib/store";
import { browseNew, browseStream, COMING_SOON, HIDDEN_GEMS, NEW_RELEASES_ID, NEW_RELEASES_TITLE, streamChoices, TALK_OF_THE_TOWN, type StreamChoice } from "../lib/shelves";
import { browse, browseAll, browseGenre, DISCOVER_CATEGORIES, genreHasShows, GENRES_LIST, IN_CINEMAS, recommendRows, searchTitles, upscale, type DiscoverCategory, type PersonMatch } from "../lib/tmdb";
import type { Candidate, KindFilter } from "../lib/types";

type Load =
  | { state: "loading" }
  | { state: "done"; items: Candidate[]; person?: PersonMatch; more?: boolean; rows?: { because: string; items: Candidate[] }[] }
  | { state: "error"; message: string };

/**
 * Adding a title by hand. As the title is typed, matching titles from the
 * title service are offered, so a known film or show is saved with its poster
 * and details rather than as bare text; typing on still saves it by hand.
 */
export function AddByHand({ onDone, onOpen, initialTitle = "" }: { onDone: () => void; onOpen: (id: string) => void; initialTitle?: string }) {
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

function Results({ items, onOpen, showtimes = false, ranked = false, compact = false }: { items: Candidate[]; onOpen: (id: string) => void; showtimes?: boolean; ranked?: boolean; compact?: boolean }) {
  return (
    <div className="grid">
      {items.map((item, index) => <CandidateCard key={item.key} candidate={item} onOpenSaved={onOpen} showtimes={showtimes} rank={ranked ? index + 1 : undefined} compact={compact} />)}
    </div>
  );
}

/** A sideways row of titles, with arrows for a mouse in place of a scrollbar. */
function Row({ title, heading, bare = false, items, failed = false, onRetry, onOpen, onSeeAll, ranked = false, showtimes = false, reasons = true, compact = false, swapKey }: {
  title: string;
  /** What the heading shows in place of the plain title, such as a menu. */
  heading?: ReactNode;
  /** The heading is itself a control, so it is not a heading element. */
  bare?: boolean;
  items: Candidate[] | null;
  /** The list couldn't be loaded (not the same as having nothing in it): say so, and offer another try. */
  failed?: boolean;
  onRetry?: () => void;
  onOpen: (id: string) => void;
  onSeeAll?: () => void;
  ranked?: boolean;
  showtimes?: boolean;
  /** Say why each title is here, under its name. */
  reasons?: boolean;
  /** Two lines under each poster, no summary. */
  compact?: boolean;
  /** Changes when the row switches to another list, so it settles in again. */
  swapKey?: string;
}) {
  const row = useRef<HTMLDivElement>(null);
  useSwap(row, swapKey);
  const id = useId();
  return (
    <section className={`cinema-shelf ${ranked ? "ranked-shelf" : ""} ${reasons ? "" : "no-reasons"}`} aria-labelledby={id}>
      <div className="cinema-shelf-head">
        {/* A row whose heading is a control (the cinema toggle) still gets a real heading, for screen readers. */}
        {bare ? <div className="cinema-shelf-title"><h2 id={id} className="visually-hidden">{title}</h2>{heading}</div> : <h2 id={id}>{heading ?? title}</h2>}
        <div className="shelf-tools">
          <ScrollArrows target={row} label={title} watch={items} />
          {onSeeAll && <button type="button" className="link-button" onClick={onSeeAll}>See all</button>}
        </div>
      </div>
      <div className="cinema-row" ref={row} aria-busy={!items && !failed}>
        {failed
          ? <p className="row-failed" role="status">Couldn't load this list. {onRetry && <button type="button" className="link-button" onClick={onRetry}>Try again</button>}</p>
          : items
          ? items.map((item, index) => <CandidateCard key={item.key} candidate={item} onOpenSaved={onOpen} showtimes={showtimes} rank={ranked ? index + 1 : undefined} compact={compact} />)
          : Array.from({ length: 6 }, (_, index) => <div key={index} className="skeleton-card" />)}
      </div>
    </section>
  );
}

const GENRE_PREFIX = "genre:";
const STREAM_PREFIX = "stream:";
const STREAM_KEY = "flickcue.discoverStream";

/** The lists behind "See all" and "Explore more": a name for each. */
const BROWSE_LISTS: { id: string; title: string }[] = [
  { id: "trending", title: "Trending" },
  { id: "trending-shows", title: "Top 10 shows" },
  { id: "upcoming", title: "Coming soon" },
  { id: "now-playing", title: "In cinemas" },
  { id: NEW_RELEASES_ID, title: NEW_RELEASES_TITLE },
  { id: "to-rent", title: "New to rent" },
  { id: "hidden-gems", title: "Hidden gems" },
  { id: "popular-films", title: "Popular films" },
  { id: "top-films", title: "Top rated films" },
  { id: "popular-shows", title: "Popular shows" },
  { id: "top-shows", title: "Top rated shows" }
];
/** The lists that get a chip under "Explore more"; the others are reached from the rows above. */
const EXPLORE_LISTS = ["trending-shows", "hidden-gems", "popular-films", "top-films", "popular-shows", "top-shows"];
/** Lists whose cards say why: a date, a rating. */
const LABELLED_LISTS: Record<string, DiscoverCategory> = { upcoming: COMING_SOON, "hidden-gems": HIDDEN_GEMS };

const NEW_TO_RENT = DISCOVER_CATEGORIES.find((category) => category.id === "to-rent")!;

const readStream = (): string => {
  try {
    return localStorage.getItem(STREAM_KEY) || "";
  } catch {
    return "";
  }
};

/**
 * The top of Discover: what's coming soon or in cinemas now, as ordinary posters.
 * The two lists share one row, switched by the pair of buttons that is its heading; coming soon shows first.
 */
function CinemaRow({ region, saved, onOpen, onSeeAll }: { region: string; saved: Set<string>; onOpen: (id: string) => void; onSeeAll: (list: string) => void }) {
  const [chosen, setMode] = useState<"now" | "soon" | "new">("soon");
  const [lists, setLists] = useState<Record<"now" | "soon" | "new", Candidate[] | null>>({ now: null, soon: null, new: null });
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setLists({ now: null, soon: null, new: null });
    setFailed(false);
    const fail = (key: "now" | "soon" | "new") => {
      if (!live) return;
      setLists((current) => ({ ...current, [key]: current[key] ?? [] }));
      setFailed(true);
    };
    // Everything in cinemas and everything coming soon: the first page shows at once, the rest fills in behind it.
    const fetchList = (key: "now" | "soon", category: DiscoverCategory) =>
      browseAll(category, region, (items) => live && setLists((current) => ({ ...current, [key]: items }))).catch(() => fail(key));
    void fetchList("now", IN_CINEMAS);
    void fetchList("soon", COMING_SOON);
    // What has just come out is a longer list than a row: its first page here, the rest under See all.
    browseNew("all", 1).then(({ items }) => live && setLists((current) => ({ ...current, new: items }))).catch(() => fail("new"));
    return () => {
      live = false;
    };
  }, [region, attempt]);

  // Nothing coming soon in this region: show what's in cinemas instead of an empty row.
  const mode = chosen === "soon" && lists.soon?.length === 0 && lists.now?.length ? "now" : chosen;
  // Titles you haven't saved come first: the row is for finding something, and the rest follow, ticked.
  const items = lists[mode]
    ? [...lists[mode]!.filter((item) => !saved.has(item.key)), ...lists[mode]!.filter((item) => saved.has(item.key))]
    : null;
  if (!failed && lists.now && lists.soon && lists.new && !lists.now.length && !lists.soon.length && !lists.new.length) return null;
  return (
    <Row
      title={mode === "new" ? NEW_RELEASES_TITLE : "At the cinema"}
      bare
      heading={
        <div className="segmented" role="group" aria-label="Coming soon, in cinemas, or new">
          <button type="button" aria-pressed={mode === "soon"} onClick={() => setMode("soon")}>Coming soon</button>
          <button type="button" aria-pressed={mode === "now"} onClick={() => setMode("now")}>In cinemas</button>
          <button type="button" aria-pressed={mode === "new"} onClick={() => setMode("new")}>New</button>
        </div>
      }
      items={items}
      failed={failed && !items?.length}
      onRetry={() => setAttempt((count) => count + 1)}
      onOpen={onOpen}
      onSeeAll={() => onSeeAll(mode === "now" ? IN_CINEMAS.id : mode === "new" ? NEW_RELEASES_ID : "upcoming")}
      showtimes={mode === "now"}
      compact
      swapKey={mode}
    />
  );
}

/** "On Netflix ▾": the row's own heading is the menu that changes what it shows. */
function StreamingRow({ region, streams, saved, onOpen, onSeeAll }: {
  region: string;
  streams: StreamChoice[];
  saved: Set<string>;
  onOpen: (id: string) => void;
  onSeeAll: (list: string) => void;
}) {
  const [chosen, setChosen] = useState(readStream);
  // Netflix unless one was picked before (and is still on offer in this region).
  const choice = streams.find((item) => item.id === chosen) ?? streams[1] ?? streams[0];
  const [items, setItems] = useState<Candidate[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setItems(null);
    setFailed(false);
    browseStream(choice, region, "all", 1).then(({ items: found }) => live && setItems(found)).catch(() => {
      if (!live) return;
      setItems([]);
      setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [choice.id, region, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = (item: StreamChoice) => (item.id === "free" ? "Free to watch" : `On ${item.label}`);
  const pick = (id: string) => {
    setChosen(id);
    try {
      localStorage.setItem(STREAM_KEY, id);
    } catch {
      // Without storage the choice lasts for this visit.
    }
  };
  const shown = items ? items.filter((item) => !saved.has(item.key)).slice(0, 10) : null;
  return (
    <Row
      title={label(choice)}
      heading={<HeadingMenu label="Streaming service" value={choice.id} options={streams.map((item) => ({ id: item.id, label: label(item) }))} onPick={pick} />}
      items={shown}
      failed={failed}
      onRetry={() => setAttempt((count) => count + 1)}
      onOpen={onOpen}
      onSeeAll={() => onSeeAll(STREAM_PREFIX + choice.id)}
      compact
    />
  );
}

export function DiscoverPage({ onOpen, query }: { onOpen: (id: string) => void; query: string }) {
  const { library, settings } = useAppState();
  const region = settings.region || "IN";
  const seeds = useMemo(() => pickSeeds(library.movies), [library.movies]);
  const saved = useMemo(() => savedKeys(library.movies), [library.movies]);
  const streams = useMemo(() => streamChoices(region), [region]);
  // Recommendations follow the seeds, not every edit to the library.
  const seedKey = seeds.map((seed) => seed.tmdbId).join(",");
  const hasSeeds = seeds.length > 0;

  // "" is Discover's own page; anything else is a full list opened from it.
  // Coming back to a list through history (Back from another page) reopens that list.
  const [list, setList] = useState(() => (history.state as { discoverList?: string } | null)?.discoverList ?? "");
  const [kind, setKind] = useState<KindFilter>("all");
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [trending, setTrending] = useState<Candidate[] | null>(null);
  const [rentals, setRentals] = useState<Candidate[] | null>(null);
  const [rowsFailed, setRowsFailed] = useState({ trending: false, rentals: false });
  const [rowsAttempt, setRowsAttempt] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [manual, setManual] = useState(false);

  // A full list is a step in history, so Back (or a phone's back gesture) returns to Discover rather than leaving it.
  const openList = (id: string) => {
    const state = (history.state ?? {}) as { discoverList?: string };
    if (state.discoverList) history.replaceState({ ...state, discoverList: id }, "", location.hash);
    else history.pushState({ fromApp: true, discoverList: id }, "", location.hash || "#/discover");
    setList(id);
  };
  const closeList = () => {
    if ((history.state as { discoverList?: string } | null)?.discoverList) history.back();
    else setList("");
  };
  useEffect(() => {
    const onPop = (event: PopStateEvent) => setList((event.state as { discoverList?: string } | null)?.discoverList ?? "");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // A genre tapped in a title's details opens here on that genre.
  useEffect(() => onIntent(() => {
    const wanted = takeIntent("genre");
    if (wanted) openList(GENRE_PREFIX + wanted);
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const searching = query.trim().length >= 2;
  const root = !searching && !list;
  const forYou = root && hasSeeds;
  const genre = list.startsWith(GENRE_PREFIX) ? list.slice(GENRE_PREFIX.length) : "";
  const stream = list.startsWith(STREAM_PREFIX) ? streams.find((item) => STREAM_PREFIX + item.id === list) : undefined;
  const newReleases = list === NEW_RELEASES_ID;
  const activeCategory = LABELLED_LISTS[list] ?? DISCOVER_CATEGORIES.find((item) => item.id === list) ?? DISCOVER_CATEGORIES[0];
  // A list of one kind shows that kind, fixed; a genre without shows is films only.
  const fixedKind: KindFilter | null = searching || root || stream || newReleases ? null : genre ? (genreHasShows(genre) ? null : "movie") : activeCategory.type ?? null;
  const shownKind = fixedKind ?? kind;
  const ranked = !searching && Boolean(list) && !genre && !stream && Boolean(activeCategory.ranked);

  // Changing region can remove a service (JioHotstar, Disney+): leave its list rather than sit on one that is gone.
  useEffect(() => {
    if (list.startsWith(STREAM_PREFIX) && !stream) setList("");
  }, [list, stream]);

  // Every list opens at its top, and coming back to Discover does too.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [list]);

  // A search starts clean: a half-filled "add by hand" form closes.
  useEffect(() => setManual(false), [searching]);

  // What's trending, and what's just out to rent, are rows of their own on the page.
  useEffect(() => {
    if (!root) return;
    let live = true;
    setRowsFailed({ trending: false, rentals: false });
    browse(TALK_OF_THE_TOWN, 1, region).then(({ items }) => live && setTrending(items)).catch(() => {
      if (!live) return;
      setTrending([]);
      setRowsFailed((current) => ({ ...current, trending: true }));
    });
    browse(NEW_TO_RENT, 1, region).then(({ items }) => live && setRentals(items)).catch(() => {
      if (!live) return;
      setRentals([]);
      setRowsFailed((current) => ({ ...current, rentals: true }));
    });
    return () => {
      live = false;
    };
  }, [root, region, rowsAttempt]);

  const fetchPage = (pageNumber: number) =>
    genre ? browseGenre(genre, kind === "all" ? "all" : kind, pageNumber)
      : stream ? browseStream(stream, region, kind, pageNumber)
        : newReleases ? browseNew(kind, pageNumber)
          : browse(activeCategory, pageNumber, region);

  useEffect(() => {
    let live = true;
    setLoad({ state: "loading" });
    setPage(1);
    const timer = setTimeout(() => {
      const request: Promise<Load> = searching
        ? searchTitles(query.trim()).then((result) => ({ state: "done", items: result.titles, person: result.person }))
        : forYou
          ? recommendRows(seeds, saved).then((rows) => ({ state: "done", items: [], rows }))
          : root
            ? Promise.resolve<Load>({ state: "done", items: [] })
            : fetchPage(1).then(({ items, more }) => ({ state: "done", items, more }));
      request
        .then((result) => live && setLoad(result))
        .catch((error) => live && setLoad({ state: "error", message: error.message }));
    }, searching ? 350 : 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [list, query, searching, forYou, root, seedKey, region, genre || stream || newReleases ? kind : ""]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = async () => {
    if (load.state !== "done") return;
    setLoadingMore(true);
    try {
      const next = await fetchPage(page + 1);
      const known = new Set(load.items.map((item) => item.key));
      setLoad({ ...load, items: [...load.items, ...next.items.filter((item) => !known.has(item.key))], more: next.more });
      setPage(page + 1);
    } catch (error) {
      toast(lookupErrorText((error as Error).message));
    } finally {
      setLoadingMore(false);
    }
  };

  // Browsing is for finding something new, so saved titles drop out of the
  // lists; a search still shows them, marked "In your queue", a chart keeps
  // them so its numbers stay true, and so does what's out to rent (it's news
  // about a saved film too).
  const keepSaved = searching || ranked || list === NEW_TO_RENT.id;
  const visible = load.state === "done"
    ? load.items.filter((item) => matchesKindFilter(item, shownKind) && (keepSaved || !saved.has(item.key)))
    : [];
  const person = load.state === "done" ? load.person : undefined;
  const personWork = person ? person.titles.filter((item) => matchesKindFilter(item, shownKind)) : [];
  const nothing = load.state === "done" && !root && !visible.length && !personWork.length;

  const picks = load.state === "done" && load.rows ? load.rows.filter((row) => row.items.length >= 3) : [];
  const fresh = (items: Candidate[]) => items.filter((item) => !saved.has(item.key)).slice(0, 10);
  const forYouRow = picks[0] ? { title: `Because you saved ${picks[0].because}`, items: fresh(picks[0].items) } : null;
  const trendingItems = trending ? fresh(trending) : null;
  // A saved film coming out to rent is news too: it keeps its place in the row, ticked.
  const rentalItems = rentals ? rentals.slice(0, 12) : null;

  const listTitle = genre
    ? GENRES_LIST.find((item) => item.id === genre)?.label ?? "Genre"
    : stream
      ? stream.id === "free" ? "Free to watch" : `On ${stream.label}`
      : BROWSE_LISTS.find((item) => item.id === list)?.title ?? activeCategory.label;

  return (
    <>
      <PageHeader title="Discover" className="discover-head" meta={searching ? <>Results for “{query.trim()}”</> : undefined} />

      <section className="paper titles discover">
        <div className="wrap">
          {!searching && list && (
            <div className="list-head">
              <button type="button" className="header-icon list-back" onClick={closeList} aria-label="Back to Discover">
                <Icon name="back" size={20} />
              </button>
              <h2>{listTitle}</h2>
            </div>
          )}

          {!root && (
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
              {!searching && !stream && (
                <label className={`select genre-select ${genre ? "active" : ""}`}>
                  <span className="visually-hidden">Genre</span>
                  <select value={genre} onChange={(event) => (event.target.value ? openList(GENRE_PREFIX + event.target.value) : closeList())}>
                    <option value="">Genre</option>
                    {GENRES_LIST.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </label>
              )}
            </div>
          )}

          {load.state === "loading" && !root && (
            <div className="grid" aria-busy="true">
              {Array.from({ length: 12 }, (_, index) => <div key={index} className="skeleton-card" />)}
            </div>
          )}
          {load.state === "error" && <p className="empty">{lookupErrorText(load.message)}</p>}

          {person && personWork.length > 0 && (
            <div className="person-block">
              <div className="person-head">
                <Poster src={person.photo} title={person.name} className="person-photo" person />
                <div>
                  <p className="eyebrow">{person.role} · best known for</p>
                  <h3>{person.name}</h3>
                </div>
              </div>
              <Results items={personWork} onOpen={onOpen} />
              {visible.length > 0 && <h3 className="subsection-title">Titles matching “{query.trim()}”</h3>}
            </div>
          )}

          {/* Discover: the cinema first, then renting and streaming, then more picks; every other list is at the bottom. */}
          {root && (
            <>
              <CinemaRow region={region} saved={saved} onOpen={onOpen} onSeeAll={openList} />
              {(!rentalItems || rentalItems.length > 0 || rowsFailed.rentals) && (
                <Row title="New to rent" items={rentalItems} failed={rowsFailed.rentals} onRetry={() => setRowsAttempt((count) => count + 1)} onOpen={onOpen} onSeeAll={() => openList(NEW_TO_RENT.id)} compact />
              )}
              <StreamingRow region={region} streams={streams} saved={saved} onOpen={onOpen} onSeeAll={openList} />
              {forYou && load.state === "loading" && <Row title="For you" items={null} onOpen={onOpen} compact />}
              {forYouRow && forYouRow.items.length > 0 && <Row title={forYouRow.title} items={forYouRow.items} onOpen={onOpen} compact />}
              {(!trendingItems || trendingItems.length > 0 || rowsFailed.trending) && (
                <Row title="Trending now" items={trendingItems} failed={rowsFailed.trending} onRetry={() => setRowsAttempt((count) => count + 1)} onOpen={onOpen} onSeeAll={() => openList("trending")} compact />
              )}
              <section className="genre-browse" aria-labelledby="explore-title">
                <h2 id="explore-title">Explore more</h2>
                <div className="genre-chips">
                  {EXPLORE_LISTS.map((id) => (
                    <button key={id} type="button" className="category" onClick={() => openList(id)}>{BROWSE_LISTS.find((item) => item.id === id)!.title}</button>
                  ))}
                </div>
                <h2 className="genre-browse-sub">Genres</h2>
                <div className="genre-chips">
                  {GENRES_LIST.map((item) => (
                    <button key={item.id} type="button" className="category" onClick={() => openList(GENRE_PREFIX + item.id)}>{item.label}</button>
                  ))}
                </div>
              </section>
            </>
          )}

          {!root && visible.length > 0 && (
            <>
              <Results key={`${list}:${shownKind}`} items={visible} onOpen={onOpen} showtimes={!searching && list === IN_CINEMAS.id} ranked={ranked} compact={!searching} />
              {!searching && load.state === "done" && load.more && (
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
                : kind !== "all" && !fixedKind ? "Nothing of that kind in this list." : "You've already saved everything in this list."}
            </p>
          )}

          {/* The rarely needed way in, where it's needed: after a search, in a list, or at the end of the page. */}
          {(load.state !== "loading" || root) && (manual ? (
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
