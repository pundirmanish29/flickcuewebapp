// The signed-out page's scroll choreography, in GSAP. It is loaded only when that page is,
// and only does anything when motion is welcome: with prefers-reduced-motion the page is
// simply its layout, every word and picture in place. The hero's own entrance is plain CSS
// (landing.css), so the headline never waits for this file.
//
// Everything animates transform and opacity (and, for reveals, clip-path on a few big
// pictures). Everything is made inside one gsap.matchMedia, so it is undone when the
// query stops matching or the page goes away.

/** Starts the page's motion; the returned function undoes all of it. */
export function startLandingMotion(root: HTMLElement): () => void {
  let disposed = false;
  let undo = () => {};

  void (async () => {
    const [{ gsap }, { ScrollTrigger }] = await Promise.all([import("gsap"), import("gsap/ScrollTrigger")]);
    if (disposed) return;
    gsap.registerPlugin(ScrollTrigger);
    // The phone's address bar growing and shrinking is not a reason to re-measure everything.
    ScrollTrigger.config({ ignoreMobileResize: true });

    const q = <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector);
    const qa = <T extends Element = HTMLElement>(selector: string) => gsap.utils.toArray<T>(selector, root);
    const header = document.querySelector<HTMLElement>(".site-header");

    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();

      mm.add(
        {
          motion: "(prefers-reduced-motion: no-preference)",
          wide: "(min-width: 60em) and (min-height: 38em)",
          pointer: "(hover: hover) and (pointer: fine)"
        },
        (context) => {
          const { motion, wide, pointer } = context.conditions as { motion: boolean; wide: boolean; pointer: boolean };
          if (!motion) return;
          const cleanups: (() => void)[] = [];

          // The header pill tucks away while you read down and comes back when you scroll up.
          if (header) {
            ScrollTrigger.create({
              start: 0,
              end: "max",
              onUpdate: (self) => header.classList.toggle("is-away", self.direction === 1 && self.scroll() > 240)
            });
            cleanups.push(() => header.classList.remove("is-away"));
          }

          // Leaving the hero: the words lift away, the posters fall behind.
          const hero = q(".l-hero");
          if (hero) {
            const leave = { trigger: hero, start: "top top", end: "bottom top", scrub: true };
            gsap.to(".l-hero-inner", { yPercent: -14, opacity: 0, ease: "none", scrollTrigger: leave });
            gsap.to(".poster-wall", { yPercent: 16, ease: "none", scrollTrigger: leave });
          }

          // The ticker runs on its own, faster while you scroll, and rests when it's off screen.
          const track = q(".l-marquee-track");
          if (track) {
            const loop = gsap.to(track, { xPercent: -50, ease: "none", duration: 60, repeat: -1 });
            ScrollTrigger.create({
              trigger: ".l-marquee",
              start: "top bottom",
              end: "bottom top",
              onToggle: (self) => (self.isActive ? loop.play() : loop.pause()),
              onUpdate: (self) => {
                const boost = 1 + Math.min(Math.abs(self.getVelocity()) / 350, 5);
                gsap.to(loop, { timeScale: boost, duration: 0.25, overwrite: true, onComplete: () => void gsap.to(loop, { timeScale: 1, duration: 1.4 }) });
              }
            });
          }

          // The statement: each word from dim to bright as you read past it.
          const words = qa(".l-statement .l-word");
          if (words.length) {
            gsap.fromTo(
              words,
              { opacity: 0.14 },
              { opacity: 1, stagger: 0.1, ease: "none", scrollTrigger: { trigger: ".l-statement-text", start: "top 80%", end: "bottom 45%", scrub: true } }
            );
          }

          // Pictures are uncovered as they arrive: a rounded window opens out to its full frame while the picture settles.
          const reveal = (frame: HTMLElement) => {
            const image = frame.querySelector("img");
            const range = { trigger: frame, start: "top 92%", end: "top 30%", scrub: 0.6 };
            gsap.fromTo(frame, { clipPath: "inset(12% 7% 12% 7% round 40px)" }, { clipPath: "inset(0% 0% 0% 0% round 28px)", ease: "none", scrollTrigger: range });
            if (image) gsap.fromTo(image, { scale: 1.16 }, { scale: 1, ease: "none", scrollTrigger: range });
          };

          // The scenes: the picture opens, the big number drifts, the words settle.
          for (const scene of qa(".l-scene")) {
            const frame = scene.querySelector<HTMLElement>(".l-window");
            if (frame) reveal(frame);
            const ghost = scene.querySelector(".l-ghost");
            if (ghost) gsap.fromTo(ghost, { yPercent: 22 }, { yPercent: -22, ease: "none", scrollTrigger: { trigger: scene, start: "top bottom", end: "bottom top", scrub: true } });
            gsap.from(scene.querySelectorAll(".l-scene-copy > *"), {
              autoAlpha: 0, y: 32, duration: 0.9, ease: "expo.out", stagger: 0.09,
              scrollTrigger: { trigger: scene.querySelector(".l-scene-copy"), start: "top 82%", once: true }
            });
          }

          // How it works: pinned on a big screen, otherwise each step just settles in.
          const seq = q(".l-seq");
          const inner = q(".l-seq-inner");
          const copies = qa(".l-step-copy");
          const shots = qa(".l-step-shot");
          if (seq && inner && copies.length === shots.length && copies.length > 1) {
            if (wide) {
              const count = copies.length;
              const bar = q(".l-seq-bar");
              const label = q(".l-seq-count");
              const dots = qa(".l-step").map((step) => step.style.getPropertyValue("--dot"));
              seq.classList.add("is-pinned");
              cleanups.push(() => seq.classList.remove("is-pinned"));
              gsap.set([...copies.slice(1), ...shots.slice(1)], { autoAlpha: 0 });

              // Each step holds for a beat, then the next one trades places with it. The snap points sit where a step
              // is fully in place, never halfway through a swap.
              const HOLD = 0.6;
              const SWAP = 0.6;
              const STEP = HOLD + SWAP;
              const total = (count - 1) * STEP + HOLD;
              const steps = gsap.timeline({
                defaults: { ease: "power2.inOut" },
                scrollTrigger: {
                  trigger: inner,
                  start: "top top",
                  end: `+=${Math.round(total * 100)}%`,
                  pin: true,
                  scrub: 0.6,
                  invalidateOnRefresh: true,
                  snap: { snapTo: "labels", directional: false, duration: { min: 0.15, max: 0.5 }, delay: 0.05, ease: "power1.inOut" },
                  onUpdate: (self) => {
                    const at = self.progress * total;
                    // The step counts as changed once its swap is half done.
                    const index = at < HOLD + SWAP / 2 ? 0 : Math.min(count - 1, Math.floor((at - HOLD - SWAP / 2) / STEP) + 1);
                    if (bar) gsap.set(bar, { scaleX: (index + 1) / count });
                    if (label) label.textContent = `0${index + 1} / 0${count}`;
                    if (dots[index]) seq.style.setProperty("--dot", dots[index]);
                  }
                }
              });
              steps.addLabel("s0", 0);
              for (let i = 1; i < count; i++) {
                const at = (i - 1) * STEP + HOLD;
                steps
                  .addLabel(`s${i}`, at + SWAP)
                  .to(copies[i - 1], { autoAlpha: 0, yPercent: -12, duration: SWAP * 0.7 }, at)
                  .to(shots[i - 1], { autoAlpha: 0, scale: 0.94, xPercent: -4, duration: SWAP * 0.85 }, at)
                  .fromTo(copies[i], { autoAlpha: 0, yPercent: 12 }, { autoAlpha: 1, yPercent: 0, duration: SWAP * 0.8 }, at + SWAP * 0.2)
                  .fromTo(shots[i], { autoAlpha: 0, scale: 1.05, xPercent: 4 }, { autoAlpha: 1, scale: 1, xPercent: 0, duration: SWAP }, at);
              }
              // Hold the last step for a beat before the page moves on.
              steps.to({}, { duration: 0.001 }, total - 0.001);
            } else {
              for (const step of qa(".l-step")) {
                gsap.from(step.querySelector(".l-step-copy"), { autoAlpha: 0, y: 32, duration: 0.9, ease: "expo.out", scrollTrigger: { trigger: step, start: "top 80%", once: true } });
                const shot = step.querySelector<HTMLElement>(".l-step-shot");
                if (shot) reveal(shot);
              }
            }
          }

          // Four phones, each rising at its own pace as the row passes, so the row ripples instead of sliding as a slab.
          const phones = qa(".l-phone");
          if (phones.length) {
            gsap.fromTo(
              phones,
              { yPercent: (index: number) => 10 + index * 5 },
              { yPercent: (index: number) => -6 - index * 3, ease: "none", scrollTrigger: { trigger: ".l-reel-track", start: "top 95%", end: "bottom 15%", scrub: 0.6 } }
            );
          }

          // The three numbers rise one after another.
          gsap.from(".l-facts li", { autoAlpha: 0, y: 40, duration: 0.9, ease: "expo.out", stagger: 0.12, scrollTrigger: { trigger: ".l-facts", start: "top 82%", once: true } });
          gsap.from(".l-cta h2, .l-cta .l-actions", { autoAlpha: 0, y: 40, duration: 1, ease: "expo.out", stagger: 0.12, scrollTrigger: { trigger: ".l-cta", start: "top 70%", once: true } });

          // On a mouse, the big buttons lean toward the pointer a little.
          if (pointer) {
            for (const button of qa("[data-magnetic]")) {
              const x = gsap.quickTo(button, "x", { duration: 0.5, ease: "power3" });
              const y = gsap.quickTo(button, "y", { duration: 0.5, ease: "power3" });
              const move = (event: PointerEvent) => {
                const box = button.getBoundingClientRect();
                x((event.clientX - (box.left + box.width / 2)) * 0.22);
                y((event.clientY - (box.top + box.height / 2)) * 0.32);
              };
              const rest = () => {
                x(0);
                y(0);
              };
              button.addEventListener("pointermove", move);
              button.addEventListener("pointerleave", rest);
              cleanups.push(() => {
                button.removeEventListener("pointermove", move);
                button.removeEventListener("pointerleave", rest);
              });
            }
          }

          return () => cleanups.forEach((clean) => clean());
        }
      );

      // Fonts change how tall everything is; measure again once they're in.
      void document.fonts?.ready.then(() => {
        if (!disposed) ScrollTrigger.refresh();
      });
      undo = () => mm.revert();
    }, root);

    const revertContext = undo;
    undo = () => {
      revertContext();
      ctx.revert();
    };
  })();

  return () => {
    disposed = true;
    undo();
  };
}
