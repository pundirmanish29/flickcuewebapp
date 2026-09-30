import { useCallback, useEffect, useRef, useState } from "react";
import * as actions from "../lib/actions";
import { findExisting } from "../lib/editor";
import {
  displayTitle, formatRating, formatRuntime, getShowStatus, hasActiveReminder, isShow, isUnreleased, readerDate, reminderText, seasonProgress, smartQuotes
} from "../lib/rules";
import { useAppState } from "../lib/store";
import { useInCinemas, useWhere } from "../lib/useCinemas";
import { FilmShowtimes } from "./Showtimes";
import { cinemaKey, fetchDetails, genreIdFor, upscale, type Provider, type TitleDetails } from "../lib/tmdb";
import type { Candidate, Movie } from "../lib/types";
import { CandidateCard } from "./CandidateCard";
import { Icon } from "./Icon";
import { Poster } from "./Poster";
import { Popover, ReminderChoices } from "./ReminderMenu";
import { providerLink, splitChannel } from "../lib/providers";
import { regionName } from "../lib/cinemas";
import { writeBack } from "../lib/showSync";
import { dismissEpisode, episodeKey, newEpisodeFor, readDismissed } from "../lib/newEpisode";
import { NewEpisodeCard } from "./NewEpisodeCard";
import { Seasons } from "./Seasons";
import { RatingScore } from "./RatingScore";
import { VerdictScale } from "./VerdictScale";
import { goDiscover } from "../lib/discoverIntent";
import { openTitle as openWithMotion, pop, reducedMotion } from "../lib/motion";
import { safeImage, safeImdbId, safeLink } from "../lib/safe";
import { useSwipeToClose } from "../lib/useSwipeToClose";


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
 * The banner's "Watch on" pill. One service links straight to it; more open
 * a list of every service, included ones first, each opening that service.
 */
function WatchOn({ title, streaming, rentOrBuy }: { title: string; streaming: Provider[]; rentOrBuy: Provider[] }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const included = streaming.length > 0;
  // One logo and a count keep the pill beside the trailer button on a phone.
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
      {/* On a phone the list rises from the bottom over a dimmed sheet. */}
      {open && <div className="watch-scrim" aria-hidden="true" />}
      <Popover open={open} onClose={close} label="Where to watch" anchor={trigger}>
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
                    <Icon name="external" size={14} />
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

/** "30 Sep 2026" from an ISO date. */
function formatDay(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

/** "today", "tomorrow", "in 5 days", "yesterday" for an ISO date. */
function dayLabel(iso: string, now = Date.now()): string {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(`${iso.slice(0, 10)}T00:00:00`).getTime() - start.getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 1 ? `in ${days} days` : `${-days} days ago`;
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

/**
 * A title's full details: a saved one by `id`, or a Discover/search result
 * (`candidate`) that isn't saved yet, which offers Save instead of the
 * list actions and turns into the saved view once it's saved.
 */
export function TitleSheet({ id, candidate, onClose }: { id?: string; candidate?: Candidate; onClose: () => void }) {
  const { library, settings } = useAppState();
  const saved = id ? library.movies.find((item) => item.id === id) : candidate ? findExisting(library, candidate) ?? undefined : undefined;
  const movie = saved ?? (candidate ? candidateAsMovie(candidate) : undefined);
  const isSaved = Boolean(saved);
  const [playing, setPlaying] = useState(false);
  const showtimesRef = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [details, setDetails] = useState<TitleDetails | null>(null);
  const [detailsError, setDetailsError] = useState("");
  const [choosingReminder, setChoosingReminder] = useState(false);
  const [note, setNote] = useState(movie?.personal?.note ?? "");
  const [dismissedEpisodes, setDismissedEpisodes] = useState(readDismissed);
  const [writingNote, setWritingNote] = useState(false);
  const inCinemas = useInCinemas();
  const { place } = useWhere();
  const showing = Boolean(movie && inCinemas?.has(cinemaKey(movie)));

  const inner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    // The sheet itself takes focus, not its close button, so a tap doesn't light a focus ring on ✕.
    dialog.current?.focus();
  }, []);
  useSwipeToClose(dialog, inner);

  // Closing slides the sheet away (faster than it arrived) rather than cutting.
  const closeSheet = useCallback(() => {
    const sheet = dialog.current;
    if (!sheet?.open || sheet.classList.contains("closing")) return;
    if (reducedMotion()) return sheet.close();
    sheet.classList.add("closing");
    const finish = () => {
      sheet.removeEventListener("animationend", onEnd);
      if (!sheet.classList.contains("closing")) return;
      sheet.classList.remove("closing");
      sheet.close();
    };
    // Only the sheet's own animation, not a shimmer or pop inside it.
    const onEnd = (event: AnimationEvent) => event.target === sheet && finish();
    sheet.addEventListener("animationend", onEnd);
    window.setTimeout(finish, 320);
  }, []);

  const tmdbKey = movie?.tmdbId ? `${movie.tmdbType}:${movie.tmdbId}` : "";
  useEffect(() => {
    if (!movie?.tmdbId) return;
    let live = true;
    setDetails(null);
    setDetailsError("");
    fetchDetails(movie, settings.region)
      .then((result) => {
        if (!live) return;
        setDetails(result);
        if (isSaved) writeBack(movie, result);
      })
      .catch((error) => live && setDetailsError(error.message));
    return () => {
      live = false;
    };
    // Only a different title or region needs a new lookup, not every edit to this one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdbKey, settings.region]);

  // The title was removed (here, or by a sync from another device).
  useEffect(() => {
    if (id && !saved) onClose();
  }, [id, saved, onClose]);
  if (!movie) return null;

  const title = displayTitle(movie);
  const unreleased = isUnreleased(movie);
  const status = getShowStatus(movie);
  const reminderActive = hasActiveReminder(movie);
  const backdrop = safeImage(details?.backdrop) || safeImage(upscale(movie.backdrop, "w1280"));
  const progress = seasonProgress(movie);
  // The latest aired episode stays up here until it is ticked off or put away.
  const newEpisode = isSaved && isShow(movie) ? newEpisodeFor(movie, details?.lastEpisode, dismissedEpisodes) : null;
  const imdbRating = Number(movie.imdbRating) || 0;
  const imdbId = safeImdbId(details?.imdbId) || safeImdbId(movie.imdbId);
  const show = isShow(movie);

  // Beside the title: who made it, in what language, and for which channel.
  const credit = [
    details?.director ? `${show ? "Created by" : "Directed by"} ${details.director}` : "",
    details?.language || "",
    details?.network || ""
  ].filter(Boolean).join(" · ");

  // The one line that says what's next: the next episode by name, or when a film comes out.
  const watchingNow = movie.personal?.status === "watching";
  // "New episode every Wednesday": the last and next episodes a week apart.
  const weekly = show && details?.nextEpisode && details.lastEpisode
    && Math.round((new Date(`${details.nextEpisode.date}T00:00:00`).getTime() - new Date(`${details.lastEpisode.date}T00:00:00`).getTime()) / 86400000) === 7
    ? new Date(`${readerDate(details.nextEpisode.date)}T00:00:00`).toLocaleDateString(undefined, { weekday: "long" })
    : "";
  const headline = (() => {
    const next = details?.nextEpisode;
    // A show you've caught up on still has news: its next episode.
    if (movie.watched && !(show && next)) return null;
    if (show && next) {
      return { tone: "green", text: `S${next.season} E${next.episode} · ${dayLabel(readerDate(next.date))}`, sub: next.name && !/^episode \d+$/i.test(next.name) ? `“${next.name}”` : "" };
    }
    if (!show && unreleased) {
      const date = details?.regionalRelease || movie.releaseDate || "";
      if (date) return { tone: "amber", text: `In cinemas ${formatDay(date)} · ${dayLabel(date)}` };
    }
    return null;
  })();

  const episodesSeen = progress.reduce((sum, season) => sum + season.seen, 0);
  // The status line may already name the seasons ("Canceled · 2 seasons"); don't say it twice.
  const statusNamesSeasons = /\bseasons?\b/i.test(headline?.text || status?.text || "");
  const facts = show && details?.seasonCount
    ? [
      statusNamesSeasons ? "" : `${details.seasonCount} season${details.seasonCount === 1 ? "" : "s"}`,
      details.episodeCount ? `${details.episodeCount} episodes` : "",
      isSaved && episodesSeen ? `${episodesSeen} watched` : ""
    ].filter(Boolean).join(" · ")
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

  return (
    <dialog
      ref={dialog}
      className="sheet"
      tabIndex={-1}
      onClose={onClose}
      onCancel={(event) => {
        // Escape: the same way out as the close button.
        event.preventDefault();
        closeSheet();
      }}
      onClick={(event) => event.target === dialog.current && closeSheet()}
      aria-labelledby="sheet-title"
    >
      <div className="sheet-inner" ref={inner}>
        <div className={`sheet-hero ${playing ? "playing" : ""}`} style={backdrop ? { backgroundImage: `url(${backdrop})`, ["--hero-hi" as string]: `url(${upscale(backdrop, "original")})` } : undefined}>
          {playing && details?.trailerKey ? (
            <iframe
              className="sheet-trailer"
              src={`https://www.youtube-nocookie.com/embed/${details.trailerKey}?autoplay=1&playsinline=1&rel=0`}
              title={`${title} trailer`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />
          ) : details?.trailerKey ? (
            <button type="button" className="sheet-play" onClick={() => setPlaying(true)} aria-label={`Play the trailer for ${title}`}>
              <span className="sheet-play-icon"><Icon name="play" size={22} /></span>
              <span>Trailer</span>
            </button>
          ) : null}
          {!playing && (
            <div className="sheet-hero-top">
              <button type="button" className="icon-button sheet-close" onClick={() => closeSheet()} aria-label="Close">
                <Icon name="close" />
              </button>
            </div>
          )}
        </div>
        {/* YouTube's own controls fill the video, so the way back sits below it. */}
        {playing && (
          <div className="trailer-bar">
            <button type="button" className="trailer-back" onClick={() => setPlaying(false)}>
              <Icon name="back" size={18} /> Back to details
            </button>
            {details?.trailer && (
              <a className="trailer-link" href={details.trailer} target="_blank" rel="noreferrer">
                <Icon name="external" size={14} /> YouTube
              </a>
            )}
            <button type="button" className="icon-button trailer-close" onClick={() => closeSheet()} aria-label="Close">
              <Icon name="close" size={18} />
            </button>
          </div>
        )}

        <div className="sheet-body">
          <div className="sheet-head">
            <Poster src={upscale(movie.poster, "w342")} title={movie.title} className="sheet-poster" />
            <div className="sheet-heading">
              <p className="eyebrow sheet-meta">
                {details?.certification && <span className="certification" title="Age rating">{details.certification}</span>}
                <span>{[movie.mediaType, movie.year, details?.episodeMinutes ? `${formatRuntime(details.episodeMinutes)} ep` : formatRuntime(movie.runtimeMinutes || details?.runtimeMinutes)].filter(Boolean).join(" · ")}</span>
              </p>
              {weekly && <p className="sheet-cadence">New episode every {weekly}</p>}
              <h2 id="sheet-title">{title}</h2>
              {credit && <p className="sheet-credit">{credit}</p>}
              <div className="score-row">
                {/* Icon and number only, so all four fit one line beside the poster; the words are in the labels. */}
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
              {headline ? (
                <p className={`sheet-status tone-${headline.tone}`}>
                  {headline.text}
                  {"sub" in headline && headline.sub && <span className="sheet-status-sub"> {headline.sub}</span>}
                </p>
              ) : (status || reminderActive || unreleased || movie.watched) && (
                <p className={`sheet-status ${status ? `tone-${status.tone}` : ""}`}>{status ? status.text : reminderText(movie)}</p>
              )}
              {facts && <p className="sheet-facts">{facts}</p>}
              {/* Where to watch sits with the title, in the space beside the poster. */}
              {details && (details.streaming.length > 0 || details.rentOrBuy.length > 0) ? (
                <WatchOn title={movie.title} streaming={details.streaming} rentOrBuy={details.rentOrBuy} />
              ) : null}
            </div>
          </div>

          {isSaved ? (
          <>
          {/* One row of actions, icon over label, so they fit a phone's width. */}
          <div className="sheet-actions action-row" onClickCapture={(event) => pop((event.target as Element).closest(".action")?.querySelector(".action-icon"))}>
            <button
              type="button"
              className={`action ${movie.watched ? "" : "primary"}`}
              disabled={!movie.watched && unreleased}
              onClick={() => actions.toggleWatched(movie.id)}
            >
              <span className="action-icon"><Icon name={movie.watched ? "eyeOff" : "eye"} size={20} /></span>
              <span>{movie.watched ? "Unwatch" : unreleased ? "Not out yet" : "Watched it"}</span>
            </button>
            {show && !movie.watched && !unreleased && (
              <button
                type="button"
                className={`action ${watchingNow ? "on" : ""}`}
                aria-pressed={watchingNow}
                onClick={() => actions.setWatching(movie.id, !watchingNow)}
              >
                <span className="action-icon"><Icon name="play" size={19} /></span>
                <span>Watching</span>
              </button>
            )}
            {!movie.watched && (
              <button
                type="button"
                className={`action ${reminderActive ? "on" : ""}`}
                aria-expanded={choosingReminder}
                aria-label={reminderActive ? "Change reminder" : "Remind me"}
                onClick={() => setChoosingReminder((open) => !open)}
              >
                <span className="action-icon"><Icon name="clock" size={20} /></span>
                <span>{reminderActive ? "Reminder" : "Remind"}</span>
              </button>
            )}
            {unreleased && !movie.watched && (
              <button
                type="button"
                className={`action ${movie.personal?.interested ? "on" : ""}`}
                aria-pressed={Boolean(movie.personal?.interested)}
                onClick={() => actions.setInterested(movie.id, !movie.personal?.interested)}
              >
                <span className="action-icon"><Icon name="bell" size={20} /></span>
                <span>Interested</span>
              </button>
            )}
            <button type="button" className="action danger" onClick={() => actions.removeTitle(movie.id)}>
              <span className="action-icon"><Icon name="trash" size={20} /></span>
              <span>Remove</span>
            </button>
          </div>

          {choosingReminder && !movie.watched && (
            <div className="sheet-panel">
              <ReminderChoices
                releaseDate={movie.releaseDate}
                onPick={(at) => {
                  actions.remindAt(movie.id, at);
                  setChoosingReminder(false);
                }}
                             onNone={reminderActive ? () => {
                  actions.clearReminder(movie.id);
                  setChoosingReminder(false);
                } : undefined}
                noneLabel="Clear reminder"
              />
            </div>
          )}
          </>
          ) : (
            <>
              {/* Not in the list yet: each action saves it as it goes. */}
              <div className="sheet-actions action-row" onClickCapture={(event) => pop((event.target as Element).closest(".action")?.querySelector(".action-icon"))}>
                <button type="button" className="action primary" aria-expanded={choosingReminder} onClick={() => setChoosingReminder((open) => !open)}>
                  <span className="action-icon"><Icon name="plus" size={20} /></span>
                  <span>Save</span>
                </button>
                {candidate && !unreleased && (
                  <button type="button" className="action" onClick={() => actions.saveWatched(candidate)}>
                    <span className="action-icon"><Icon name="eye" size={20} /></span>
                    <span>Watched it</span>
                  </button>
                )}
                {candidate && show && !unreleased && (
                  <button type="button" className="action" onClick={() => actions.saveWatching(candidate)}>
                    <span className="action-icon"><Icon name="play" size={19} /></span>
                    <span>Watching</span>
                  </button>
                )}
              </div>
              {choosingReminder && candidate && (
                <div className="sheet-panel">
                  <p className="popover-label">Remind me…</p>
                  <ReminderChoices
                    releaseDate={movie.releaseDate}
                    onPick={(at) => {
                      actions.addCandidate(candidate, at);
                      setChoosingReminder(false);
                    }}
                    onNone={() => {
                      actions.addCandidate(candidate, null);
                      setChoosingReminder(false);
                    }}
                    noneLabel="Just save it"
                  />
                </div>
              )}
            </>
          )}

          <section className="sheet-section">
            {details?.tagline && <p className="tagline">“{smartQuotes(details.tagline)}”</p>}
            <p className="overview">{smartQuotes(details?.overview || movie.tagline || "") || (movie.tmdbId ? "" : "No synopsis for a title added by hand.")}</p>
            {!details && movie.tmdbId && !detailsError && <p className="muted loading-text">Loading details…</p>}
            {detailsError && <p className="muted">{detailsError}</p>}
            {(details?.genres.length || movie.genres?.length) ? (
              <div className="tag-row">
                {(details?.genres || movie.genres || []).map((genre) => {
                  const id = genreIdFor(genre);
                  return id
                    ? <button key={genre} type="button" className="tag tag-link" onClick={() => goDiscover({ genre: id })}>{genre}</button>
                    : <span key={genre} className="tag">{genre}</span>;
                })}
              </div>
            ) : null}
          </section>

          {showing && !movie.watched && (
            <section className="sheet-section" ref={showtimesRef}>
              <h3 className="section-label">Showtimes in {place}</h3>
              <FilmShowtimes title={movie.title} year={movie.year} imdb={imdbId} />
            </section>
          )}

          {details && !showing && !unreleased && !details.streaming.length && !details.rentOrBuy.length && (
            <p className="muted small-print">Not streaming in {regionName(settings.region || "IN")} right now.</p>
          )}

          {isSaved && isShow(movie) && (progress.length > 0 || newEpisode) && (
            <section className="sheet-section">
              {newEpisode && (
                <>
                  <h3 className="section-label">Episode progress</h3>
                  <NewEpisodeCard
                    tmdbId={movie.tmdbId}
                    air={newEpisode}
                    onWatched={() => actions.toggleEpisode(movie.id, newEpisode.season, newEpisode.episode)}
                    onDismiss={() => setDismissedEpisodes(dismissEpisode(episodeKey(movie.id, newEpisode.season, newEpisode.episode)))}
                  />
                </>
              )}
              {progress.length > 0 && <Seasons movie={movie} info={details?.seasons} />}
            </section>
          )}

          {details && details.cast.length > 0 && (
            <section className="sheet-section">
              <h3 className="section-label">Cast</h3>
              <ul className="cast-row">
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

          {isSaved && (movie.watched || take) && (
            <section className="sheet-section">
              <h3 className="section-label">Your take</h3>
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

          {isSaved && <section className="sheet-section">
            {note || writingNote ? (
              <>
                <h3 className="section-label"><label htmlFor="note">{movie.watched ? "Notes" : "Why I saved this"}</label></h3>
                <textarea
                  id="note"
                  className="note"
                  rows={3}
                  maxLength={2000}
                  autoFocus={writingNote && !note}
                  placeholder={movie.watched ? "What you thought, who you watched it with…" : "A friend's pick, a review you read, the mood it's for…"}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  onBlur={() => { actions.setNote(movie.id, note); if (!note.trim()) setWritingNote(false); }}
                />
              </>
            ) : (
              <button type="button" className="add-note" onClick={() => setWritingNote(true)}>
                <Icon name="plus" size={15} /> {movie.watched ? "Add a note" : "Add why you saved it"}
              </button>
            )}
            {savedLine && <p className="saved-line">{savedLine}</p>}
          </section>}

          {details && details.recommendations.length > 0 && (
            <section className="sheet-section">
              <h3 className="section-label">More like this</h3>
              <div className="cinema-row more-row">
                {details.recommendations.map((item) => (
                  <CandidateCard key={item.key} candidate={item} onOpenSaved={(savedId) => openWithMotion(() => { location.hash = `#/title/${encodeURIComponent(savedId)}`; })} />
                ))}
              </div>
            </section>
          )}

          <div className="sheet-links">
            {imdbId && <a className="link-chip" href={`https://www.imdb.com/title/${imdbId}/`} target="_blank" rel="noreferrer"><Icon name="external" size={14} /> IMDb</a>}
            {safeLink(movie.sourceUrl) && (
              <a className="link-chip" href={safeLink(movie.sourceUrl)} target="_blank" rel="noreferrer"><Icon name="external" size={14} /> Where you found it</a>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}
