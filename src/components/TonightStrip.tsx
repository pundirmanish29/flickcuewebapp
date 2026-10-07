import { useEffect, useState, type Ref } from "react";
import * as actions from "../lib/actions";
import type { TonightEntry } from "../lib/newEpisode";
import { cardLine, displayTitle } from "../lib/rules";
import type { Movie } from "../lib/types";
import { safeImage } from "../lib/safe";
import { fetchEpisode, upscale, type EpisodeInfo } from "../lib/tmdb";
import { Icon } from "./Icon";
import { Poster } from "./Poster";
import { CalendarMark } from "./CalendarMark";

function Card({ entry, onOpen, compact = false }: { entry: TonightEntry; onOpen: (id: string) => void; compact?: boolean }) {
  const { movie, season, episode, state } = entry;
  const [info, setInfo] = useState<EpisodeInfo | null>(null);
  useEffect(() => {
    let live = true;
    fetchEpisode(movie.tmdbId, season, episode).then((result) => live && setInfo(result)).catch(() => {});
    return () => {
      live = false;
    };
  }, [movie.tmdbId, season, episode]);

  const still = safeImage(info?.still);
  const name = info?.name && !/^episode \d+$/i.test(info.name) ? info.name : "";
  const title = displayTitle(movie);
  if (compact) return (
    <li className="due-episode-card">
      <button type="button" className="radar-item" onClick={() => onOpen(movie.id)} aria-label={`${title}, season ${season} episode ${episode}${name ? `, ${name}` : ""}. Open`}>
        <Poster src={upscale(movie.poster, "w185")} retina={upscale(movie.poster, "w342")} title={movie.title} className="radar-poster" />
        <span className="radar-text">
          <span className="radar-when tone-due">{state === "out" ? "Out now" : "Today"}</span>
          <span className="radar-title">{title}</span>
          <span className="radar-sub">S{season} E{episode}{name ? ` · ${name}` : ""}</span>
        </span>
      </button>
      {state === "out" && <button type="button" className="tonight-watched" onClick={() => actions.toggleEpisode(movie.id, season, episode)} aria-label={`Mark ${title} season ${season} episode ${episode} watched`} title="Mark watched"><Icon name="check" size={15} /></button>}
    </li>
  );
  return (
    <li className="tonight-card">
      <button type="button" className="tonight-card-open" onClick={() => onOpen(movie.id)} aria-label={`${title}, season ${season} episode ${episode}${name ? `, ${name}` : ""}. Open`}>
        <span className={`tonight-card-still ${still ? "" : "no-still"}`}>
          {still ? <img src={still} alt="" loading="lazy" decoding="async" /> : <Poster src={movie.poster} title={movie.title} className="tonight-card-poster" />}
          <span className={`tonight-tag ${state}`}>{state === "out" ? "Out now" : "Today"}</span>
        </span>
        <span className="tonight-card-text">
          <b>{title}</b>
          <span>S{season} E{episode}{name ? ` · ${name}` : ""}</span>
        </span>
      </button>
      {state === "out" && (
        <button type="button" className="tonight-watched" onClick={() => actions.toggleEpisode(movie.id, season, episode)} aria-label={`Mark ${title} season ${season} episode ${episode} watched`} title="Mark watched">
          <Icon name="check" size={15} />
        </button>
      )}
    </li>
  );
}

/** Episodes of the shows you follow that air, or came out, today: a strip above the rest of the Queue's rows. */
export function TonightStrip({ entries, onOpen, embedded = false, reminders = [], listRef }: { entries: TonightEntry[]; onOpen: (id: string) => void; embedded?: boolean; reminders?: Movie[]; listRef?: Ref<HTMLUListElement> }) {
  if (!entries.length && !reminders.length) return null;
  if (embedded) return <ul className="radar-list due-list" ref={listRef}>
    {entries.map(entry => <Card key={`${entry.movie.id}:${entry.season}:${entry.episode}`} entry={entry} onOpen={onOpen} compact />)}
    {reminders.map(movie => <li key={movie.id}>
      <button type="button" className="radar-item" onClick={() => onOpen(movie.id)}>
        <Poster src={upscale(movie.poster, "w185")} retina={upscale(movie.poster, "w342")} title={movie.title} className="radar-poster" />
        <span className="radar-text">
          <span className="radar-when tone-due">{cardLine(movie)}<CalendarMark movie={movie} /></span>
          <span className="radar-title">{displayTitle(movie)}</span>
        </span>
      </button>
    </li>)}
  </ul>;
  return (
    <section className="paper radar tonight-strip" aria-labelledby="on-tonight-title">
      <div className="wrap">
        <h2 id="on-tonight-title" className="section-title">On tonight <span className="count">{entries.length}</span></h2>
        <ul className="tonight-list">
          {entries.map((entry) => <Card key={`${entry.movie.id}:${entry.season}:${entry.episode}`} entry={entry} onOpen={onOpen} />)}
        </ul>
      </div>
    </section>
  );
}
