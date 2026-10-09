import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import * as actions from "../lib/actions";
import { episodesAired, formatRuntime, localIsoDate, readerDate } from "../lib/rules";
import { safeImage } from "../lib/safe";
import { fetchEpisode, fetchSeason, type EpisodeInfo, type SeasonEpisode } from "../lib/tmdb";
import type { UpNext } from "../lib/newEpisode";
import type { Movie } from "../lib/types";
import { Icon } from "./Icon";
import { Popover } from "./ReminderMenu";
import { ScrollArrows } from "./ScrollArrows";

const realName = (name: string | undefined, episode: number) => (name && !/^episode \d+$/i.test(name) ? name : `Episode ${episode}`);

type SeasonChoice = { number: number; name?: string; seen?: number; total?: number };
const seasonLabel = (item: SeasonChoice) => (item.name && !/^season \d+$/i.test(item.name) ? `Season ${item.number} · ${item.name}` : `Season ${item.number}`);

/**
 * The other seasons, as a pill that opens a short menu on the page's own
 * colours (a native select's list is the system's, white on a dark page): each
 * season with how much of it you've watched, the one shown ticked.
 */
function SeasonPicker({ season, seasons, onSeason }: { season: number; seasons: SeasonChoice[]; onSeason: (season: number) => void }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const current = seasons.find((item) => item.number === season);
  return (
    <div className="season-pick">
      <button ref={trigger} type="button" className="season-pick-button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span>{current ? seasonLabel(current) : `Season ${season}`}</span>
        <Icon name="chevron" size={14} />
      </button>
      <Popover open={open} onClose={close} label="Choose a season" anchor={trigger} focusFirst>
        <ul className="season-menu">
          {seasons.map((item) => (
            <li key={item.number}>
              <button
                type="button"
                aria-current={item.number === season || undefined}
                onClick={() => { onSeason(item.number); close(); trigger.current?.focus(); }}
              >
                <span className="season-menu-name">{seasonLabel(item)}</span>
                {item.total ? <span className="season-menu-count">{item.seen ? `${item.seen} of ${item.total}` : `${item.total} episode${item.total === 1 ? "" : "s"}`}</span> : null}
                {item.number === season && <Icon name="check" size={16} className="season-menu-tick" />}
              </button>
            </li>
          ))}
        </ul>
      </Popover>
    </div>
  );
}

/**
 * In a show's stub: the episode to watch next, its still across the stub with
 * a tag ("New · Episode 1180") and a tick to mark it watched (left out when the
 * stub's main button already does), then its name and length under it.
 */
export function UpNextRow({ tmdbId, air, code, fallbackImage = "", onWatched, tick }: {
  tmdbId: string | undefined;
  air: UpNext;
  /** "S1 E4", or "Episode 1180" for a show numbered through its whole run. */
  code: string;
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
  const aired = info?.airDate || air.date;
  const meta = [
    info?.runtimeMinutes ? formatRuntime(info.runtimeMinutes) : "",
    aired ? `Aired ${new Date(`${readerDate(aired)}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""
  ].filter(Boolean).join(" · ");
  return (
    <div className="tp-upnext">
      <div className={`tp-upnext-still ${still && !stillFailed ? "" : "is-empty"}`}>
        {still && !stillFailed && <img src={still} alt="" loading="lazy" decoding="async" onError={() => setStillFailed(true)} />}
        <span className="tp-upnext-tag">{air.state === "new" ? "New" : "Up next"} · {code}</span>
        {tick && (
          <button type="button" className="tp-upnext-tick" onClick={onWatched} aria-label={`Mark ${code} watched`} title="Mark watched">
            <Icon name="check" size={20} />
          </button>
        )}
      </div>
      <div className="tp-upnext-text">
        <b>{realName(info?.name || air.name, air.episode)}</b>
        {meta && <span className="tp-upnext-meta">{meta}</span>}
      </div>
    </div>
  );
}

/**
 * How far through you are: "3 of 16 · 19%", with a thin bar. A very long show
 * counts the season you're in instead ("This season · Elbaph"), since 20 of
 * 1,180 says nothing.
 */
export function SeriesProgress({ seen, total, label = "Series progress" }: { seen: number; total: number; label?: string }) {
  const percent = Math.min(100, Math.round((seen / total) * 100));
  return (
    <div className="tp-series">
      <div className="tp-series-head">
        <span>{label}</span>
        <b>{seen} of {total} · {percent}%</b>
      </div>
      <div className="tp-series-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={seen} aria-valuetext={`${seen} of ${total} episodes watched`}>
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/**
 * A season as a strip of stills, headed by its number, episode range, name and
 * how many you've watched, with a picker for the other seasons. Watched ones
 * are dimmed with a tick, the next one outlined, the rest ready to tick. It
 * opens at the next episode.
 */
export function EpisodeStrip({ movie, season, seasonName, seasons = [], onSeason, upNext, onDismiss }: {
  movie: Movie;
  season: number;
  seasonName?: string;
  /** Every season, for the picker. */
  seasons?: SeasonChoice[];
  onSeason?: (season: number) => void;
  /** The next episode's number in this season, outlined and scrolled to (0: none in this season). */
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

  // Open at the next episode, with one watched one before it for context; another season opens at its start.
  useLayoutEffect(() => {
    const list = row.current;
    if (!list) return;
    const next = list.querySelector<HTMLElement>(".ep-card.is-next");
    const before = next?.previousElementSibling as HTMLElement | null;
    list.scrollLeft = next ? Math.max(0, (before ?? next).offsetLeft - list.offsetLeft) : 0;
  }, [episodes, upNext]);

  if (failed) return null;
  const aired = episodes ? episodesAired(episodes, localIsoDate()) : [];
  const watched = episodes ? episodes.filter((episode) => seen.has(`${season}:${episode.number}`)).length : 0;
  const named = Boolean(seasonName && !/^season \d+$/i.test(seasonName));
  const label = named ? seasonName! : `Season ${season}`;
  const range = episodes?.length ? `Episodes ${episodes[0].number}–${episodes[episodes.length - 1].number}` : "";
  const eyebrow = [named ? `Season ${season}` : "", range].filter(Boolean).join(" · ");

  return (
    <div className="ep-strip">
      <div className="rail-head ep-strip-head">
        <div>
          {eyebrow && <p className="section-label">{eyebrow}</p>}
          <h2 className="ep-strip-title">{label} {episodes && <span className="count">{watched} of {episodes.length} watched</span>}</h2>
        </div>
        <div className="ep-strip-tools">
          {seasons.length > 1 && onSeason && <SeasonPicker season={season} seasons={seasons} onSeason={onSeason} />}
          <ScrollArrows target={row} label={`${label} episodes`} watch={episodes?.length} />
        </div>
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
                {next && onDismiss && <button type="button" className="ep-dismiss" onClick={onDismiss}>Not now</button>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
