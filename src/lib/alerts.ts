// Whether this device can show FlickCue's alerts, for Settings and the
// Notifications page to say the same thing.

export type AlertSupport = "supported" | "home-screen" | "unsupported";

/** iOS allows a site's notifications only once it's added to the home screen. */
export function alertSupport(): AlertSupport {
  if (typeof window === "undefined") return "unsupported";
  if (typeof (window as { Notification?: unknown }).Notification === "function") return "supported";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
  return ios && !standalone ? "home-screen" : "unsupported";
}
