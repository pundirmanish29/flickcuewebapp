import { useEffect, type RefObject } from "react";

const CLOSE_AT = 110;

/**
 * Pulling a phone sheet down from its top drags it down and, past a point,
 * closes it, as iOS sheets do. Only a mostly-downward drag that starts with
 * the content scrolled to the top counts, so sideways rows still scroll.
 */
export function useSwipeToClose(sheet: RefObject<HTMLDialogElement | null>, scroller: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const dialog = sheet.current;
    const inner = scroller.current;
    if (!dialog || !inner || !window.matchMedia("(max-width: 600px)").matches) return;

    let startX = 0;
    let startY = 0;
    let pulling: boolean | null = null;
    let offset = 0;

    const reset = (animate: boolean) => {
      dialog.style.transition = animate ? "transform 220ms ease" : "";
      dialog.style.transform = "";
      offset = 0;
    };

    const onStart = (event: TouchEvent) => {
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      // Decided on the first move: a pull only if it starts at the top.
      pulling = inner.scrollTop <= 0 ? null : false;
    };

    const onMove = (event: TouchEvent) => {
      if (pulling === false) return;
      const dx = event.touches[0].clientX - startX;
      const dy = event.touches[0].clientY - startY;
      if (pulling === null) {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        pulling = dy > 0 && dy > Math.abs(dx) && inner.scrollTop <= 0;
        if (!pulling) return;
      }
      event.preventDefault();
      offset = Math.max(0, dy);
      dialog.style.transition = "none";
      dialog.style.transform = `translateY(${offset}px)`;
    };

    const onEnd = () => {
      if (!pulling) return;
      pulling = null;
      if (offset > CLOSE_AT) {
        dialog.style.transition = "transform 180ms ease-in";
        dialog.style.transform = "translateY(100%)";
        window.setTimeout(() => dialog.close(), 170);
      } else {
        reset(true);
      }
    };

    inner.addEventListener("touchstart", onStart, { passive: true });
    inner.addEventListener("touchmove", onMove, { passive: false });
    inner.addEventListener("touchend", onEnd);
    inner.addEventListener("touchcancel", onEnd);
    return () => {
      inner.removeEventListener("touchstart", onStart);
      inner.removeEventListener("touchmove", onMove);
      inner.removeEventListener("touchend", onEnd);
      inner.removeEventListener("touchcancel", onEnd);
      reset(false);
    };
  }, [sheet, scroller]);
}
