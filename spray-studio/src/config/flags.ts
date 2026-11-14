/**
 * Feature switches for the Spray Studio (ported from AiroHub, whose flags came from its own dashboard).
 * Fixed here: no AI anywhere (EVADE's audience dislikes AI), no image stamps for now (Spray Bobo's decals
 * come from the Decal Mode work), no 3D model uploads (merch comes from the Spray Bobo CMS).
 */
export interface PublicFlags {
  ui: { aiPanel: boolean; padMode: boolean; stamps: boolean; showcase: boolean; uploads: boolean; feedbackButton: boolean };
  notice: string;
}
const FLAGS: PublicFlags = {
  ui: { aiPanel: false, padMode: false, stamps: false, showcase: true, uploads: false, feedbackButton: false },
  notice: '',
};
export const getFlags = (): PublicFlags => FLAGS;
export const useFlags = (): PublicFlags => FLAGS;
export const ensureFlags = () => Promise.resolve(FLAGS);
export const subscribe = (_l: () => void) => () => {};
