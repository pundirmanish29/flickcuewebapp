// Whether a screen is worth the original-size backdrop (a file of 1 to 2 MB where the 1280-wide copy is
// about 180 KB). Only a screen whose pixels the smaller copy can't fill, on a connection that isn't saving
// data, and never while another page covers the one the picture belongs to.

export interface ScreenFacts {
  saveData?: boolean;
  effectiveType?: string;
  /** Device pixel ratio. */
  ratio: number;
  /** Viewport width in CSS pixels. */
  width: number;
  /** A title page is open on top of the page the picture belongs to. */
  covered?: boolean;
}

/** Physical pixels across, past which the 1280-wide copy would visibly soften. */
export const SHARP_FROM_PIXELS = 1600;

export function wantsSharpPicture({ saveData, effectiveType, ratio, width, covered }: ScreenFacts): boolean {
  if (covered || saveData || /^(slow-2g|2g|3g)$/.test(effectiveType ?? "")) return false;
  return Math.min(ratio || 1, 2) * width > SHARP_FROM_PIXELS;
}

/** The facts for this browser right now. */
export function currentScreen(covered = false): ScreenFacts {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return { saveData: connection?.saveData, effectiveType: connection?.effectiveType, ratio: window.devicePixelRatio || 1, width: window.innerWidth, covered };
}
