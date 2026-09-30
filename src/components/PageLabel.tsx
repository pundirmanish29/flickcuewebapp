import { useEffect, useRef, useState } from "react";

/** The signed-in pages in the order the dock lists them, so moving between them has a direction. */
export const ROUTE_ORDER = ["queue", "discover", "watched", "settings", "notifications"] as const;

/** Which way a move between two pages goes: toward the later one is forward. */
export const directionBetween = (from: string, to: string): "forward" | "back" =>
  ROUTE_ORDER.indexOf(to as (typeof ROUTE_ORDER)[number]) >= ROUTE_ORDER.indexOf(from as (typeof ROUTE_ORDER)[number]) ? "forward" : "back";

/**
 * The page's name in the phone header. When the page changes, the old name slides out
 * and the new one slides in from the side you're heading toward (CSS, styles.css).
 */
export function PageLabel({ route, text }: { route: string; text: string }) {
  const [shown, setShown] = useState({ text, previous: "", direction: 1, key: 0 });
  const lastRoute = useRef(route);

  useEffect(() => {
    if (text === shown.text) return;
    const direction = directionBetween(lastRoute.current, route) === "forward" ? 1 : -1;
    lastRoute.current = route;
    setShown((current) => ({ text, previous: current.text, direction, key: current.key + 1 }));
    const timer = window.setTimeout(() => setShown((current) => ({ ...current, previous: "" })), 700);
    return () => window.clearTimeout(timer);
  }, [text, route]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span className="page-label" style={{ ["--dir" as string]: shown.direction }} role="status">
      {shown.previous && <span key={`out-${shown.key}`} className="label-out" aria-hidden="true">{shown.previous}</span>}
      <span key={`in-${shown.key}`} className={`label-in ${shown.key === 0 ? "is-first" : ""}`}>{shown.text}</span>
    </span>
  );
}
