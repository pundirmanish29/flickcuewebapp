import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { reducedMotion } from "../lib/motion";
import { Icon, type IconName } from "./Icon";

export interface SwipeAction {
  label: string;
  icon: IconName;
  run: () => void;
}

interface Drag {
  x: number;
  y: number;
  id: number;
  on: boolean;
  offset: number;
  armed: boolean;
}

/**
 * A list row you can swipe: left runs `left`, right runs `right`, and a direction with no
 * action doesn't move at all. The card follows the finger and a coloured strip with the
 * action's name shows underneath; past a third of the way it is armed (the icon swells,
 * a phone gives a tick), and letting go runs it. Short of that the card springs back.
 * Vertical scrolling is untouched (touch-action: pan-y), and everything a swipe does
 * also has a button inside the card for anyone who doesn't swipe.
 */
export function SwipeRow({ className = "", style, left, right, children }: {
  className?: string;
  style?: CSSProperties;
  left?: SwipeAction;
  right?: SwipeAction;
  children: ReactNode;
}) {
  const row = useRef<HTMLLIElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  const threshold = () => Math.min(120, (card.current?.offsetWidth ?? 300) * 0.32);
  const still = () => {
    const element = row.current;
    if (!element) return;
    delete element.dataset.side;
    delete element.dataset.armed;
    element.style.removeProperty("--pull");
  };

  const onDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Buttons in the card's action strip are just buttons.
    if (event.button !== 0 || (event.target as Element).closest(".notification-actions")) return;
    drag.current = { x: event.clientX, y: event.clientY, id: event.pointerId, on: false, offset: 0, armed: false };
  };

  const onMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    const element = card.current;
    if (!current || !element || event.pointerId !== current.id) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.on) {
      // Mostly downward or upward: it's a scroll, so let go of it.
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        drag.current = null;
        return;
      }
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      if (!(dx < 0 ? left : right)) return;
      current.on = true;
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // A pointer that has already gone: the drag still follows the events it does get.
      }
      element.style.transition = "none";
      element.dataset.dragging = "";
    }
    const limit = threshold();
    // Past the arming point the card gives more slowly, so it feels like it is on a spring.
    const allowed = dx < 0 ? (left ? dx : 0) : (right ? dx : 0);
    const size = Math.abs(allowed);
    const offset = Math.sign(allowed) * (size > limit ? limit + (size - limit) * 0.35 : size);
    current.offset = offset;
    element.style.transform = `translateX(${offset}px)`;
    const armed = Math.abs(offset) >= limit;
    if (armed !== current.armed) {
      current.armed = armed;
      if (armed) navigator.vibrate?.(8);
    }
    if (row.current) {
      row.current.dataset.side = offset > 0 ? "right" : "left";
      row.current.style.setProperty("--pull", String(Math.min(Math.abs(offset) / limit, 1)));
      if (armed) row.current.dataset.armed = "";
      else delete row.current.dataset.armed;
    }
  };

  const onEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    const element = card.current;
    drag.current = null;
    if (!current?.on || !element) return;
    delete element.dataset.dragging;
    if (element.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture(event.pointerId);
    // What was a drag isn't a tap on whatever is under the finger.
    const stop = (click: Event) => click.stopPropagation();
    element.addEventListener("click", stop, { capture: true, once: true });
    window.setTimeout(() => element.removeEventListener("click", stop, { capture: true }), 60);

    const action = current.armed && event.type !== "pointercancel" ? (current.offset < 0 ? left : right) : undefined;
    const quick = reducedMotion();
    if (action) {
      const away = (current.offset < 0 ? -1 : 1) * (element.offsetWidth + 24);
      element.style.transition = quick ? "none" : "transform 240ms cubic-bezier(0.5, 0, 0.75, 0), opacity 240ms ease";
      element.style.transform = `translateX(${away}px)`;
      element.style.opacity = "0";
      window.setTimeout(() => {
        action.run();
        // If the row is still here (the action left it in place), bring it back.
        window.setTimeout(() => {
          if (!card.current) return;
          card.current.style.transition = quick ? "none" : "transform 420ms var(--ease-spring), opacity 240ms ease";
          card.current.style.transform = "";
          card.current.style.opacity = "";
          still();
        }, 350);
      }, quick ? 0 : 220);
    } else {
      element.style.transition = quick ? "none" : "transform 520ms var(--ease-spring)";
      element.style.transform = "";
      still();
    }
  };

  return (
    <li className="swipe-row" ref={row}>
      {right && (
        <div className="swipe-bg swipe-right" aria-hidden="true">
          <Icon name={right.icon} size={20} /><span>{right.label}</span>
        </div>
      )}
      {left && (
        <div className="swipe-bg swipe-left" aria-hidden="true">
          <span>{left.label}</span><Icon name={left.icon} size={20} />
        </div>
      )}
      <div ref={card} className={className} style={style} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onEnd} onPointerCancel={onEnd}>
        {children}
      </div>
    </li>
  );
}
