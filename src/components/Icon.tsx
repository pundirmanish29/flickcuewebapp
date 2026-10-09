// Line icons on a 24px grid, stroked in currentColor, in the same weight as
// the extension's row actions. The media-type paths are the extension's own.

const PATHS = {
  movie: [
    "M3.5 10.5h17v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-8Z",
    "M3.4 10.5 2.8 7.4a1.8 1.8 0 0 1 1.4-2.1l12.7-2.6a1.8 1.8 0 0 1 2.1 1.4l.6 3Z",
    "m7.6 4.6 2.7 3.9",
    "m13 3.5 2.7 3.9"
  ],
  show: ["M4.5 7.5h15a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2Z", "m8.5 3.5 3.5 4 3.5-4"],
  eye: ["M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"],
  eyeOff: ["M3 3l18 18", "M10.6 5.1A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1", "M6.6 6.6A16.4 16.4 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6", "M9.9 9.9a3 3 0 0 0 4.2 4.2"],
  clock: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "M12 7v5l3 2"],
  trash: ["M4 7h16", "M9 7V4.5h6V7", "M6.5 7l1 13h9l1-13", "M10 11v5.5", "M14 11v5.5"],
  plus: ["M12 5v14", "M5 12h14"],
  pause: ["M9 5v14", "M15 5v14"],
  back: ["M19 12H5", "m11 18-6-6 6-6"],
  chevron: ["m6 9 6 6 6-6"],
  sun: ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z", "M12 2.5v2", "M12 19.5v2", "M4.6 4.6l1.4 1.4", "M18 18l1.4 1.4", "M2.5 12h2", "M19.5 12h2", "M4.6 19.4 6 18", "M18 6l1.4-1.4"],
  moon: ["M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"],
  tomato: ["M12 8.5c4.4 0 7.5 2.6 7.5 6s-3.1 6-7.5 6-7.5-2.6-7.5-6 3.1-6 7.5-6Z", "M12 8.5V5.5", "M8.5 7 12 8.5 15.5 7", "M9.5 4.5 12 5.5l2.5-1"],
  popcorn: ["M5.5 9.5h13l-1.6 10.1a1 1 0 0 1-1 .9H8.1a1 1 0 0 1-1-.9Z", "M9.5 9.5 10 20.5", "M14.5 9.5 14 20.5", "M6.5 9.5a2.5 2.5 0 0 1 2.4-3.4 3 3 0 0 1 6.2 0 2.5 2.5 0 0 1 2.4 3.4"],
  heart: ["M12 20s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.2a4.4 4.4 0 0 1 7.5 2.7C19.5 15.4 12 20 12 20Z"],
  signOut: ["M9 20H5.5a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 5.5 4H9", "m16 16 4-4-4-4", "M20 12H9"],
  check: ["m5 12.5 4.5 4.5L19 7.5"],
  search: ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z", "m20 20-4-4"],
  close: ["M6 6l12 12", "M18 6 6 18"],
  sync: ["M4 12a8 8 0 0 1 13.7-5.6L20 8.5", "M20 4v4.5h-4.5", "M20 12a8 8 0 0 1-13.7 5.6L4 15.5", "M4 20v-4.5h4.5"],
  star: ["m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z"],
  play: ["M7 4.5v15l12-7.5Z"],
  external: ["M14 4h6v6", "M20 4l-9 9", "M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"],
  compass: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "m15.5 8.5-2 5-5 2 2-5Z"],
  // A bookmark: the list of things you saved (three lines read as a menu).
  queue: ["M7 3.5h10a1 1 0 0 1 1 1V21l-6-3.8L6 21V4.5a1 1 0 0 1 1-1Z"],
  gear: ["M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z", "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"],
  pin: ["M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z", "M12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"],
  globe: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "M3 12h18", "M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"],
  calendar: ["M4.5 5.5h15A1.5 1.5 0 0 1 21 7v11.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5V7a1.5 1.5 0 0 1 1.5-1.5Z", "M3 10h18", "M8 3v4", "M16 3v4"],
  ticket: ["M3.5 7.5A1.5 1.5 0 0 1 5 6h14a1.5 1.5 0 0 1 1.5 1.5v2.2a2.3 2.3 0 0 0 0 4.6v2.2A1.5 1.5 0 0 1 19 18H5a1.5 1.5 0 0 1-1.5-1.5v-2.2a2.3 2.3 0 0 0 0-4.6Z", "M14.5 6v2", "M14.5 11v2", "M14.5 16v2"],
  bell: ["M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15Z", "M10 20.5a2 2 0 0 0 4 0"],
  user: ["M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z", "M4.5 20.5a7.5 7.5 0 0 1 15 0"],
  shuffle: ["M4 7h3.5c3.5 0 5.5 10 9 10H20", "M4 17h3.5c1.4 0 2.5-1.6 3.5-3.6", "M13 10.6c1-2 2.1-3.6 3.5-3.6H20", "m17.5 4.5 2.5 2.5-2.5 2.5", "m17.5 14.5 2.5 2.5-2.5 2.5"]
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

/** The FlickCue extension's own icon, for the buttons that mean it. */
export function ExtensionIcon({ size = 22 }: { size?: number }) {
  return <img className="ext-icon" src="./flickcue-extension-icon.png" alt="" width={size} height={size} decoding="async" />;
}

/** Google's "G", in its own colours, on a white disc so it reads on any button. */
export function GoogleIcon({ size = 22 }: { size?: number }) {
  return (
    <span className="g-icon" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 48 48" width={Math.round(size * 0.64)} height={Math.round(size * 0.64)}>
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
    </span>
  );
}

/** The three-dot FlickCue mark. */
export function Logo({ size = 10 }: { size?: number }) {
  return (
    <span className="logo-dots" aria-hidden="true" style={{ ["--dot" as string]: `${size}px` }}>
      <i style={{ background: "var(--green)" }} />
      <i style={{ background: "var(--orange)" }} />
      <i style={{ background: "var(--blue)" }} />
    </span>
  );
}
