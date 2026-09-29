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
          <div className="sheet-hero-top">
            {details && (details.streaming.length > 0 || details.rentOrBuy.length > 0) ? (
              <WatchOn title={movie.title} streaming={details.streaming} rentOrBuy={details.rentOrBuy} />
            ) : showing && !movie.watched ? (
              <button type="button" className="watch-on" onClick={() => showtimesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                <Icon name="movie" size={15} /> <span>In cinemas</span>
              </button>
            ) : null}
            <button type="button" className="icon-button sheet-close" onClick={() => dialog.current?.close()} aria-label="Close">
              <Icon name="close" />
            </button>
          </div>
        </div>

        <div className="sheet-body">
          <div className="sheet-head">
            <Poster src={upscale(movie.poster, "w342")} title={movie.title} className="sheet-poster" />
            <div className="sheet-heading">
              <p className="eyebrow sheet-meta">
                {details?.certification && <span className="certification" title="Age rating">{details.certification}</span>}
                <span>{[movie.mediaType, movie.year, formatRuntime(movie.runtimeMinutes || details?.runtimeMinutes)].filter(Boolean).join(" · ")}</span>
              </p>
              <h2 id="sheet-title">{title}</h2>
              <div className="score-row">
                {formatRating(movie.rating || details?.rating) && <span className="score"><b>{formatRating(movie.rating || details?.rating)}</b> Rating</span>}
                {imdbRating > 0 && <span className="score"><b>{imdbRating.toFixed(1)}</b> IMDb</span>}
                {Number(movie.criticScore) >= 0 && movie.criticScore != null && <span className="score"><b>{movie.criticScore}%</b> Critics</span>}
                {Number(movie.audienceScore) >= 0 && movie.audienceScore != null && <span className="score"><b>{movie.audienceScore}%</b> Audience</span>}
              </div>
              {(status || isSaved || unreleased) && (
                <p className={`sheet-status ${status ? `tone-${status.tone}` : ""}`}>{status ? status.text : reminderText(movie)}</p>
              )}
            </div>
          </div>

          {isSaved ? (
          <>
          <div className="sheet-actions">
            <button
              type="button"
              className={`button ${movie.watched ? "button-quiet" : "button-ink"}`}
              disabled={!movie.watched && unreleased}
              onClick={() => actions.toggleWatched(movie.id)}
            >
              <Icon name={movie.watched ? "eyeOff" : "eye"} size={16} />
              {movie.watched ? "Back to queue" : unreleased ? "Not out yet" : "Mark watched"}
            </button>
            {!movie.watched && (
              <button type="button" className="button button-quiet" aria-expanded={choosingReminder} onClick={() => setChoosingReminder((open) => !open)}>
                <Icon name="clock" size={16} /> {reminderActive ? "Change reminder" : "Remind me"}
              </button>
            )}
            {!movie.watched && reminderActive && (
              <button type="button" className="button button-quiet" onClick={() => actions.clearReminder(movie.id)}>Clear reminder</button>
            )}
            {unreleased && !movie.watched && (
              <button
                type="button"
                className={`button ${movie.personal?.interested ? "button-lime" : "button-quiet"}`}
                aria-pressed={Boolean(movie.personal?.interested)}
                onClick={() => actions.setInterested(movie.id, !movie.personal?.interested)}
              >
                <Icon name="bell" size={16} /> {movie.personal?.interested ? "Interested" : "Interested?"}
              </button>
            )}
            <button type="button" className="button button-quiet danger" onClick={() => actions.removeTitle(movie.id)}>
              <Icon name="trash" size={16} /> Remove
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
            {details?.director && <p className="muted small-print">{movie.tmdbType === "tv" ? "Created by" : "Directed by"} {details.director}</p>}
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
          {details && !showing && !details.streaming.length && !details.rentOrBuy.length && (
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
          </section>}

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
