import { config } from "../config";

const BASE_URL = "https://api.jolpi.ca/ergast/f1";

interface JolpicaRace {
  season: string;
  round: string;
  raceName: string;
  Circuit: {
    circuitName: string;
    Location: { country: string };
  };
  date: string;
  time?: string;
  Qualifying?: { date: string; time?: string };
}

interface JolpicaQualifyingResult {
  position: string;
  Driver: { code: string; familyName: string };
}

interface JolpicaRaceResult {
  position: string;
  Driver: { code: string; familyName: string };
  FastestLap?: { rank: string };
}

export interface F1RaceInfo {
  season: number;
  round: number;
  name: string;
  circuit: string;
  country: string;
  qualiDate: string; // ISO datetime
  raceDate: string;  // ISO datetime
}

export interface F1QualifyingResults {
  pole: string;       // driver code
  top3: string[];     // driver codes in order
  last: string;       // last classified driver
}

export interface F1RaceResults {
  winner: string;     // driver code
  podium: string[];   // driver codes in order (P1, P2, P3)
  last: string;       // last classified driver
  fastestLap: string | null; // driver with fastest lap
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Jolpica API error: ${res.status} ${res.statusText} for ${url}`);
  }
  return res.json();
}

/** Fetch the full season calendar */
export async function fetchSeasonCalendar(season: number = config.f1Season): Promise<F1RaceInfo[]> {
  const data = await fetchJson(`${BASE_URL}/${season}.json`);
  const races: JolpicaRace[] = data.MRData.RaceTable.Races;

  return races.map((r) => {
    const qualiDate = r.Qualifying
      ? `${r.Qualifying.date}T${r.Qualifying.time || "14:00:00Z"}`
      : `${r.date}T14:00:00Z`; // fallback: day before race assumed

    const raceDate = `${r.date}T${r.time || "15:00:00Z"}`;

    return {
      season: parseInt(r.season, 10),
      round: parseInt(r.round, 10),
      name: r.raceName,
      circuit: r.Circuit.circuitName,
      country: r.Circuit.Location.country,
      qualiDate,
      raceDate,
    };
  });
}

/** Fetch qualifying results for a specific round */
export async function fetchQualifyingResults(
  round: number,
  season: number = config.f1Season
): Promise<F1QualifyingResults | null> {
  try {
    const data = await fetchJson(`${BASE_URL}/${season}/${round}/qualifying.json`);
    const results: JolpicaQualifyingResult[] =
      data.MRData.RaceTable.Races[0]?.QualifyingResults ?? [];

    if (results.length === 0) return null;

    const sorted = results.sort((a, b) => parseInt(a.position) - parseInt(b.position));
    return {
      pole: sorted[0].Driver.code,
      top3: sorted.slice(0, 3).map((r) => r.Driver.code),
      last: sorted[sorted.length - 1].Driver.code,
    };
  } catch {
    return null;
  }
}

/** Fetch race results for a specific round */
export async function fetchRaceResults(
  round: number,
  season: number = config.f1Season
): Promise<F1RaceResults | null> {
  try {
    const data = await fetchJson(`${BASE_URL}/${season}/${round}/results.json`);
    const results: JolpicaRaceResult[] =
      data.MRData.RaceTable.Races[0]?.Results ?? [];

    if (results.length === 0) return null;

    const sorted = results.sort((a, b) => parseInt(a.position) - parseInt(b.position));
    const fastestLapDriver = results.find((r) => r.FastestLap?.rank === "1");
    return {
      winner: sorted[0].Driver.code,
      podium: sorted.slice(0, 3).map((r) => r.Driver.code),
      last: sorted[sorted.length - 1].Driver.code,
      fastestLap: fastestLapDriver?.Driver.code ?? null,
    };
  } catch {
    return null;
  }
}
