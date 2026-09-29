import { useEffect, useState } from "react";
import { regionName, resolveCity, type City } from "./cinemas";
import { useAppState } from "./store";
import { inCinemasNow } from "./tmdb";

/** The films in cinemas in the reader's region, or null while that's being looked up. */
export function useInCinemas(): Set<string> | null {
  const { settings } = useAppState();
  const region = settings.region || "IN";
  const [keys, setKeys] = useState<Set<string> | null>(null);
  useEffect(() => {
    let live = true;
    setKeys(null);
    void inCinemasNow(region).then((found) => live && setKeys(found));
    return () => {
      live = false;
    };
  }, [region]);
  return keys;
}

/** The reader's city if set, and a name for where they are either way ("Delhi NCR", or "India"). */
export function useWhere(): { city: City | null; place: string; regionLabel: string } {
  const { settings } = useAppState();
  const city = resolveCity(settings.city || "");
  const regionLabel = regionName(settings.region || "IN");
  return { city, place: city?.name || regionLabel, regionLabel };
}
