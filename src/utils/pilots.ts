export interface Pilot {
  code: string;       // 3-letter code used by the API (e.g. "VER")
  name: string;       // Full display name
  team: string;
}

// Pilotes saison 2026 (22 pilotes, 11 écuries)
export const PILOTS: Pilot[] = [
  // McLaren (Mercedes)
  { code: "NOR", name: "Lando Norris", team: "McLaren" },
  { code: "PIA", name: "Oscar Piastri", team: "McLaren" },
  // Mercedes
  { code: "RUS", name: "George Russell", team: "Mercedes" },
  { code: "ANT", name: "Kimi Antonelli", team: "Mercedes" },
  // Ferrari
  { code: "LEC", name: "Charles Leclerc", team: "Ferrari" },
  { code: "HAM", name: "Lewis Hamilton", team: "Ferrari" },
  // Red Bull (Ford)
  { code: "VER", name: "Max Verstappen", team: "Red Bull" },
  { code: "HAD", name: "Isack Hadjar", team: "Red Bull" },
  // Racing Bulls (Ford)
  { code: "LAW", name: "Liam Lawson", team: "Racing Bulls" },
  { code: "LIN", name: "Arvid Lindblad", team: "Racing Bulls" },
  // Aston Martin (Honda)
  { code: "ALO", name: "Fernando Alonso", team: "Aston Martin" },
  { code: "STR", name: "Lance Stroll", team: "Aston Martin" },
  // Williams (Mercedes)
  { code: "SAI", name: "Carlos Sainz", team: "Williams" },
  { code: "ALB", name: "Alexander Albon", team: "Williams" },
  // Alpine (Mercedes)
  { code: "GAS", name: "Pierre Gasly", team: "Alpine" },
  { code: "COL", name: "Franco Colapinto", team: "Alpine" },
  // Haas (Ferrari)
  { code: "OCO", name: "Esteban Ocon", team: "Haas" },
  { code: "BEA", name: "Oliver Bearman", team: "Haas" },
  // Audi
  { code: "HUL", name: "Nico Hulkenberg", team: "Audi" },
  { code: "BOR", name: "Gabriel Bortoleto", team: "Audi" },
  // Cadillac (Ferrari) — nouvelle écurie
  { code: "PER", name: "Sergio Perez", team: "Cadillac" },
  { code: "BOT", name: "Valtteri Bottas", team: "Cadillac" },
];

const pilotsMap = new Map(PILOTS.map((p) => [p.code, p]));

export function getPilotByCode(code: string): Pilot | undefined {
  return pilotsMap.get(code.toUpperCase());
}

export function getPilotName(code: string): string {
  return pilotsMap.get(code.toUpperCase())?.name ?? code;
}

/** Filter pilots for Discord autocomplete */
export function filterPilots(query: string): Pilot[] {
  const q = query.toLowerCase();
  return PILOTS.filter(
    (p) =>
      p.code.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.team.toLowerCase().includes(q)
  ).slice(0, 25); // Discord autocomplete max 25
}
