// Placeholder Selfie mode (runs until src/experience/modes/face/index.ts exists). Proves the engine side of a face
// mode: the world <-> face camera swap in ONE engine session, a persistent root re-attached on every run, face
// events reaching the active mode. It puts a flat pink disc on the nose tip.
import * as THREE from 'three';
import type { ExperienceMode } from '../../shared/contracts';
import type { FaceEvent, Mode, ModeContext } from '../types';

export function createFacePlaceholder(ctx: ModeContext): Mode {
  const root = new THREE.Group();
  root.name = 'face-placeholder';
  root.visible = false;
  const face = new THREE.Group(); // follows the face transform
  face.visible = false;
  root.add(face);
  const nose = new THREE.Mesh(
    new THREE.CircleGeometry(0.11, 32),
    new THREE.MeshBasicMaterial({ color: 0xff389b, toneMapped: false, side: THREE.DoubleSide, depthTest: false }),
  );
  nose.position.set(0, 0, 0.6);
  nose.renderOrder = 10;
  face.add(nose);
  let found = false;
  let events = 0;

  return {
    id: 'face' as ExperienceMode,
    camera: 'face',
    root,
    enter() {
      root.visible = true;
      ctx.hud.hint('Look at the camera');
    },
    exit() {
      root.visible = false;
      face.visible = false;
      found = false;
      ctx.hud.hint('');
    },
    update() {
      /* face events drive it */
    },
    onFace(ev: FaceEvent) {
      events++;
      if (ev.type === 'found' || ev.type === 'updated') {
        const t = ev.detail?.transform;
        if (t) {
          face.position.set(t.position.x, t.position.y, t.position.z);
          face.quaternion.set(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w);
          face.scale.setScalar(t.scale ?? 1);
        }
        const nt = ev.detail?.attachmentPoints?.noseTip?.position;
        if (nt) nose.position.set(nt.x, nt.y, nt.z + 0.02);
        face.visible = true;
        if (!found) {
          found = true;
          ctx.hud.hint('Selfie mode: coming soon');
        }
      } else if (ev.type === 'lost') {
        face.visible = false;
        found = false;
        ctx.hud.hint('Look at the camera');
      }
      (root.userData as { events?: number }).events = events;
    },
    trigger() {
      return false;
    },
  };
}
