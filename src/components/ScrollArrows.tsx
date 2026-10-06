import { useEffect, useState, type RefObject } from "react";
import { Icon } from "./Icon";

/**
 * Back and on buttons for a sideways row, in place of a scrollbar. Each one
 * greys out at its end of the row. Shown only to a mouse: a finger swipes.
 */
export function ScrollArrows({ target, label, watch }: {
  target: RefObject<HTMLElement | null>;
  /** What the row is, for the buttons' names ("Scroll Cast back"). */
  label: string;
  /** Changes when the row's contents do, so the ends are measured again. */
  watch?: unknown;
}) {
  const [ends, setEnds] = useState({ start: true, end: true });

  useEffect(() => {
    const row = target.current;
    if (!row) return;
    const measure = () => setEnds({ start: row.scrollLeft <= 4, end: row.scrollLeft + row.clientWidth >= row.scrollWidth - 4 });
    measure();
    row.addEventListener("scroll", measure, { passive: true });
    const resize = new ResizeObserver(measure);
    resize.observe(row);
    return () => {
      row.removeEventListener("scroll", measure);
      resize.disconnect();
    };
  }, [target, watch]);

  const scroll = (direction: number) => {
    const row = target.current;
    row?.scrollBy({ left: direction * row.clientWidth * 0.85, behavior: "smooth" });
  };
  // A row that fits has nowhere to go.
  if (ends.start && ends.end) return null;
  return (
    <span className="shelf-arrows">
      <button type="button" className="shelf-arrow" aria-label={`Scroll ${label} back`} disabled={ends.start} onClick={() => scroll(-1)}><Icon name="back" size={16} /></button>
      <button type="button" className="shelf-arrow flip" aria-label={`Scroll ${label} on`} disabled={ends.end} onClick={() => scroll(1)}><Icon name="back" size={16} /></button>
    </span>
  );
}
