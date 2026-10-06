import { Fragment, useEffect, useRef, useState } from "react";
import "../landing.css";
import { canAskExtension } from "../lib/auth";
import { EXTENSION_URL } from "../lib/config";
import { onPhone } from "../lib/device";
import { startLandingMotion } from "../lib/landingMotion";
import { safeImage } from "../lib/safe";
import { TALK_OF_THE_TOWN } from "../lib/shelves";
import { connect, connectWithExtension } from "../lib/store";
import { browse, upscale } from "../lib/tmdb";
import { ExtensionIcon, GoogleIcon, Icon } from "./Icon";

// Empty until the Android app has a public listing; the page then says "coming soon".
const ANDROID_URL = "";

const PRIVACY = "Your list lives in your own Google Drive. FlickCue can't see anything else in it, and there's no account with us.";

type ShotName = "queue" | "title" | "discover" | "alerts";

/** A screenshot of the web app: the phone-shaped one on narrow screens. */
function Shot({ name, alt, eager = false }: { name: ShotName; alt: string; eager?: boolean }) {
  return (
    <picture>
      <source media="(max-width: 700px)" srcSet={`./home-${name}-phone.webp`} width={780} height={1688} />
      <img
        src={`./home-${name}-desktop.webp`}
        alt={alt}
        width={1600}
        height={1000}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        {...(eager ? { fetchPriority: "high" as const } : {})}
      />
    </picture>
  );
}

/**
 * The way in: one button, and under it one plain line. The extension is a nice extra, not a
 * second thing to choose between, so it only ever appears as that line. Someone who already has
 * it is offered to pick up from it, with Google as the line instead. The hero keeps that line off
 * this cluster (its extension link sits in the corner); the closing block asks with it.
 */
function Actions({ tone = "light", extensionLine = false }: { tone?: "light" | "ink"; extensionLine?: boolean }) {
  const phone = onPhone();
  // Chrome only lets a page talk to an extension that is installed and lists it, so this is "already installed".
  const installed = canAskExtension();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const primary = tone === "light" ? "button-light" : "button-ink";

  const pickUp = async () => {
    setBusy(true);
    setNote("");
    // Signed in, the page swaps to the app and this goes with it; only a miss comes back here.
    if (!(await connectWithExtension())) {
      setBusy(false);
      setNote("The extension isn't signed in yet. Open it from your toolbar to sign in, then try again.");
    }
  };

  return (
    <>
      <div className="button-row l-actions">
        {installed ? (
          <button type="button" className={`button ${primary} large`} data-magnetic onClick={() => void pickUp()} disabled={busy}>
            <ExtensionIcon /> {busy ? "Checking…" : "Pick up from the extension"}
          </button>
        ) : (
          <button type="button" className={`button ${primary} large`} data-magnetic onClick={() => void connect()}>
            <GoogleIcon /> Continue with Google
          </button>
        )}
      </div>
      {note && <p className="l-note" role="status">{note}</p>}
      {(installed || phone || extensionLine) && (
        <p className="l-note">
          {installed ? (
            <>or <button type="button" className="l-link" onClick={() => void connect()}>sign in with Google</button></>
          ) : phone ? (
            <>On your computer? <a href={EXTENSION_URL} target="_blank" rel="noreferrer">Add FlickCue to Chrome</a> to save from any page.</>
          ) : (
            <>
              <span>Want to save from any page too?</span>
              <a className="l-ext-link" href={EXTENSION_URL} target="_blank" rel="noreferrer"><ExtensionIcon size={20} /><span>Add the Chrome extension</span></a>
            </>
          )}
        </p>
      )}
    </>
  );
}

/**
 * What's on right now, as slowly drifting columns of posters behind the headline.
 * They come from the same title service the app uses; if it can't be reached the
 * hero simply stands on its own.
 */
function PosterWall() {
  const [posters, setPosters] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    browse(TALK_OF_THE_TOWN, 1)
      .then(({ items }) => live && setPosters(items.map((item) => safeImage(upscale(item.poster, "w500"))).filter(Boolean).slice(0, 18)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (posters.length < 9) return null;
  // Five columns of a few posters each; every column is shown twice so its drift loops without a jump.
  const columns = Array.from({ length: 5 }, (_, col) => posters.filter((_, index) => index % 5 === col));
  return (
    <div className="poster-wall" aria-hidden="true">
      <div className="poster-wall-tilt">
        {columns.map((column, col) => (
          <div key={col} className={`poster-col poster-col-${col}`}>
            <div className="poster-col-track">
              {[...column, ...column].map((poster, index) => (
                <img key={index} src={poster} alt="" loading={index < 3 ? "eager" : "lazy"} decoding="async" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A sentence whose words light up one by one as you scroll (landingMotion.ts). Screen readers get it whole. */
function Words({ parts }: { parts: { text: string; em?: boolean }[] }) {
  const text = parts.map((part) => part.text).join(" ");
  return (
    <>
      <span className="visually-hidden">{text}</span>
      <span aria-hidden="true">
        {parts.map((part, p) => (
          <Fragment key={p}>
            {part.text.split(" ").map((word, index) => (
              <span key={index} className={`l-word ${part.em ? "l-word-em" : ""}`}>{word} </span>
            ))}
          </Fragment>
        ))}
      </span>
    </>
  );
}

const STATEMENT = [
  { text: "Films find you in reviews, trailers and group chats." },
  { text: "FlickCue is where they wait until movie night.", em: true }
];

// The logo's three dots, one for each step.
const STEPS = [
  {
    word: "Save it.", dot: "var(--green)", text: "One click on a review, a trailer or a streaming page with the Chrome extension. Or from Discover, or by hand.",
    image: <img src="./flickcue-extension-04.webp" alt="The FlickCue save card on a film page, with a Want to watch button" width={1280} height={800} loading="lazy" decoding="async" />
  },
  {
    word: "Remember it.", dot: "var(--orange)", text: "One list, kept in your own Google Drive, the same on the web and in Chrome, and soon on Android.",
    image: <Shot name="queue" alt="The FlickCue queue: tonight's pick, what's due and the shows you're watching" />
  },
  {
    word: "Watch it.", dot: "var(--blue)", text: "A reminder for tonight, the weekend or release day, and a pick when you can't decide.",
    image: <Shot name="alerts" alt="FlickCue notifications: reminders due and new seasons out" />
  }
] as const;

const PHONES: { name: ShotName; label: string; alt: string }[] = [
  { name: "queue", label: "Tonight, decided", alt: "The FlickCue queue on a phone: tonight's pick and what's due" },
  { name: "title", label: "Know what's next", alt: "A show's details on a phone: next episode, where to watch, episode progress" },
  { name: "discover", label: "Find something good", alt: "FlickCue Discover on a phone: in cinemas, coming soon, and where to stream" },
  { name: "alerts", label: "A nudge, on time", alt: "FlickCue notifications on a phone: reminders due and new seasons out" }
];

const FACTS = [
  { value: "0", label: "accounts with us", text: "You sign in with Google. That's all." },
  { value: "0", label: "ads or trackers", text: "No analytics, nothing watching you watch." },
  { value: "1", label: "list, in your Drive", text: "The same on the web and in Chrome, and soon on Android." }
];

/** The signed-out home page: a headline over what's playing, a film's worth of scenes, and a way in. */
export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const [dock, setDock] = useState(false);
  // Offered in the story, not next to the way in; not to phones, or to someone who already has it.
  const offerExtension = !onPhone() && !canAskExtension();

  useEffect(() => (root.current ? startLandingMotion(root.current) : undefined), []);

  // On a phone the header's Sign in is out of sight after the hero: a small glass button follows you down, until the closing block has its own.
  useEffect(() => {
    const hero = root.current?.querySelector(".l-hero");
    const close = root.current?.querySelector(".l-cta");
    if (!hero || !close || typeof IntersectionObserver === "undefined") return;
    const seen = { hero: true, close: false };
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) seen[entry.target === hero ? "hero" : "close"] = entry.isIntersecting;
      setDock(!seen.hero && !seen.close);
    }, { threshold: 0.15 });
    observer.observe(hero);
    observer.observe(close);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="landing" ref={root}>
      <section className="l-hero" aria-labelledby="l-title">
        <PosterWall />
        <div className="wrap l-hero-inner">
          <h1 id="l-title">
            <span className="l-line"><span className="l-line-in">One watchlist.</span></span>
            <span className="l-line"><em className="l-line-in">Everywhere.</em></span>
          </h1>
          <p className="l-lede">Save films and shows from anywhere, see what's next for the ones you're watching, and get a nudge when it's time to watch.</p>
          <Actions />
          <p className="l-fine">{PRIVACY}</p>
        </div>
        <p className="l-scroll" aria-hidden="true">Scroll</p>
        {offerExtension && (
          <a className="l-ext" href={EXTENSION_URL} target="_blank" rel="noreferrer">
            <ExtensionIcon size={20} /><span>Get the Chrome extension</span><Icon name="external" size={14} />
          </a>
        )}
      </section>

      {/* A slow ticker between the hero and the story; it speeds up as you scroll. */}
      <div className="l-marquee" aria-hidden="true">
        <div className="l-marquee-track">
          {[0, 1].map((copy) => (
            <div key={copy} className="l-marquee-group">
              {[...STEPS, ...STEPS].map((step, index) => (
                <Fragment key={index}>
                  <span className={`l-marquee-item ${index % STEPS.length === 1 ? "is-fill" : ""}`} style={{ ["--dot" as string]: STEPS[index % STEPS.length].dot }}>{step.word}</span>
                  <span className="l-marquee-dot" style={{ background: STEPS[index % STEPS.length].dot }} />
                </Fragment>
              ))}
            </div>
          ))}
        </div>
      </div>

      <section className="l-statement" aria-label="What FlickCue is for">
        <div className="wrap">
          <p className="l-statement-text"><Words parts={STATEMENT} /></p>
        </div>
      </section>

      {/* Pinned on a big screen, one step at a time; on a phone just three blocks, one after another. */}
      <section className="l-seq" aria-labelledby="l-seq-title">
        <h2 id="l-seq-title" className="visually-hidden">How it works</h2>
        <div className="l-seq-inner">
          <ol className="l-seq-list">
            {STEPS.map((step, index) => (
              <li key={step.word} className="l-step" style={{ ["--dot" as string]: step.dot }}>
                <div className="l-step-copy">
                  <span className="l-step-no">0{index + 1}</span>
                  <span className="l-step-word">{step.word}</span>
                  <p>{step.text}</p>
                  {index === 0 && offerExtension && (
                    <p className="l-step-link"><a href={EXTENSION_URL} target="_blank" rel="noreferrer"><ExtensionIcon size={18} /> Add to Chrome</a></p>
                  )}
                </div>
                <figure className="l-step-shot">{step.image}</figure>
              </li>
            ))}
          </ol>
          <div className="l-seq-meter" aria-hidden="true">
            <span className="l-seq-track"><span className="l-seq-bar" /></span>
            <span className="l-seq-count">01 / 0{STEPS.length}</span>
          </div>
        </div>
      </section>

      <section className="l-scene" aria-labelledby="l-scene-a">
        <div className="wrap l-scene-grid">
          <p className="l-ghost" aria-hidden="true">01</p>
          <div className="l-scene-copy">
            <p className="l-eyebrow" style={{ ["--tone" as string]: "var(--blue)" }}>Shows you follow</p>
            <h2 id="l-scene-a">Know what's next.</h2>
            <p>Mark a show as Watching and FlickCue keeps up: the next episode and when it airs, the ones you've seen, and where to stream it in your country.</p>
          </div>
          <figure className="l-window">
            <Shot name="title" alt="FlickCue title details: next episode tomorrow, where to watch, and episode progress" />
          </figure>
        </div>
      </section>

      <section className="l-scene l-scene-flip" aria-labelledby="l-scene-b">
        <div className="wrap l-scene-grid">
          <p className="l-ghost" aria-hidden="true">02</p>
          <div className="l-scene-copy">
            <p className="l-eyebrow" style={{ ["--tone" as string]: "var(--orange)" }}>Tonight's search</p>
            <h2 id="l-scene-b">Find something good.</h2>
            <p>The cinema first, then what's on Netflix, Prime Video, JioHotstar or Apple TV, and picks based on what you've saved.</p>
          </div>
          <figure className="l-window">
            <Shot name="discover" alt="FlickCue Discover: what's in cinemas and coming soon, and where to stream" />
          </figure>
        </div>
      </section>

      <section className="l-reel" aria-labelledby="l-reel-title">
        <div className="l-reel-pin">
          <div className="wrap l-reel-head">
            <p className="l-eyebrow" style={{ ["--tone" as string]: "var(--orange)" }}>On your phone</p>
            <h2 id="l-reel-title">Made for the couch.</h2>
            <p>Most nights you'll open FlickCue on your phone, so that's where it started.</p>
          </div>
          <ul className="l-reel-track">
            {PHONES.map((phone) => (
              <li key={phone.name} className="l-phone">
                <figure>
                  <img src={`./home-${phone.name}-phone.webp`} alt={phone.alt} width={780} height={1688} loading="lazy" decoding="async" />
                  <figcaption>{phone.label}</figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="l-privacy" aria-labelledby="l-privacy-title">
        <div className="wrap">
          <p className="l-eyebrow">Yours</p>
          <h2 id="l-privacy-title">Your list stays yours.</h2>
          <ul className="l-facts">
            {FACTS.map((fact) => (
              <li key={fact.label}>
                <b>{fact.value}</b>
                <span>{fact.label}</span>
                <p>{fact.text}</p>
              </li>
            ))}
          </ul>
          <p className="l-fine">{PRIVACY}</p>
        </div>
      </section>

      <section className="l-cta" aria-labelledby="l-cta-title">
        <div className="wrap l-cta-inner">
          <span className="l-dots" aria-hidden="true"><i /><i /><i /></span>
          <h2 id="l-cta-title">Your next great watch deserves better than a screenshot.</h2>
          <Actions tone="ink" extensionLine />
          <p className="l-cta-note">
            {ANDROID_URL ? <a href={ANDROID_URL} target="_blank" rel="noreferrer">Get the Android app</a> : "Android app coming soon"}
            {" · "}<a href="./privacy.html">Privacy</a>
          </p>
          <nav className="l-cta-note l-guides" aria-label="Guides">
            <a href="./guides/movie-watchlist-app/">Watchlist app</a>
            <a href="./guides/movie-release-reminders/">Release reminders</a>
            <a href="./guides/save-movies-from-any-page/">Save from any page</a>
            <a href="./guides/where-to-watch-and-cinema-showtimes/">Where to watch</a>
            <a href="./guides/watchlist-without-an-account/">No account</a>
          </nav>
        </div>
      </section>

      <div className={`l-dock glass ${dock ? "is-on" : ""}`} aria-hidden={!dock}>
        <button type="button" className="button button-light" tabIndex={dock ? 0 : -1} onClick={() => void connect()}><GoogleIcon /> Sign in with Google</button>
      </div>
    </div>
  );
}
