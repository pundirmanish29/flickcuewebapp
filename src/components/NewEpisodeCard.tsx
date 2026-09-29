import { useEffect, useState } from "react";
import { formatRuntime, readerDate, shortDay } from "../lib/rules";
import { safeImage } from "../lib/safe";
import { fetchEpisode, type EpisodeInfo } from "../lib/tmdb";
import type { AiredEpisode } from "../lib/newEpisode";
import { Icon } from "./Icon";

/**
 * The latest aired episode, kept at the top of a followed show's progress until
 * it's watched or put away: its still, name, rating and summary, fetched as the
 * sheet opens.
 */
export function NewEpisodeCard({ tmdbId, air, onWatched, onDismiss }: {
  tmdbId: string | undefined;
  air: AiredEpisode;
  onWatched: () => void;
  onDismiss: () => void;
}) {
  const [info, setInfo] = useState<EpisodeInfo | null>(null);
  const [stillFailed, setStillFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setInfo(null);
    setStillFailed(false);
    fetchEpisode(tmdbId, air.season, air.episode).then((result) => live && setInfo(result)).catch(() => {});
    return () => {
      live = false;
    };
  }, [tmdbId, air.season, air.episode]);

  const still = safeImage(info?.still);
  const name = info?.name || air.name;
  const aired = new Date(`${readerDate(air.date)}T20:00:00`).getTime();
  const meta = [info?.runtimeMinutes ? formatRuntime(info.runtimeMinutes) : "", shortDay(aired, Date.now(), false)].filter(Boolean).join(" · ");

  return (
    <article className="new-episode" aria-label={`New episode: season ${air.season} episode ${air.episode}`}>
      <div className={`new-episode-still ${still && !stillFailed ? "" : "is-empty"}`}>
        {still && !stillFailed && <img src={still} alt="" loading="lazy" decoding="async" onError={() => setStillFailed(true)} />}
        <span className="new-episode-tag">New · S{air.season} E{air.episode}</span>
      </div>
      <div className="new-episode-body">
        <div className="new-episode-head">
          <h4>{name && !/^episode \d+$/i.test(name) ? name : `Episode ${air.episode}`}</h4>
          {info?.rating && <span className="new-episode-rating"><Icon name="star" size={12} /> {info.rating}</span>}
        </div>
        {meta && <p className="new-episode-meta">{meta}</p>}
        {info?.overview && <p className="new-episode-overview">{info.overview}</p>}
        <div className="new-episode-actions">
          <button type="button" className="chip-button new-episode-watched" onClick={onWatched}>
            <Icon name="check" size={14} /> Watched
          </button>
          <button type="button" className="chip-button ghost" onClick={onDismiss}>Not now</button>
        </div>
      </div>
    </article>
  );
}
