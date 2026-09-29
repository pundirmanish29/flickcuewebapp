import { useEffect, useState } from "react";
import { reducedMotion } from "../lib/motion";
import { Icon } from "./Icon";

// Only on pages long enough to need it, and only the directions that go somewhere.
const EDGE = 400;

/** Round buttons in the corner: to the top once you've scrolled down, to the bottom while there's more below. */
export function ScrollJump() {
  const [where, setWhere] = useState({ up: false, down: false });

  useEffect(() => {
    let queued = false;
    const measure = () => {
      queued = false;
      const page = document.documentElement;
      const long = page.scrollHeight > window.innerHeight * 2;
      const next = {
        up: long && window.scrollY > EDGE,
        down: long && window.scrollY + window.innerHeight < page.scrollHeight - EDGE
      };
      setWhere((current) => (current.up === next.up && current.down === next.down ? current : next));
    };
    const onScroll = () => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(measure);
      }
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // The page grows as lists load and "Show more" adds to them.
    const growth = new ResizeObserver(onScroll);
    growth.observe(document.body);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      growth.disconnect();
    };
  }, []);

  if (!where.up && !where.down) return null;
  const go = (top: number) => window.scrollTo({ top, behavior: reducedMotion() ? "auto" : "smooth" });
  return (
    <div className="scroll-jump">
      {where.up && (
        <button type="button" className="scroll-jump-button up" onClick={() => go(0)} aria-label="Back to top" title="Back to top">
          <Icon name="chevron" size={20} />
        </button>
      )}
      {where.down && (
        <button type="button" className="scroll-jump-button" onClick={() => go(document.documentElement.scrollHeight)} aria-label="Go to the bottom" title="Go to the bottom">
          <Icon name="chevron" size={20} />
        </button>
      )}
    </div>
  );
}
