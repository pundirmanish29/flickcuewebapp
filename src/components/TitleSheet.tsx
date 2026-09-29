import { useCallback, useEffect, useRef, useState } from "react";
import * as actions from "../lib/actions";
import { enrich, findExisting } from "../lib/editor";
import {
  displayTitle, formatRating, formatRuntime, getShowStatus, hasActiveReminder, isShow, isUnreleased, reminderText, seasonProgress
} from "../lib/rules";
import { commit, getState, useAppState } from "../lib/store";
import { useInCinemas, useWhere } from "../lib/useCinemas";
import { FilmShowtimes } from "./Showtimes";
import { cinemaKey, fetchDetails, upscale, type Provider, type TitleDetails } from "../lib/tmdb";
import type { Candidate, Movie } from "../lib/types";
import { CandidateCard } from "./CandidateCard";
import { Icon } from "./Icon";
import { Poster } from "./Poster";
import { Popover, ReminderChoices } from "./ReminderMenu";
import { providerLink } from "../lib/providers";

/** Writes looked-up details back onto the saved title, the way the extension and the Android app do. */
function writeBack(movie: Movie, details: TitleDetails) {
  const library = getState().library;
  const next = enrich(library, movie.id, {
    runtimeMinutes: details.runtimeMinutes || undefined,
    genres: details.genres.length ? details.genres : undefined,
    genre: details.genres[0],
    imdbId: details.imdbId,
    productionStatus: details.status,
    tagline: movie.tagline ? undefined : details.overview.slice(0, 200),
    backdrop: movie.backdrop ? undefined : details.backdrop,
    poster: movie.poster ? undefined : details.poster,
    rating: movie.rating ? undefined : details.rating,
    seasons: details.seasons.length ? details.seasons : undefined
  });
  if (next) commit(next);
}

function ProviderRow({ label, providers, tone, title }: { label: string; providers: Provider[]; tone: "included" | "paid"; title: string }) {
  if (!providers.length) return null;
  return (
    <div className="provider-row">
      <span className="eyebrow">{label}</span>
      <div className="provider-logos">
        {providers.map((provider) => (
          <a key={provider.name} className={`provider provider-${tone}`} href={providerLink(provider.name, title)} target="_blank" rel="noreferrer" title={`${provider.name} · ${tone === "included" ? "included with subscription" : "rent or buy"}`}>
            {provider.logo ? <img src={provider.logo} alt={provider.name} /> : <span>{provider.name.slice(0, 2)}</span>}
          </a>
        ))}
      </div>
    </div>
  );
}

const ProviderLogo = ({ provider }: { provider: Provider }) =>
  provider.logo ? <img src={provider.logo} alt="" /> : <b>{provider.name.slice(0, 2)}</b>;

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
      <Popover open={open} onClose={close} label="Where to watch" anchor={trigger}>
        <ul className="watch-list">
          {all.map(({ provider, tone }, index) => (
            <li key={provider.name + tone}>
              {(index === 0 || all[index - 1].tone !== tone) && <p className="watch-list-label">{tone}</p>}
              <a href={providerLink(provider.name, title)} target="_blank" rel="noreferrer" onClick={close}>
                <ProviderLogo provider={provider} />
                <span>{provider.name}</span>
                <Icon name="external" size={14} />
              </a>
            </li>
          ))}
        </ul>
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
  const [openSeason, setOpenSeason] = useState<number | null>(null);
  const inCinemas = useInCinemas();
  const { place } = useWhere();
  const showing = Boolean(movie && inCinemas?.has(cinemaKey(movie)));

  useEffect(() => {
    dialog.current?.showModal();
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
  const backdrop = details?.backdrop || upscale(movie.backdrop, "w1280");
  const progress = seasonProgress(movie);
  const imdbRating = Number(movie.imdbRating) || 0;
  const imdbId = details?.imdbId || (movie.imdbId as string | undefined);
  const show = isShow(movie);

  // Beside the title: who made it, in what language, and for which channel.
  const credit = [
    details?.director ? `${show ? "Created by" : "Directed by"} ${details.director}` : "",
    details?.language || "",
    details?.network || ""
  ].filter(Boolean).join(" · ");

  // The one line that says what's next: the next episode by name, or when a film comes out.
  const headline = (() => {
    if (movie.watched) return null;
    const next = details?.nextEpisode;
    if (show && next) {
      return { tone: "green", text: `Next: S${next.season} E${next.episode}${next.name && !/^episode \d+$/i.test(next.name) ? ` “${next.name}”` : ""} · ${dayLabel(next.date)}` };
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
  const takeRating = personalRating || Number(letterboxd.rating) || 0;
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
      onClose={onClose}
      onClick={(event) => event.target === dialog.current && dialog.current?.close()}
      aria-labelledby="sheet-title"
    >
      <div className="sheet-inner">
        <div className={`sheet-hero ${playing ? "playing" : ""}`} style={backdrop ? { backgroundImage: `url(${backdrop})` } : undefined}>
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
              <button type="button" className="icon-button sheet-close" onClick={() => dialog.current?.close()} aria-label="Close">
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
            <button type="button" className="icon-button trailer-close" onClick={() => dialog.current?.close()} aria-label="Close">
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
              <h2 id="sheet-title">{title}</h2>
              {credit && <p className="sheet-credit">{credit}</p>}
              <div className="score-row">
                {/* Icon and number only, so all four fit one line beside the poster; the words are in the labels. */}
                {formatRating(movie.rating || details?.rating) && (
                  <span className="score" title="Rating" aria-label={`Rating ${formatRating(movie.rating || details?.rating)} out of 10`}>
                    <Icon name="star" size={13} /> {formatRating(movie.rating || details?.rating)}
                  </span>
                )}
                {imdbRating > 0 && (
                  <span className="score" title="IMDb" aria-label={`IMDb ${imdbRating.toFixed(1)}`}>
                    <span className="imdb-mark" aria-hidden="true">IMDb</span> {imdbRating.toFixed(1)}
                  </span>
                )}
                {Number(movie.criticScore) >= 0 && movie.criticScore != null && (
                  <span className="score" title="Critics" aria-label={`Critics ${movie.criticScore}%`}>
                    <Icon name="tomato" size={14} /> {movie.criticScore}%
                  </span>
                )}
                {Number(movie.audienceScore) >= 0 && movie.audienceScore != null && (
                  <span className="score" title="Audience" aria-label={`Audience ${movie.audienceScore}%`}>
                    <Icon name="popcorn" size={14} /> {movie.audienceScore}%
                  </span>
                )}
              </div>
              {headline ? (
                <p className={`sheet-status tone-${headline.tone}`}>{headline.text}</p>
              ) : (status || reminderActive || unreleased || movie.watched) && (
                <p className={`sheet-status ${status ? `tone-${status.tone}` : ""}`}>{status ? status.text : reminderText(movie)}</p>
              )}
              {facts && <p className="sheet-facts">{facts}</p>}
              {/* Where to watch sits with the title, in the space beside the poster. */}
              {details && (details.streaming.length > 0 || details.rentOrBuy.length > 0) ? (
                <WatchOn title={movie.title} streaming={details.streaming} rentOrBuy={details.rentOrBuy} />
              ) : showing && !movie.watched ? (
                <button type="button" className="watch-on" onClick={() => showtimesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                  <Icon name="movie" size={15} /> <span>In cinemas · showtimes</span>
                </button>
              ) : null}
            </div>
          </div>

          {isSaved ? (
          <>
          {/* One row of actions, icon over label, so they fit a phone's width. */}
          <div className="sheet-actions action-row">
            <button
              type="button"
              className={`action ${movie.watched ? "" : "primary"}`}
              disabled={!movie.watched && unreleased}
              onClick={() => actions.toggleWatched(movie.id)}
            >
              <span className="action-icon"><Icon name={movie.watched ? "eyeOff" : "eye"} size={20} /></span>
              <span>{movie.watched ? "Unwatch" : unreleased ? "Not out yet" : "Mark watched"}</span>
            </button>
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
              <div className="sheet-actions">
                <button type="button" className="button button-ink" aria-expanded={choosingReminder} onClick={() => setChoosingReminder((open) => !open)}>
                  <Icon name="plus" size={16} /> Save
                </button>
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
            {details?.tagline && <p className="tagline">“{details.tagline}”</p>}
            <p className="overview">{details?.overview || movie.tagline || (movie.tmdbId ? "" : "No synopsis for a title added by hand.")}</p>
            {!details && movie.tmdbId && !detailsError && <p className="muted loading-text">Loading details…</p>}
            {detailsError && <p className="muted">{detailsError}</p>}
            {(details?.genres.length || movie.genres?.length) ? (
              <div className="tag-row">{(details?.genres || movie.genres || []).map((genre) => <span key={genre} className="tag">{genre}</span>)}</div>
            ) : null}
          </section>

          {showing && !movie.watched && (
            <section className="sheet-section" ref={showtimesRef}>
              <h3 className="section-label">In cinemas · showtimes in {place}</h3>
              <FilmShowtimes title={movie.title} year={movie.year} imdb={imdbId} />
            </section>
          )}

          {details && (details.streaming.length > 0 || details.rentOrBuy.length > 0) && (
            <section className="sheet-section">
              <h3 className="section-label">Where to watch · {settings.region}</h3>
              <ProviderRow label="Included" providers={details.streaming} tone="included" title={movie.title} />
              <ProviderRow label="Rent or buy" providers={details.rentOrBuy} tone="paid" title={movie.title} />
            </section>
          )}
          {details && !showing && !unreleased && !details.streaming.length && !details.rentOrBuy.length && (
            <p className="muted small-print">Not streaming in {settings.region} right now. Change the region in Settings.</p>
          )}

          {isSaved && isShow(movie) && progress.length > 0 && (
            <section className="sheet-section">
              <h3 className="section-label">Episode progress</h3>
              <ul className="season-list">
                {progress.map((season) => (
                  <li key={season.number}>
                    <div className="season-row">
                      <button type="button" className="season-toggle" aria-expanded={openSeason === season.number} onClick={() => setOpenSeason(openSeason === season.number ? null : season.number)}>
                        <span>{season.name || `Season ${season.number}`}</span>
                        <span className="muted">{season.seen}/{season.total}</span>
                      </button>
                      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={season.total} aria-valuenow={season.seen} aria-label={`Season ${season.number} progress`}>
                        <span style={{ width: `${Math.round((season.seen / season.total) * 100)}%` }} />
                      </div>
                      <button type="button" className="chip-button" onClick={() => actions.toggleSeason(movie.id, season.number, season.total)}>
                        {season.seen === season.total ? "Unmark" : "All seen"}
                      </button>
                    </div>
                    {openSeason === season.number && (
                      <div className="episode-grid">
                        {Array.from({ length: season.total }, (_, index) => {
                          const episode = index + 1;
                          const seen = movie.personal?.episodes?.includes(`${season.number}:${episode}`);
                          return (
                            <button key={episode} type="button" className={`episode ${seen ? "seen" : ""}`} aria-pressed={seen} onClick={() => actions.toggleEpisode(movie.id, season.number, episode)}>
                              {episode}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {details && details.cast.length > 0 && (
            <section className="sheet-section">
              <h3 className="section-label">Cast</h3>
              <ul className="cast-row">
                {details.cast.map((person) => (
                  <li key={person.name + person.character}>
                    <Poster src={person.photo} title={person.name} className="cast-photo" />
                    <span className="cast-name">{person.name}</span>
                    <span className="muted cast-role">{person.character}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {isSaved && take && (
            <section className="sheet-section">
              <h3 className="section-label">Your take</h3>
              <div className="take">
                {take.rating > 0 && <span className="take-stars" aria-label={`${take.rating} out of 5`}><Icon name="star" size={16} /> <b>{take.rating}</b>/5</span>}
                {take.liked && <span className="take-liked"><Icon name="heart" size={16} /> Liked</span>}
                {take.source && <span className="take-source">from {take.source}</span>}
              </div>
              {take.review && <blockquote className="take-review">{take.review}</blockquote>}
            </section>
          )}

          {isSaved && <section className="sheet-section">
            <h3 className="section-label"><label htmlFor="note">Why I saved this</label></h3>
            <textarea
              id="note"
              className="note"
              rows={3}
              maxLength={2000}
              placeholder="A friend's pick, a review you read, the mood it's for…"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              onBlur={() => actions.setNote(movie.id, note)}
            />
            {savedLine && <p className="saved-line">{savedLine}</p>}
          </section>}

          {details && details.recommendations.length > 0 && (
            <section className="sheet-section">
              <h3 className="section-label">More like this</h3>
              <div className="cinema-row more-row">
                {details.recommendations.map((item) => (
                  <CandidateCard key={item.key} candidate={item} onOpenSaved={(savedId) => { location.hash = `#/title/${encodeURIComponent(savedId)}`; }} />
                ))}
              </div>
            </section>
          )}

          <div className="sheet-links">
            {details?.trailer && <a className="link-chip" href={details.trailer} target="_blank" rel="noreferrer"><Icon name="play" size={14} /> Trailer</a>}
            {imdbId && <a className="link-chip" href={`https://www.imdb.com/title/${imdbId}/`} target="_blank" rel="noreferrer"><Icon name="external" size={14} /> IMDb</a>}
            {typeof movie.sourceUrl === "string" && /^https?:\/\//.test(movie.sourceUrl) && (
              <a className="link-chip" href={movie.sourceUrl} target="_blank" rel="noreferrer"><Icon name="external" size={14} /> Where you found it</a>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}
