// Bobo's Arcade catalogue for the EVADE Hub: every EVADE game and experience, read from the same file Cola Run's
// BOBO OS uses (public/evade/arcade/games.json) plus the hub-only "places" (globe, collection) below.
// Both the 3D/AR world (arcade cabinets in Bobo's Hideout) and the app's Arcade sheet render from this list, so a new
// experience appears everywhere by adding one entry to games.json.
//
// Unlocks are local flags for now (localStorage keys set by the experiences themselves, e.g. Cola Run sets
// `ohg-reward-earned` on a win) until the Activation API exists. `testing: true` in games.json opens everything.

export interface ArcadeItem {
  id: string;
  name: string;
  /** one line: what you do */
  sub: string;
  /** thumbnail (absolute site path) */
  img: string;
  /** where Play goes (absolute site path; the hub adds ?from=evade-hub so the experience shows a home button) */
  url: string;
  /** what the fan needs to play, e.g. "Your EVADE keychain" */
  needs?: string;
  unlock?: { task: string; key: string };
  soon?: boolean;
  kind: 'game' | 'place';
  /** flat accent for the cabinet / card (no gradients) */
  color: string;
}

export interface ArcadeState extends ArcadeItem {
  locked: boolean;
}

const COLORS: Record<string, string> = {
  'cola-run': '#ff7a1a',
  'off-the-chain': '#f6c344',
  'bobo-booth': '#ff4f9a',
  'bobo-hoops': '#e3243a',
  'spray-bobo': '#4fd6e8',
  'xray-bobo': '#7bf1a8',
  'photo-beam': '#a78bfa',
  'bobo-portal': '#2a5bd7',
  'eclipse-night': '#6a32e8',
  'where-is-bobo': '#2a5bd7',
  vault: '#4b3fb8',
};

const PLACES: Omit<ArcadeItem, 'color' | 'kind'>[] = [
  { id: 'where-is-bobo', name: 'Where is Bobo?', sub: 'See every fan who played, on the globe', img: '/labs/img/where-is-bobo.webp', url: '/evade/where-is-bobo/' },
  { id: 'vault', name: 'Digital Collection', sub: 'Your EVADE pieces, unlocked by your merch', img: '/labs/img/vault.webp', url: '/evade/vault/' },
];

const FALLBACK: Omit<ArcadeItem, 'color' | 'kind'>[] = [
  { id: 'cola-run', name: 'Cola Run', sub: 'Grab every can before time runs out', img: '/evade/creators/assets/img/cola-run-splash-sm.webp', url: '/evade/cola-run/' },
  { id: 'off-the-chain', name: 'Bobo Off the Chain', sub: 'Bobo and the can jump off your keychain', img: '/labs/img/off-the-chain.webp', url: '/evade/keychain-ar/', needs: 'Your EVADE keychain' },
  { id: 'bobo-booth', name: 'Bobo Booth', sub: 'Selfie booth: cat hat, shades, can earrings', img: '/labs/img/bobo-booth.webp', url: '/evade/bobo-booth/' },
  { id: 'bobo-hoops', name: 'Bobo Hoops', sub: 'Pop the can off your keychain and sink 10 balls', img: '/labs/img/bobo-hoops.webp', url: '/evade/bobo-hoops/', needs: 'Your EVADE keychain' },
  { id: 'spray-bobo', name: 'Spray Bobo', sub: 'Your phone is the spray can', img: '/labs/img/spray-bobo.webp', url: '/evade/spray-bobo/' },
];

let cache: Promise<ArcadeItem[]> | null = null;

/** The whole catalogue, games first, then places. Never rejects (falls back to a built-in list offline). */
export function loadArcade(): Promise<ArcadeItem[]> {
  return (cache ||= (async () => {
    let games: Omit<ArcadeItem, 'color' | 'kind'>[] = FALLBACK;
    try {
      const r = await fetch('/evade/arcade/games.json', { cache: 'no-cache' });
      if (r.ok) {
        const d = await r.json();
        if (Array.isArray(d.games) && d.games.length) games = d.games;
        testing = !!d.testing;
      }
    } catch { /* offline: built-in list */ }
    const out: ArcadeItem[] = games.map((g) => ({ ...g, kind: 'game', color: COLORS[g.id] ?? '#f6c344' }));
    for (const p of PLACES) out.push({ ...p, kind: 'place', color: COLORS[p.id] ?? '#4fd6e8' });
    return out;
  })());
}

let testing = false;

export function isLocked(item: ArcadeItem): boolean {
  if (testing || !item.unlock) return false;
  try { return !localStorage.getItem(item.unlock.key); } catch { return false; }
}

export async function arcadeState(): Promise<ArcadeState[]> {
  const items = await loadArcade();
  return items.map((i) => ({ ...i, locked: isLocked(i) }));
}

/** Open an experience from the hub (same tab, so Back and the experience's home button both return here). */
export function launch(item: ArcadeItem): void {
  const u = new URL(item.url, location.origin);
  u.searchParams.set('from', 'evade-hub');
  location.assign(u.pathname + u.search + u.hash);
}
