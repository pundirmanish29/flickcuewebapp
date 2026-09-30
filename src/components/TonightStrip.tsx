import { useEffect, useState } from "react";
import * as actions from "../lib/actions";
import type { TonightEntry } from "../lib/newEpisode";
import { displayTitle } from "../lib/rules";
import { safeImage } from "../lib/safe";
import { fetchEpisode, type EpisodeInfo } from "../lib/tmdb";
import { Icon } from "./Icon";
import { Poster } from "./Poster";

function Card({ entry, onOpen }: { entry: TonightEntry; onOpen: (id: string) => void }) {
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
export function TonightStrip({ entries, onOpen }: { entries: TonightEntry[]; onOpen: (id: string) => void }) {
  if (!entries.length) return null;
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
