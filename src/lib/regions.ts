export const REGIONS = [
  ["AR", "Argentina"], ["AU", "Australia"], ["AT", "Austria"], ["BE", "Belgium"],
  ["BR", "Brazil"], ["CA", "Canada"], ["CL", "Chile"], ["CO", "Colombia"],
  ["CZ", "Czechia"], ["DK", "Denmark"], ["FI", "Finland"], ["FR", "France"],
  ["DE", "Germany"], ["HK", "Hong Kong"], ["HU", "Hungary"], ["IN", "India"],
  ["ID", "Indonesia"], ["IE", "Ireland"], ["IL", "Israel"], ["IT", "Italy"],
  ["JP", "Japan"], ["MY", "Malaysia"], ["MX", "Mexico"], ["NL", "Netherlands"],
  ["NZ", "New Zealand"], ["NO", "Norway"], ["PH", "Philippines"], ["PL", "Poland"],
  ["PT", "Portugal"], ["SG", "Singapore"], ["ZA", "South Africa"], ["KR", "South Korea"],
  ["ES", "Spain"], ["SE", "Sweden"], ["CH", "Switzerland"], ["TW", "Taiwan"],
  ["TH", "Thailand"], ["TR", "Turkey"], ["GB", "United Kingdom"], ["US", "United States"]
] as const;

/** TMDB language codes for titles, overviews and taglines. */
export const LANGUAGES = [
  ["en-US", "English"], ["hi-IN", "हिन्दी (Hindi)"], ["ta-IN", "தமிழ் (Tamil)"], ["te-IN", "తెలుగు (Telugu)"],
  ["ml-IN", "മലയാളം (Malayalam)"], ["kn-IN", "ಕನ್ನಡ (Kannada)"], ["bn-IN", "বাংলা (Bengali)"], ["mr-IN", "मराठी (Marathi)"],
  ["es-ES", "Español"], ["fr-FR", "Français"], ["de-DE", "Deutsch"], ["pt-BR", "Português"],
  ["ja-JP", "日本語"], ["ko-KR", "한국어"]
] as const;

/**
 * TMDB dates an episode by where it first aired, mostly the US. For a reader in
 * India that evening arrives the next day, so their calendar runs a day on.
 */
export function airDateShiftDays(region: string): number {
  return region === "IN" ? 1 : 0;
}
