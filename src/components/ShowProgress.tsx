import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as actions from "../lib/actions";
import { episodesAired, formatRuntime, localIsoDate } from "../lib/rules";
import { safeImage } from "../lib/safe";
import { fetchEpisode, fetchSeason, type EpisodeInfo, type SeasonEpisode } from "../lib/tmdb";
import type { UpNext } from "../lib/newEpisode";
import type { Movie } from "../lib/types";
import { Icon } from "./Icon";
import { ScrollArrows } from "./ScrollArrows";

const realName = (name: string | undefined, episode: number) => (name && !/^episode \d+$/i.test(name) ? name : `Episode ${episode}`);

/**
 * In a show's stub: the episode to watch next, with its still, name and length,
 * and a tick to mark it watched (left out when the stub's main button already does).
 */
export function UpNextRow({ tmdbId, air, fallbackImage = "", onWatched, tick }: {
  tmdbId: string | undefined;
  air: UpNext;
  fallbackImage?: string;
  onWatched: () => void;
  tick: boolean;
}) {
  const [info, setInfo] = useState<EpisodeInfo | null>(null);
  const [stillFailed, setStillFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setInfo(null);
    setStillFailed(false);
    fetchEpisode(tmdbId, air.season, air.episode).then((result) => live && setInfo(result)).catch(() => {});
    return () => { live = false; };
  }, [tmdbId, air.season, air.episode]);

  const still = safeImage(info?.still) || (info ? safeImage(fallbackImage) : "");
  const code = `S${air.season} E${air.episode}`;
  return (
    <div className="tp-upnext">
      <span className="tp-upnext-tag">{air.state === "new" ? "New" : "Up next"} · {code}</span>
      <div className={`tp-upnext-still ${still && !stillFailed ? "" : "is-empty"}`}>
        {still && !stillFailed && <img src={still} alt="" loading="lazy" decoding="async" onError={() => setStillFailed(true)} />}
      </div>
      <div className="tp-upnext-text">
        <b>{realName(info?.name || air.name, air.episode)}</b>
        {info?.runtimeMinutes ? <span className="tp-upnext-meta">{formatRuntime(info.runtimeMinutes)}</span> : null}
      </div>
      {tick && (
        <button type="button" className="tp-upnext-tick" onClick={onWatched} aria-label={`Mark ${code} watched`} title="Mark watched">
          <Icon name="check" size={20} />
        </button>
      )}
    </div>
  );
}

/** How far through the whole show you are: "3 of 16 · 19%", with a thin bar. */
export function SeriesProgress({ seen, total }: { seen: number; total: number }) {
  const percent = Math.min(100, Math.round((seen / total) * 100));
  return (
    <div className="tp-series">
      <div className="tp-series-head">
        <span>Series progress</span>
        <b>{seen} of {total} · {percent}%</b>
      </div>
      <div className="tp-series-bar" role="progressbar" aria-label="Series progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={seen} aria-valuetext={`${seen} of ${total} episodes watched`}>
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/**
 * The season you're in as a strip of stills: watched ones dimmed with a tick,
 * the next one outlined, the rest ready to tick. It opens at the next episode.
 */
export function EpisodeStrip({ movie, season, seasonName, upNext, onDismiss }: {
  movie: Movie;
  season: number;
  seasonName?: string;
  /** The next episode's number in this season, outlined and scrolled to. */
  upNext: number;
  /** "Not now" for a newly aired episode, as the up-next card had. */
  onDismiss?: () => void;
}) {
  const [episodes, setEpisodes] = useState<SeasonEpisode[] | null>(null);
  const [failed, setFailed] = useState(false);
  const row = useRef<HTMLOListElement>(null);
  const seen = new Set(movie.personal?.episodes ?? []);

  useEffect(() => {
    let live = true;
    setEpisodes(null);
    setFailed(false);
    fetchSeason(movie.tmdbId, season).then((list) => live && setEpisodes(list)).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [movie.tmdbId, season]);

  // Open at the next episode, with one watched one before it for context.
  useLayoutEffect(() => {
    const list = row.current;
    const next = list?.querySelector<HTMLElement>(".ep-card.is-next");
    if (!list || !next) return;
    const before = next.previousElementSibling as HTMLElement | null;
    list.scrollLeft = Math.max(0, (before ?? next).offsetLeft - list.offsetLeft);
  }, [episodes, upNext]);

  if (failed) return null;
  const aired = episodes ? episodesAired(episodes, localIsoDate()) : [];
  const watched = episodes ? episodes.filter((episode) => seen.has(`${season}:${episode.number}`)).length : 0;
  const label = seasonName && !/^season \d+$/i.test(seasonName) ? seasonName : `Season ${season}`;

  return (
    <div className="ep-strip">
      <div className="rail-head">
        <h2 className="section-label">{label} {episodes && <span className="count">{watched} of {episodes.length} watched</span>}</h2>
        <ScrollArrows target={row} label={`${label} episodes`} watch={episodes?.length} />
      </div>
      {!episodes ? (
        <div className="season-loading" aria-hidden="true"><span /><span /><span /></div>
      ) : (
        <ol className="ep-row" ref={row}>
          {episodes.map((episode, index) => {
            const done = seen.has(`${season}:${episode.number}`);
            const next = episode.number === upNext && !done;
            const unaired = !aired[index];
            const still = safeImage(episode.still);
            return (
              <li key={episode.number} className={`ep-card${done ? " is-done" : ""}${next ? " is-next" : ""}${unaired ? " is-unaired" : ""}`}>
                <div className="ep-still">
                  {still && <img src={still} alt="" loading="lazy" decoding="async" />}
                  {next && <span className="ep-tag">Up next</span>}
                  <button
                    type="button"
                    className={`ep-tick${done ? " done" : ""}`}
                    aria-pressed={done}
                    disabled={unaired && !done}
                    aria-label={unaired && !done ? `Episode ${episode.number} hasn't aired yet` : `Episode ${episode.number}, ${done ? "watched" : "not watched"}`}
                    title={unaired && !done ? "Not aired yet" : done ? "Watched" : "Mark watched"}
                    onClick={() => actions.toggleEpisode(movie.id, season, episode.number)}
                  >
                    <Icon name="check" size={15} />
                  </button>
                </div>
                <p className="ep-meta">E{episode.number}{episode.runtimeMinutes ? ` · ${formatRuntime(episode.runtimeMinutes)}` : ""}</p>
                <b className="ep-name">{realName(episode.name, episode.number)}</b>
                {next && onDismiss && <button type="button" className="link-button inline ep-dismiss" onClick={onDismiss}>Not now</button>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
