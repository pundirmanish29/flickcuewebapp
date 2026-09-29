// Where a film is showing. No booking service offers a public showtimes API,
// so FlickCue links out: Google's showtimes box for the film in the reader's
// city, and the city's movie page on District and BookMyShow.
//
// District's city pages (/movies/<slug>-movie-tickets) were each checked to
// load. BookMyShow's (/explore/movies-<slug>) refuse automated checks, so only
// the big cities whose slugs are well established get a BookMyShow link.

export interface City {
  id: string;
  name: string;
  district?: string;
  bookmyshow?: string;
}

export const INDIAN_CITIES: City[] = [
  { id: "delhi-ncr", name: "Delhi NCR", district: "delhi-ncr", bookmyshow: "national-capital-region-ncr" },
  { id: "mumbai", name: "Mumbai", district: "mumbai", bookmyshow: "mumbai" },
  { id: "bengaluru", name: "Bengaluru", district: "bengaluru", bookmyshow: "bengaluru" },
  { id: "hyderabad", name: "Hyderabad", district: "hyderabad", bookmyshow: "hyderabad" },
  { id: "chennai", name: "Chennai", district: "chennai", bookmyshow: "chennai" },
  { id: "kolkata", name: "Kolkata", district: "kolkata", bookmyshow: "kolkata" },
  { id: "pune", name: "Pune", district: "pune", bookmyshow: "pune" },
  { id: "ahmedabad", name: "Ahmedabad", district: "ahmedabad", bookmyshow: "ahmedabad" },
  { id: "jaipur", name: "Jaipur", district: "jaipur", bookmyshow: "jaipur" },
  { id: "lucknow", name: "Lucknow", district: "lucknow", bookmyshow: "lucknow" },
  { id: "chandigarh", name: "Chandigarh", district: "chandigarh", bookmyshow: "chandigarh" },
  { id: "kochi", name: "Kochi", district: "kochi", bookmyshow: "kochi" },
  { id: "gurgaon", name: "Gurugram", district: "gurgaon", bookmyshow: "national-capital-region-ncr" },
  { id: "noida", name: "Noida", district: "noida", bookmyshow: "national-capital-region-ncr" },
  { id: "indore", name: "Indore", district: "indore" },
  { id: "bhopal", name: "Bhopal", district: "bhopal" },
  { id: "surat", name: "Surat", district: "surat" },
  { id: "nagpur", name: "Nagpur", district: "nagpur" },
  { id: "coimbatore", name: "Coimbatore", district: "coimbatore" },
  { id: "vizag", name: "Visakhapatnam", district: "vizag" },
  { id: "vijayawada", name: "Vijayawada", district: "vijayawada" },
  { id: "goa", name: "Goa", district: "goa" },
  { id: "guwahati", name: "Guwahati", district: "guwahati" },
  { id: "patna", name: "Patna", district: "patna" },
  { id: "dehradun", name: "Dehradun", district: "dehradun" },
  { id: "thiruvananthapuram", name: "Thiruvananthapuram", district: "thiruvananthapuram" },
  { id: "mysuru", name: "Mysuru", district: "mysuru" },
  { id: "bhubaneswar", name: "Bhubaneswar", district: "bhubaneswar" }
];

/** The reader's city from Settings: a listed city by id, or any other place typed by name. */
export function resolveCity(value: string): City | null {
  const text = value.trim();
  if (!text) return null;
  return INDIAN_CITIES.find((city) => city.id === text) ?? { id: text, name: text };
}

export interface ShowtimeLink {
  label: string;
  url: string;
}

/** Where to look up showtimes for a film; with no city, Google's search for the region. */
export function showtimeLinks(title: string, year: string, city: City | null, regionName: string): ShowtimeLink[] {
  const place = city?.name || regionName;
  const film = [title.replace(/\s*\(\d{4}\)$/, ""), year].filter(Boolean).join(" ");
  const links: ShowtimeLink[] = [
    { label: "Google", url: `https://www.google.com/search?q=${encodeURIComponent(`${film} showtimes in ${place}`)}` }
  ];
  if (city?.bookmyshow) links.push({ label: "BookMyShow", url: `https://in.bookmyshow.com/explore/movies-${city.bookmyshow}` });
  if (city?.district) links.push({ label: "District", url: `https://www.district.in/movies/${city.district}-movie-tickets` });
  return links;
}

/** "India", from a region code, for headings; the code itself when the browser can't name it. */
export function regionName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) || code;
  } catch {
    return code;
  }
}
