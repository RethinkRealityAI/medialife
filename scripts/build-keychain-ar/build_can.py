# Eclipse can from the EVADE keychain - modelled in Blender from a measured profile, label painted
# from the keychain art (build_label.py). No generative AI. Run: python build_can.py -- out.glb [out.blend]
import os
WORK = os.environ.get('KC_WORK', '/tmp/keychain-ar'); os.makedirs(WORK, exist_ok=True)
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))

import bpy, bmesh, math, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Vector, Matrix, Quaternion, Euler

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = ARGV[0] if ARGV else WORK + '/eclipse-can.glb'
OUT_BLEND = ARGV[1] if len(ARGV) > 1 else None
LABEL = WORK + '/can_label.png'

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene; scene.render.fps = 30
N = 96
LZ0, LZ1 = 0.06, 0.935          # label band (bottom bevel .. neck)

# radius, height  (12 oz can proportions: D 66 mm, H 122 mm -> scaled to H = 1)
PROFILE = [
    (0.000, 0.040), (0.120, 0.034), (0.175, 0.016), (0.200, 0.002), (0.214, 0.000), (0.232, 0.006),
    (0.252, 0.024), (0.266, 0.048), (0.2705, LZ0), (0.2705, 0.25), (0.2705, 0.55), (0.2705, 0.79),
    (0.266, 0.825), (0.252, 0.862), (0.236, 0.898), (0.226, 0.922), (0.222, LZ1), (0.222, 0.950),
    (0.2255, 0.962), (0.2255, 0.974), (0.219, 0.980), (0.212, 0.974), (0.209, 0.958), (0.204, 0.950),
    (0.150, 0.951), (0.000, 0.952),
]

def mat(name, color, metallic=0.0, rough=0.5, tex=None, emis=0.0, cull=True, alpha=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metallic; b.inputs['Roughness'].default_value = rough
    if tex:
        t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(tex)
        m.node_tree.links.new(t.outputs['Color'], b.inputs['Base Color'])
        if emis:
            m.node_tree.links.new(t.outputs['Color'], b.inputs['Emission Color'])
            b.inputs['Emission Strength'].default_value = emis
    elif emis:
        b.inputs['Emission Color'].default_value = (*color, 1); b.inputs['Emission Strength'].default_value = emis
    if alpha is not None:
        b.inputs['Alpha'].default_value = alpha
        m.blend_method = 'BLEND' if hasattr(m, 'blend_method') else None
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            pass
    m.use_backface_culling = cull
    return m

def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)

M_LABEL = mat('Can_Label', (1, 1, 1), metallic=0.25, rough=0.32, tex=LABEL, emis=0.18)
M_METAL = mat('Can_Aluminium', srgb('#d6ecf6'), metallic=0.45, rough=0.28, emis=0.08)
M_DARK = mat('Can_Opening', srgb('#0b0b10'), rough=0.6)
M_LINE = mat('Can_Outline', (0, 0, 0), rough=1.0)
M_FIZZ = mat('Can_Fizz', srgb('#c8f2ff'), rough=0.15, emis=0.35, alpha=0.75)

def link(ob):
    scene.collection.objects.link(ob); return ob

# ---------------------------------------------------------------- lathe body
bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
rings = []
for (r, z) in PROFILE:
    ring = []
    for i in range(N + 1):
        phi = 2 * math.pi * i / N
        ring.append(bm.verts.new((r * math.sin(phi), -r * math.cos(phi), z)))
    rings.append(ring)
for k in range(len(PROFILE) - 1):
    (r0, z0), (r1, z1) = PROFILE[k], PROFILE[k + 1]
    is_label = z0 >= LZ0 - 1e-6 and z1 <= LZ1 + 1e-6 and z1 > z0
    for i in range(N):
        a, b, c, d = rings[k][i], rings[k][i + 1], rings[k + 1][i + 1], rings[k + 1][i]
        if (a.co - d.co).length < 1e-7 and (b.co - c.co).length < 1e-7:
            continue
        verts = [a, b, c, d]
        if r1 == 0:
            verts = [a, b, c]
        elif r0 == 0:
            verts = [a, c, d]
        try:
            f = bm.faces.new(verts)
        except ValueError:
            continue
        f.material_index = 0 if is_label else 1
        f.smooth = True
        for lp in f.loops:
            vi = lp.vert
            # which column is this vertex?
            col = i if vi in (a, d) else i + 1
            u = 0.5 + col / N
            v = 1 - (LZ1 - vi.co.z) / (LZ1 - LZ0)
            lp[uvl].uv = (u, min(max(v, 0.0), 1.0))
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me = bpy.data.meshes.new('Can_Body'); bm.to_mesh(me); bm.free()
me.materials.append(M_LABEL); me.materials.append(M_METAL)
body = link(bpy.data.objects.new('Can_Body', me))
# sharp edge at the label/metal seams but smooth elsewhere
for p in me.polygons:
    p.use_smooth = True

LID_Z = 0.952

# opening (black, slightly sunk) + the pressed-in tongue rim
def disc(name, cx, cy, rx, ry, z, m, n=40):
    bm = bmesh.new()
    vs = [bm.verts.new((cx + rx * math.cos(2 * math.pi * k / n), cy + ry * math.sin(2 * math.pi * k / n), z)) for k in range(n)]
    bm.faces.new(vs)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(m)
    return link(bpy.data.objects.new(name, me))
hole = disc('Can_Opening', 0.0, -0.095, 0.062, 0.044, LID_Z + 0.002, M_DARK)
# rivet
bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=10, radius=0.022, location=(0, 0, LID_Z + 0.004))
rivet = bpy.context.active_object; rivet.name = 'Can_Rivet'; rivet.scale = (1, 1, 0.35)
rivet.data.materials.append(M_METAL)

# ---------------------------------------------------------------- pull tab (hinged at the rivet)
def tab_mesh():
    cu = bpy.data.curves.new('Tab', 'CURVE'); cu.dimensions = '2D'; cu.fill_mode = 'BOTH'
    cu.extrude = 0.003; cu.bevel_depth = 0.0025; cu.bevel_resolution = 2
    def rrect(cx, cy, w, h, r, n=6):
        pts = []
        for (qx, qy, a0) in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
            for k in range(n + 1):
                a = math.radians(a0 + 90 * k / n)
                pts.append((cx + qx + r * math.cos(a), cy + qy + r * math.sin(a)))
        return pts
    for pts in (rrect(0, 0.045, 0.092, 0.175, 0.04), rrect(0, 0.085, 0.056, 0.07, 0.025), rrect(0, -0.005, 0.03, 0.028, 0.012)):
        sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1); sp.use_cyclic_u = True
        for p, (x, y) in zip(sp.points, pts):
            p.co = (x, y, 0, 1)
    ob = link(bpy.data.objects.new('TabTmp', cu))
    bpy.context.view_layer.objects.active = ob
    for o in scene.objects: o.select_set(o == ob)
    bpy.ops.object.convert(target='MESH')
    ob = bpy.context.view_layer.objects.active
    ob.data.materials.clear(); ob.data.materials.append(M_METAL)
    for p in ob.data.polygons: p.use_smooth = True
    return ob
tab_geo = tab_mesh()
tab = link(bpy.data.objects.new('Can_Tab', None))
tab.empty_display_size = 0.02
tab.location = (0, 0.0, LID_Z + 0.008)
tab_geo.name = 'Can_TabMesh'; tab_geo.parent = tab; tab_geo.scale = (1.25, 1.25, 1.25)
# nose of the tab sits over the opening (-Y); the ring end points back (+Y)
tab_geo.location = (0, -0.02, 0)

# ---------------------------------------------------------------- outlines (cartoon ink line like the art)
def outline(src, w):
    bm = bmesh.new(); bm.from_mesh(src.data); bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * w
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    me = bpy.data.meshes.new(src.name + '_Line'); bm.to_mesh(me); bm.free()
    me.materials.clear(); me.materials.append(M_LINE)
    for p in me.polygons: p.material_index = 0
    o = link(bpy.data.objects.new(src.name + '_Line', me)); o.parent = src.parent
    o.matrix_parent_inverse = src.matrix_parent_inverse.copy(); o.location = src.location
    return o
outline(body, 0.009)

# ---------------------------------------------------------------- hierarchy + fizz
root = link(bpy.data.objects.new('EclipseCan', None))
for o in list(scene.objects):
    if o is not root and o.parent is None:
        o.parent = root
fizz = []
for k in range(7):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0, location=(0, -0.095, LID_Z + 0.02))
    f = bpy.context.active_object; f.name = f'Can_Fizz_{k + 1}'; f.data.materials.append(M_FIZZ)
    for p in f.data.polygons: p.use_smooth = True
    f.parent = root; f.scale = (0, 0, 0); fizz.append(f)

# ---------------------------------------------------------------- animation (object level, NLA tracks per clip)
FPS = 30
def ease(x):
    x = max(0.0, min(1.0, x)); return x * x * (3 - 2 * x)
def spring(x, f=2.6, damp=4.0):
    return 1 - math.exp(-damp * x) * math.cos(f * math.pi * x) if x > 0 else 0.0

OPEN = math.radians(72)
def fizz_state(k, t, active):
    if not active:
        return Vector((0, -0.095, LID_Z + 0.02)), 0.0
    period = 1.3; ph = ((t / period) + k / 7.0) % 1.0
    ang = k * 2.4
    x = 0.03 * math.cos(ang) + 0.02 * math.sin(ph * 6 + k)
    y = -0.095 + 0.025 * math.sin(ang)
    z = LID_Z + 0.02 + ph * 0.32
    s = (0.012 + 0.006 * (k % 3)) * math.sin(ph * math.pi)
    return Vector((x, y, z)), s

def clip(name, L, fn):
    nfr = int(round(L * FPS))
    objs = [root, tab] + fizz
    acts = {}
    for o in objs:
        o.animation_data_create()
        a = bpy.data.actions.new(f'{name}_{o.name}'); o.animation_data.action = a; acts[o] = a
        o.rotation_mode = 'XYZ'
    for f in range(0, nfr + 1):
        t = f / FPS
        st = fn(t, L)
        for o, (loc, rot, sca) in st.items():
            o.location = loc; o.rotation_euler = rot; o.scale = sca
            o.keyframe_insert('location', frame=f); o.keyframe_insert('rotation_euler', frame=f); o.keyframe_insert('scale', frame=f)
    for o in objs:
        o.animation_data.action = None
        tr = o.animation_data.nla_tracks.new(); tr.name = name
        s = tr.strips.new(name, 0, acts[o]); s.name = name
        acts[o].use_fake_user = True

PITCH = math.radians(24)          # the print shows the can from slightly above (you can see the lid)
def pop(t, L):
    # starts exactly like the print (full size, tipped toward the viewer), stands up, spins once, lands
    wob = math.exp(-4.5 * t) * math.sin(3.0 * math.pi * t)
    s_r, s_h = 1 - 0.10 * wob, 1 + 0.16 * wob
    spin = -2 * math.pi * (1 - ease(t / 1.05))
    hop = 0.18 * math.sin(min(t / 0.75, 1) * math.pi)
    st = {root: (Vector((0, 0, hop)), Euler((PITCH * (1 - ease(t / 0.4)), 0, spin)), Vector((s_r, s_r, s_h)))}
    # the tab stays open like the print, and kicks when the can lands
    k = (t - 0.95) / 0.35
    ang = OPEN + (math.radians(22) * math.exp(-5 * k) * math.sin(2.2 * math.pi * k) if k > 0 else 0)
    st[tab] = (Vector((0, 0, LID_Z + 0.008)), Euler((ang, 0, 0)), Vector((1, 1, 1)))
    for i, f in enumerate(fizz):
        loc, s = fizz_state(i, max(t - 1.05, 0), t > 1.05)
        st[f] = (loc, Euler((0, 0, 0)), Vector((s, s, s)))
    return st

def idle(t, L):
    w = 2 * math.pi * t / L
    st = {root: (Vector((0, 0, 0.02 * math.sin(2 * w))), Euler((0.0, math.radians(3) * math.sin(w), math.radians(14) * math.sin(w))), Vector((1, 1, 1)))}
    st[tab] = (Vector((0, 0, LID_Z + 0.008)), Euler((OPEN + math.radians(4) * math.sin(3 * w), 0, 0)), Vector((1, 1, 1)))
    for i, f in enumerate(fizz):
        loc, s = fizz_state(i, t, True)
        st[f] = (loc, Euler((0, 0, 0)), Vector((s, s, s)))
    return st

clip('PopOut', 1.4, pop)
clip('Idle', 5.2, idle)
# resting pose = opened can like the keychain
root.location = (0, 0, 0); root.rotation_euler = (0, 0, 0); root.scale = (1, 1, 1)
tab.rotation_euler = (OPEN, 0, 0)
for f in fizz: f.scale = (0, 0, 0)

# ---------------------------------------------------------------- silhouette left on the charm
from silhouette import add_silhouette, world_bounds
root.animation_data.use_nla = False
root.rotation_euler = (PITCH, 0, 0); bpy.context.view_layer.update()      # the pose PopOut starts in
_b = world_bounds([o for o in scene.objects if o.type == 'MESH' and not o.name.startswith('Can_Fizz')])
root.rotation_euler = (0, 0, 0); bpy.context.view_layer.update()
root.animation_data.use_nla = True
add_silhouette(scene, 'eclipse', _b)

for o in scene.objects: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=True,
                          export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_yup=True,
                          export_image_format='WEBP', export_image_quality=90, export_apply=True)
if OUT_BLEND:
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print('EXPORTED', OUT)
