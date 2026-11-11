# Bobo (keychain version) - built from primitives in Blender, textured by projecting the
# supplied keychain art. No generative AI. Run: python build_bobo.py -- out.glb [out.blend]
import os
WORK = os.environ.get('KC_WORK', '/tmp/keychain-ar'); os.makedirs(WORK, exist_ok=True)
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))

import bpy, bmesh, math, json, sys
import numpy as np
from mathutils import Vector, Matrix, Quaternion, Euler
from PIL import Image
from skimage import measure

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = ARGV[0] if ARGV else WORK + '/bobo.glb'
OUT_BLEND = ARGV[1] if len(ARGV) > 1 else None
OLD = os.environ.get('BOBO_OLD_RIG', '/mnt/project-files/Evade/Cat_Bobo_Evade/CatBobo_Anims.glb')
ART = REPO + '/public/evade/keychain/src/cat_art.png'
ATLAS = WORK + '/bobo_atlas.png'
AJ = json.load(open(WORK + '/atlas.json'))

S = 0.00185          # metres-ish per art pixel (model is ~1.9 units tall, same scale as the old Bobo)
GROUND_PX = 1020

def P(x, y, depth=0.0):
    """art pixel -> sit-space point (front of the cat faces -Y)"""
    return Vector(((x - 540) * S, depth, (GROUND_PX - y) * S))

def art_uv(co, layer):
    xp = co.x / S + 540
    yp = GROUND_PX - co.z / S
    xp = min(max(xp, 1), AJ['artW'] - 2)
    yp = min(max(yp, 1), AJ['artH'] - 2)
    return ((layer * 1024 + xp) / AJ['W'], 1 - yp / AJ['H'])

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---------------------------------------------------------------- old rig (bone names + orientations)
bpy.ops.import_scene.gltf(filepath=OLD)
old_arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
OLD_BONES = {}
for b in old_arm.data.bones:
    m = old_arm.matrix_world @ b.matrix_local
    OLD_BONES[b.name] = dict(rot=m.to_quaternion().normalized(), head=m.to_translation(),
                             length=b.length, parent=b.parent.name if b.parent else None)
OLD_ACTIONS = {}
for a in list(bpy.data.actions):
    OLD_ACTIONS[a.name] = a
    a.name = 'Old' + a.name
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for m in list(bpy.data.meshes):
    bpy.data.meshes.remove(m)
for m in list(bpy.data.materials):
    bpy.data.materials.remove(m)
for i in list(bpy.data.images):
    bpy.data.images.remove(i)

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

# ---------------------------------------------------------------- the parts
art = np.array(Image.open(ART).convert('RGBA'))
alpha = art[..., 3] > 100
HH, WW = alpha.shape
yy, xx = np.mgrid[0:HH, 0:WW]

parts = []   # (object, bone, uvmode)

# head: soft "mochi" ellipsoid
HEAD_C = Vector((0.0, 0.02, (GROUND_PX - 262) * S))
def head_shape(p):
    if p.y < 0:
        p.y *= 0.9
    if p.z < 0:            # fuller cheeks / jowls
        p.x *= 1.0 + 0.06 * (-p.z / 0.39)
    return p
head = ellipsoid('Head', HEAD_C, (0.545, 0.46, 0.395), exp=2.35, shape=head_shape)
parts.append((head, 'CatHead', 'skin'))

# cheek fluff, traced from the art silhouette
for side, (x0, x1) in (('L', (0, 262)), ('R', (818, WW))):
    m = alpha & (xx >= x0) & (xx < x1) & (yy > 275) & (yy < 485)
    lab, nl = __import__('scipy.ndimage', fromlist=['label']).label(m)
    edge_col = x1 - 1 if side == 'L' else x0
    keep = set(np.unique(lab[:, edge_col])) - {0}
    m = np.isin(lab, list(keep))
    # extend into the head so it is anchored
    cx_ = 300 if side == 'L' else 780
    m |= ((xx - cx_) / 70.0) ** 2 + ((yy - 380) / 92.0) ** 2 < 1
    pts = contour_of(m, 1.2)
    ob = slab('Fluff' + side, pts, 0.16, 0.05, ycen=-0.02)
    for v in ob.data.vertices:  # sweep the tips back around the head
        ax = abs(v.co.x)
        v.co.y += 0.95 * max(0.0, ax - 0.40) ** 1.3
    parts.append((ob, 'CatHead', 'art2'))

# ears (outline from the art; base hidden inside the head)
EARS = {
    'Ear': [(262, 150), (290, 70), (318, 20), (338, 12), (390, 40), (468, 58), (470, 150), (380, 190)],
    'Ear2': [(820, 185), (840, 150), (790, 40), (748, 12), (722, 18), (660, 45), (612, 60), (612, 150), (700, 190)],
}
for bone, pts in EARS.items():
    ob = slab(bone + 'Mesh', pts, 0.11, 0.035, ycen=0.0)
    for v in ob.data.vertices:          # lean back a touch and curve with the skull
        h = v.co.z - 1.55
        v.co.y += 0.18 * max(h, 0) + 0.3 * (abs(v.co.x) - 0.35) ** 2
    parts.append((ob, bone, 'art'))

# visor band around the head + flipped-up brim with "BOBO"
band = ring_band('VisorBand', (0, 0.02, (GROUND_PX - 222) * S), 0.535, 0.455, 0.16, 0.045, tilt=-0.03)
parts.append((band, 'CatHead', 'art:blue'))
brim_pts = [(352, 90), (420, 74), (540, 76), (660, 74), (730, 90), (736, 120), (732, 226), (700, 238),
            (540, 242), (380, 238), (348, 226), (344, 120)]
brim = slab('VisorBrim', brim_pts, 0.05, 0.018, ycen=0.0)
for v in brim.data.vertices:
    zrel = v.co.z - (GROUND_PX - 255) * S         # 0 at brim root
    ell = 0.50 * math.sqrt(max(0.0, 1 - (v.co.x / 0.565) ** 2))
    v.co.y += -ell - 0.03 + 0.30 * zrel           # wraps the band, leaning back
parts.append((brim, 'CatHead', 'art:blue'))

# torso (pear) - in sit space it is upright
TOR_C = Vector((0.01, 0.06, 0.50))
def torso_shape(p):
    z = p.z + TOR_C.z
    k = 1.06 - 0.16 * min(max(z / 1.0, 0), 1)     # wider at the base
    p.x *= k; p.y *= k * 0.98
    if p.y < 0:
        p.y *= 0.92
    return p
torso = ellipsoid('Torso', TOR_C, (0.47, 0.40, 0.60), exp=2.7, shape=torso_shape)
for v in torso.data.vertices:
    v.co.z = max(v.co.z, 0.015)
parts.append((torso, 'FakeTorso', 'skin'))

# collar + bell
collar = ring_band('Collar', (0, 0.04, (GROUND_PX - 500) * S), 0.405, 0.345, 0.085, 0.04, dip=0.0)
parts.append((collar, 'FakeTorso', 'art:blue'))
BELL_C = P(540, 568, -0.37)
bell = ellipsoid('Bell', BELL_C, (0.098, 0.09, 0.094))
loop = ellipsoid('BellLoop', P(540, 506, -0.36), (0.03, 0.025, 0.035))
parts.append((bell, 'FakeTorso', 'bell'))
parts.append((loop, 'FakeTorso', 'bell'))

# front legs (columns), paws on the ground
for bone, cx in (('FrontLeg', 415), ('FrontLeg2', 668)):
    c = P(cx, 830, -0.25)
    def leg_shape(p, c=c):
        z = p.z + c.z
        if z < 0.13:
            p.x *= 1.0 + 0.5 * (0.13 - z); p.y *= 1.0 + 0.9 * (0.13 - z)
        if p.y < 0:
            p.y *= 1.0
        return p
    ob = ellipsoid(bone + 'Mesh', c, (0.165, 0.15, 0.40), exp=2.8, shape=leg_shape)
    for v in ob.data.vertices:
        v.co.z = max(v.co.z, 0.0)
    parts.append((ob, bone, 'skin'))

# haunches (back legs folded) + hind feet
for bone, sx in (('BackLeg', -1), ('BackLeg2', 1)):
    h = ellipsoid(bone + 'Mesh', (sx * 0.37, 0.06, 0.24), (0.18, 0.36, 0.25), exp=2.3)
    f = ellipsoid(bone + 'Foot', (sx * 0.42, -0.25, 0.075), (0.13, 0.17, 0.08), exp=2.4)
    for v in list(h.data.vertices) + list(f.data.vertices):
        v.co.z = max(v.co.z, 0.0)
    parts.append((h, bone, 'skin'))
    parts.append((f, bone, 'skin'))

# tail - follows the art's curve up the left side, root tucked behind the body
TAIL_PATH = [Vector((-0.10, 0.36, 0.14)), Vector((-0.40, 0.30, 0.20)), P(268, 760, 0.16), P(250, 640, 0.10),
             P(212, 540, 0.06), P(150, 460, 0.03), P(85, 410, 0.01), P(40, 388, 0.0)]
tail = tube('TailMesh', TAIL_PATH, [0.085, 0.092, 0.096, 0.098, 0.096, 0.094, 0.092, 0.088])
parts.append((tail, 'Tail', 'art2'))

# ---------------------------------------------------------------- UVs: project the art from the front
SW = AJ['swatch']
def apply_uvs(ob, mode):
    me = ob.data
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    uv = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        ny = poly.normal.y
        front = ny < (-0.35 if mode in ('skin',) else (-0.45 if mode.startswith('art:') else 0.0))
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if mode == 'skin':
                u = art_uv(co, 1 if front else 2)
            elif mode == 'art2':
                u = art_uv(co, 0)
            elif mode == 'bell':
                u = art_uv(co, 0) if front else SW['silver']
            elif mode.startswith('art'):
                sw = mode.split(':')[1] if ':' in mode else 'fur'
                u = art_uv(co, 0) if front else SW[sw]
            uv.data[li].uv = u

for ob, bone, mode in parts:
    apply_uvs(ob, mode)
    for poly in ob.data.polygons:
        poly.use_smooth = True

# ---------------------------------------------------------------- materials
img = bpy.data.images.load(ATLAS); img.name = 'bobo_atlas'
def make_mat(name, metallic=0.0, rough=0.85, emis=0.22, culling=True):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; bsdf = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = emis
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = rough
    m.use_backface_culling = culling
    return m
MAT_FUR = make_mat('Bobo_Fur')
MAT_BELL = make_mat('Bobo_Bell', metallic=0.2, rough=0.35, emis=0.3)
MAT_LINE = bpy.data.materials.new('Bobo_Outline'); MAT_LINE.use_nodes = True
b = MAT_LINE.node_tree.nodes['Principled BSDF']
b.inputs['Base Color'].default_value = (0.0, 0.0, 0.0, 1); b.inputs['Roughness'].default_value = 1.0
MAT_LINE.use_backface_culling = True

for ob, bone, mode in parts:
    ob.data.materials.append(MAT_BELL if mode == 'bell' else MAT_FUR)

# ---------------------------------------------------------------- inverted-hull outline (cartoon ink line)
LINE_W = {'Head': 0.014, 'Torso': 0.014, 'TailMesh': 0.012}
def add_outline(ob, w):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bm.normal_update()
    for v in bm.verts:
        v.co = v.co + v.normal * w
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    me = bpy.data.meshes.new(ob.name + '_Line'); bm.to_mesh(me); bm.free()
    me.materials.clear(); me.materials.append(MAT_LINE)
    for p in me.polygons:
        p.material_index = 0
    o2 = bpy.data.objects.new(ob.name + '_Line', me); scene.collection.objects.link(o2)
    return o2
line_parts = []
for ob, bone, mode in parts:
    if ob.name.startswith('BellLoop'):
        continue
    w = LINE_W.get(ob.name, 0.010 if mode != 'bell' else 0.006)
    line_parts.append((add_outline(ob, w), bone))

# ---------------------------------------------------------------- skeleton: old bone names/orientations, new joints
# sit-space joints (where each bone pivots on the keychain pose)
def rotX(deg):
    return Quaternion((1, 0, 0), math.radians(deg))
JOINTS = {
    'HRP': (OLD_BONES['HRP']['head'], Quaternion()),
    'FakeTorso': (Vector((0.0, 0.06, 0.34)), rotX(-72)),
    'CatHead': (Vector((0.0, 0.0, 1.02)), Quaternion()),
    'Ear': (Vector((-0.34, 0.0, 1.62)), Quaternion()),
    'Ear2': (Vector((0.34, 0.0, 1.62)), Quaternion()),
    'FrontLeg': (P(415, 640, -0.24), Quaternion()),
    'FrontLeg2': (P(668, 640, -0.24), Quaternion()),
    'BackLeg': (Vector((-0.36, 0.10, 0.36)), rotX(-90)),
    'BackLeg2': (Vector((0.36, 0.10, 0.36)), rotX(-90)),
    'Tail': (Vector((-0.12, 0.34, 0.15)), Quaternion()),
}
ORDER = ['HRP', 'FakeTorso', 'CatHead', 'Ear', 'Ear2', 'FrontLeg', 'FrontLeg2', 'BackLeg', 'BackLeg2', 'Tail']

def mat_of(q, t):
    m = q.to_matrix().to_4x4(); m.translation = t; return m

REST = {}; SIT = {}; T = {}
LIFT = Vector((0, 0, 0.0))
def solve(lift):
    for name in ORDER:
        ob_ = OLD_BONES[name]; J, D = JOINTS[name]
        rot_rest = ob_['rot']; rot_sit = (D @ rot_rest).normalized()
        SIT[name] = mat_of(rot_sit, J)
        par = ob_['parent']
        if par is None:
            REST[name] = mat_of(rot_rest, J)
        else:
            head = T[par] @ J
            if name == 'FakeTorso':
                head = head + lift
            REST[name] = mat_of(rot_rest, head)
        T[name] = REST[name] @ SIT[name].inverted()
solve(LIFT)
# lift the torso in the rest pose so the front paws touch the old ground
fl = [o for o, b, m in parts if b == 'FrontLeg'][0]
minz = min((T['FrontLeg'] @ v.co).z for v in fl.data.vertices)
LIFT = Vector((0, 0, -0.065 - minz)); solve(LIFT)

# tail chain: extra bones along the curve so the tail can wag smoothly
tail_pts = []
me = tail.data
TAIL_CHAIN = ['Tail', 'Tail2', 'Tail3', 'Tail4', 'Tail5']
chain_sit = [JOINTS['Tail'][0], TAIL_PATH[2], TAIL_PATH[4], TAIL_PATH[5], TAIL_PATH[6], TAIL_PATH[7] + Vector((-0.08, 0, 0))]
CHAIN = {}
for i, nm in enumerate(TAIL_CHAIN[1:], start=1):
    h, t2 = chain_sit[i], chain_sit[i + 1]
    y = (t2 - h).normalized()
    x = y.cross(Vector((0, -1, 0))).normalized(); z = x.cross(y)
    m = Matrix((x, y, z)).transposed().to_4x4(); m.translation = h
    SIT[nm] = m
    par = TAIL_CHAIN[i - 1]
    REST[nm] = T[par] @ m          # identity pose in sit -> follows the parent
    T[nm] = REST[nm] @ SIT[nm].inverted()
    CHAIN[nm] = (par, (t2 - h).length)

# build the armature in REST space
arm_data = bpy.data.armatures.new('BoboRig'); arm = bpy.data.objects.new('BoboRig', arm_data)
scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
for o in scene.objects: o.select_set(o == arm)
bpy.ops.object.mode_set(mode='EDIT')
eb = {}
def add_bone(name, mrest, length, parent):
    b = arm_data.edit_bones.new(name)
    b.head = (0, 0, 0); b.tail = (0, length, 0); b.roll = 0
    b.matrix = mrest
    eb[name] = b
    if parent:
        b.parent = eb[parent]
for name in ORDER:
    add_bone(name, REST[name], OLD_BONES[name]['length'] * (0.6 if name in ('HRP',) else 0.8), OLD_BONES[name]['parent'])
for nm in TAIL_CHAIN[1:]:
    add_bone(nm, REST[nm], CHAIN[nm][1], CHAIN[nm][0])
bpy.ops.object.mode_set(mode='OBJECT')
ALL_BONES = ORDER + TAIL_CHAIN[1:]

# ---------------------------------------------------------------- move meshes into rest space, weight, join
def tail_weights(ob):
    """smooth weights along the tail chain (by nearest segment in sit space)"""
    W = {}
    segs = [(TAIL_CHAIN[i], chain_sit[i], chain_sit[i + 1]) for i in range(len(TAIL_CHAIN))]
    for v in ob.data.vertices:
        p = v.co
        ws = []
        for nm, a, b in segs:
            ab = b - a; t = max(0, min(1, (p - a).dot(ab) / ab.length_squared))
            d = (a + ab * t - p).length
            ws.append((nm, 1.0 / (d ** 4 + 1e-6)))
        tot = sum(w for _, w in ws)
        W[v.index] = [(nm, w / tot) for nm, w in ws if w / tot > 0.02]
    return W

all_objs = []
for (ob, bone, mode) in parts + [(o, b, 'line') for o, b in line_parts]:
    for nm in ALL_BONES:
        ob.vertex_groups.new(name=nm)
    if bone == 'Tail':
        W = tail_weights(ob)
        for vi, lst in W.items():
            for nm, w in lst:
                ob.vertex_groups[nm].add([vi], w, 'REPLACE')
        # transform each vertex with its blended rest transform
        for v in ob.data.vertices:
            acc = Vector((0, 0, 0)); tw = 0
            for nm, w in W[v.index]:
                acc += (T[nm] @ v.co) * w; tw += w
            v.co = acc / tw
    else:
        ob.vertex_groups[bone].add([v.index for v in ob.data.vertices], 1.0, 'REPLACE')
        ob.data.transform(T[bone])
    ob.data.update()
    all_objs.append(ob)

bpy.ops.object.select_all(action='DESELECT')
for o in all_objs: o.select_set(True)
bpy.context.view_layer.objects.active = all_objs[0]
bpy.ops.object.join()
body = bpy.context.view_layer.objects.active; body.name = 'Bobo'; body.data.name = 'Bobo'
body.parent = arm
mod = body.modifiers.new('Armature', 'ARMATURE'); mod.object = arm
for p in body.data.polygons:
    pass

# ---------------------------------------------------------------- animation
FPS = 30; scene.render.fps = FPS
arm.animation_data_create()
pb = arm.pose.bones
for p in pb:
    p.rotation_mode = 'QUATERNION'

def sit_world(name, extra=None):
    """world (armature) matrix of a bone in the keychain pose, optionally with a world-space
    rotation delta about its joint"""
    m = SIT[name].copy()
    if extra is not None:
        j = m.translation.copy()
        m = Matrix.Translation(j) @ extra.to_matrix().to_4x4() @ Matrix.Translation(-j) @ m
    return m

def pose_frame(deltas, root_off=None, root_scale=None):
    """set every bone to the sit pose plus per-bone world deltas (applied down the chain)"""
    # compute world matrices top-down, children inherit the parent's delta motion
    W = {}
    for name in ALL_BONES:
        par = OLD_BONES[name]['parent'] if name in OLD_BONES else CHAIN[name][0]
        base = SIT[name]
        if par is not None:
            # follow the parent: parent_world_now @ parent_sit^-1 @ base
            base = W[par] @ SIT[par].inverted() @ base
        d = deltas.get(name)
        if d is not None:
            j = base.translation.copy()
            base = Matrix.Translation(j) @ d.to_matrix().to_4x4() @ Matrix.Translation(-j) @ base
        if name == 'HRP':
            off = Vector(root_off) if root_off is not None else Vector((0, 0, 0))
            if root_scale is not None:
                off.z -= base.translation.z * (1 - root_scale[2])   # keep the paws on the ground
            base = Matrix.Translation(off) @ base
        W[name] = base
    for name in ALL_BONES:
        par = OLD_BONES[name]['parent'] if name in OLD_BONES else CHAIN[name][0]
        if par is None:
            basis = REST[name].inverted() @ W[name]
        else:
            rel = REST[par].inverted() @ REST[name]
            basis = rel.inverted() @ (W[par].inverted() @ W[name])
        pb[name].matrix_basis = basis
    if root_scale is not None:
        # squash in the HRP's local axes (children keep clean rotations)
        R = REST['HRP'].to_3x3()
        loc = []
        for i in range(3):
            ax = R.col[i]
            k = max(range(3), key=lambda j: abs(ax[j]))
            loc.append(root_scale[k])
        pb['HRP'].scale = loc

def key_all(frame, names=None):
    for name in (names or ALL_BONES):
        p = pb[name]
        p.keyframe_insert('rotation_quaternion', frame=frame, group=name)
        p.keyframe_insert('location', frame=frame, group=name)
        p.keyframe_insert('scale', frame=frame, group=name)

def qx(d): return Quaternion((1, 0, 0), math.radians(d))
def qy(d): return Quaternion((0, 1, 0), math.radians(d))
def qz(d): return Quaternion((0, 0, 1), math.radians(d))

def tail_deltas(t, amp=1.0, speed=1.0):
    d = {}
    for i, nm in enumerate(TAIL_CHAIN):
        ph = t * 2 * math.pi * speed - i * 0.7
        a = amp * (6 + 5 * i)
        d[nm] = qy(a * math.sin(ph)) @ qz(0.4 * a * math.sin(ph + 0.6))
    return d

def make_action(name, length_s, fn, loop=True):
    act = bpy.data.actions.new(name)
    arm.animation_data.action = act
    nfr = int(round(length_s * FPS))
    step = 2
    for f in list(range(0, nfr, step)) + [nfr]:
        t = f / FPS
        deltas, off, sc = fn(t, length_s)
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
    d = {'FrontLeg': qy(-28 * up) @ qx(-135 * up) @ qy(16 * wave * up),
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
    k = min(t / 0.55, 1.0)
    # spring for depth and size
    def spring(x, f=3.2, damp=5.0):
        return 1 - math.exp(-damp * x) * math.cos(f * math.pi * x)
    s_xy = 0.82 + 0.18 * spring(t / 1.0)
    s_y = 0.04 + 0.96 * spring(t / 0.9, f=2.6, damp=4.0)
    hop = 0.25 * math.sin(min(t / 0.7, 1) * math.pi)
    d = {'FakeTorso': breathe(t), 'CatHead': qx(-8 * math.sin(min(t / 0.8, 1) * math.pi))}
    d.update(tail_deltas(t / 0.7, amp=1.0 * min(t / 0.5, 1)))
    return d, Vector((0, 0, hop)), (s_xy, s_y, s_xy)

make_action('PopOut', 1.4, pop_out, loop=False)
make_action('Sit', 6.0, sit_idle)
make_action('PawRaise', 3.2, paw_raise, loop=False)
make_action('TailWag', 2.4, tail_wag)

# legacy clips from the original Bobo rig (same bone names) - quadruped moves
for nm in ('Walk', 'Excited', 'Chill', 'Sleep', 'Sit'):
    if nm not in OLD_ACTIONS:
        continue
    src = OLD_ACTIONS[nm]
    act = src.copy(); act.name = 'Classic' + nm
    act.use_fake_user = True
    trk = arm.animation_data.nla_tracks.new(); trk.name = act.name
    st = trk.strips.new(act.name, 0, act); st.name = act.name
for a in OLD_ACTIONS.values():
    a.use_fake_user = False

# rest the rig in the keychain pose when no clip runs
pose_frame({})

# ---------------------------------------------------------------- export
for o in scene.objects: o.select_set(o in (arm, body))
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True,
                          export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_force_sampling=True, export_yup=True,
                          export_image_format='WEBP', export_image_quality=88,
                          export_apply=False, export_skins=True, export_def_bones=False,
                          export_optimize_animation_size=True)
if OUT_BLEND:
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print('EXPORTED', OUT)

# ---- self-check (rest and keychain-pose matrices must match exactly)
def merr(a, b):
    return max(abs(a[i][j] - b[i][j]) for i in range(4) for j in range(4))
pose_frame({}); bpy.context.view_layer.update()
for nm in ALL_BONES:
    print('CHECK', nm, 'rest', round(merr(arm.data.bones[nm].matrix_local, REST[nm]), 4), 'sit', round(merr(arm.pose.bones[nm].matrix, SIT[nm]), 4))
