// A cherry blossom as an SVG path (five notched petals), for flat icons. `r` = petal length from the centre.
const PETAL: Array<[number, number]> = [[0, 0], [-0.5, -0.3], [-0.43, -0.93], [-0.12, -0.93], [0, -0.77], [0.12, -0.93], [0.43, -0.93], [0.5, -0.3], [0, 0]];

export function blossomD(cx: number, cy: number, r: number): string {
  const f = (n: number) => +n.toFixed(2);
  let d = '';
  for (let k = 0; k < 5; k++) {
    const a = (k * 2 * Math.PI) / 5, c = Math.cos(a), s = Math.sin(a);
    const P = PETAL.map(([x, y]) => `${f(cx + (x * c - y * s) * r)} ${f(cy + (x * s + y * c) * r)}`);
    d += `M${P[0]}C${P[1]} ${P[2]} ${P[3]}L${P[4]}L${P[5]}C${P[6]} ${P[7]} ${P[8]}Z`;
  }
  return d;
}

/** A filled blossom icon in a 24 x 24 box. */
export const BLOSSOM_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${blossomD(12, 12.6, 10)}"/></svg>`;
