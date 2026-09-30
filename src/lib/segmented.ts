// A thumb that slides behind the pressed button of every segmented control (the
// All / Films / Shows switches, the theme choice, the cinema toggle). The page's
// own markup doesn't change: this reads which button is pressed, sets where the
// thumb goes as CSS variables (--thumb-x, --thumb-w), and styles.css moves it
// with a spring. Before the first measurement, and without script, the pressed
// button just has its own background.

const SELECTOR = ".segmented, .am-seg";

function place(control: HTMLElement) {
  const pressed = control.querySelector<HTMLElement>('[aria-pressed="true"]');
  if (!pressed) {
    control.style.setProperty("--thumb-w", "0px");
    return;
  }
  control.style.setProperty("--thumb-x", `${pressed.offsetLeft}px`);
  control.style.setProperty("--thumb-w", `${pressed.offsetWidth}px`);
  if (!control.hasAttribute("data-thumb")) {
    // Placed first without a transition, so it doesn't slide in from the corner on load.
    control.setAttribute("data-thumb", "");
    requestAnimationFrame(() => requestAnimationFrame(() => control.setAttribute("data-thumb", "ready")));
  }
}

export function initSegmented() {
  if (typeof document === "undefined") return;
  let queued = false;
  const run = () => {
    queued = false;
    document.querySelectorAll<HTMLElement>(SELECTOR).forEach(place);
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
  };
  new MutationObserver(schedule).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-pressed"] });
  window.addEventListener("resize", schedule);
  void document.fonts?.ready.then(schedule);
  schedule();
}
