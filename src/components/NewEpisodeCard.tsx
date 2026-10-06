import { useEffect, useState } from "react";
import { formatRuntime, readerDate, shortDay } from "../lib/rules";
import { safeImage } from "../lib/safe";
import { fetchEpisode, type EpisodeInfo } from "../lib/tmdb";
import type { UpNext } from "../lib/newEpisode";
import { Icon } from "./Icon";

const TAGS: Record<UpNext["state"], string> = { next: "Up next", new: "New", upcoming: "Next" };

/**
 * The episode to watch next, kept at the top of a followed show's progress: its
 * still, name, rating and summary, fetched as the sheet opens. An aired one can
 * be ticked off or put away; one still to air says when it does.
 */
export function NewEpisodeCard({ tmdbId, air, fallbackImage = "", onWatched, onDismiss }: {
  tmdbId: string | undefined;
  air: UpNext;
  /** The show's own backdrop, for an episode TMDB has no still for yet (often one still to air). */
  fallbackImage?: string;
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

  const still = safeImage(info?.still) || (info ? safeImage(fallbackImage) : "");
  const name = info?.name || air.name;
  // A caught-up episode comes without its date; the episode lookup has it.
  const date = air.date || info?.airDate || "";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? shortDay(new Date(`${readerDate(date)}T20:00:00`).getTime(), Date.now(), false) : "";
  const upcoming = air.state === "upcoming";
  const when = upcoming && day ? `Airs ${day === "Today" || day === "Tomorrow" ? day.toLowerCase() : day}` : day;
  const meta = [info?.runtimeMinutes ? formatRuntime(info.runtimeMinutes) : "", when].filter(Boolean).join(" · ");

  return (
    <article className={`new-episode is-${air.state}`} aria-label={`${TAGS[air.state]} episode: season ${air.season} episode ${air.episode}`}>
      <div className={`new-episode-still ${still && !stillFailed ? "" : "is-empty"}`}>
        {still && !stillFailed && <img src={still} alt="" loading="lazy" decoding="async" onError={() => setStillFailed(true)} />}
        <span className="new-episode-tag">{TAGS[air.state]} · S{air.season} E{air.episode}</span>
      </div>
      <div className="new-episode-body">
        <div className="new-episode-head">
          <h4>{name && !/^episode \d+$/i.test(name) ? name : `Episode ${air.episode}`}</h4>
          {info?.rating && <span className="new-episode-rating"><Icon name="star" size={12} /> {info.rating}</span>}
        </div>
        {meta && <p className="new-episode-meta">{meta}</p>}
        {info?.overview && <p className="new-episode-overview">{info.overview}</p>}
        {!upcoming && (
          <div className="new-episode-actions">
            <button type="button" className="chip-button new-episode-watched" onClick={onWatched}>
              <Icon name="check" size={14} /> Watched
            </button>
            <button type="button" className="chip-button ghost" onClick={onDismiss}>Not now</button>
          </div>
        )}
      </div>
    </article>
  );
}
