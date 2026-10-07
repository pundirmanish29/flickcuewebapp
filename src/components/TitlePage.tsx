import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import * as actions from "../lib/actions";
import { findExisting } from "../lib/editor";
import {
  displayTitle, formatRating, formatRuntime, getShowStatus, hasActiveReminder, isShow, isUnreleased, readerDate, seasonProgress, smartQuotes
} from "../lib/rules";
import { CALENDAR_MIRROR_ENABLED } from "../lib/config";
import { getSessionGeneration, getState, sync as syncLibrary, useAppState } from "../lib/store";
import { syncReady } from "../lib/syncReady";
import { editNoteDraft, noteDraft, noteSavePlan, reconcileNoteDraft } from "../lib/noteDraft";
import { useInCinemas, useWhere } from "../lib/useCinemas";
import { FilmShowtimes } from "./Showtimes";
import { TicketPanel } from "./TicketPanel";
import { cinemaKey, fetchCandidate, fetchDetails, genreIdFor, upscale, type Provider, type TitleDetails } from "../lib/tmdb";
import type { Candidate, Movie } from "../lib/types";
import { CandidateCard } from "./CandidateCard";
import { CalendarMark } from "./CalendarMark";
import { Icon, type IconName } from "./Icon";
import { Poster } from "./Poster";
import { Popover, ReminderChoices } from "./ReminderMenu";
import { providerLink, splitChannel } from "../lib/providers";
import { regionName } from "../lib/cinemas";
import { writeBack } from "../lib/showSync";
import { dismissEpisode, episodeKey, readDismissed, upNextEpisode } from "../lib/newEpisode";
import { NewEpisodeCard } from "./NewEpisodeCard";
import { Seasons } from "./Seasons";
import { RatingScore } from "./RatingScore";
import { ScrollArrows } from "./ScrollArrows";
import { VerdictScale } from "./VerdictScale";
import { goDiscover } from "../lib/discoverIntent";
import { openTitle as openWithMotion, pop, reducedMotion } from "../lib/motion";
import { usePreview } from "../lib/preview";
import { safeImage, safeImdbId, safeLink } from "../lib/safe";
import { goToTitle, parseCandidateKey } from "../lib/titleRoute";
import { dayLabel, formatDay, titleStub, type StubPrimary } from "../lib/titleStub";

const ProviderLogo = ({ provider }: { provider: Provider }) =>
  provider.logo ? <img src={provider.logo} alt="" /> : <b>{provider.name.slice(0, 2)}</b>;

function WatchName({ name }: { name: string }) {
  const [service, via] = splitChannel(name);
  return (
    <span className="watch-name">
      {service}
      {via && <small>{via}</small>}
    </span>
  );
}

/**
 * The "Watch on" pill beside the title. One service links straight to it; more open
 * a list of every service, included ones first, each opening that service.
 */
function WatchOn({ title, streaming, rentOrBuy }: { title: string; streaming: Provider[]; rentOrBuy: Provider[] }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const included = streaming.length > 0;
  // One logo and a count keep the pill short on a phone.
  const shown = (included ? streaming : rentOrBuy).slice(0, 1);
  const all = [...streaming.map((provider) => ({ provider, tone: "Included" })), ...rentOrBuy.map((provider) => ({ provider, tone: "Rent or buy" }))];
  const label = included ? "Watch on" : "Rent or buy";
  const groups = [
    { tone: "included", label: "With subscription", providers: streaming },
    { tone: "paid", label: "Rent or buy", providers: rentOrBuy }
  ].filter((group) => group.providers.length);

  if (all.length === 1) {
    const only = all[0].provider;
    return (
      <a className="watch-on" href={providerLink(only.name, title)} target="_blank" rel="noreferrer" aria-label={`${label} ${only.name}`}>
        <span>{label}</span>
        <ProviderLogo provider={only} />
      </a>
    );
  }
  return (
    <div className="watch-on-wrap">
      <button
        ref={trigger}
        type="button"
        className="watch-on"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label} ${all.map((item) => item.provider.name).join(", ")}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{label}</span>
        {shown.map((provider) => <ProviderLogo key={provider.name} provider={provider} />)}
        {all.length > shown.length && <em>+{all.length - shown.length}</em>}
        <Icon name="chevron" size={14} />
      </button>
      {/* On a phone the list rises from the bottom over a dimmed page. */}
      {open && <div className="watch-scrim" aria-hidden="true" />}
      <Popover open={open} onClose={close} label="Where to watch" anchor={trigger} modal>
        <p className="watch-sheet-title">Where to watch <b>{title.replace(/\s*\(\d{4}\)$/, "")}</b></p>
        {groups.map((group) => (
          <section key={group.tone} className={`watch-group watch-${group.tone}`} aria-label={group.label}>
            <p className="watch-list-label">{group.label}</p>
            <ul className="watch-list">
              {group.providers.map((provider) => (
                <li key={provider.name}>
                  <a href={providerLink(provider.name, title)} target="_blank" rel="noreferrer" onClick={close}>
                    <ProviderLogo provider={provider} />
                    <WatchName name={provider.name} />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </Popover>
    </div>
  );
}

/** Out within the last `days` days: a film people may still be booking tickets for. */
function releasedWithin(iso: string | undefined, days: number, now = Date.now()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso ?? "")) return false;
  const released = new Date(`${iso}T00:00:00`).getTime();
  return released <= now && now - released <= days * 24 * 60 * 60 * 1000;
}

/** A Discover or search result as a title, for showing it before it's saved. */
function candidateAsMovie(candidate: Candidate): Movie {
  return {
    id: candidate.key, title: candidate.title, year: candidate.year, mediaType: candidate.mediaType,
    tmdbType: candidate.tmdbType, tmdbId: candidate.tmdbId, releaseDate: candidate.releaseDate,
    upcoming: candidate.upcoming, poster: candidate.poster, backdrop: candidate.backdrop,
    rating: candidate.rating, tagline: candidate.overview
  };
}

/** A button or link in the stub, icon then words. */
function StubButton({ icon, children, href, onClick, kind = "plain", pressed, expanded, disabled }: {
  icon?: IconName;
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  kind?: "primary" | "plain" | "danger";
  pressed?: boolean;
  expanded?: boolean;
  disabled?: boolean;
}) {
  const className = `tp-button tp-button-${kind}${pressed ? " on" : ""}`;
  const content = <>{icon && <Icon name={icon} size={18} />}<span>{children}</span></>;
  return href
    ? <a className={className} href={href} target="_blank" rel="noreferrer">{content}</a>
    : <button type="button" className={className} onClick={onClick} aria-pressed={pressed} aria-expanded={expanded} disabled={disabled}>{content}</button>;
}

/**
 * A title's own page: a saved one by its id, or one that isn't saved by its
 * Discover key (tmdb:<type>:<id>), which offers Save and turns into the saved
 * view once it's saved. A ticket stub holds where you stand with the title and
 * the one thing to do next; on a phone it is also pinned above the dock while
 * you scroll.
 */
export function TitlePage({ id, backLabel, onBack }: { id: string; backLabel: string; onBack: () => void }) {
  const { library, settings, sync: syncState } = useAppState();
  const preview = usePreview();
  const ref = parseCandidateKey(id);
  const savedById = library.movies.find((item) => item.id === id);
  const [fetched, setFetched] = useState<Candidate | null>(null);
  const [lookupError, setLookupError] = useState("");
  const candidate = savedById ? undefined : preview?.key === id ? preview : fetched ?? undefined;
  const saved = savedById
    ?? (ref ? library.movies.find((item) => String(item.tmdbId ?? "") === ref.tmdbId && (item.tmdbType || "") === ref.tmdbType) : undefined)
    ?? (candidate ? findExisting(library, candidate) : undefined);
  const movie = saved ?? (candidate ? candidateAsMovie(candidate) : undefined);
  const isSaved = Boolean(saved);

  const [playing, setPlaying] = useState(false);
  const [details, setDetails] = useState<TitleDetails | null>(null);
  const [detailsFor, setDetailsFor] = useState("");
  const detailsGeneration = useRef(getSessionGeneration());
  const detailsWritten = useRef<{ result: TitleDetails; id: string; generation: number } | null>(null);
  const [detailsError, setDetailsError] = useState("");
  const [choosingReminder, setChoosingReminder] = useState(false);
  const syncedNote = movie?.personal?.note ?? "";
  const [draft, setDraft] = useState(() => noteDraft(syncedNote));
  const note = draft.text;
  const [missingLookup, setMissingLookup] = useState<"waiting" | "loading" | "missing" | "error">("waiting");
  const [missingRetry, setMissingRetry] = useState(0);
  const wasSaved = useRef(Boolean(savedById));
  const [dismissedEpisodes, setDismissedEpisodes] = useState(readDismissed);
  const [writingNote, setWritingNote] = useState(false);
  const [stubInView, setStubInView] = useState(true);
  const inCinemas = useInCinemas();
  const { place } = useWhere();
  const showing = Boolean(movie && inCinemas?.has(cinemaKey(movie)));
  const castRow = useRef<HTMLUListElement>(null);
  const stubRef = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const ticketRef = useRef<HTMLElement>(null);

  // A link to a title that isn't saved, opened cold: look it up.
  useEffect(() => {
    if (savedById || !ref || preview?.key === id) return;
    let live = true;
    setLookupError("");
    fetchCandidate(ref.tmdbType, ref.tmdbId)
      .then((result) => live && setFetched(result))
      .catch((error) => live && setLookupError(error instanceof Error ? error.message : "Couldn't load this title."));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // A cold extension link may arrive before Drive has its new title. Keep it open through one lookup,
  // with an explicit retry when unavailable. A title removed while this page was open still goes back.
  useEffect(() => {
    if (savedById) { wasSaved.current = true; return; }
    if (ref) return;
    if (wasSaved.current) { onBack(); return; }
    if (!syncState.connected) { setMissingLookup("error"); return; }
    let live = true;
    setMissingLookup("loading");
    void syncLibrary().then(() => {
      if (!live) return;
      const state = getState();
      setMissingLookup(state.sync.status === "error" || state.sync.status === "needs-auth" || !state.sync.connected ? "error" : "missing");
    }).catch(() => live && setMissingLookup("error"));
    return () => { live = false; };
  }, [id, Boolean(ref), Boolean(savedById), syncState.connected, missingRetry, onBack]);

  useEffect(() => setDraft(current => reconcileNoteDraft(current, syncedNote)), [syncedNote]);

  const currentNote = () => getState().library.movies.find(item => item.id === movie?.id)?.personal?.note ?? "";
  const saveNote = () => {
    const remote = currentNote();
    const plan = noteSavePlan(draft, remote);
    if (plan === "conflict") { setDraft(reconcileNoteDraft(draft, remote)); return; }
    if (plan === "save" && movie) actions.setNote(movie.id, draft.text);
    setDraft(noteDraft(plan === "save" ? draft.text : remote));
    if (!draft.text.trim()) setWritingNote(false);
  };

  // Screen readers and keyboards start at the title.
  const ready = Boolean(movie);
  useEffect(() => {
    if (ready) heading.current?.focus({ preventScroll: true });
  }, [ready]);

  const tmdbKey = movie?.tmdbId ? `${movie.tmdbType}:${movie.tmdbId}` : "";
  const detailsKey = `${tmdbKey}:${settings.region}`;
  const sessionGeneration = getSessionGeneration();
  useEffect(() => {
    if (!movie?.tmdbId) return;
    let live = true;
    setDetails(null);
    setDetailsFor("");
    setDetailsError("");
    const generation = getSessionGeneration();
    fetchDetails(movie, settings.region)
      .then((result) => {
        if (!live) return;
        detailsGeneration.current = generation;
        setDetailsFor(detailsKey);
        setDetails(result);
      })
      .catch((error) => live && setDetailsError(error.message));
    return () => {
      live = false;
    };
    // Only a different title or region needs a new lookup, not every edit to this one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdbKey, settings.region, sessionGeneration]);

  const readyToWrite = syncReady(syncState);
  useEffect(() => {
    if (!details || detailsFor !== detailsKey || !isSaved || !movie || !readyToWrite) return;
    const generation = detailsGeneration.current;
    const written = detailsWritten.current;
    if (written?.result === details && written.id === movie.id && written.generation === generation) return;
    if (writeBack(movie, details, generation)) detailsWritten.current = { result: details, id: movie.id, generation };
  }, [details, detailsFor, detailsKey, isSaved, movie?.id, readyToWrite]);

  // On a phone the stub's bar is pinned above the dock once the stub itself has scrolled away.
  useEffect(() => {
    const stub = stubRef.current;
    if (!stub || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setStubInView(entry.isIntersecting || entry.boundingClientRect.top > 0));
    observer.observe(stub);
    return () => observer.disconnect();
  }, [ready]);

  // The stub stays in view on a wide screen; one taller than the window keeps its buttons in view (CSS reads --stub-h).
  useEffect(() => {
    const stub = stubRef.current;
    if (!stub || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => stub.style.setProperty("--stub-h", `${stub.offsetHeight}px`));
    observer.observe(stub);
    return () => observer.disconnect();
  }, [ready]);

  const back = (
    <button type="button" className="tp-back" onClick={onBack}>
      <Icon name="back" size={18} /> <span className="tp-back-label">{backLabel}</span>
    </button>
  );

  if (!movie) {
    const missingSaved = !ref;
    const waiting = missingSaved ? missingLookup === "waiting" || missingLookup === "loading" : !lookupError;
    return (
      <article className="title-page title-page-loading" aria-busy={waiting}>
        <div className="tp-hero"><div className="wrap tp-hero-bar">{back}</div></div>
        <div className="wrap tp-empty">
          {missingSaved ? <>
            <p role="status">{waiting ? "Looking for this title in your synced list…" : missingLookup === "error" ? syncState.status === "needs-auth" ? "Resume sync in your account menu, then retry this title." : "Couldn't sync your list. Your title link is kept here." : "This title isn't in your synced list yet. If you just saved it in the extension, let it finish syncing and try again."}</p>
            {!waiting && <button type="button" className="button button-quiet" onClick={() => setMissingRetry(value => value + 1)}>Retry title</button>}
          </> : lookupError ? <p>{lookupError}</p> : <p className="muted loading-text">Loading…</p>}
        </div>
      </article>
    );
  }

  const title = displayTitle(movie);
  const unreleased = isUnreleased(movie);
  const status = getShowStatus(movie);
  const reminderActive = hasActiveReminder(movie);
  const backdrop = safeImage(details?.backdrop) || safeImage(upscale(movie.backdrop, "w1280"));
  const posterSrc = upscale(movie.poster, "w342");
  const progress = seasonProgress(movie);
  // The episode to watch next: the next one while catching up, the latest aired, or, once caught up, the next to air.
  const newEpisode = isSaved && isShow(movie) ? upNextEpisode(movie, details?.lastEpisode, details?.nextEpisode, dismissedEpisodes) : null;
  const imdbRating = Number(movie.imdbRating) || 0;
  const imdbId = safeImdbId(details?.imdbId) || safeImdbId(movie.imdbId);
  const show = isShow(movie);
  const watchingNow = movie.personal?.status === "watching";

  // Beside the title: who made it, in what language, and for which channel.
  const credit = [
    details?.director ? `${show ? "Created by" : "Directed by"} ${details.director}` : "",
    details?.language || "",
    details?.network || ""
  ].filter(Boolean).join(" · ");

  // "New episode every Wednesday": the last and next episodes a week apart.
  const weekly = show && details?.nextEpisode && details.lastEpisode
    && Math.round((new Date(`${details.nextEpisode.date}T00:00:00`).getTime() - new Date(`${details.lastEpisode.date}T00:00:00`).getTime()) / 86400000) === 7
    ? new Date(`${readerDate(details.nextEpisode.date)}T00:00:00`).toLocaleDateString(undefined, { weekday: "long" })
    : "";
  // A show's next episode by name: news even once you're caught up.
  const nextAiring = show && details?.nextEpisode
    ? { text: `S${details.nextEpisode.season} E${details.nextEpisode.episode} · ${dayLabel(readerDate(details.nextEpisode.date))}`, sub: details.nextEpisode.name && !/^episode \d+$/i.test(details.nextEpisode.name) ? `“${details.nextEpisode.name}”` : "" }
    : null;

  const episodesSeen = progress.reduce((sum, season) => sum + season.seen, 0);
  const seasons = details?.seasonCount ? `${details.seasonCount} season${details.seasonCount === 1 ? "" : "s"}` : "";
  const statusNamesSeasons = /\bseasons?\b/i.test(status?.text || "");
  const facts = show && details?.seasonCount
    ? [statusNamesSeasons ? "" : seasons, details.episodeCount ? `${details.episodeCount} episodes` : "", isSaved && episodesSeen ? `${episodesSeen} watched` : ""].filter(Boolean).join(" · ")
    : "";

  // Your own rating beats Letterboxd's, as in the other clients (SHARED.md, "Your take").
  const letterboxd = (movie.letterboxd ?? {}) as { rating?: number; liked?: boolean; review?: string };
  const personalRating = Number(movie.personal?.rating) || 0;
  const takeRating = Math.round((personalRating || Number(letterboxd.rating) || 0) * 2) / 2;
  const takeLiked = Boolean(movie.personal?.liked ?? letterboxd.liked);
  const takeReview = String(movie.personal?.review || letterboxd.review || "").trim();
  const take = takeRating || takeLiked || takeReview
    ? { rating: takeRating, liked: takeLiked, review: takeReview, source: !personalRating && !movie.personal?.review && (letterboxd.rating || letterboxd.review) ? "Letterboxd" : "" }
    : null;

  const sourceHost = (() => {
    try {
      return typeof movie.sourceUrl === "string" && /^https?:\/\//.test(movie.sourceUrl) ? new URL(movie.sourceUrl).hostname.replace(/^www\./, "") : "";
    } catch {
      return "";
    }
  })();
  const savedLine = movie.createdAt
    ? `Saved ${formatDay(new Date(Number(movie.createdAt)).toISOString().slice(0, 10))}${sourceHost ? ` from ${sourceHost}` : movie.origin === "letterboxd" ? " from Letterboxd" : ""}`
    : "";

  // The stub: where you stand, and the one thing to do next.
  const provider = details?.streaming[0] ? { name: details.streaming[0].name, included: true }
    : details?.rentOrBuy[0] ? { name: details.rentOrBuy[0].name, included: false } : null;
  const stub = titleStub({
    movie, saved: isSaved, show, unreleased,
    releaseDate: show ? details?.releaseDate || movie.releaseDate || "" : details?.regionalRelease || movie.releaseDate || "",
    provider,
    upNext: newEpisode && newEpisode.state !== "upcoming" ? `S${newEpisode.season} E${newEpisode.episode}` : "",
    length: show ? seasons : formatRuntime(movie.runtimeMinutes || details?.runtimeMinutes),
    now: Date.now()
  });
  const providerName = provider ? splitChannel(provider.name)[0] : "";
  // Every service, beside the title, unless the stub's main button already is the only one.
  const providerCount = (details?.streaming.length ?? 0) + (details?.rentOrBuy.length ?? 0);
  const episodeAction = isSaved && !movie.watched && show && newEpisode && newEpisode.state !== "upcoming" ? newEpisode : null;
  const watchOnShown = providerCount > 1 || (providerCount === 1 && (episodeAction || (stub.primary !== "watch" && stub.primary !== "watchAgain")));
  const watchHref = provider ? providerLink(provider.name, movie.title) : "";

  const openChoices = (fromBar = false) => {
    setChoosingReminder(true);
    if (fromBar) stubRef.current?.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
  };
  const showTicket = () => ticketRef.current?.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });

  const primary = (where: "stub" | "bar"): ReactNode => {
    const fromBar = where === "bar";
    const map: Record<StubPrimary, ReactNode> = {
      save: <StubButton kind="primary" icon="plus" expanded={choosingReminder} onClick={() => (fromBar ? openChoices(true) : setChoosingReminder((open) => !open))}>Save</StubButton>,
      remind: <StubButton kind="primary" icon="clock" expanded={choosingReminder} onClick={() => (fromBar ? openChoices(true) : setChoosingReminder((open) => !open))}>{reminderActive ? "Change reminder" : "Remind me"}</StubButton>,
      watch: <StubButton kind="primary" icon="play" href={watchHref}>{fromBar ? (provider?.included ? "Watch" : "Rent") : provider?.included ? `Watch on ${providerName}` : `Rent on ${providerName}`}</StubButton>,
      watched: <StubButton kind="primary" icon="eye" onClick={() => isSaved && actions.toggleWatched(movie.id)}>{show ? "Mark series finished" : "Watched it"}</StubButton>,
      ticket: <StubButton kind="primary" icon="ticket" onClick={showTicket}>{fromBar ? "Ticket" : "Show ticket"}</StubButton>,
      watchAgain: <StubButton kind="primary" icon="play" href={watchHref}>{fromBar ? "Watch again" : `Watch again on ${providerName}`}</StubButton>,
      none: null
    };
    if (isSaved && !movie.watched && show && newEpisode && newEpisode.state !== "upcoming") return <StubButton kind="primary" icon="check" onClick={() => actions.toggleEpisode(movie.id, newEpisode.season, newEpisode.episode)}>{fromBar ? `Watched S${newEpisode.season} E${newEpisode.episode}` : `Mark S${newEpisode.season} E${newEpisode.episode} watched`}</StubButton>;
    if (show && stub.primary === "watched") return <StubButton kind="primary" icon="play" onClick={() => document.getElementById("episode-progress")?.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" })}>Episode progress</StubButton>;
    return map[stub.primary];
  };

  // Everything else you can do, under the main button.
  const secondary: ReactNode[] = [];
  if (isSaved) {
    if (movie.watched) {
      secondary.push(<StubButton key="unwatch" icon="eyeOff" onClick={() => actions.toggleWatched(movie.id)}>Unwatch</StubButton>);
    } else if (stub.primary === "ticket") {
      // Booked: the ticket is the plan; once it's out you can mark it watched here too.
      if (!unreleased) secondary.push(<StubButton key="watched" icon="eye" onClick={() => actions.toggleWatched(movie.id)}>{show ? "Mark series finished" : "Watched it"}</StubButton>);
    } else if (unreleased) {
      secondary.push(
        <StubButton key="interested" icon="bell" pressed={Boolean(movie.personal?.interested)} onClick={() => actions.setInterested(movie.id, !movie.personal?.interested)}>Interested</StubButton>
      );
    } else {
      if (show || stub.primary !== "watched") secondary.push(<StubButton key="watched" icon="eye" onClick={() => actions.toggleWatched(movie.id)}>{show ? "Mark series finished" : "Watched it"}</StubButton>);
      if (show) secondary.push(<StubButton key="watching" icon="play" pressed={watchingNow} onClick={() => actions.setWatching(movie.id, !watchingNow)}>Watching</StubButton>);
      if (stub.primary !== "remind") secondary.push(<StubButton key="remind" icon="clock" pressed={reminderActive} expanded={choosingReminder} onClick={() => setChoosingReminder((open) => !open)}>{reminderActive ? "Reminder" : "Remind me"}</StubButton>);
    }
    secondary.push(<StubButton key="remove" kind="danger" icon="trash" onClick={() => actions.removeTitle(movie.id)}>Remove</StubButton>);
  } else if (candidate && !unreleased) {
    secondary.push(<StubButton key="watched" icon="eye" onClick={() => actions.saveWatched(candidate)}>{show ? "Mark series finished" : "Watched it"}</StubButton>);
    if (show) secondary.push(<StubButton key="watching" icon="play" onClick={() => actions.saveWatching(candidate)}>Watching</StubButton>);
  }

  return (
    <article className="title-page" aria-labelledby="title-heading">
      <div className={`tp-hero ${playing ? "playing" : ""}`} style={backdrop ? { backgroundImage: `url(${backdrop})`, ["--hero-hi" as string]: `url(${upscale(backdrop, "original")})` } : undefined}>
        {playing && details?.trailerKey && (
          <iframe
            className="tp-trailer"
            src={`https://www.youtube-nocookie.com/embed/${details.trailerKey}?autoplay=1&playsinline=1&rel=0`}
            title={`${title} trailer`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        )}
        {!playing && (
          <div className="wrap tp-hero-bar">
            {back}
            {details?.trailerKey && (
              <button type="button" className="tp-play" onClick={() => setPlaying(true)} aria-label={`Play the trailer for ${title}`}>
                <span className="tp-play-icon"><Icon name="play" size={18} /></span>
                <span className="tp-play-label">Trailer</span>
              </button>
            )}
          </div>
        )}
      </div>
      {/* YouTube's own controls fill the video, so the way back sits below it. */}
      {playing && (
        <div className="trailer-bar">
          <button type="button" className="trailer-back" onClick={() => setPlaying(false)}>
            <Icon name="back" size={18} /> Back to details
          </button>
          {details?.trailer && <a className="trailer-link" href={details.trailer} target="_blank" rel="noreferrer">YouTube</a>}
        </div>
      )}

      <div className={`wrap tp-layout ${playing ? "after-trailer" : ""}`}>
        <header className="tp-head">
          <Poster src={posterSrc} title={movie.title} className="tp-poster tp-poster-head" priority />
          <div className="tp-heading">
            <p className="eyebrow tp-meta">
              {details?.certification && <span className="certification" title="Age rating">{details.certification}</span>}
              <span>{[movie.mediaType, movie.year, details?.episodeMinutes ? `${formatRuntime(details.episodeMinutes)} ep` : formatRuntime(movie.runtimeMinutes || details?.runtimeMinutes)].filter(Boolean).join(" · ")}</span>
            </p>
            {weekly && <p className="sheet-cadence">New episode every {weekly}</p>}
            <h1 id="title-heading" ref={heading} tabIndex={-1}>{title}</h1>
            {credit && <p className="tp-credit">{credit}</p>}
            <div className="score-row">
              {formatRating(movie.rating || details?.rating) && <RatingScore value={movie.rating || details?.rating} className="score" size={13} />}
              {imdbRating > 0 && (
                <span className="score" title="IMDb" aria-label={`IMDb ${imdbRating.toFixed(1)}`}>
                  <span className="imdb-mark" aria-hidden="true">IMDb</span> {imdbRating.toFixed(1)}
                </span>
              )}
              {Number(movie.criticScore) >= 0 && movie.criticScore != null && (
                <span className="score score-critics" title="Critics" aria-label={`Critics ${movie.criticScore}%`}>
                  <Icon name="tomato" size={14} /> {movie.criticScore}%
                </span>
              )}
              {Number(movie.audienceScore) >= 0 && movie.audienceScore != null && (
                <span className="score score-audience" title="Audience" aria-label={`Audience ${movie.audienceScore}%`}>
                  <Icon name="popcorn" size={14} /> {movie.audienceScore}%
                </span>
              )}
            </div>
            {nextAiring ? (
              <p className="sheet-status tone-green">
                {nextAiring.text}
                {nextAiring.sub && <span className="sheet-status-sub"> {nextAiring.sub}</span>}
              </p>
            ) : status && <p className={`sheet-status tone-${status.tone}`}>{status.text}</p>}
            {facts && <p className="tp-facts">{facts}</p>}
            {watchOnShown && details && <WatchOn title={movie.title} streaming={details.streaming} rentOrBuy={details.rentOrBuy} />}
          </div>
        </header>

        <aside className={`tp-stub tp-tone-${stub.tone}`} ref={stubRef} aria-label="Your plan for this title">
          <div className="tp-stub-art">
            <Poster src={posterSrc} title={movie.title} className="tp-poster tp-poster-stub" priority />
          </div>
          <div className="tp-perf" aria-hidden="true" />
          <div className="tp-stub-body">
            <p className="tp-stub-label">{stub.label}</p>
            {/* A phone shows the fields as one line under the state; the grid is for a wide screen. */}
            {stub.fields.length > 0 && <p className="tp-summary">{stub.fields.slice(0, 2).map((item) => item.value).join(" · ")}</p>}
            {stub.fields.length > 0 && (
              <dl className="tp-fields">
                {stub.fields.map((item) => (
                  <div key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {reminderActive && !movie.watched && <CalendarMark movie={movie} label />}
            {primary("stub")}
            {secondary.length > 0 && (
              <div className="tp-secondary" onClickCapture={(event) => pop((event.target as Element).closest(".tp-button"))}>{secondary}</div>
            )}
            {choosingReminder && !movie.watched && (
              <div className="tp-choices">
                <p className="popover-label">{isSaved ? "Remind me…" : "Save it, and remind me…"}</p>
                <ReminderChoices
                  releaseDate={unreleased ? movie.releaseDate : undefined}
                  onPick={(at) => {
                    if (isSaved) actions.remindAt(movie.id, at);
                    else if (candidate) actions.addCandidate(candidate, at);
                    setChoosingReminder(false);
                  }}
                  onNone={isSaved ? reminderActive ? () => {
                    actions.clearReminder(movie.id);
                    setChoosingReminder(false);
                  } : undefined : () => {
                    if (candidate) actions.addCandidate(candidate, null);
                    setChoosingReminder(false);
                  }}
                  noneLabel={isSaved ? "Clear reminder" : "Just save it"}
                />
                {isSaved && CALENDAR_MIRROR_ENABLED && settings.calendarMirror && <p className="muted small-print">This reminder also goes on your Google Calendar.</p>}
              </div>
            )}
          </div>
        </aside>

        <div className="tp-body">
          {/* A ticket already added comes first: it's what matters on the day. */}
          {isSaved && !show && movie.booking && (
            <section className="sheet-section" id="your-ticket" ref={ticketRef}>
              <h2 className="section-label">Your ticket</h2>
              <TicketPanel movie={movie} />
            </section>
          )}

          <section className="sheet-section tp-story">
            {details?.tagline && <p className="tagline">“{smartQuotes(details.tagline)}”</p>}
            <p className="overview">{smartQuotes(details?.overview || movie.tagline || "") || (movie.tmdbId ? "" : "No synopsis for a title added by hand.")}</p>
            {!details && movie.tmdbId && !detailsError && <p className="muted loading-text">Loading details…</p>}
            {detailsError && <p className="muted">{detailsError}</p>}
            {(details?.genres.length || movie.genres?.length) ? (
              <div className="tag-row">
                {(details?.genres || movie.genres || []).map((genre) => {
                  const genreId = genreIdFor(genre);
                  return genreId
                    ? <button key={genre} type="button" className="tag tag-link" onClick={() => goDiscover({ genre: genreId })}>{genre}</button>
                    : <span key={genre} className="tag">{genre}</span>;
                })}
              </div>
            ) : null}
          </section>

          {showing && !movie.watched && (
            <section className="sheet-section">
              <h2 className="section-label">Showtimes in {place}</h2>
              <FilmShowtimes title={movie.title} year={movie.year} imdb={imdbId} />
            </section>
          )}

          {isSaved && !show && !movie.booking && !movie.watched && (showing || unreleased || releasedWithin(movie.releaseDate, 120)) && (
            <section className="sheet-section">
              <h2 className="section-label">Cinema ticket</h2>
              <TicketPanel movie={movie} />
            </section>
          )}

          {details && !showing && !unreleased && !details.streaming.length && !details.rentOrBuy.length && (
            <p className="muted small-print">Not streaming in {regionName(settings.region || "IN")} right now.</p>
          )}

          {isSaved && show && (
            <section className="sheet-section" id="episode-progress">
              {!progress.length && !newEpisode && <p className="muted">Episode information isn't available for this show yet.</p>}
              {newEpisode && (
                <>
                  <h2 className="section-label">Episode progress</h2>
                  <NewEpisodeCard
                    tmdbId={movie.tmdbId}
                    air={newEpisode}
                    fallbackImage={backdrop}
                    onWatched={() => actions.toggleEpisode(movie.id, newEpisode.season, newEpisode.episode)}
                    onDismiss={() => setDismissedEpisodes(dismissEpisode(episodeKey(movie.id, newEpisode.season, newEpisode.episode)))}
                  />
                </>
              )}
              {progress.length > 0 && <Seasons movie={movie} info={details?.seasons} nested={Boolean(newEpisode)} />}
            </section>
          )}

          {isSaved && (movie.watched || take) && (
            <section className="sheet-section">
              <h2 className="section-label">Your take</h2>
              <VerdictScale stars={takeRating} ownStars={personalRating} onPick={(stars) => actions.setTake(movie.id, { rating: stars })} />
              <div className="take" onClickCapture={(event) => pop((event.target as Element).closest("button"))}>
                <span className="take-stars-edit" role="group" aria-label="Your rating">
                  {[1, 2, 3, 4, 5].map((star) => {
                    const fill = takeRating >= star ? "full" : takeRating >= star - 0.5 ? "half" : "";
                    // Tapping a star sets it; tapping it again takes off half, then clears.
                    const next = takeRating === star ? star - 0.5 : takeRating === star - 0.5 ? 0 : star;
                    return (
                      <button key={star} type="button" className={`star ${fill}`} aria-label={`${star} star${star === 1 ? "" : "s"}`} aria-pressed={takeRating >= star - 0.5} onClick={() => actions.setTake(movie.id, { rating: next })}>
                        <Icon name="star" size={22} />
                        {fill === "half" && <span className="star-half" aria-hidden="true"><Icon name="star" size={22} /></span>}
                      </button>
                    );
                  })}
                </span>
                {takeRating > 0 && <b className="take-number">{takeRating}</b>}
                <button type="button" className={`take-heart ${takeLiked ? "on" : ""}`} aria-pressed={takeLiked} aria-label="Liked" onClick={() => actions.setTake(movie.id, { liked: !takeLiked })}>
                  <Icon name="heart" size={20} />
                </button>
                {take?.source && <span className="take-source">from {take.source}</span>}
              </div>
              {take?.review && <blockquote className="take-review">{take.review}</blockquote>}
            </section>
          )}

          {isSaved && (
            <section className="sheet-section">
              {note || writingNote || draft.dirty ? (
                <>
                  <h2 className="section-label"><label htmlFor="note">{movie.watched ? "Notes" : "Why I saved this"}</label></h2>
                  <textarea
                    id="note"
                    className="note"
                    rows={3}
                    maxLength={2000}
                    autoFocus={writingNote && !note}
                    placeholder={movie.watched ? "What you thought, who you watched it with…" : "A friend's pick, a review you read, the mood it's for…"}
                    value={note}
                    onChange={(event) => setDraft(current => reconcileNoteDraft(editNoteDraft(current, event.target.value), syncedNote))}
                    onBlur={saveNote}
                  />
                  {draft.conflict && <div className="note-conflict" role="alert">
                    <p>A newer note arrived from another device. Your draft is kept here and hasn't been saved.</p>
                    <p className="muted">Synced note: {syncedNote || "(empty)"}</p>
                    <div className="button-row">
                      <button type="button" className="button button-quiet" onClick={() => setDraft(noteDraft(currentNote()))}>Use synced note</button>
                      <button type="button" className="button button-quiet" onClick={() => { actions.setNote(movie.id, draft.text); setDraft(noteDraft(draft.text)); }}>Save my edit instead</button>
                    </div>
                  </div>}
                </>
              ) : (
                <button type="button" className="add-note" onClick={() => setWritingNote(true)}>
                  <Icon name="plus" size={15} /> {movie.watched ? "Add a note" : "Add why you saved it"}
                </button>
              )}
              {savedLine && <p className="saved-line">{savedLine}</p>}
            </section>
          )}

          {details && details.cast.length > 0 && (
            <section className="sheet-section">
              <div className="rail-head">
                <h2 className="section-label">Cast</h2>
                <ScrollArrows target={castRow} label="Cast" watch={details.cast} />
              </div>
              <ul className="cast-row" ref={castRow}>
                {details.cast.map((person) => (
                  <li key={person.name + person.character}>
                    <button type="button" className="cast-link" onClick={() => goDiscover({ search: person.name })} aria-label={`${person.name}: more with them`}>
                      <Poster src={person.photo} title={person.name} className="cast-photo" />
                      <span className="cast-name">{person.name}</span>
                      <span className="muted cast-role">{person.character}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {details && details.recommendations.length > 0 && (
            <section className="sheet-section">
              <h2 className="section-label">More like this</h2>
              <div className="cinema-row more-row">
                {details.recommendations.map((item) => (
                  <CandidateCard key={item.key} candidate={item} onOpenSaved={(savedId) => openWithMotion(() => goToTitle(savedId))} />
                ))}
              </div>
            </section>
          )}

          <div className="sheet-links">
            {imdbId && <a className="link-chip" href={`https://www.imdb.com/title/${imdbId}/`} target="_blank" rel="noreferrer">IMDb</a>}
            {safeLink(movie.sourceUrl) && <a className="link-chip" href={safeLink(movie.sourceUrl)} target="_blank" rel="noreferrer">Where you found it</a>}
          </div>
        </div>
      </div>

      {/* Phones: the stub, pinned above the dock once the stub itself has scrolled away. */}
      {stub.primary !== "none" && (
        <div className={`tp-bar tp-tone-${stub.tone} ${stubInView ? "" : "on"}`}>
          <div className="tp-bar-text">
            <p className="tp-stub-label">{stub.label}</p>
            {stub.fields[0] && <p className="tp-bar-main">{stub.fields[0].value}</p>}
            {stub.fields[1] && <p className="tp-bar-sub">{stub.fields[1].value}</p>}
          </div>
          <div className="tp-bar-action">{primary("bar")}</div>
        </div>
      )}
    </article>
  );
}
