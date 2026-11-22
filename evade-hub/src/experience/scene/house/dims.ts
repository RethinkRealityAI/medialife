// Bobo's Hideout door, in metres, door-local: the doorway stands on the floor at z = 0, centred on x = 0; your room is
// on +z and the hideout's hall behind the door on -z (src/evade/world/hideout.ts lays the hall out in the same frame).

/** The doorway: what you walk through (square top). */
export const DOOR = { w: 1.1, h: 2.15 };

/** The freestanding door frame outside (an Eclipse can opened up into a doorway). */
export const COT = { w: 1.9, peak: 2.85, d: 0.34 };

/** Inside the hall while the camera stays within the hall circle plus this slack. */
export const ROOM_SLACK = 0.45;
