import { useEffect, useRef, useState } from "react";
import * as actions from "../lib/actions";
import { episodesAired, formatRuntime, localIsoDate, readerDate, seasonProgress } from "../lib/rules";
import { safeImage } from "../lib/safe";
import { fetchSeason, upscale, type SeasonEpisode } from "../lib/tmdb";
import type { Movie, Season } from "../lib/types";
import { Icon } from "./Icon";
import { Poster } from "./Poster";
import { ScrollArrows } from "./ScrollArrows";

const dayText = (iso: string) => {
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

/**
 * A followed show's seasons as a row of cards, each with its rating and how
 * much has been watched; a season opens to its episodes, each with its still,
 * date, runtime, rating and summary, and a tick to mark it watched.
 */
export function Seasons({ movie, info }: { movie: Movie; info: Season[] | undefined }) {
  const [openNumber, setOpenNumber] = useState<number | null>(null);
  const progress = seasonProgress(movie);
  const open = progress.find((season) => season.number === openNumber);
  const rail = useRef<HTMLUListElement>(null);

  if (open) {
    return <SeasonView movie={movie} season={open} info={info?.find((item) => item.number === open.number)} onBack={() => setOpenNumber(null)} />;
  }
  return (
    <>
      <div className="seasons-head">
        <h3 className="section-label">Seasons</h3>
        <span className="seasons-tools">
          <ScrollArrows target={rail} label="Seasons" watch={progress.length} />
          <span className="muted">{progress.length}</span>
        </span>
      </div>
      <ul className="season-rail" ref={rail}>
        {progress.map((season) => {
          const meta = info?.find((item) => item.number === season.number);
          return (
            <li key={season.number}>
              <button type="button" className="season-card" onClick={() => setOpenNumber(season.number)} aria-label={`${season.name || `Season ${season.number}`}, ${season.seen} of ${season.total} watched`}>
                <span className="season-card-art">
                  <Poster src={upscale(meta?.poster, "w185")} retina={upscale(meta?.poster, "w342")} title={season.name || `Season ${season.number}`} />
                  {meta?.rating && <span className="season-card-rating"><Icon name="star" size={11} /> {meta.rating}</span>}
                </span>
                <span className="progress" aria-hidden="true">
                  <span style={{ width: `${Math.round((season.seen / season.total) * 100)}%` }} />
                </span>
                <b>{season.name || `Season ${season.number}`}</b>
                <span className="muted">{season.seen} of {season.total} watched</span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function SeasonView({ movie, season, info, onBack }: {
  movie: Movie;
  season: { number: number; name?: string; seen: number; total: number };
  info: Season | undefined;
  onBack: () => void;
}) {
  const [episodes, setEpisodes] = useState<SeasonEpisode[] | null>(null);
  const [failed, setFailed] = useState(false);
  const seen = new Set(movie.personal?.episodes ?? []);
  const today = localIsoDate();

  useEffect(() => {
    let live = true;
    setEpisodes(null);
    setFailed(false);
    fetchSeason(movie.tmdbId, season.number).then((list) => live && setEpisodes(list)).catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [movie.tmdbId, season.number]);

  // Only episodes that have aired can be ticked, so "all" means all of those (an undated one isn't, unless a later one is).
  const aired = episodes ? episodesAired(episodes, today) : [];
  const airedNumbers = episodes?.filter((_, index) => aired[index]).map((episode) => episode.number);
  const allAiredSeen = Boolean(airedNumbers?.length) && airedNumbers!.every((number) => seen.has(`${season.number}:${number}`));
  const facts = [`${season.total} episodes`, info?.year, `${season.seen} of ${season.total} watched`].filter(Boolean).join(" · ");
  return (
    <div className="season-view">
      <div className="season-view-head">
        <button type="button" className="header-icon season-back" onClick={onBack} aria-label="Back to seasons">
          <Icon name="back" size={20} />
        </button>
        <div>
          <h3>{season.name || `Season ${season.number}`}</h3>
          <p className="muted">{facts}</p>
        </div>
        <button type="button" className="chip-button" disabled={!airedNumbers?.length} onClick={() => actions.toggleSeason(movie.id, season.number, season.total, airedNumbers)}>
          {allAiredSeen ? "Unmark all" : "Mark all"}
        </button>
      </div>
      {failed && <p className="muted small-print">Couldn't load this season's episodes. Try again in a moment.</p>}
      {!failed && !episodes && <div className="season-loading" aria-hidden="true"><span /><span /><span /></div>}
      {episodes && (
        <ol className="episode-list">
          {episodes.map((episode, index) => {
            const done = seen.has(`${season.number}:${episode.number}`);
            const unaired = !aired[index];
            const still = safeImage(episode.still);
            const meta = [episode.airDate ? dayText(readerDate(episode.airDate)) : "", formatRuntime(episode.runtimeMinutes)].filter(Boolean).join(" · ");
            return (
              <li key={episode.number} className={`episode-item ${unaired ? "unaired" : ""}`}>
                <div className="episode-still">{still && <img src={still} alt="" loading="lazy" decoding="async" />}</div>
                <div className="episode-info">
                  <b>{episode.number}. {episode.name || `Episode ${episode.number}`}</b>
                  <span className="episode-meta">
                    {meta}
                    {episode.rating && <>{meta ? " · " : ""}<span className="episode-rating"><Icon name="star" size={11} /> {episode.rating}</span></>}
                  </span>
                  {episode.overview && <p>{episode.overview}</p>}
                </div>
                <button
                  type="button"
                  className={`episode-check ${done ? "done" : ""}`}
                  aria-pressed={done}
                  disabled={unaired && !done}
                  aria-label={unaired && !done ? `Episode ${episode.number} hasn't aired yet` : `Episode ${episode.number}, ${done ? "watched" : "not watched"}`}
                  title={unaired && !done ? "Not aired yet" : done ? "Watched" : "Mark watched"}
                  onClick={() => actions.toggleEpisode(movie.id, season.number, episode.number)}
                >
                  <Icon name="check" size={16} />
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
