// FlickCue's motion. One authored moment: opening a title, the poster you
// pressed grows into the details sheet's poster (a view transition). Around
// it, quiet continuity (pages cross-fade) and small feedback (pop). All of it
// steps aside for prefers-reduced-motion and for browsers without the APIs.

type ViewTransition = { finished: Promise<void> };
type TransitionDocument = Document & { startViewTransition?: (update: () => void | Promise<void>) => ViewTransition };

export const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const canTransition = () => typeof document !== "undefined" && typeof (document as TransitionDocument).startViewTransition === "function" && !reducedMotion();

let running = false;
/** A transition is underway: DOM changes inside it shouldn't start another. */
export const transitionRunning = () => running;

/** Runs a DOM change as a view transition where the browser has them, else at once. */
export function transition(update: () => void | Promise<void>, kind: "page" | "title" = "page") {
  if (!canTransition() || running) {
    void update();
    return;
  }
  running = true;
  const root = document.documentElement;
  root.dataset.transition = kind;
  const done = () => {
    running = false;
    delete root.dataset.transition;
    delete root.dataset.opening;
  };
  (document as TransitionDocument).startViewTransition!(update).finished.then(done, done);
}

// The poster last pressed, to grow from when a title opens.
let pressed: { element: Element; at: number } | null = null;
if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", (event) => {
    const element = (event.target as Element | null)?.closest?.(".title-card, .radar-item, .notification, .candidate-card");
    pressed = element ? { element, at: Date.now() } : null;
  }, { capture: true });
}

const pressedPoster = (): HTMLElement | null =>
  pressed && Date.now() - pressed.at < 1500 ? pressed.element.querySelector<HTMLElement>(".poster") : null;

// Not requestAnimationFrame: the browser holds rendering while a transition waits for the DOM.
const tick = () => new Promise<void>((resolve) => window.setTimeout(resolve, 16));

/** Waits (at most about half a second) for the details sheet to be open with its poster. */
async function sheetReady() {
  for (let tries = 0; tries < 30 && !document.querySelector("dialog.sheet[open] .sheet-poster"); tries++) await tick();
  // One more beat, for the sheet's content to settle.
  await tick();
}

/** Opens a title's details, the pressed poster growing into the sheet's. */
export function openTitle(open: () => void) {
  const poster = pressedPoster();
  if (!poster || !canTransition() || running) {
    open();
    return;
  }
  poster.style.setProperty("view-transition-name", "title-poster");
  transition(async () => {
    poster.style.removeProperty("view-transition-name");
    // Named only now, so a sheet already open doesn't share the name in the old picture.
    document.documentElement.dataset.opening = "";
    open();
    await sheetReady();
  }, "title");
}

/** A small press acknowledgement: the element swells and settles. */
export function pop(element: Element | null | undefined) {
  if (!element || reducedMotion() || typeof (element as HTMLElement).animate !== "function") return;
  (element as HTMLElement).animate(
    [{ transform: "scale(1)" }, { transform: "scale(1.16)", offset: 0.4 }, { transform: "scale(1)" }],
    { duration: 280, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
  );
}
