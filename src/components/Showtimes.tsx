import { showtimeLinks } from "../lib/cinemas";
import { useWhere } from "../lib/useCinemas";
import { Icon } from "./Icon";

/**
 * Where to see a film's showtimes: Google for the reader's city (or region),
 * plus the city's page on BookMyShow and District when the city is known.
 */
export function ShowtimeLinks({ title, year }: { title: string; year?: string }) {
  const { city, regionLabel } = useWhere();
  const links = showtimeLinks(title, year || "", city, regionLabel);
  return (
    <>
      <div className="showtime-links">
        {links.map((link) => (
          <a key={link.label} className="link-chip" href={link.url} target="_blank" rel="noreferrer">
            <Icon name="external" size={14} /> {link.label}
          </a>
        ))}
      </div>
      {!city && (
        <p className="showtime-hint">
          Showtimes for {regionLabel}. <a href="#/settings">Set your city</a> to see what's on near you.
        </p>
      )}
    </>
  );
}
