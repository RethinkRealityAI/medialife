// Happi's house, in metres, door-local: the door opening stands on the floor at z = 0, centred on x = 0, the
// garden is on +z and the room behind the door on -z. The outside is a cosy cottage; the room through the door is
// much bigger than the cottage (it is a portal: you only ever see the room through the door, or from inside).

/** The doorway: what you walk through. Arched top (half circle). */
export const DOOR = { w: 1.12, h: 2.12 };
export const DOOR_R = DOOR.w / 2;
export const DOOR_H0 = DOOR.h - DOOR_R; // where the arch starts

/** The cottage outside. */
export const COT = { w: 3.7, wall: 2.3, peak: 3.0, d: 2.4, t: 0.2 };

/** The room inside (rounded at the back), its front wall just behind the cottage's front wall. */
export const ROOM = { halfW: 2.75, zFront: -0.21, zBack: -4.7, rc: 1.15, h: 2.62 };

/** Inside the room while the camera stays within this box (a little slack round the walls). */
export const ROOM_SLACK = 0.45;
