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
  /** The city centre, for "nearest cinemas" showtimes. A typed city has none. */
  lat?: number;
  lng?: number;
}

export const INDIAN_CITIES: City[] = [
  { id: "delhi-ncr", name: "Delhi NCR", district: "delhi-ncr", bookmyshow: "national-capital-region-ncr", lat: 28.6139, lng: 77.209 },
  { id: "mumbai", name: "Mumbai", district: "mumbai", bookmyshow: "mumbai", lat: 19.076, lng: 72.8777 },
  { id: "bengaluru", name: "Bengaluru", district: "bengaluru", bookmyshow: "bengaluru", lat: 12.9716, lng: 77.5946 },
  { id: "hyderabad", name: "Hyderabad", district: "hyderabad", bookmyshow: "hyderabad", lat: 17.385, lng: 78.4867 },
  { id: "chennai", name: "Chennai", district: "chennai", bookmyshow: "chennai", lat: 13.0827, lng: 80.2707 },
  { id: "kolkata", name: "Kolkata", district: "kolkata", bookmyshow: "kolkata", lat: 22.5726, lng: 88.3639 },
  { id: "pune", name: "Pune", district: "pune", bookmyshow: "pune", lat: 18.5204, lng: 73.8567 },
  { id: "ahmedabad", name: "Ahmedabad", district: "ahmedabad", bookmyshow: "ahmedabad", lat: 23.0225, lng: 72.5714 },
  { id: "jaipur", name: "Jaipur", district: "jaipur", bookmyshow: "jaipur", lat: 26.9124, lng: 75.7873 },
  { id: "lucknow", name: "Lucknow", district: "lucknow", bookmyshow: "lucknow", lat: 26.8467, lng: 80.9462 },
  { id: "chandigarh", name: "Chandigarh", district: "chandigarh", bookmyshow: "chandigarh", lat: 30.7333, lng: 76.7794 },
  { id: "kochi", name: "Kochi", district: "kochi", bookmyshow: "kochi", lat: 9.9312, lng: 76.2673 },
  { id: "gurgaon", name: "Gurugram", district: "gurgaon", bookmyshow: "national-capital-region-ncr", lat: 28.4595, lng: 77.0266 },
  { id: "noida", name: "Noida", district: "noida", bookmyshow: "national-capital-region-ncr", lat: 28.5355, lng: 77.391 },
  { id: "indore", name: "Indore", district: "indore", lat: 22.7196, lng: 75.8577 },
  { id: "bhopal", name: "Bhopal", district: "bhopal", lat: 23.2599, lng: 77.4126 },
  { id: "surat", name: "Surat", district: "surat", lat: 21.1702, lng: 72.8311 },
  { id: "nagpur", name: "Nagpur", district: "nagpur", lat: 21.1458, lng: 79.0882 },
  { id: "coimbatore", name: "Coimbatore", district: "coimbatore", lat: 11.0168, lng: 76.9558 },
  { id: "vizag", name: "Visakhapatnam", district: "vizag", lat: 17.6868, lng: 83.2185 },
  { id: "vijayawada", name: "Vijayawada", district: "vijayawada", lat: 16.5062, lng: 80.648 },
  { id: "goa", name: "Goa", district: "goa", lat: 15.4909, lng: 73.8278 },
  { id: "guwahati", name: "Guwahati", district: "guwahati", lat: 26.1445, lng: 91.7362 },
  { id: "patna", name: "Patna", district: "patna", lat: 25.5941, lng: 85.1376 },
  { id: "dehradun", name: "Dehradun", district: "dehradun", lat: 30.3165, lng: 78.0322 },
  { id: "thiruvananthapuram", name: "Thiruvananthapuram", district: "thiruvananthapuram", lat: 8.5241, lng: 76.9366 },
  { id: "mysuru", name: "Mysuru", district: "mysuru", lat: 12.2958, lng: 76.6394 },
  { id: "bhubaneswar", name: "Bhubaneswar", district: "bhubaneswar", lat: 20.2961, lng: 85.8245 }
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
