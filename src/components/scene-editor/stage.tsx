import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Grid, Line, OrbitControls, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

import { loadModel, modelHeight, type LoadedModel } from "./assets";
import { itemDims, mm, printWidth } from "./scene-math";
import type { AssetInfo, Mode, SceneItem, ScenePrint, View } from "./types";

// The 3D stage (client only; scene-editor.tsx loads it lazily). One world unit = one millimetre of the
// real print, so what is placed here is placed in AR: the print is a flat card heightMm tall at the
// origin (x right, y up, z out of the print), and every item sits at its pos / rot / size exactly as
// the renderers read it (README.md).

const ACCENT = "#f6c344";
const CUT_LINE = "#ff4fa3";
const BG = "#141519";
const DEG = Math.PI / 180;
/** A phone's camera, held upright, sees about 60 degrees top to bottom. */
export const PHONE_FOV = 60;
/** iPhone-sized reference: 71.6 x 147.6 mm. */
const PHONE = { w: 71.6, h: 147.6 };

export type StageProps = {
  heightMm: number;
  print: ScenePrint;
  items: SceneItem[];
  infos: Record<string, AssetInfo>;
  selected: string | null;
  mode: Mode;
  snap: boolean;
  view: View;
  /** Changes every time a view button is pressed, so pressing the same one again re-frames. */
  viewNonce: number;
  /** Fraction of the stage's height the phone frame covers in phone view. */
  phoneFrame: number;
  showPhone: boolean;
  onSelect: (id: string | null) => void;
  onCommit: (id: string, v: { pos: SceneItem["pos"]; rot: SceneItem["rot"]; size: number }) => void;
  onInfo: (file: string, info: AssetInfo) => void;
};

export default function Stage(props: StageProps) {
  return (
    <Canvas
      camera={{ fov: 35, near: 0.5, far: 60000, position: [120, 80, 220] }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NeutralToneMapping;
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
      onPointerMissed={(e) => {
        if (e.type === "click") props.onSelect(null);
      }}
      style={{ touchAction: "none" }}
    >
      <color attach="background" args={[BG]} />
      <Lights />
      <OrbitControls makeDefault enableDamping={false} zoomSpeed={0.9} />
      <ViewController {...props} />
      <PrintCard heightMm={props.heightMm} print={props.print} />
      {props.showPhone ? <PhoneReference heightMm={props.heightMm} /> : null}
      {props.items
        .filter((it) => it.visible)
        .map((it) => (
          <ItemNode key={it.id} item={it} {...props} />
        ))}
    </Canvas>
  );
}

function Lights() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.9;
    return () => {
      scene.environment = null;
      env.dispose();
      pm.dispose();
    };
  }, [gl, scene]);
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[0.4, 0.8, 1]} intensity={1.6} />
    </>
  );
}

// ------------------------------------------------------------------ camera views
function ViewController({ view, viewNonce, heightMm, items, infos, phoneFrame }: StageProps) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as {
    target: THREE.Vector3;
    update: () => void;
  } | null;
  const size = useThree((s) => s.size);
  // items and sizes only matter at the moment a view is chosen, not while things move
  const latest = useRef({ items, infos, size });
  latest.current = { items, infos, size };

  useEffect(() => {
    if (!controls) return;
    const { items, infos, size } = latest.current;
    const aspect = size.width / Math.max(1, size.height);
    if (view === "phone") {
      // the phone frame drawn over the stage covers phoneFrame of its height and sees PHONE_FOV
      camera.fov = (2 * Math.atan(Math.tan((PHONE_FOV / 2) * DEG) / phoneFrame)) / DEG;
      camera.position.set(0, 0, 300);
    } else {
      camera.fov = 35;
      let r = heightMm * 0.625;
      for (const it of items) {
        if (!it.visible) continue;
        const d = itemDims(it, infos[it.file]);
        const reach = Math.hypot(...it.pos) + Math.max(d.w, d.h, d.d) * 0.6;
        r = Math.max(r, reach);
      }
      const v = camera.fov * DEG;
      const h = 2 * Math.atan(Math.tan(v / 2) * aspect);
      const dist = (r * 1.15) / Math.sin(Math.min(v, h) / 2);
      const dir =
        view === "front"
          ? [0, 0, 1]
          : view === "side"
            ? [1, 0, 0]
            : view === "top"
              ? [0, 1, 0.0001]
              : [0.55, 0.35, 0.76];
      const n = new THREE.Vector3(...dir).normalize().multiplyScalar(dist);
      camera.position.copy(n);
    }
    camera.near = Math.max(0.1, heightMm / 400);
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.update();
    // viewNonce re-frames when the same view is pressed again
  }, [view, viewNonce, controls, camera, heightMm, phoneFrame]);
  return null;
}

// ------------------------------------------------------------------ the print
function useTexture(url: string | null | undefined) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!url) {
      setTex(null);
      return;
    }
    let live = true;
    let t: THREE.Texture | null = null;
    new THREE.TextureLoader().load(
      url,
      (loaded) => {
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.anisotropy = 4;
        t = loaded;
        if (live) setTex(loaded);
        else loaded.dispose();
      },
      undefined,
      () => live && setTex(null),
    );
    return () => {
      live = false;
      t?.dispose();
    };
  }, [url]);
  return tex;
}

function PrintCard({ heightMm: H, print }: { heightMm: number; print: ScenePrint }) {
  const W = printWidth(H);
  const image = useTexture(print.image);
  const mask = useTexture(print.mask);
  const [outline, setOutline] = useState<THREE.Vector3[] | null>(null);
  useEffect(() => {
    if (!print.outline) return;
    let live = true;
    fetch(print.outline)
      .then((r) => (r.ok ? r.json() : null))
      .then((o: { points?: [number, number][] } | null) => {
        if (!live || !o?.points?.length) return;
        const pts = o.points.map(([u, v]) => new THREE.Vector3((u - 0.5) * W, (0.5 - v) * H, 0.12));
        pts.push(pts[0].clone());
        setOutline(pts);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [print.outline, W, H]);

  return (
    <group>
      <Grid
        position={[0, 0, -0.4]}
        rotation={[Math.PI / 2, 0, 0]}
        args={[10, 10]}
        cellSize={H > 400 ? 10 : 1}
        cellThickness={0.6}
        cellColor="#2a2c33"
        sectionSize={H > 400 ? 100 : 10}
        sectionThickness={1}
        sectionColor="#3d4049"
        fadeDistance={H * 8}
        fadeStrength={1.5}
        infiniteGrid
      />
      {/* the card: colour print on the front, plain on the back */}
      <mesh>
        <planeGeometry args={[W, H]} />
        <meshBasicMaterial
          key={image ? image.uuid : "none"}
          map={image}
          color={image ? "#ffffff" : "#3a3c44"}
          toneMapped={false}
        />
      </mesh>
      <mesh rotation={[0, Math.PI, 0]} position={[0, 0, -0.05]}>
        <planeGeometry args={[W, H]} />
        <meshBasicMaterial color="#2a2c33" />
      </mesh>
      {mask ? (
        <mesh position={[0, 0, 0.06]}>
          <planeGeometry args={[W, H]} />
          <meshBasicMaterial
            key={mask.uuid}
            color={ACCENT}
            alphaMap={mask}
            transparent
            opacity={0.32}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ) : null}
      {outline ? <Line points={outline} color={CUT_LINE} lineWidth={2} /> : null}
      <Ruler W={W} H={H} />
    </group>
  );
}

/** Millimetre ticks along the bottom and left edges, with the print's size. */
function Ruler({ W, H }: { W: number; H: number }) {
  const geo = useMemo(() => {
    const step = H > 1500 ? 10 : H > 300 ? 5 : 1;
    const gap = H * 0.025;
    const unit = H * 0.012;
    const pts: number[] = [];
    const tick = (i: number) => (i % (step * 10) === 0 ? 3 : i % (step * 5) === 0 ? 2 : 1) * unit;
    for (let x = 0; x <= W + 1e-6; x += step) {
      const px = -W / 2 + x;
      const len = tick(Math.round(x));
      pts.push(px, -H / 2 - gap, 0, px, -H / 2 - gap - len, 0);
    }
    for (let y = 0; y <= H + 1e-6; y += step) {
      const py = -H / 2 + y;
      const len = tick(Math.round(y));
      pts.push(-W / 2 - gap, py, 0, -W / 2 - gap - len, py, 0);
    }
    pts.push(-W / 2, -H / 2 - gap, 0, W / 2, -H / 2 - gap, 0);
    pts.push(-W / 2 - gap, -H / 2, 0, -W / 2 - gap, H / 2, 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [W, H]);
  useEffect(() => () => geo.dispose(), [geo]);
  const t = H * 0.055;
  return (
    <group>
      <lineSegments geometry={geo}>
        <lineBasicMaterial color="#8b8f9a" />
      </lineSegments>
      <TextLabel text={`${mm(W)} mm`} position={[0, -H / 2 - H * 0.1, 0]} height={t} />
      <TextLabel
        text={`${mm(H)} mm`}
        position={[-W / 2 - H * 0.1, 0, 0]}
        height={t}
        rotation={Math.PI / 2}
      />
    </group>
  );
}

/** Text drawn on the print plane, at a size in millimetres (hidden behind things in front of it). */
function TextLabel({
  text,
  position,
  height,
  rotation = 0,
  color = "#c9ccd4",
}: {
  text: string;
  position: [number, number, number];
  height: number;
  rotation?: number;
  color?: string;
}) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    const px = 64;
    const ctx = c.getContext("2d")!;
    ctx.font = `600 ${px * 0.62}px system-ui, sans-serif`;
    c.width = Math.ceil(ctx.measureText(text).width + px * 0.4);
    c.height = px;
    ctx.font = `600 ${px * 0.62}px system-ui, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, c.width / 2, px / 2 + 2);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [text, color]);
  useEffect(() => () => tex.dispose(), [tex]);
  const img = tex.image as HTMLCanvasElement;
  const w = (height * img.width) / img.height;
  return (
    <mesh position={position} rotation={[0, 0, rotation]} raycast={() => null}>
      <planeGeometry args={[w, height]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function PhoneReference({ heightMm: H }: { heightMm: number }) {
  const W = printWidth(H);
  const pts = useMemo(() => {
    const r = 9;
    const { w, h } = PHONE;
    const cx = W / 2 + 20 + w / 2;
    const cy = -H / 2 + h / 2;
    const out: THREE.Vector3[] = [];
    const corner = (x: number, y: number, a0: number) => {
      for (let i = 0; i <= 8; i++) {
        const a = a0 + (i / 8) * (Math.PI / 2);
        out.push(new THREE.Vector3(x + Math.cos(a) * r, y + Math.sin(a) * r, 0));
      }
    };
    corner(cx + w / 2 - r, cy + h / 2 - r, 0);
    corner(cx - w / 2 + r, cy + h / 2 - r, Math.PI / 2);
    corner(cx - w / 2 + r, cy - h / 2 + r, Math.PI);
    corner(cx + w / 2 - r, cy - h / 2 + r, (3 * Math.PI) / 2);
    out.push(out[0].clone());
    return { out, cx, cy };
  }, [W, H]);
  return (
    <group>
      <Line points={pts.out} color="#9aa0ad" lineWidth={1.5} dashed dashSize={4} gapSize={3} />
      <TextLabel text="A phone" position={[pts.cx, pts.cy + 6, 0]} height={9} />
      <TextLabel text={`${PHONE.h} mm tall`} position={[pts.cx, pts.cy - 6, 0]} height={7} />
    </group>
  );
}

// ------------------------------------------------------------------ items
type ItemProps = StageProps & { item: SceneItem };

function ItemNode(p: ItemProps) {
  const { item, selected, mode, snap, onSelect, onCommit } = p;
  const [obj, setObj] = useState<THREE.Group | null>(null);
  const isSel = selected === item.id;
  const start = useRef(new THREE.Vector3(1, 1, 1));

  // put the object back on the saved numbers (after a drag that snapped or was clamped)
  useEffect(() => {
    if (!obj) return;
    obj.position.set(...item.pos);
    obj.rotation.set(item.rot[0] * DEG, item.rot[1] * DEG, item.rot[2] * DEG, "XYZ");
    obj.scale.set(1, 1, 1);
  }, [obj, item.pos, item.rot, item.size]);

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(item.id);
  };

  return (
    <>
      <group ref={setObj} onClick={click}>
        {item.kind === "model" ? (
          <ModelBody item={item} onInfo={p.onInfo} selected={isSel} />
        ) : (
          <PlaneBody item={item} selected={isSel} />
        )}
      </group>
      {isSel && obj ? (
        <TransformControls
          object={obj}
          mode={mode}
          size={0.85}
          translationSnap={snap ? 1 : null}
          rotationSnap={snap ? 5 * DEG : null}
          scaleSnap={null}
          onMouseDown={() => start.current.copy(obj.scale)}
          onObjectChange={() => {
            if (mode !== "scale") return;
            // one size only: follow whichever handle moved the most
            const s = obj.scale;
            const d = [s.x, s.y, s.z].map((v, i) => Math.abs(v - start.current.getComponent(i)));
            const k = [s.x, s.y, s.z][d.indexOf(Math.max(...d))];
            s.set(k, k, k);
          }}
          onMouseUp={() => {
            const r = (v: number, step: number) => Math.round(v / step) * step;
            let size = item.size * obj.scale.x;
            if (snap && mode === "scale") size = Math.round(size);
            size = Math.min(3000, Math.max(1, r(size, 0.01)));
            const pos = obj.position
              .toArray()
              .map((v) => Math.min(2000, Math.max(-2000, r(v, 0.01))));
            const e = new THREE.Euler().setFromQuaternion(obj.quaternion, "XYZ");
            const rot = [e.x, e.y, e.z].map((v) => r(v / DEG, 0.01));
            obj.scale.set(1, 1, 1);
            onCommit(item.id, {
              pos: pos as SceneItem["pos"],
              rot: rot as SceneItem["rot"],
              size,
            });
          }}
        />
      ) : null}
    </>
  );
}

function SelectionBox({ w, h, d }: { w: number; h: number; d: number }) {
  const geo = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(w || 0.01, h || 0.01, d || 0.01)),
    [w, h, d],
  );
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <lineSegments geometry={geo} raycast={() => null}>
      <lineBasicMaterial color={ACCENT} depthTest={false} transparent opacity={0.9} />
    </lineSegments>
  );
}

function ModelBody({
  item,
  selected,
  onInfo,
}: {
  item: SceneItem;
  selected: boolean;
  onInfo: StageProps["onInfo"];
}) {
  const [model, setModel] = useState<LoadedModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onInfoRef = useRef(onInfo);
  onInfoRef.current = onInfo;
  useEffect(() => {
    let live = true;
    setError(null);
    loadModel(item.file).then(
      (m) => {
        if (!live) return;
        setModel(m);
        onInfoRef.current(item.file, m.info);
      },
      (e: Error) => {
        if (!live) return;
        setError(e.message);
        onInfoRef.current(item.file, { bytes: null, error: e.message });
      },
    );
    return () => {
      live = false;
    };
  }, [item.file]);

  const copy = useMemo(
    () => (model ? (cloneSkinned(model.gltf.scene) as THREE.Object3D) : null),
    [model],
  );
  const mixer = useMemo(() => (copy ? new THREE.AnimationMixer(copy) : null), [copy]);
  useEffect(() => {
    if (!mixer || !model || !item.clip) return;
    const clip = model.gltf.animations.find((a) => a.name === item.clip);
    if (!clip) return;
    const action = mixer.clipAction(clip);
    action.reset().play();
    return () => {
      action.stop();
      mixer.uncacheAction(clip);
    };
  }, [mixer, model, item.clip]);
  useFrame((_, dt) => mixer?.update(dt));

  if (error || !model || !copy) {
    // a stand-in the size the item will be
    const s = item.size;
    return (
      <mesh>
        <boxGeometry args={[s * 0.6, s, s * 0.6]} />
        <meshBasicMaterial color={error ? "#f43f5e" : "#5b5f6b"} wireframe />
      </mesh>
    );
  }
  // README.md: scale = size / bbox height; then the bbox centre is moved onto pos
  const b = model.info.box!;
  const s = item.size / modelHeight(b);
  const c = model.box.getCenter(new THREE.Vector3());
  return (
    <>
      <group scale={s}>
        <group position={[-c.x, -c.y, -c.z]}>
          <primitive object={copy} />
        </group>
      </group>
      {selected ? <SelectionBox w={b.w * s} h={b.h * s} d={b.d * s} /> : null}
    </>
  );
}

function useVideoTexture(url: string) {
  const [tex, setTex] = useState<THREE.VideoTexture | null>(null);
  useEffect(() => {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.src = url;
    const t = new THREE.VideoTexture(v);
    t.colorSpace = THREE.SRGBColorSpace;
    const ready = () => {
      setTex(t);
      v.play().catch(() => {});
    };
    v.addEventListener("loadeddata", ready, { once: true });
    v.load();
    return () => {
      v.pause();
      v.removeAttribute("src");
      v.load();
      t.dispose();
      setTex(null);
    };
  }, [url]);
  return tex;
}

function PlaneBody({ item, selected }: { item: SceneItem; selected: boolean }) {
  const w = item.size * (item.aspect ?? 1);
  const h = item.size;
  return (
    <>
      {item.kind === "video" ? (
        <VideoPlane url={item.file} w={w} h={h} />
      ) : (
        <ImagePlane url={item.file} w={w} h={h} />
      )}
      {selected ? <SelectionBox w={w} h={h} d={0} /> : null}
    </>
  );
}

function ImagePlane({ url, w, h }: { url: string; w: number; h: number }) {
  const tex = useTexture(url);
  return (
    <mesh>
      <planeGeometry args={[w, h]} />
      {tex ? (
        <meshBasicMaterial
          key={tex.uuid}
          map={tex}
          transparent
          alphaTest={0.01}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      ) : (
        <meshBasicMaterial color="#5b5f6b" wireframe />
      )}
    </mesh>
  );
}

function VideoPlane({ url, w, h }: { url: string; w: number; h: number }) {
  const tex = useVideoTexture(url);
  return (
    <mesh>
      <planeGeometry args={[w, h]} />
      {tex ? (
        <meshBasicMaterial key={tex.uuid} map={tex} side={THREE.DoubleSide} toneMapped={false} />
      ) : (
        <meshBasicMaterial color="#5b5f6b" wireframe />
      )}
    </mesh>
  );
}
