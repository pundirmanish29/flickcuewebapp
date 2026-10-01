import { eventIdFor } from "../lib/calendarPlan";
import { useCalendarMirrored } from "../lib/store";
import type { Movie } from "../lib/types";
import { Icon } from "./Icon";

/** A small calendar glyph on a title whose reminder is really on the person's Google Calendar (never one that is only planned). */
export function CalendarMark({ movie, label = false }: { movie: Movie; label?: boolean }) {
  const mirrored = useCalendarMirrored();
  const id = Number(movie.remindAt) > Date.now() ? eventIdFor(movie.id, Number(movie.remindAt)) : null;
  if (!id || !mirrored.includes(id)) return null;
  return (
    <span className="on-calendar" title="On your Google Calendar" {...(label ? {} : { "aria-label": "On your Google Calendar" })}>
      <Icon name="calendar" size={label ? 14 : 12} />
      {label && "On your Google Calendar"}
    </span>
  );
}
