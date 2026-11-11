# Bobo (keychain version), v2: the ORIGINAL Bobo model (mesh + rig) posed like the keychain
# and restyled to the keychain look (flat cel colours, ink lines, painted face from the supplied
# art, light-blue visor, collar + bell). No generative AI.
# Run: python build_bobo.py -- out.glb [out.blend]
import os
WORK = os.environ.get('KC_WORK', '/tmp/keychain-ar'); os.makedirs(WORK, exist_ok=True)
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))

import bpy, bmesh, math, sys
import numpy as np
from collections import defaultdict
from mathutils import Vector, Matrix, Quaternion
from PIL import Image
from scipy import ndimage
from skimage import measure

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = ARGV[0] if ARGV else WORK + '/bobo.glb'
OUT_BLEND = ARGV[1] if len(ARGV) > 1 else None
OLD = os.environ.get('BOBO_OLD_RIG', '/mnt/project-files/Evade/Cat_Bobo_Evade/CatBobo_Anims.glb')
ART = REPO + '/public/evade/keychain/src/cat_art.png'
FACE = WORK + '/face_skin.png'          # from build_tex.py: the art with outlines + accessories removed

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---------------------------------------------------------------- mesh helpers (all in sit space)
def bm_to_obj(bm, name):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob

def ellipsoid(name, c, r, exp=2.0, seg=40, rings=24, shape=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    for v in bm.verts:
        d = v.co.copy()
        if exp != 2.0:
            # superellipsoid-ish: push toward a rounded box
            q = Vector([math.copysign(abs(t) ** (2.0 / exp), t) for t in d])
            d = q.normalized() * 1.0 if q.length > 0 else q
            d = Vector([math.copysign(abs(t) ** (2.0 / exp), t) for t in v.co.normalized()])
        p = Vector((d.x * r[0], d.y * r[1], d.z * r[2]))
        if shape:
            p = shape(p)
        v.co = Vector(c) + p
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm_to_obj(bm, name)

def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    a, b = np.array(pts[0]), np.array(pts[-1])
    ab = b - a; n = np.linalg.norm(ab) or 1e-9
    d = [abs(ab[0] * (p[1] - a[1]) - ab[1] * (p[0] - a[0])) / n for p in pts[1:-1]]
    i = int(np.argmax(d)) + 1
    if d[i - 1] > eps:
        return rdp(pts[:i + 1], eps)[:-1] + rdp(pts[i:], eps)
    return [pts[0], pts[-1]]

def slab(name, pts_px, depth, bevel, ycen=0.0, res=2):
    """extruded, bevelled outline (pts in art px) -> mesh in the XZ plane, centred on y=ycen"""
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '2D'; cu.fill_mode = 'BOTH'
    cu.extrude = max(depth / 2 - bevel, 0.001); cu.bevel_depth = bevel; cu.bevel_resolution = res
    cu.resolution_u = 4
    sp = cu.splines.new('POLY'); sp.points.add(len(pts_px) - 1); sp.use_cyclic_u = True
    for p, (x, y) in zip(sp.points, pts_px):
        q = P(x, y)
        p.co = (q.x, q.z, 0, 1)
    ob = bpy.data.objects.new(name, cu); scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    for o in scene.objects: o.select_set(o == ob)
    bpy.ops.object.convert(target='MESH')
    ob = bpy.context.view_layer.objects.active
    # curve XY -> world XZ, extrusion -> Y
    for v in ob.data.vertices:
        x, y, z = v.co
        v.co = Vector((x, -z + ycen, y))
    ob.data.update()
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data); bm.free()
    return ob

def tube(name, path, radii, ring=18, cap_rings=5):
    """sweep a circle along a 3D polyline (Catmull-Rom smoothed); rounded tip at the end"""
    pts = [Vector(p) for p in path]
    sm = []
    for i in range(len(pts) - 1):
        p0 = pts[max(i - 1, 0)]; p1 = pts[i]; p2 = pts[i + 1]; p3 = pts[min(i + 2, len(pts) - 1)]
        for k in range(8):
            t = k / 8
            sm.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    sm.append(pts[-1])
    n = len(sm)
    rr = np.interp(np.linspace(0, 1, n), np.linspace(0, 1, len(radii)), radii)
    bm = bmesh.new(); rings_v = []
    up = Vector((0, 1, 0))
    prev_n = None
    for i, p in enumerate(sm):
        t = (sm[min(i + 1, n - 1)] - sm[max(i - 1, 0)]).normalized()
        nrm = (up - t * up.dot(t)).normalized() if prev_n is None else (prev_n - t * prev_n.dot(t)).normalized()
        prev_n = nrm; bi = t.cross(nrm)
        ringv = []
        for k in range(ring):
            a = 2 * math.pi * k / ring
            ringv.append(bm.verts.new(p + (nrm * math.cos(a) + bi * math.sin(a)) * rr[i]))
        rings_v.append((ringv, p, t, nrm, bi, rr[i]))
    # tip cap
    ringv, p, t, nrm, bi, r = rings_v[-1]
    for j in range(1, cap_rings + 1):
        ang = (math.pi / 2) * j / (cap_rings + 1)
        c = p + t * r * math.sin(ang); rad = r * math.cos(ang)
        rv = [bm.verts.new(c + (nrm * math.cos(2 * math.pi * k / ring) + bi * math.sin(2 * math.pi * k / ring)) * rad) for k in range(ring)]
        rings_v.append((rv, c, t, nrm, bi, rad))
    tipv = bm.verts.new(p + t * r)
    for i in range(len(rings_v) - 1):
        a, b = rings_v[i][0], rings_v[i + 1][0]
        for k in range(ring):
            bm.faces.new((a[k], a[(k + 1) % ring], b[(k + 1) % ring], b[k]))
    last = rings_v[-1][0]
    for k in range(ring):
        bm.faces.new((last[k], last[(k + 1) % ring], tipv))
    first = rings_v[0][0]
    bm.faces.new(list(reversed(first)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm_to_obj(bm, name)

def ring_band(name, c, rx, ry, h, t, seg=64, dip=0.0, tilt=0.0):
    """elliptic band (visor band / collar) - a short tube with rounded rectangle section"""
    bm = bmesh.new(); prof = []
    for k in range(12):
        a = 2 * math.pi * k / 12
        prof.append((math.copysign(abs(math.cos(a)) ** 0.5, math.cos(a)) * t / 2,
                     math.copysign(abs(math.sin(a)) ** 0.5, math.sin(a)) * h / 2))
    rings = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        dx, dy = math.cos(a), math.sin(a)
        rv = []
        for (pr, pz) in prof:
            x = (rx + pr) * dx; y = (ry + pr) * dy
            z = c[2] + pz + dip * max(0.0, -dy) + tilt * dy
            rv.append(bm.verts.new((c[0] + x, c[1] + y, z)))
        rings.append(rv)
    for i in range(seg):
        a, b = rings[i], rings[(i + 1) % seg]
        for k in range(len(prof)):
            bm.faces.new((a[k], a[(k + 1) % len(prof)], b[(k + 1) % len(prof)], b[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm_to_obj(bm, name)

def contour_of(mask, eps=1.5):
    cs = measure.find_contours(mask.astype(float), 0.5)
    c = max(cs, key=len)
    pts = [(float(p[1]), float(p[0])) for p in c]
    if pts[0] == pts[-1]:
        pts = pts[:-1]
    h = len(pts) // 2
    pts = rdp(pts[:h + 1], eps)[:-1] + rdp(pts[h:] + [pts[0]], eps)[:-1]
    return pts


# ---------------------------------------------------------------- the original Bobo
bpy.ops.import_scene.gltf(filepath=OLD)
for n in ('Icosphere', 'Clothes1', 'Clothes2'):          # helper sphere + the hoodie
    if n in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
arm.name = 'BoboRig'; arm.data.name = 'BoboRig'
OLD_ACTIONS = {a.name: a for a in bpy.data.actions}
for k, a in OLD_ACTIONS.items(): a.name = 'Classic' + k
if arm.animation_data:
    arm.animation_data.action = None
    for t in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(t)
OBJ = {o.name: o for o in bpy.data.objects if o.type == 'MESH'}
BONE_OF = {'Torso': 'FakeTorso'}
XC = 0.055                                               # the model's centre line

def orig_tex(ob):
    for n in ob.material_slots[0].material.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and 'diff' in n.image.name:
            im = n.image
            return np.array(im.pixels[:], dtype=np.float32).reshape(im.size[1], im.size[0], 4)[..., :3]

def islands(ob):
    """label loose parts (welding coincident verts) -> per-polygon island id, list of info"""
    me = ob.data
    key = lambda v: (round(v.co.x, 4), round(v.co.y, 4), round(v.co.z, 4))
    groups = defaultdict(list)
    for v in me.vertices: groups[key(v)].append(v.index)
    adj = defaultdict(set)
    for e in me.edges:
        a, b = e.vertices; adj[a].add(b); adj[b].add(a)
    lab = {}; info = []
    for v in me.vertices:
        if v.index in lab: continue
        i = len(info); st = [v.index]; lab[v.index] = i; n = 0
        while st:
            x = st.pop(); n += 1
            for y in list(adj[x]) + groups[key(me.vertices[x])]:
                if y not in lab: lab[y] = i; st.append(y)
        info.append(n)
    return [lab[p.vertices[0]] for p in me.polygons], info, lab

# ---------------------------------------------------------------- keychain palette + face art
face = np.array(Image.open(FACE).convert('RGB')).astype(np.float32)
FUR = np.median(face[300:440, 440:640].reshape(-1, 3), axis=0)
STR = np.array([242, 154, 99], np.float32)      # stripes / paws
EAR = np.array([240, 160, 104], np.float32)
CREAM = np.array([255, 245, 234], np.float32)
PINK = np.array([247, 166, 166], np.float32)
BLUE = np.array([153, 200, 246], np.float32)
WHITE = np.array([255, 255, 255], np.float32)
# art pixel -> head (rest space, original head size): eyes of the art sit where the old eyes were
K = 560.0; ZE = 1.525
def P(x, y, depth=0.0):
    return Vector((XC + (x - 540) / K, depth, ZE + (310 - y) / K))

def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def tri(x):                                    # 0..1 triangle wave, period 1
    return 1 - np.abs((x % 1.0) * 2 - 1)
def mix(c0, c1, w):
    return c0 * (1 - w[..., None]) + c1 * w[..., None]
def lens(d, half):                             # soft-edged band of half-width `half` (array)
    return sstep(0.006, -0.006, np.abs(d) - half)

def col_leg(ob, front):
    b = arm.data.bones[ob.name]; x0, y0 = b.head_local.x, b.head_local.y
    s = 1.0 if x0 > XC else -1.0
    def fn(p, n, o, isl):
        dx = (p[..., 0] - x0) * s; dy = p[..., 1] - y0; z = p[..., 2]
        out = np.clip(np.cos(np.arctan2(dy, dx)), 0, 1)           # 1 on the outer side
        c = np.broadcast_to(FUR, p.shape).copy()
        for zk, hw in ((0.44, 0.045), (0.62, 0.04)) if front else ((0.42, 0.05), (0.62, 0.05), (0.82, 0.04)):
            c = mix(c, STR, lens(z - zk - 0.05 * (1 - out), hw * out ** 0.8))
        c = mix(c, STR, sstep(0.25, 0.22, z + 0.02 * tri(np.arctan2(dy, dx) * 1.6)))   # orange paw
        pad = (o[..., 0] > o[..., 1] * 1.25) & (o[..., 1] < 0.75)                    # original pink pads
        c[pad] = PINK
        return c
    return fn

def col_torso(p, n, o, isl):
    x = p[..., 0] - XC; y = p[..., 1]; z = p[..., 2] - 1.05
    th = np.degrees(np.arctan2(x, -z))                       # 0 = belly, 180 = spine
    c = np.broadcast_to(FUR, p.shape).copy()
    # stripes over the back and down the sides
    side = np.clip((np.abs(th) - 55) / 60, 0, 1)
    for yk in (-0.30, -0.02, 0.26, 0.54):
        c = mix(c, STR, lens(y - yk - 0.05 * (1 - side), 0.05 * side ** 0.7))
    # cream bib: chest + belly, with a jagged fur edge
    w = 36 + 6 * sstep(0.3, -0.5, y) + 5 * tri(y * 9.0)
    bib = sstep(w + 2, w - 2, np.abs(th)) * sstep(0.62, 0.52, y)
    chest = sstep(0.0, -0.2, n[..., 1] + 0.75) * sstep(0.34, 0.30, np.abs(x) + 0.04 * tri(z * 8)) * sstep(0.42, 0.36, z)
    c = mix(c, CREAM, np.maximum(bib, chest))
    return c

def col_tail(p, n, o, isl):
    b = arm.data.bones['Tail']; h = np.array(b.head_local); d = np.array((b.tail_local - b.head_local).normalized())
    t = (p - h) @ d
    L = max((v.co - b.head_local).dot(b.tail_local - b.head_local) for v in OBJ['Tail'].data.vertices) / b.length
    c = np.broadcast_to(FUR, p.shape).copy()
    c = mix(c, STR, lens((t % 0.21) - 0.105, 0.036) * sstep(0.12, 0.2, t))
    c = mix(c, STR, sstep(L - 0.26, L - 0.22, t))
    return c

def col_ear(p, n, o, isl):
    c = np.broadcast_to(EAR, p.shape).copy()
    pink = (o[..., 0] > o[..., 1] * 1.3) & (o[..., 2] > o[..., 1] * 0.9)
    c[pink] = PINK
    return c

HEAD_ISL = {}
def col_head(p, n, o, isl):
    x = p[..., 0] - XC; y = p[..., 1]; z = p[..., 2]
    c = np.broadcast_to(FUR, p.shape).copy()
    # three forehead stripes running back over the crown
    for xk in (-0.14, 0.0, 0.14):
        c = mix(c, STR, lens(x - xk, 0.032 * sstep(-1.12, -0.95, y) * sstep(-0.42, -0.6, y)) * sstep(1.55, 1.62, z))
    # cheek stripes at the sides / back of the head
    for zk in (1.36, 1.50):
        c = mix(c, STR, lens(z - zk, 0.03 * sstep(0.26, 0.38, np.abs(x)) * sstep(-0.45, -0.6, y)))
    # painted face from the keychain art
    px = 540 + x * K; py = 310 - (z - ZE) * K
    xi = np.clip(px, 0, face.shape[1] - 1).astype(int); yi = np.clip(py, 0, face.shape[0] - 1).astype(int)
    w = (sstep(338, 362, px) * sstep(742, 718, px) * sstep(268, 284, py) * sstep(452, 428, py)
         * sstep(-0.2, -0.45, n[..., 1]))
    c = mix(c, face[yi, xi], w)
    # visor: light blue, white trim + lettering (the old paw prints and dots are dropped)
    vis = isl == HEAD_ISL['visor']
    grey = vis & (np.abs(o[..., 0] - o[..., 2]) < 0.12) & (o[..., 0] > 0.45)
    lab, nl = ndimage.label(grey)
    keep = np.zeros(nl + 1, bool)
    if nl:
        area = ndimage.sum(grey, lab, range(1, nl + 1))
        cx = ndimage.mean(np.abs(x), lab, range(1, nl + 1))
        big = area.max() * 0.2
        for i in range(nl):
            keep[i + 1] = area[i] > big or (cx[i] < 0.24 and area[i] > area.max() * 0.004)
    c[vis] = BLUE
    c[vis & keep[lab]] = WHITE
    return c

def bake(name, size, jobs):
    """rasterise every job's UV triangles; colour each texel from its 3D position / normal /
    original texel -> flat keychain-style texture"""
    pos = np.zeros((size, size, 3), np.float32); nrm = np.zeros((size, size, 3), np.float32)
    isl = np.full((size, size), -1, np.int32); mask = np.zeros((size, size), bool)
    rgb = np.zeros((size, size, 3), np.float32)
    for ob, fn in jobs:
        me = ob.data; me.calc_loop_triangles()
        uvl = me.uv_layers.active.data
        pid, _, _ = islands(ob)
        m_ = np.zeros((size, size), bool)
        for t in me.loop_triangles:
            uv = np.array([uvl[l].uv[:] for l in t.loops], np.float64) % 1.0001 * size - 0.5
            P3 = np.array([me.vertices[v].co[:] for v in t.vertices]); N3 = np.array([me.vertices[v].normal[:] for v in t.vertices])
            x0, y0 = np.floor(uv.min(0)).astype(int) - 1; x1, y1 = np.ceil(uv.max(0)).astype(int) + 1
            x0 = max(x0, 0); y0 = max(y0, 0); x1 = min(x1, size - 1); y1 = min(y1, size - 1)
            if x1 < x0 or y1 < y0: continue
            gx, gy = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
            a, b_, c_ = uv
            den = (b_[1] - c_[1]) * (a[0] - c_[0]) + (c_[0] - b_[0]) * (a[1] - c_[1])
            if abs(den) < 1e-9: continue
            w0 = ((b_[1] - c_[1]) * (gx - c_[0]) + (c_[0] - b_[0]) * (gy - c_[1])) / den
            w1 = ((c_[1] - a[1]) * (gx - c_[0]) + (a[0] - c_[0]) * (gy - c_[1])) / den
            w2 = 1 - w0 - w1
            e = -0.6 / max(np.sqrt(abs(den)), 1.0)
            ins = (w0 >= e) & (w1 >= e) & (w2 >= e)
            if not ins.any(): continue
            W3 = np.stack([w0[ins], w1[ins], w2[ins]], -1)
            pos[gy[ins], gx[ins]] = W3 @ P3; nrm[gy[ins], gx[ins]] = W3 @ N3
            isl[gy[ins], gx[ins]] = pid[t.polygon_index]; m_[gy[ins], gx[ins]] = True
        o = orig_tex(ob)
        if o.shape[0] != size:
            o = np.array(Image.fromarray((np.clip(o, 0, 1) * 255).astype(np.uint8)).resize((size, size), Image.NEAREST)).astype(np.float32) / 255
        nl = np.linalg.norm(nrm, axis=-1, keepdims=True); nn = nrm / np.maximum(nl, 1e-6)
        c = fn(pos, nn, o, isl)
        rgb[m_] = c[m_]; mask |= m_
    idx = ndimage.distance_transform_edt(~mask, return_distances=False, return_indices=True)
    rgb = rgb[idx[0], idx[1]]
    path = f'{WORK}/bobo_{name}.png'
    Image.fromarray(np.clip(rgb[::-1], 0, 255).astype(np.uint8)).save(path)
    return path

# head islands: sphere (largest), visor (blue), the rest (old eyes, nose, whiskers, flat fins) go
head = OBJ['CatHead']
pid, info, vlab = islands(head)
ot = orig_tex(head); uvl = head.data.uv_layers.active.data
blue_score = defaultdict(list)
for p in head.data.polygons:
    u = np.mean([uvl[l].uv[:] for l in p.loop_indices], axis=0) % 1.0
    t = ot[int(u[1] * ot.shape[0]) % ot.shape[0], int(u[0] * ot.shape[1]) % ot.shape[1]]
    blue_score[pid[p.index]].append(t[2] - t[0])
HEAD_ISL['sphere'] = int(np.argmax(info))
HEAD_ISL['visor'] = max((i for i in blue_score if i != HEAD_ISL['sphere']), key=lambda i: np.mean(blue_score[i]) * (info[i] > 100))

TEX = {
    'Head': bake('head', 2048, [(head, col_head)]),
    'Torso': bake('torso', 1024, [(OBJ['Torso'], col_torso)]),
    'FrontLeg': bake('frontleg', 512, [(OBJ['FrontLeg'], col_leg(OBJ['FrontLeg'], True)), (OBJ['FrontLeg2'], col_leg(OBJ['FrontLeg2'], True))]),
    'BackLeg': bake('backleg', 512, [(OBJ['BackLeg'], col_leg(OBJ['BackLeg'], False)), (OBJ['BackLeg2'], col_leg(OBJ['BackLeg2'], False))]),
    'Tail': bake('tail', 512, [(OBJ['Tail'], col_tail)]),
    'Ear': bake('ear', 256, [(OBJ['Ear'], col_ear), (OBJ['Ear2'], col_ear)]),
}
TEX_OF = {'CatHead': 'Head', 'Torso': 'Torso', 'FrontLeg': 'FrontLeg', 'FrontLeg2': 'FrontLeg', 'BackLeg': 'BackLeg',
          'BackLeg2': 'BackLeg', 'Tail': 'Tail', 'Ear': 'Ear', 'Ear2': 'Ear'}

# drop the old 3D eyes / nose / whiskers / flat cheek fins (the face is painted, fluff is rebuilt)
bm = bmesh.new(); bm.from_mesh(head.data); bm.verts.ensure_lookup_table()
kill = [v for v in bm.verts if vlab[v.index] not in (HEAD_ISL['sphere'], HEAD_ISL['visor'])]
bmesh.ops.delete(bm, geom=kill, context='VERTS'); bm.to_mesh(head.data); bm.free()

# ---------------------------------------------------------------- materials
for m in list(bpy.data.materials): bpy.data.materials.remove(m)
for i in list(bpy.data.images): bpy.data.images.remove(i)
def make_mat(name, img=None, color=None, metallic=0.0, rough=0.85, emis=0.22):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; bsdf = nt.nodes['Principled BSDF']
    if img:
        tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(img)
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Emission Color'])
    else:
        c = [(v / 255) ** 2.2 for v in color] + [1]
        bsdf.inputs['Base Color'].default_value = c; bsdf.inputs['Emission Color'].default_value = c
    bsdf.inputs['Emission Strength'].default_value = emis
    bsdf.inputs['Metallic'].default_value = metallic; bsdf.inputs['Roughness'].default_value = rough
    m.use_backface_culling = True
    return m
MATS = {k: make_mat('Bobo_' + k, img=v) for k, v in TEX.items()}
MAT_FLUFF = make_mat('Bobo_Fluff', color=FUR)
MAT_COLLAR = make_mat('Bobo_Collar', color=BLUE)
MAT_STUD = make_mat('Bobo_Stud', color=(58, 110, 220))
MAT_BELL = make_mat('Bobo_Bell', color=(190, 208, 216), metallic=0.25, rough=0.35, emis=0.3)
MAT_LINE = make_mat('Bobo_Outline', color=(0, 0, 0), rough=1.0, emis=0.0)
for nm, ob in OBJ.items():
    ob.data.materials.clear(); ob.data.materials.append(MATS[TEX_OF[nm]])

# ---------------------------------------------------------------- cartoon proportions: bigger head, rounder forms
HEAD_S = 1.62
piv = arm.data.bones['CatHead'].head_local.copy()
for nm in ('CatHead', 'Ear', 'Ear2'):
    for v in OBJ[nm].data.vertices:
        v.co = piv + (v.co - piv) * HEAD_S
for nm in ('Ear', 'Ear2'):                       # taller ears, like the art
    eh = piv + (arm.data.bones[nm].head_local - piv) * HEAD_S
    for v in OBJ[nm].data.vertices:
        v.co = eh + (v.co - eh) * 1.22
def hp(v):                                       # original head-space point -> scaled head
    return piv + (Vector(v) - piv) * HEAD_S
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for nm in ('Ear', 'Ear2'):
    b = arm.data.edit_bones[nm]; d = b.tail - b.head
    b.head = piv + (b.head - piv) * HEAD_S; b.tail = b.head + d
for nm in ('Clothes2', 'Clothes1'):
    if nm in arm.data.edit_bones: arm.data.edit_bones.remove(arm.data.edit_bones[nm])
bpy.ops.object.mode_set(mode='OBJECT')
for nm, ob in OBJ.items():
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data); bm.free()
    for p in ob.data.polygons: p.use_smooth = True
    md = ob.modifiers.new('sub', 'SUBSURF'); md.levels = 1
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_move_to_index(modifier='sub', index=0)
    bpy.ops.object.modifier_apply(modifier='sub')


# ---------------------------------------------------------------- tail: extra bones so it can curl and wag
tail = OBJ['Tail']; tb = arm.data.bones['Tail']
t_h = tb.head_local.copy(); t_d = (tb.tail_local - tb.head_local).normalized()
for v in tail.data.vertices:                     # the keychain tail is longer and fuller
    t = (v.co - t_h).dot(t_d); perp = v.co - t_h - t_d * t
    v.co = t_h + t_d * (t * (1.4 if t > 0 else 1.0)) + perp * 1.25
tt = np.array([(v.co - t_h).dot(t_d) for v in tail.data.vertices]); TL = float(tt.max())
CUTS = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0]
def t_centre(f):
    sel = [v.co for v, t in zip(tail.data.vertices, tt) if abs(t - f * TL) < 0.07 * TL]
    return sum(sel, Vector()) / len(sel)
t_pts = [t_h] + [t_centre(f) for f in CUTS[1:-1]] + [t_h + t_d * TL]
TAIL_CHAIN = ['Tail', 'Tail2', 'Tail3', 'Tail4', 'Tail5']
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for i, nm in enumerate(TAIL_CHAIN[1:], start=1):
    b = arm.data.edit_bones.new(nm); b.head = t_pts[i]; b.tail = t_pts[i + 1]; b.roll = 0
    b.parent = arm.data.edit_bones[TAIL_CHAIN[i - 1]]; b.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')
for nm in TAIL_CHAIN[1:]:
    tail.vertex_groups.new(name=nm)
bw = 0.08 * TL
for v, t in zip(tail.data.vertices, tt):
    s = [1.0] + [float(sstep(CUTS[i] * TL - bw, CUTS[i] * TL + bw, t)) for i in range(1, 5)] + [0.0]
    for j, nm in enumerate(TAIL_CHAIN):
        w = s[j] * (1 - s[j + 1])
        tail.vertex_groups[nm].add([v.index], w, 'REPLACE')

REST = {b.name: b.matrix_local.copy() for b in arm.data.bones}
PAR = {b.name: (b.parent.name if b.parent else None) for b in arm.data.bones}
ORDER = [b.name for b in arm.data.bones]
ALL_BONES = ORDER

def qx(d): return Quaternion((1, 0, 0), math.radians(d))
def qy(d): return Quaternion((0, 1, 0), math.radians(d))
def qz(d): return Quaternion((0, 0, 1), math.radians(d))

def fk(deltas, base, off=None, trans=None, scl=None):
    """world matrices: `base` pose plus world-space rotation deltas about each joint (inherited
    down the chain), optional per-bone world translations and a root offset"""
    W = {}
    for n in ORDER:
        p = PAR[n]; m = base[n].copy()
        if p: m = W[p] @ base[p].inverted() @ m
        d = deltas.get(n)
        if d is not None:
            j = m.translation.copy()
            m = Matrix.Translation(j) @ d.to_matrix().to_4x4() @ Matrix.Translation(-j) @ m
        if trans and n in trans: m = Matrix.Translation(trans[n]) @ m
        if scl and n in scl: m = m @ Matrix.Diagonal((*scl[n], 1.0))
        if p is None and off is not None: m = Matrix.Translation(off) @ m
        W[n] = m
    return W

# ---------------------------------------------------------------- the keychain pose (sitting upright)
A = 60.0                                    # how far the body rears up from the walking pose
SITD = {
    'FakeTorso': qx(-A), 'CatHead': qx(A - 3),
    'FrontLeg': qz(3) @ qx(A), 'FrontLeg2': qz(-3) @ qx(A),
    # hind legs fold under the body: a short, full haunch with the foot flat on the ground
    'BackLeg': qz(-16) @ qy(-14) @ qx(A - 24), 'BackLeg2': qz(16) @ qy(14) @ qx(A - 24),
}
SIT_SCL = {'BackLeg': (1.2, 0.58, 1.2), 'BackLeg2': (1.2, 0.58, 1.2)}
# the tail sweeps out to Bobo's right (viewer's left), up, and curls over at the tip - like the art
TAIL_DIRS = [(-0.85, 0.35, 0.15), (-0.72, -0.1, 0.62), (-0.3, -0.2, 0.93), (-0.2, -0.12, 0.97), (-0.8, -0.05, 0.6)]
for nm, d in zip(TAIL_CHAIN, TAIL_DIRS):
    cur = fk(SITD, REST)[nm].to_3x3().col[1].normalized()
    SITD[nm] = cur.rotation_difference(Vector(d).normalized())
def posed(W, names):
    out = []
    for nm in names:
        b = BONE_OF.get(nm, nm); M = W[b] @ REST[b].inverted()
        out += [M @ v.co for v in OBJ[nm].data.vertices]
    return out
W0 = fk(SITD, REST, scl=SIT_SCL)
ground = min(p.z for p in posed(W0, ['Torso']))
SIT_TR = {}                                   # slide each leg so its paw stands on the ground
for nm in ('FrontLeg', 'FrontLeg2', 'BackLeg', 'BackLeg2'):
    sx = -1 if nm.endswith('Leg') else 1
    SIT_TR[nm] = Vector((sx * (0.05 if nm.startswith('Front') else 0.16), 0, ground - min(p.z for p in posed(W0, [nm]))))
W0 = fk(SITD, REST, trans=SIT_TR, scl=SIT_SCL)
pts = posed(W0, ['FrontLeg', 'FrontLeg2', 'BackLeg', 'BackLeg2', 'Torso'])
ys = [p.y for p in pts]
SIT_OFF = Vector((-XC, -(min(ys) + max(ys)) / 2, -min(p.z for p in pts)))
SIT = fk(SITD, REST, off=SIT_OFF, trans=SIT_TR, scl=SIT_SCL)
T = {n: REST[n] @ SIT[n].inverted() for n in ORDER}     # sit space -> rest space, per bone

# ---------------------------------------------------------------- keychain extras
extras = []     # (object, bone)
# cheek fluff: three soft pointed tufts per side, placed and sized after the art
TUFTS = [((0.26, 0.02, 0.00), (0.47, 0.05, -0.02), (0.66, 0.10, -0.045), 0.125),
         ((0.26, 0.02, -0.10), (0.44, 0.04, -0.13), (0.57, 0.08, -0.17), 0.115),
         ((0.24, 0.00, -0.19), (0.38, 0.02, -0.25), (0.46, 0.05, -0.335), 0.105)]
for sx in (-1, 1):
    for i, (p0, p1, p2, r) in enumerate(TUFTS):
        path = [hp((XC + sx * q[0], piv.y - 0.03 + q[1], ZE + q[2])) for q in (p0, p1, p2)]
        ob = tube(f'Fluff{"L" if sx < 0 else "R"}{i}', path, [r * HEAD_S, r * HEAD_S * 0.72, r * HEAD_S * 0.1], ring=14, cap_rings=2)
        c0 = path[0]
        for v in ob.data.vertices:                         # flatter front-to-back, like a lock of fur
            v.co.y = c0.y + (v.co.y - c0.y) * 0.62
        ob.data.materials.append(MAT_FLUFF)
        extras.append((ob, 'CatHead', False))

# collar + bell sit on the neck in the keychain pose
tv = posed(SIT, ['Torso']); ztop = max(p.z for p in tv)
ring = [p for p in tv if ztop - 0.22 < p.z < ztop - 0.12]
cx = (min(p.x for p in ring) + max(p.x for p in ring)) / 2; cy = (min(p.y for p in ring) + max(p.y for p in ring)) / 2
rx = (max(p.x for p in ring) - min(p.x for p in ring)) / 2 + 0.015; ry = (max(p.y for p in ring) - min(p.y for p in ring)) / 2 + 0.015
cz = ztop - 0.17
collar = ring_band('Collar', (cx, cy, cz), rx, ry, 0.085, 0.045)
collar.data.materials.append(MAT_COLLAR); extras.append((collar, 'FakeTorso', True))
for a in (-70, -35, 35, 70, 110, 180, 250):
    r = math.radians(a - 90)
    st = ellipsoid('Stud', (cx + (rx + 0.022) * math.cos(r), cy + (ry + 0.022) * math.sin(r), cz), (0.016, 0.016, 0.016), seg=12, rings=8)
    st.data.materials.append(MAT_STUD); extras.append((st, 'FakeTorso', True))
bell = ellipsoid('Bell', (cx, cy - ry - 0.05, cz - 0.115), (0.1, 0.092, 0.096), seg=24, rings=16)
loop = ellipsoid('BellLoop', (cx, cy - ry - 0.035, cz - 0.03), (0.032, 0.028, 0.045), seg=12, rings=8)
slot = ellipsoid('BellSlot', (cx, cy - ry - 0.05 - 0.088, cz - 0.15), (0.05, 0.012, 0.012), seg=12, rings=8)
for o in (bell, loop):
    o.data.materials.append(MAT_BELL); extras.append((o, 'FakeTorso', True))
slot.data.materials.append(MAT_LINE); extras.append((slot, 'FakeTorso', True))
for ob, bone, in_sit in extras:
    for p in ob.data.polygons: p.use_smooth = True
    if in_sit: ob.data.transform(T[bone])
    ob.vertex_groups.new(name=bone).add([v.index for v in ob.data.vertices], 1.0, 'REPLACE')

# ---------------------------------------------------------------- inverted-hull outline (cartoon ink line)
LINE_W = {'Torso': 0.016, 'CatHead': 0.016, 'FrontLeg': 0.014, 'FrontLeg2': 0.014, 'BackLeg': 0.014, 'BackLeg2': 0.014,
          'Tail': 0.013, 'Ear': 0.012, 'Ear2': 0.012, 'Bell': 0.007, 'Collar': 0.008}
def add_outline(ob, w):
    o2 = ob.copy(); o2.data = ob.data.copy(); o2.name = ob.name + '_Line'; scene.collection.objects.link(o2)
    bm = bmesh.new(); bm.from_mesh(o2.data); bm.normal_update()
    for v in bm.verts: v.co = v.co + v.normal * w
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(o2.data); bm.free()
    o2.data.materials.clear(); o2.data.materials.append(MAT_LINE)
    return o2
all_objs = list(OBJ.values()) + [e[0] for e in extras]
lines = [add_outline(o, LINE_W.get(o.name, 0.011)) for o in all_objs if o.name[:4] not in ('Stud', 'Bell') or o.name == 'Bell']
for o in [e[0] for e in extras] + lines:
    if not any(m.type == 'ARMATURE' for m in o.modifiers):
        pass
bpy.ops.object.select_all(action='DESELECT')
body = OBJ['Torso']
for o in all_objs + lines: o.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
body.name = 'Bobo'; body.data.name = 'Bobo'

# ---------------------------------------------------------------- animation
FPS = 30; scene.render.fps = FPS
pb = arm.pose.bones
for p in pb:
    p.rotation_mode = 'QUATERNION'

def pose_frame(deltas, root_off=None, root_scale=None):
    """keychain pose plus per-bone world deltas (applied down the chain)"""
    off = Vector(root_off) if root_off is not None else Vector((0, 0, 0))
    if root_scale is not None:
        off.z -= SIT['HRP'].translation.z * (1 - root_scale[2])     # keep the paws on the ground
    W = fk(deltas, SIT, off=off)
    for name in ORDER:
        par = PAR[name]
        if par is None:
            basis = REST[name].inverted() @ W[name]
        else:
            rel = REST[par].inverted() @ REST[name]
            basis = rel.inverted() @ (W[par].inverted() @ W[name])
        pb[name].matrix_basis = basis
    if root_scale is not None:
        R = REST['HRP'].to_3x3(); loc = []
        for i in range(3):
            ax = R.col[i]; k = max(range(3), key=lambda j: abs(ax[j])); loc.append(root_scale[k])
        pb['HRP'].scale = loc

def key_all(frame):
    for name in ORDER:
        p = pb[name]
        p.keyframe_insert('rotation_quaternion', frame=frame, group=name)
        p.keyframe_insert('location', frame=frame, group=name)
        p.keyframe_insert('scale', frame=frame, group=name)

def tail_deltas(t, amp=1.0, speed=1.0):
    d = {}
    for i, nm in enumerate(TAIL_CHAIN):
        ph = t * 2 * math.pi * speed - i * 0.7
        a = amp * (5 + 4 * i)
        d[nm] = qy(a * math.sin(ph)) @ qz(0.5 * a * math.sin(ph + 0.6))
    return d

arm.animation_data_create()
def make_action(name, length_s, fn):
    act = bpy.data.actions.new(name)
    arm.animation_data.action = act
    nfr = int(round(length_s * FPS))
    for f in list(range(0, nfr, 2)) + [nfr]:
        deltas, off, sc = fn(f / FPS, length_s)
        pose_frame(deltas, off, sc)
        key_all(f)
    act.use_fake_user = True
    trk = arm.animation_data.nla_tracks.new(); trk.name = name
    st = trk.strips.new(name, 0, act); st.name = name
    arm.animation_data.action = None
    return act

def breathe(t):
    return qx(1.2 * math.sin(t * 2 * math.pi / 3.0))

def sit_idle(t, L):
    d = {'FakeTorso': breathe(t), 'CatHead': qy(2.5 * math.sin(t * 2 * math.pi / L)) @ qx(-1.5 * math.sin(t * 2 * math.pi * 2 / L))}
    tw = (t % L)
    if 2.0 < tw < 2.35:
        d['Ear2'] = qy(-14 * math.sin((tw - 2.0) / 0.35 * math.pi))
    if 4.3 < tw < 4.6:
        d['Ear'] = qy(14 * math.sin((tw - 4.3) / 0.3 * math.pi))
    d.update(tail_deltas(t / L * 2, amp=0.6))
    return d, None, None

def ease(x):
    x = max(0, min(1, x)); return x * x * (3 - 2 * x)

def paw_raise(t, L):
    # Bobo's right paw (viewer's left) lifts, waves three times, settles back
    up = ease(t / 0.45) * (1 - ease((t - (L - 0.5)) / 0.45))
    wave = math.sin((t - 0.45) * 2 * math.pi * 1.6) if 0.45 < t < L - 0.5 else 0
    d = {'FrontLeg': qy(-24 * up) @ qx(-120 * up) @ qy(16 * wave * up),
         'FakeTorso': breathe(t) @ qy(3 * up),
         'CatHead': qz(-6 * up) @ qy(-5 * up)}
    d.update(tail_deltas(t / 0.9, amp=1.3))
    return d, None, None

def tail_wag(t, L):
    d = {'FakeTorso': breathe(t), 'CatHead': qy(3 * math.sin(t * 2 * math.pi / L))}
    d.update(tail_deltas(t / 0.8 * (0.8 / L * round(L / 0.8)), amp=1.6))
    return d, None, None

def pop_out(t, L):
    # starts flat on the charm (depth squashed), springs out toward the viewer, lands sitting
    def spring(x, f=3.2, damp=5.0):
        return 1 - math.exp(-damp * x) * math.cos(f * math.pi * x)
    s_xy = 0.82 + 0.18 * spring(t / 1.0)
    s_y = 0.04 + 0.96 * spring(t / 0.9, f=2.6, damp=4.0)
    hop = 0.25 * math.sin(min(t / 0.7, 1) * math.pi)
    d = {'FakeTorso': breathe(t), 'CatHead': qx(-8 * math.sin(min(t / 0.8, 1) * math.pi))}
    d.update(tail_deltas(t / 0.7, amp=1.0 * min(t / 0.5, 1)))
    return d, Vector((0, 0, hop)), (s_xy, s_y, s_xy)

make_action('PopOut', 1.4, pop_out)
make_action('Sit', 6.0, sit_idle)
make_action('PawRaise', 3.2, paw_raise)
make_action('TailWag', 2.4, tail_wag)

# the original Bobo clips (same rig) - walk and the other quadruped moves
for nm in ('Walk', 'Excited', 'Chill', 'Sleep', 'Sit'):
    if nm not in OLD_ACTIONS:
        continue
    act = OLD_ACTIONS[nm]
    act.use_fake_user = True
    trk = arm.animation_data.nla_tracks.new(); trk.name = act.name
    st = trk.strips.new(act.name, 0, act); st.name = act.name

# rest the rig in the keychain pose when no clip runs
pose_frame({})

# ---------------------------------------------------------------- export
for o in scene.objects: o.select_set(o in (arm, body))
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True,
                          export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_force_sampling=True, export_yup=True,
                          export_image_format='WEBP', export_image_quality=90,
                          export_apply=False, export_skins=True, export_def_bones=False,
                          export_optimize_animation_size=True)
if OUT_BLEND:
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print('EXPORTED', OUT)
