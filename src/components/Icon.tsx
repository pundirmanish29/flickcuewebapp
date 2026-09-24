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
  check: ["m5 12.5 4.5 4.5L19 7.5"],
  search: ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z", "m20 20-4-4"],
  close: ["M6 6l12 12", "M18 6 6 18"],
  sync: ["M4 12a8 8 0 0 1 13.7-5.6L20 8.5", "M20 4v4.5h-4.5", "M20 12a8 8 0 0 1-13.7 5.6L4 15.5", "M4 20v-4.5h4.5"],
  star: ["m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z"],
  play: ["M7 4.5v15l12-7.5Z"],
  external: ["M14 4h6v6", "M20 4l-9 9", "M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"],
  compass: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "m15.5 8.5-2 5-5 2 2-5Z"],
  queue: ["M4 6h16", "M4 12h16", "M4 18h10"],
  gear: ["M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z", "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"],
  bell: ["M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15Z", "M10 20.5a2 2 0 0 0 4 0"],
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
