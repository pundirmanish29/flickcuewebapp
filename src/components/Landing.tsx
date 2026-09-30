import { useEffect, useState } from "react";
import { EXTENSION_URL } from "../lib/config";
import { safeImage } from "../lib/safe";
import { TALK_OF_THE_TOWN } from "../lib/shelves";
import { connect } from "../lib/store";
import { browse } from "../lib/tmdb";
import { Icon } from "./Icon";

// Empty until the Android app has a public listing; the page then says "coming soon".
const ANDROID_URL = "";

/** A phone or tablet, where the Chrome extension can't be installed. */
const onPhone = () => typeof navigator !== "undefined" && /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);

/** A screenshot of the web app: the phone-shaped one on narrow screens. */
function Shot({ name, alt, eager = false }: { name: string; alt: string; eager?: boolean }) {
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

function Actions({ tone = "lime" }: { tone?: "lime" | "ink" }) {
  const phone = onPhone();
  return (
    <>
      <div className="button-row landing-actions">
        <button type="button" className={`button ${tone === "lime" ? "button-lime" : "button-ink"} large`} onClick={() => void connect()}>
          Sign in with Google
        </button>
        {!phone && (
          <a className={`button large ${tone === "lime" ? "button-outline-light" : "button-outline-ink"}`} href={EXTENSION_URL} target="_blank" rel="noreferrer">
            <Icon name="plus" size={17} /> Add to Chrome
          </a>
        )}
      </div>
      {phone && (
        <p className="landing-note">
          On your computer? <a href={EXTENSION_URL} target="_blank" rel="noreferrer">Add FlickCue to Chrome</a> to save from any page.
        </p>
      )}
    </>
  );
}

const PRIVACY = "Your list lives in your own Google Drive. FlickCue can't see anything else in it, and there's no account with us.";

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
      .then(({ items }) => live && setPosters(items.map((item) => safeImage(item.poster)).filter(Boolean).slice(0, 18)))
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
  );
}

const STEPS = [
  { word: "Save it.", text: "One click on a review, a trailer or a streaming page with the Chrome extension. Or from Discover, or by hand." },
  { word: "Remember it.", text: "One list, kept in your own Google Drive, the same on the web, in Chrome and on Android." },
  { word: "Watch it.", text: "A reminder for tonight, the weekend or release day, and a pick when you can't decide." }
] as const;

const SHOWS = [
  {
    shot: "queue",
    alt: "The FlickCue queue: tonight's pick, what's due and the shows you're watching",
    title: "Tonight, decided.",
    text: "Your queue opens on one pick, with what's due and the shows you're partway through right underneath."
  },
  {
    shot: "title",
    alt: "FlickCue title details: next episode tomorrow, where to watch, and episode progress",
    title: "Know what's next.",
    text: "Mark a show as Watching and FlickCue keeps up: the next episode and when it airs, the ones you've seen, and where to stream it in your country."
  },
  {
    shot: "discover",
    alt: "FlickCue Discover: what's in cinemas and coming soon, and where to stream",
    title: "Find something good.",
    text: "The cinema first, then what's on Netflix, Prime Video, JioHotstar or Apple TV, and picks based on what you've saved."
  },
  {
    shot: "alerts",
    alt: "FlickCue notifications: reminders due and new seasons out",
    title: "A nudge, on time.",
    text: "Hear when a new season or episode of something you watch is out, and when a reminder comes due."
  }
] as const;

/** The signed-out home page: a headline over what's playing, how it works, the app, and a way in. */
export function Landing() {
  return (
    <div className="landing">
      <section className="landing-hero">
        <PosterWall />
        <div className="wrap landing-hero-inner">
          <h1>
            <span>One watchlist.</span>
            <em>Everywhere.</em>
          </h1>
          <p className="landing-lede">Save films and shows from anywhere, see what's next for the ones you're watching, and get a nudge when it's time to watch.</p>
          <Actions />
          <p className="landing-privacy">{PRIVACY}</p>
        </div>
      </section>

      <section className="landing-steps" aria-labelledby="steps-title">
        <div className="wrap">
          <h2 id="steps-title" className="visually-hidden">How it works</h2>
          <ol>
            {STEPS.map((step) => (
              <li key={step.word}>
                <span className="landing-step-word">{step.word}</span>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="landing-show" aria-labelledby="show-title">
        <div className="wrap">
          <h2 id="show-title" className="visually-hidden">The app</h2>
          {SHOWS.map((item, index) => (
            <article key={item.shot} className="landing-show-item">
              <div className="landing-show-text">
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
              <figure className="landing-shot"><Shot name={item.shot} alt={item.alt} eager={index === 0} /></figure>
            </article>
          ))}
          <article className="landing-show-item">
            <div className="landing-show-text">
              <h3>Save it from any page.</h3>
              <p>With the FlickCue Chrome extension, one click on a review, trailer or streaming page adds the film or show to your list.</p>
              <p><a href={EXTENSION_URL} target="_blank" rel="noreferrer">Add to Chrome</a></p>
            </div>
            <figure className="landing-shot">
              <img src="./flickcue-extension-04.webp" alt="The FlickCue save card on a film page, with a Want to watch button" width={1280} height={800} loading="lazy" decoding="async" />
            </figure>
          </article>
        </div>
      </section>

      <section className="landing-cta" aria-labelledby="cta-title">
        <div className="wrap landing-cta-inner">
          <h2 id="cta-title">Your next great watch deserves better than a screenshot.</h2>
          <Actions tone="ink" />
          <p className="landing-cta-note">
            {ANDROID_URL ? <a href={ANDROID_URL} target="_blank" rel="noreferrer">Get the Android app</a> : "Android app coming soon"}
            {" · "}<a href="./privacy.html">Privacy</a>
          </p>
        </div>
      </section>
    </div>
  );
}
