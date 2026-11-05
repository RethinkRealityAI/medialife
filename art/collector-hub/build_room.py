"""Bobo's Hideout: the EVADE room for the MEDIALIFE Collector Hub, built entirely by script.

Bobo lives inside a giant cut-away Eclipse can that floats over a Cola Run spawn pad. It is made to be
walked around in AR: the open side shows a two-level home (lounge downstairs, gaming loft upstairs) and
the closed side shows the can's label.

Run (any Blender 4.2+):
  blender -b --python art/collector-hub/build_room.py -- [--render out.png --shot hero|back|side|top|case|loft|lounge]
                                                        [--glb out.glb] [--blend out.blend] [--samples N] [--res N]

Everything is procedural geometry plus EVADE's supplied art (posters, screen, sky and can label are composited
by make_textures.py). No image-to-image or image-to-3D generation touches EVADE assets.
Units are metres, Z up in Blender (Y up after glTF export). The can's floor centre is the origin.
Object names that start with "hub_" are interaction targets the web room looks up by name.
"""
import bpy, bmesh, math, os, sys, random
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
TEX = os.path.join(HERE, 'tex')
BOBO_GLB = os.environ.get('BOBO_GLB', '/mnt/project-files/Evade/Cat_Bobo_Evade/CatBobo_Anims.glb')
COLA_GLB = os.environ.get('COLA_GLB', '/mnt/project-files/Evade/Cola/Cola_Collectible.glb')
KEYCHAIN_GLB = os.path.join(REPO, 'public/evade/keychain/evade-keychain.glb')

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default

R = 1.8            # inner radius of the can
WT = 0.1           # wall thickness
H = 3.5            # wall height
LOFT = 1.75        # loft floor height
OPEN = -45.0       # the cut-away faces this azimuth (degrees), toward the hero camera
WALL_A0, WALL_A1 = 40.0, 230.0   # the wall runs from WALL_A0 to WALL_A1 counter-clockwise

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
col_room = bpy.data.collections.new('EVADE_Room'); scene.collection.children.link(col_room)
rnd = random.Random(11)

# ---------------------------------------------------------------- materials
def hexrgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c] + [1]

_mats = {}
def mat(name, color='#ffffff', rough=0.6, metal=0.0, emit=None, emit_str=0.0, alpha=1.0, trans=0.0, coat=0.0):
    if name in _mats: return _mats[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = hexrgb(color)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = hexrgb(emit); b.inputs['Emission Strength'].default_value = emit_str
    if trans:
        b.inputs['Transmission Weight'].default_value = trans; b.inputs['IOR'].default_value = 1.45
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
    if coat: b.inputs['Coat Weight'].default_value = coat
    _mats[name] = m; return m

def img_mat(name, file, emit_str=0.0, rough=0.5, alpha=False, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(os.path.join(TEX, file))
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    if emit_str:
        nt.links.new(t.outputs['Color'], b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = emit_str
    if alpha:
        nt.links.new(t.outputs['Alpha'], b.inputs['Alpha'])
        try: m.surface_render_method = 'DITHERED'
        except Exception: pass
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    return m

M = dict(
    wall_in=mat('Wall_Inside_Navy', '#24356a', 0.85),
    wainscot=mat('Wall_Wainscot', '#17244c', 0.8),
    trim=mat('Neon_Cyan', '#36e3ff', 0.4, emit='#36e3ff', emit_str=3.5),
    pink=mat('Neon_Pink', '#ff4fa3', 0.4, emit='#ff4fa3', emit_str=3.5),
    gold=mat('Gold', '#ffc42e', 0.25, metal=1.0),
    rim=mat('Diorama_Rim', '#0d1430', 0.7),
    alu=mat('Can_Aluminium', '#dfe4ec', 0.22, metal=1.0),
    label=img_mat('Can_Label', 'can_label.png', rough=0.3),
    wood=img_mat('Wood_Floor', 'wood.png', rough=0.55),
    wood_dark=mat('Wood_Dark', '#5b3a26', 0.55),
    desk=mat('Desk_Black', '#151a2c', 0.35, coat=0.5),
    plastic=mat('Plastic_Dark', '#0f1322', 0.4),
    chair=mat('Chair_Blue', '#2753c9', 0.55), chair_dark=mat('Chair_Dark', '#121833', 0.6),
    metal=mat('Metal_Silver', '#d9dde6', 0.25, metal=1.0),
    glass=mat('Glass', '#ffffff', 0.05, trans=1.0),
    rail_glass=mat('Rail_Glass', '#9fe9ff', 0.05, alpha=0.18),
    lamp_glass=mat('Lamp_Glass', '#ff8fc4', 0.08, trans=0.85),
    lamp_blob=mat('Lamp_Blob', '#ff4fa3', 0.3, emit='#ff4fa3', emit_str=5),
    lamp_blob2=mat('Lamp_Blob_Cyan', '#36e3ff', 0.3, emit='#36e3ff', emit_str=4),
    eclipse_red=mat('Eclipse_Red', '#9b1c45', 0.4), eclipse_white=mat('Eclipse_White', '#fbf6ee', 0.4),
    eclipse_blue=mat('Eclipse_Blue', '#a5d8f7', 0.35),
    beanbag=mat('Beanbag_Purple', '#5b3fb0', 0.9),
    plant=mat('Leaf_Green', '#2f9e6a', 0.7), pot=mat('Pot_Cream', '#efe2cf', 0.6),
    rug_navy=mat('Rug_Navy', '#1b2a5e', 0.95), rug_cyan=mat('Rug_Cyan', '#2fd6f0', 0.9, emit='#2fd6f0', emit_str=0.6),
    rug_white=mat('Rug_White', '#e9f6ff', 0.95),
    felt=mat('Felt_Case', '#2a3f86', 0.95),
    bulb=mat('Bulb_Warm', '#ffd9a0', 0.4, emit='#ffcf8a', emit_str=6),
    ghost=mat('Hologram_Ghost', '#36e3ff', 0.2, emit='#36e3ff', emit_str=1.6, alpha=0.35),
    pad=mat('Spawn_Pad', '#1d6f8a', 0.3, emit='#36e3ff', emit_str=0.25, alpha=0.12),
    fizz=mat('Fizz_Bubble', '#d9f6ff', 0.05, emit='#bff2ff', emit_str=1.2, alpha=0.45),
    bed=mat('CatBed_Blue', '#3c6ee0', 0.9), bed_in=mat('CatBed_Cream', '#f3e6d0', 0.95),
    trophy=mat('Trophy_Gold', '#ffc42e', 0.2, metal=1.0, emit='#ffb300', emit_str=0.15),
    orange=mat('Bridge_Orange', '#e5512b', 0.5),
)

# ---------------------------------------------------------------- helpers
def link(o):
    for c in o.users_collection: c.objects.unlink(o)
    col_room.objects.link(o); return o

def finish(o, m, bevel=0.0, smooth=False, parent=None):
    if m: o.data.materials.append(m)
    if bevel:
        bv = o.modifiers.new('bevel', 'BEVEL'); bv.width = bevel; bv.segments = 2; bv.limit_method = 'ANGLE'
    if smooth:
        for p in o.data.polygons: p.use_smooth = True
    if parent: o.parent = parent
    return link(o)

def box(name, size, loc, m, bevel=0.0, rot=(0, 0, 0), parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return finish(o, m, bevel, parent=parent)

def cyl(name, r, depth, loc, m, verts=32, rot=(0, 0, 0), bevel=0.0, smooth=True, parent=None, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name
    o = finish(o, m, bevel, smooth, parent)
    if smooth:
        try: bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
        except Exception: pass
    return o

def sphere(name, r, loc, m, scale=(1, 1, 1), seg=24, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=r, location=loc)
    o = bpy.context.object; o.name = name; o.scale = scale; bpy.ops.object.transform_apply(scale=True)
    return finish(o, m, smooth=True, parent=parent)

def torus(name, Rm, r, loc, m, rot=(0, 0, 0), parent=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=Rm, minor_radius=r, major_segments=64, minor_segments=12, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name
    return finish(o, m, smooth=True, parent=parent)

def image_plane(name, w, h, loc, rot, m, parent=None):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name; o.scale = (w, h, 1); bpy.ops.object.transform_apply(scale=True)
    return finish(o, m, parent=parent)

def empty(name, loc=(0, 0, 0), parent=None, rz=0.0):
    o = bpy.data.objects.new(name, None); o.location = loc; o.rotation_euler = (0, 0, rz); col_room.objects.link(o)
    if parent: o.parent = parent
    return o

def new_mesh_obj(name, bm, mats, parent=None, smooth=False):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); col_room.objects.link(o)
    for m in mats: me.materials.append(m)
    if smooth:
        for p in me.polygons: p.use_smooth = True
    if parent: o.parent = parent
    return o

def P(a_deg, r, z=0.0):
    a = math.radians(a_deg); return (r * math.cos(a), r * math.sin(a), z)

def on_wall(name, a_deg, r, z, parent=None):
    """An empty on the inner wall at angle a, whose local -Y (the 'front' of every prop) faces the centre."""
    return empty(name, P(a_deg, r, z), parent, rz=math.radians(a_deg - 90))

def ring_wall(name, r_in, r_out, z0, z1, a0, a1, m_out, m_in, m_edge, seg=96):
    bm = bmesh.new(); uv = bm.loops.layers.uv.new()
    n = max(4, int(seg * (a1 - a0) / 360))
    angs = [a0 + (a1 - a0) * i / n for i in range(n + 1)]
    V = []
    for a in angs:
        ar = math.radians(a); c, s = math.cos(ar), math.sin(ar)
        V.append([bm.verts.new((r_out * c, r_out * s, z0)), bm.verts.new((r_out * c, r_out * s, z1)),
                  bm.verts.new((r_in * c, r_in * s, z0)), bm.verts.new((r_in * c, r_in * s, z1))])
    def face(vs, mi, uvs=None):
        f = bm.faces.new(vs); f.material_index = mi
        if uvs:
            for l, t in zip(f.loops, uvs): l[uv].uv = t
        return f
    for i in range(n):
        a, b = V[i], V[i + 1]; ua, ub = angs[i] / 360 % 1.0, angs[i + 1] / 360 % 1.0
        if ub < ua: ub += 1.0
        face([a[0], b[0], b[1], a[1]], 0, [(ua, 0), (ub, 0), (ub, 1), (ua, 1)])          # outside: label
        face([a[2], a[3], b[3], b[2]], 1, [(0, 0), (0, 1), (1, 1), (1, 0)])              # inside
        face([a[1], b[1], b[3], a[3]], 2); face([a[0], a[2], b[2], b[0]], 2)              # top / bottom lips
    face([V[0][0], V[0][1], V[0][3], V[0][2]], 2); face([V[-1][0], V[-1][2], V[-1][3], V[-1][1]], 2)
    bm.normal_update()
    return new_mesh_obj(name, bm, [m_out, m_in, m_edge])

def arc_band(name, r, z, h, a0, a1, m, seg=96, parent=None, uv=False):
    """A curved strip on the inside of the wall. With uv=True the image reads correctly from the centre."""
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new(); n = max(4, int(seg * (a1 - a0) / 360)); prev = None
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n); c, s = math.cos(a), math.sin(a)
        cur = (bm.verts.new((r * c, r * s, z)), bm.verts.new((r * c, r * s, z + h)), 1 - i / n)
        if prev:
            f = bm.faces.new([prev[0], prev[1], cur[1], cur[0]])
            for l, t in zip(f.loops, [(prev[2], 0), (prev[2], 1), (cur[2], 1), (cur[2], 0)]): l[uvl].uv = t
        prev = cur
    bm.normal_update()
    return new_mesh_obj(name, bm, [m], parent)

def prism(name, pts, z0, z1, m_top, m_side=None, parent=None, uv_r=None):
    """Extrude a 2D outline; the top face gets planar UVs over a square of half-size uv_r."""
    bm = bmesh.new(); uv = bm.loops.layers.uv.new()
    bot = [bm.verts.new((x, y, z0)) for x, y in pts]; top = [bm.verts.new((x, y, z1)) for x, y in pts]
    ft = bm.faces.new(top); ft.material_index = 0
    fb = bm.faces.new(list(reversed(bot))); fb.material_index = 1 if m_side else 0
    ur = uv_r or max(max(abs(x), abs(y)) for x, y in pts)
    for f in (ft, fb):
        for l in f.loops: l[uv].uv = (l.vert.co.x / (2 * ur) + 0.5, l.vert.co.y / (2 * ur) + 0.5)
    k = len(pts)
    for i in range(k):
        f = bm.faces.new([bot[i], bot[(i + 1) % k], top[(i + 1) % k], top[i]]); f.material_index = 1 if m_side else 0
    bm.normal_update()
    return new_mesh_obj(name, bm, [m_top] + ([m_side] if m_side else []), parent)

def circle_pts(r, n=96, a0=0, a1=360):
    full = abs(a1 - a0) >= 360
    cnt = n if full else n + 1
    return [(r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(cnt)]

# ---------------------------------------------------------------- the can house
shell = empty('Can_House')
can = ring_wall('Can_Wall', R, R + WT, -0.12, H, WALL_A0, WALL_A1, M['label'], M['wall_in'], M['alu']); can.parent = shell
prism('Floor_Ground', circle_pts(R + WT), -0.12, 0.0, M['wood'], M['alu'], shell, uv_r=R)
torus('Can_Base_Rim', R + WT, 0.06, (0, 0, -0.12), M['alu'], parent=shell)
cyl('Can_Base_Dome', R + 0.02, 0.18, (0, 0, -0.24), M['alu'], 96, r2=R - 0.35, rot=(math.pi, 0, 0), parent=shell)
arc_band('Can_Top_Lip', R + WT / 2, H, 0.05, WALL_A0, WALL_A1, M['alu']).parent = shell
# inner wall dressing: wainscot + neon grid on both floors
for lvl, z in (('G', 0.0), ('L', LOFT + 0.1)):
    a0, a1 = (WALL_A0, WALL_A1)
    arc_band(f'Wainscot_{lvl}', R - 0.01, z, 0.8, a0, a1, M['wainscot']).parent = shell
    arc_band(f'Neon_Trim_{lvl}', R - 0.02, z + 0.8, 0.025, a0, a1, M['trim']).parent = shell
    for k, a in enumerate(range(int(a0) + 10, int(a1), 19)):
        box(f'Grid_{lvl}_{k}', (0.012, 0.02, 0.8), P(a, R - 0.015, z + 0.4), M['trim'], rot=(0, 0, math.radians(a - 90)), parent=shell)
# cut edges glow so the cross-section reads as "can"
for k, a in enumerate((WALL_A0, WALL_A1)):
    box(f'Cut_Edge_Neon_{k}', (0.03, 0.03, H + 0.1), P(a, R + WT / 2, H / 2 - 0.06), M['pink'], rot=(0, 0, math.radians(a)), parent=shell)

# loft: half disc on the closed side, with a glass rail along its open edge
loft_pts = circle_pts(R - 0.005, 48, 45, 225)
prism('Loft_Floor', loft_pts, LOFT, LOFT + 0.1, M['wood'], M['rim'], shell, uv_r=R)
d = Vector((math.cos(math.radians(45)), math.sin(math.radians(45)), 0))
box('Loft_Edge_Neon', (2 * R - 0.05, 0.03, 0.03), (0, 0, LOFT + 0.015), M['trim'], rot=(0, 0, math.radians(45)), parent=shell)
s0, s1 = -0.95, R - 0.08
mid = d * ((s0 + s1) / 2)
box('Loft_Rail_Glass', (s1 - s0, 0.02, 0.55), (mid.x, mid.y, LOFT + 0.1 + 0.3), M['rail_glass'], rot=(0, 0, math.radians(45)), parent=shell)
box('Loft_Rail_Top', (s1 - s0, 0.05, 0.035), (mid.x, mid.y, LOFT + 0.1 + 0.58), M['trim'], 0.01, rot=(0, 0, math.radians(45)), parent=shell)
for s in (s0, s1):
    box(f'Loft_Rail_Post_{s:+.1f}', (0.04, 0.04, 0.6), (d.x * s, d.y * s, LOFT + 0.4), M['alu'], parent=shell)
# ladder from the lounge up to the loft (at the loft's open end)
lad = empty('hub_ladder', (d.x * -1.3 + 0.12, d.y * -1.3 - 0.12, 0), rz=math.radians(45))
for sx in (-0.22, 0.22):
    box(f'Ladder_Rail_{sx:+.2f}', (0.05, 0.05, LOFT + 0.7), (sx, 0, (LOFT + 0.7) / 2), M['alu'], 0.01, parent=lad)
for k in range(7):
    cyl(f'Ladder_Rung_{k}', 0.02, 0.44, (0, 0, 0.25 + k * 0.25), M['trim'] if k % 2 == 0 else M['alu'], 12, rot=(0, math.radians(90), 0), parent=lad)
# giant ring-pull on the rim
def stadium(w, h, n=14, cy=0.0):
    """Rounded-rectangle outline (semicircle ends at +/- y), w wide and h long."""
    r = w / 2; pts = []
    for i in range(n + 1):
        t = math.pi * i / n; pts.append((r * math.cos(t), cy + h / 2 - r + r * math.sin(t)))
    for i in range(n + 1):
        t = math.pi + math.pi * i / n; pts.append((r * math.cos(t), cy - h / 2 + r + r * math.sin(t)))
    return pts
def ring_prism(name, outer, inner, z0, z1, m, parent=None):
    """A flat ring between two outlines with the same point count (no holes needed)."""
    bm = bmesh.new(); k = len(outer)
    ob = [bm.verts.new((x, y, z0)) for x, y in outer]; ot = [bm.verts.new((x, y, z1)) for x, y in outer]
    ib = [bm.verts.new((x, y, z0)) for x, y in inner]; it = [bm.verts.new((x, y, z1)) for x, y in inner]
    for i in range(k):
        j = (i + 1) % k
        bm.faces.new([ot[i], ot[j], it[j], it[i]]); bm.faces.new([ob[i], ib[i], ib[j], ob[j]])
        bm.faces.new([ob[i], ob[j], ot[j], ot[i]]); bm.faces.new([ib[i], it[i], it[j], ib[j]])
    bm.normal_update()
    o = new_mesh_obj(name, bm, [m], parent, smooth=False)
    bv = o.modifiers.new('bevel', 'BEVEL'); bv.width = 0.012; bv.segments = 2
    return o
# giant ring-pull standing up on the rim, like a can that's just been opened
tab = empty('hub_pull_tab', P(150, R + WT / 2, H + 0.02), rz=math.radians(150 - 90))
tabp = empty('Pull_Tab_Tilt', (0, 0, 0), tab); tabp.rotation_euler = (math.radians(-72), 0, 0)
ring_prism('Pull_Tab', stadium(0.62, 1.05, cy=-0.5), stadium(0.36, 0.5, cy=-0.66), 0, 0.045, M['alu'], parent=tabp)
ring_prism('Pull_Tab_Rivet_Ring', stadium(0.62, 0.36, cy=-0.12)[:30], stadium(0.2, 0.2, cy=-0.12)[:30], 0, 0.05, M['alu'], parent=tabp)
cyl('Pull_Tab_Rivet', 0.06, 0.07, (0, -0.12, 0.03), M['metal'], 24, parent=tabp)
# string lights along the inside of the rim
for k in range(22):
    a = WALL_A0 + 4 + k * (WALL_A1 - WALL_A0 - 8) / 21
    if 96 < a < 174: continue  # the big screen sits here
    sag = 0.1 * math.sin(math.pi * ((k % 5) / 5))
    sphere(f'String_Bulb_{k:02d}', 0.024, P(a, R - 0.06, H - 0.15 - sag), M['bulb'], seg=10, parent=shell)

# ---------------------------------------------------------------- floating Cola Run spawn pad + fizz
pad = empty('hub_spawn_pad', (0, 0, -0.62))
prism('Pad_Disc', circle_pts(2.7, 96), 0, 0.02, M['pad'], parent=pad)
for k, (rr, t) in enumerate(((2.25, 0.03), (2.62, 0.022), (1.6, 0.015))):
    torus(f'Pad_Ring_{k}', rr, t, (0, 0, 0.02), M['trim'], parent=pad)
for k in range(48):
    a = rnd.uniform(0, 360); rr = rnd.uniform(R + 0.25, 2.7); z = rnd.uniform(-0.4, H + 0.6)
    if (a - OPEN + 360) % 360 < 60 or (a - OPEN + 360) % 360 > 300:  # keep bubbles out of the main view
        continue
    sphere(f'Fizz_{k:02d}', rnd.uniform(0.025, 0.07), P(a, rr, z), M['fizz'], seg=12)

def mini_can(name, loc, s=1.0, tilt=(0, 0, 0), parent=None):
    c = empty(name, loc, parent); c.rotation_euler = tilt
    cyl(f'{name}_Body', 0.033 * s, 0.12 * s, (0, 0, 0.06 * s), M['eclipse_red'], 24, parent=c)
    cyl(f'{name}_Upper', 0.0332 * s, 0.05 * s, (0, 0, 0.1 * s), M['eclipse_blue'], 24, parent=c)
    cyl(f'{name}_Top', 0.03 * s, 0.01 * s, (0, 0, 0.125 * s), M['metal'], 24, parent=c)
    cyl(f'{name}_Logo', 0.012 * s, 0.004 * s, (0, -0.033 * s, 0.075 * s), M['eclipse_white'], 16, rot=(math.radians(90), 0, 0), parent=c)
    return c
# orbiting collectible cans (the web room spins these)
orbit = empty('hub_orbit_cans', (0, 0, 0))
for k, (a, z, rr) in enumerate(((95, 2.6, 2.45), (180, 1.4, 2.5), (255, 3.4, 2.3))):
    mini_can(f'Orbit_Can_{k}', P(a, rr, z), 3.4, (math.radians(25), math.radians(15 * k), math.radians(a)), orbit)

# ---------------------------------------------------------------- "Go home" portal on the spawn pad
PAD_TOP = -0.6
PA = -112.0
portal = empty('hub_portal', P(PA, 2.25, PAD_TOP), rz=math.radians(OPEN + 90 - 25)); portal.scale = (1.3, 1.3, 1.3)
prt_m = img_mat('Portal_Swirl', 'portal.png', emit_str=3.5, rough=0.2)
disc = prism('Portal_Swirl', circle_pts(0.5, 48), -0.01, 0.01, prt_m, parent=portal)
disc.rotation_euler = (math.radians(90), 0, 0); disc.location = (0, 0, 0.62)
torus('Portal_Ring', 0.54, 0.05, (0, 0, 0.62), M['trim'], rot=(math.radians(90), 0, 0), parent=portal)
torus('Portal_Ring_Outer', 0.62, 0.018, (0, 0, 0.62), M['pink'], rot=(math.radians(90), 0, 0), parent=portal)
cyl('Portal_Base', 0.42, 0.06, (0, 0, 0.03), M['alu'], 48, parent=portal)
torus('Portal_Base_Glow', 0.42, 0.012, (0, 0, 0.06), M['trim'], parent=portal)
bpy.ops.object.text_add(location=(0, -0.02, 1.33), rotation=(math.radians(90), 0, 0))
gt = bpy.context.object; gt.name = 'Portal_GoHome_Text'; gt.data.body = 'GO HOME'; gt.data.align_x = 'CENTER'
gt.data.size = 0.16; gt.data.extrude = 0.01
try: gt.data.font = bpy.data.fonts.load(os.path.join(REPO, 'scripts/brand/fonts/SpaceGrotesk-Bold.ttf'))
except Exception: pass
gt.data.materials.append(M['trim']); link(gt); gt.parent = portal
bpy.ops.object.select_all(action='DESELECT'); gt.select_set(True); bpy.context.view_layer.objects.active = gt
bpy.ops.object.convert(target='MESH')
# floating steps from the portal up to the floor, and glowing paw prints
p0 = Vector(P(PA, 2.0, PAD_TOP)); p1 = Vector(P(OPEN - 40, R - 0.1, 0))
for k in range(4):
    t = (k + 1) / 5; q = p0.lerp(p1, t); z = PAD_TOP + (0 - PAD_TOP) * t
    st = empty(f'Step_{k}', (q.x, q.y, z - 0.03))
    cyl(f'Step_{k}_Disc', 0.2, 0.05, (0, 0, 0), M['alu'], 32, parent=st)
    torus(f'Step_{k}_Glow', 0.2, 0.01, (0, 0, 0.026), M['trim'], parent=st)
for k in range(5):
    q = Vector(P(OPEN - 40, R - 0.4, 0)).lerp(Vector((0.25, -0.3, 0)), k / 5)
    sphere(f'Paw_{k}', 0.045, (q.x + (0.05 if k % 2 else -0.05), q.y, 0.004), M['ghost'], (1, 1.2, 0.08), 12)

# ---------------------------------------------------------------- posters (EVADE's own art)
def poster(name, file, w, h, a_deg, z, glow=None):
    p = on_wall(name, a_deg, R - 0.03, z)
    box(f'{name}_Frame', (w + 0.07, 0.035, h + 0.07), (0, 0, 0), M['rim'], 0.008, parent=p)
    image_plane(f'{name}_Art', w, h, (0, -0.02, 0), (math.radians(90), 0, 0), img_mat(f'{name}_Art', file, emit_str=0.35, rough=0.35), parent=p)
    if glow: box(f'{name}_Glow', (w + 0.11, 0.01, h + 0.11), (0, 0.022, 0), glow, parent=p)
    return p
poster('hub_poster_colarun', 'poster_colarun.png', 0.6, 1.07, 82, LOFT + 1.05, glow=M['trim'])
poster('hub_poster_bobo', 'poster_bobo.png', 0.62, 0.62, 190, LOFT + 1.0, glow=M['pink'])

# ---------------------------------------------------------------- keychain display case (lounge wall)
CA = 112
case = on_wall('hub_keychain_case', CA, R - 0.1, 0.92)
CW, CH = 0.84, 1.04
box('Case_Back', (CW, 0.04, CH), (0, 0.02, 0), M['felt'], parent=case)
for nm, sz, l in [('Case_Frame_T', (CW + 0.08, 0.13, 0.05), (0, -0.045, CH / 2 + 0.015)), ('Case_Frame_B', (CW + 0.08, 0.13, 0.05), (0, -0.045, -CH / 2 - 0.015)),
                  ('Case_Frame_L', (0.05, 0.13, CH + 0.08), (-CW / 2 - 0.015, -0.045, 0)), ('Case_Frame_R', (0.05, 0.13, CH + 0.08), (CW / 2 + 0.015, -0.045, 0))]:
    box(nm, sz, l, M['gold'], 0.006, parent=case)
box('Case_Glass', (CW, 0.006, CH), (0, -0.105, 0), M['glass'], parent=case)
box('Case_Neon', (CW, 0.012, 0.012), (0, -0.09, CH / 2 - 0.02), M['pink'], parent=case)
box('Case_Plaque', (0.26, 0.012, 0.06), (0, -0.03, -0.45), M['gold'], 0.004, parent=case)
bpy.ops.object.text_add(location=(0, -0.037, -0.464), rotation=(math.radians(90), 0, 0))
tx = bpy.context.object; tx.name = 'Case_Plaque_Serial'; tx.data.body = '#00412'; tx.data.align_x = 'CENTER'; tx.data.size = 0.042
tx.data.materials.append(M['rim']); link(tx); tx.parent = case
bpy.ops.object.convert(target='MESH')

# ---------------------------------------------------------------- the EVADE collection wall
# The keychain case sits in the middle; four holographic cubbies flank it, one per
# upcoming drop. Each cubby is its own hub_slot_* node with a *_Holo child, so the
# web room can spin the hologram and swap in the real item once it's unlocked.
coll = empty('hub_collection', (0, 0, 0))
case.parent = coll
def cubby(name, a_deg, z, shape):
    c = on_wall(name, a_deg, R - 0.12, z, coll)
    W_, H_ = 0.36, 0.42
    box(f'{name}_Back', (W_, 0.03, H_), (0, 0.02, 0), M['felt'], parent=c)
    for nm, sz, l in [('T', (W_ + 0.04, 0.09, 0.02), (0, -0.03, H_ / 2)), ('B', (W_ + 0.04, 0.09, 0.02), (0, -0.03, -H_ / 2)),
                      ('L', (0.02, 0.09, H_ + 0.04), (-W_ / 2, -0.03, 0)), ('R', (0.02, 0.09, H_ + 0.04), (W_ / 2, -0.03, 0))]:
        box(f'{name}_Frame_{nm}', sz, l, M['plastic'], 0.004, parent=c)
    box(f'{name}_Edge', (W_, 0.006, 0.006), (0, -0.075, H_ / 2 - 0.012), M['trim'], parent=c)
    cyl(f'{name}_Projector', 0.07, 0.025, (0, -0.03, -H_ / 2 + 0.022), M['alu'], 32, parent=c)
    torus(f'{name}_Projector_Glow', 0.07, 0.006, (0, -0.03, -H_ / 2 + 0.036), M['trim'], parent=c)
    h = empty(f'{name}_Holo', (0, -0.03, -H_ / 2 + 0.05), c)
    g = M['ghost']
    if shape == 'hoodie':
        box(f'{name}_Hoodie_Body', (0.17, 0.05, 0.17), (0, 0, 0.12), g, 0.02, parent=h)
        box(f'{name}_Hoodie_Pocket', (0.1, 0.012, 0.045), (0, -0.03, 0.08), g, 0.01, parent=h)
        sphere(f'{name}_Hoodie_Hood', 0.07, (0, 0.005, 0.225), g, (1, 0.8, 0.85), 16, parent=h)
        for sx in (-1, 1):
            box(f'{name}_Hoodie_Sleeve_{sx}', (0.05, 0.045, 0.16), (sx * 0.11, 0, 0.12), g, 0.015, rot=(0, sx * math.radians(18), 0), parent=h)
    elif shape == 'tee':
        box(f'{name}_Tee_Body', (0.15, 0.02, 0.18), (0, 0, 0.13), g, 0.01, parent=h)
        for sx in (-1, 1):
            box(f'{name}_Tee_Sleeve_{sx}', (0.07, 0.02, 0.06), (sx * 0.1, 0, 0.19), g, 0.01, rot=(0, -sx * math.radians(30), 0), parent=h)
        cyl(f'{name}_Tee_Logo', 0.03, 0.004, (0, -0.012, 0.15), M['pink'], 24, rot=(math.radians(90), 0, 0), parent=h)
    elif shape == 'deskmat':
        mt = empty(f'{name}_Mat', (0, 0, 0.12), h); mt.rotation_euler = (math.radians(70), 0, 0)
        box(f'{name}_Mat_Slab', (0.28, 0.16, 0.01), (0, 0, 0), g, 0.02, parent=mt)
        cyl(f'{name}_Mat_Moon', 0.035, 0.004, (0.06, 0.02, 0.007), M['pink'], 24, parent=mt)
        box(f'{name}_Mat_Stripe', (0.24, 0.012, 0.003), (0, -0.05, 0.007), M['trim'], parent=mt)
    else:
        bpy.ops.object.text_add(location=(0, 0, 0.06), rotation=(math.radians(90), 0, 0))
        q = bpy.context.object; q.name = f'{name}_Mystery_Mark'; q.data.body = '?'; q.data.align_x = 'CENTER'
        q.data.size = 0.26; q.data.extrude = 0.02
        try: q.data.font = bpy.data.fonts.load(os.path.join(REPO, 'scripts/brand/fonts/SpaceGrotesk-Bold.ttf'))
        except Exception: pass
        q.data.materials.append(g); link(q); q.parent = h
        bpy.ops.object.select_all(action='DESELECT'); q.select_set(True); bpy.context.view_layer.objects.active = q
        bpy.ops.object.convert(target='MESH')
    return c
cubby('hub_slot_hoodie', CA + 23, 1.16, 'hoodie')
cubby('hub_slot_tee', CA + 23, 0.68, 'tee')
cubby('hub_slot_deskmat', CA - 23, 1.16, 'deskmat')
cubby('hub_slot_mystery', CA - 23, 0.68, 'mystery')
# "EVADE COLLECTION" sign over the case
bpy.ops.object.text_add(location=(0, 0, 0), rotation=(math.radians(90), 0, 0))
st = bpy.context.object; st.name = 'Collection_Sign'; st.data.body = 'EVADE COLLECTION'; st.data.align_x = 'CENTER'
st.data.size = 0.085; st.data.extrude = 0.006
try: st.data.font = bpy.data.fonts.load(os.path.join(REPO, 'scripts/brand/fonts/SpaceGrotesk-Bold.ttf'))
except Exception: pass
st.data.materials.append(M['trim']); link(st)
sign_anchor = on_wall('Collection_Sign_Anchor', CA, R - 0.1, 1.53, coll)
st.parent = sign_anchor; st.location = (0, -0.06, 0)
bpy.ops.object.select_all(action='DESELECT'); st.select_set(True); bpy.context.view_layer.objects.active = st
bpy.ops.object.convert(target='MESH')

# ---------------------------------------------------------------- lounge: shelves, lamp, rug, Bobo's bed, beanbag, porthole
shelf = on_wall('hub_shelf', 62, R - 0.14, 0)
for k, z in enumerate((0.95, 1.38)):
    box(f'Shelf_Board_{k}', (0.95, 0.26, 0.04), (0, 0, z), M['wood_dark'], 0.008, parent=shelf)
    box(f'Shelf_LED_{k}', (0.9, 0.01, 0.008), (0, -0.125, z - 0.024), M['trim'], parent=shelf)
tr = empty('hub_trophy_colarun', (-0.3, 0, 0.97), shelf)
cyl('Trophy_Base', 0.06, 0.04, (0, 0, 0.02), M['rim'], 24, parent=tr)
cyl('Trophy_Stem', 0.015, 0.08, (0, 0, 0.08), M['trophy'], 16, parent=tr)
cyl('Trophy_Cup', 0.07, 0.11, (0, 0, 0.17), M['trophy'], 32, r2=0.035, rot=(math.pi, 0, 0), parent=tr)
for s in (-1, 1):
    torus(f'Trophy_Handle_{s}', 0.03, 0.007, (s * 0.075, 0, 0.18), M['trophy'], rot=(math.radians(90), 0, 0), parent=tr)
sg = empty('hub_snowglobe_sf', (0.05, 0, 0.97), shelf)
cyl('Globe_Base', 0.07, 0.05, (0, 0, 0.025), M['wood_dark'], 32, parent=sg)
sphere('Globe_Glass', 0.08, (0, 0, 0.12), M['glass'], parent=sg)
box('Globe_Bridge_Deck', (0.1, 0.012, 0.006), (0, 0, 0.09), M['orange'], parent=sg)
for xx in (-0.03, 0.03):
    box(f'Globe_Bridge_Tower_{xx:+.2f}', (0.01, 0.01, 0.07), (xx, 0, 0.115), M['orange'], parent=sg)
# top shelf: a row of Eclipse cans (the hologram slots moved to the collection wall)
for k, x in enumerate((-0.3, -0.18, 0.2, 0.32)):
    mini_can(f'Shelf_Can_{k}', (x, 0, 1.40), 1.3, parent=shelf)

lamp_tbl = empty('Side_Table', P(168, 1.42, 0))
cyl('Side_Table_Top', 0.24, 0.05, (0, 0, 0.55), M['wood_dark'], 32, parent=lamp_tbl)
cyl('Side_Table_Stem', 0.04, 0.5, (0, 0, 0.27), M['wood_dark'], 16, parent=lamp_tbl)
cyl('Side_Table_Foot', 0.17, 0.03, (0, 0, 0.015), M['wood_dark'], 32, parent=lamp_tbl)
lamp = empty('hub_cola_lamp', (0, 0, 0.575), lamp_tbl)
cyl('Lamp_Base', 0.1, 0.12, (0, 0, 0.06), M['metal'], 32, r2=0.085, parent=lamp)
cyl('Lamp_Glass', 0.085, 0.42, (0, 0, 0.33), M['lamp_glass'], 32, parent=lamp)
cyl('Lamp_Cap', 0.085, 0.06, (0, 0, 0.57), M['metal'], 32, r2=0.06, parent=lamp)
cyl('Lamp_Label', 0.0865, 0.09, (0, 0, 0.27), M['eclipse_red'], 32, parent=lamp)
for k, (x, y, z, r) in enumerate([(0.01, 0.0, 0.18, 0.045), (-0.02, 0.01, 0.33, 0.035), (0.02, -0.01, 0.45, 0.03), (0.0, 0.02, 0.4, 0.022)]):
    sphere(f'Lamp_Blob_{k}', r, (x, y, z), M['lamp_blob'] if k != 2 else M['lamp_blob2'], (1, 1, 1.25), 16, parent=lamp)

port = on_wall('hub_window', 156, R - 0.02, 1.05)
disc_sky = prism('Porthole_Sky', circle_pts(0.36, 48), 0, 0.01, img_mat('Porthole_Sky', 'sky.png', emit_str=1.6), parent=port)
disc_sky.rotation_euler = (math.radians(90), 0, 0)
torus('Porthole_Frame', 0.39, 0.045, (0, -0.02, 0), M['alu'], rot=(math.radians(90), 0, 0), parent=port)
for k in range(8):
    a = k * 45
    sphere(f'Porthole_Bolt_{k}', 0.018, (0.39 * math.cos(math.radians(a)), -0.06, 0.39 * math.sin(math.radians(a))), M['alu'], seg=10, parent=port)

rug = empty('hub_rug', (0.25, -0.3, 0.0))
prism('Rug_Outer', circle_pts(1.05, 64), 0, 0.012, M['rug_navy'], parent=rug)
for k, rr in enumerate((0.95, 0.68, 0.4)):
    torus(f'Rug_Ring_{k}', rr, 0.02 if k == 0 else 0.015, (0, 0, 0.012), M['rug_cyan'], parent=rug)
prism('Rug_Center', circle_pts(0.38, 48), 0, 0.014, M['rug_white'], parent=rug)
bed = empty('hub_cat_bed', (0.25, -0.3, 0.0))
torus('CatBed_Rim', 0.3, 0.09, (0, 0, 0.09), M['bed'], parent=bed)
cyl('CatBed_Cushion', 0.3, 0.08, (0, 0, 0.04), M['bed_in'], 48, parent=bed)
bean = empty('Beanbag', P(205, 1.1, 0))
sphere('Beanbag_Body', 0.42, (0, 0, 0.28), M['beanbag'], (1.0, 1.05, 0.7), 32, parent=bean)
sphere('Beanbag_Cushion', 0.23, (0.1, 0.1, 0.52), M['beanbag'], (1.0, 1.0, 0.5), 24, parent=bean)
pl = empty('Plant_Lounge', P(30, 1.45, 0))
cyl('Plant_Pot', 0.18, 0.4, (0, 0, 0.2), M['pot'], 32, r2=0.15, parent=pl)
for k in range(9):
    a = k * 2.4; r = 0.11 + 0.03 * (k % 3)
    sphere(f'Plant_Leaf_{k}', 0.12, (r * math.cos(a), r * math.sin(a), 0.58 + 0.08 * (k % 4)), M['plant'], (0.7, 0.45, 1.25), 14, parent=pl)

# ---------------------------------------------------------------- loft: the hub computer
desk = on_wall('Desk', 135, R - 0.5, LOFT + 0.1)
box('Desk_Top', (1.5, 0.66, 0.05), (0, 0, 0.76), M['desk'], 0.01, parent=desk)
box('Desk_LED', (1.45, 0.01, 0.012), (0, -0.332, 0.735), M['trim'], parent=desk)
for sx in (-0.7, 0.7):
    box(f'Desk_Leg_{sx:+.1f}', (0.06, 0.58, 0.74), (sx, 0, 0.37), M['plastic'], 0.01, parent=desk)
box('Desk_Mat', (1.1, 0.4, 0.006), (-0.08, -0.08, 0.788), M['rug_navy'], 0.003, parent=desk)
box('Desk_Mat_Edge', (1.11, 0.41, 0.004), (-0.08, -0.08, 0.786), M['trim'], parent=desk)
# the hub computer's screen: a giant curved display that follows the can's wall
SC_A, SC_SPAN = 135.0, 70.0
SC_Z0, SC_Z1 = LOFT + 0.1 + 0.86, H - 0.08
pc = empty('hub_computer', (0, 0, 0))
arc_band('Screen_Bezel', R - 0.06, SC_Z0 - 0.05, SC_Z1 - SC_Z0 + 0.1, SC_A - SC_SPAN / 2 - 1.6, SC_A + SC_SPAN / 2 + 1.6, M['plastic'], parent=pc)
arc_band('Screen_Backglow', R - 0.03, SC_Z0 - 0.09, SC_Z1 - SC_Z0 + 0.18, SC_A - SC_SPAN / 2 - 3.2, SC_A + SC_SPAN / 2 + 3.2, M['pink'], parent=pc)
scr = arc_band('Monitor_Screen', R - 0.075, SC_Z0, SC_Z1 - SC_Z0, SC_A - SC_SPAN / 2, SC_A + SC_SPAN / 2,
               img_mat('Monitor_Screen', 'screen.png', emit_str=2.6, rough=0.15), parent=pc, uv=True)
sphere('hub_alert_light', 0.035, P(SC_A + SC_SPAN / 2 - 2, R - 0.09, SC_Z0 - 0.03), M['pink'], parent=pc)
box('Keyboard', (0.44, 0.14, 0.022), (-0.05, -0.15, 0.8), M['plastic'], 0.006, parent=desk)
box('Keyboard_Glow', (0.42, 0.12, 0.004), (-0.05, -0.15, 0.812), M['trim'], parent=desk)
sphere('Mouse', 0.035, (0.3, -0.15, 0.8), M['plastic'], (0.8, 1.2, 0.5), 16, parent=desk)
tw = empty('PC_Tower', (0.45, 0.06, 0.0), desk)  # under the desk so the wall screen stays clear
box('Tower_Case', (0.2, 0.42, 0.46), (0, 0, 0.23), M['plastic'], 0.01, parent=tw)
box('Tower_Glass', (0.005, 0.38, 0.4), (-0.102, 0, 0.23), M['glass'], parent=tw)
for k, z in enumerate((0.12, 0.25, 0.38)):
    torus(f'Tower_Fan_{k}', 0.055, 0.008, (-0.09, 0.1, z), M['pink'] if k == 1 else M['trim'], rot=(0, math.radians(90), 0), parent=tw)
mini_can('Desk_Can_1', (-0.55, -0.12, 0.785), parent=desk)
mini_can('Desk_Can_2', (-0.46, -0.05, 0.785), parent=desk)
ch = empty('Gaming_Chair', (0.62, -0.72, 0), desk); ch.rotation_euler = (0, 0, math.radians(58))
box('Chair_Seat', (0.5, 0.48, 0.1), (0, 0, 0.5), M['chair'], 0.04, parent=ch)
box('Chair_Back', (0.48, 0.1, 0.7), (0, -0.24, 0.88), M['chair'], 0.05, parent=ch)
box('Chair_Back_Stripe', (0.12, 0.105, 0.66), (0, -0.24, 0.88), M['chair_dark'], 0.03, parent=ch)
cyl('Chair_Pole', 0.03, 0.36, (0, 0, 0.28), M['metal'], 16, parent=ch)
for k in range(5):
    a = k * 2 * math.pi / 5
    box(f'Chair_Leg_{k}', (0.28, 0.05, 0.04), (0.14 * math.cos(a), 0.14 * math.sin(a), 0.07), M['plastic'], 0.01, rot=(0, 0, a), parent=ch)
    sphere(f'Chair_Wheel_{k}', 0.03, (0.27 * math.cos(a), 0.27 * math.sin(a), 0.03), M['plastic'], seg=12, parent=ch)
sign = empty('hub_sign_evade', (mid.x + 0.03, mid.y - 0.03, LOFT + 0.1 + 0.3), rz=math.radians(45))
image_plane('Sign_EVADE_Logo', 1.05, 1.05 * 158 / 600, (0, -0.012, 0), (math.radians(90), 0, 0), img_mat('Sign_EVADE', 'sign_evade.png', emit_str=2.2, alpha=True), parent=sign)
box('Sign_Backplate', (1.17, 0.02, 0.34), (0, 0.0, 0), M['plastic'], 0.01, parent=sign)
box('Sign_Underglow', (1.21, 0.012, 0.38), (0, 0.012, 0), M['trim'], parent=sign)
pl2 = empty('Plant_Loft', P(205, 1.45, LOFT + 0.1))
cyl('Plant2_Pot', 0.14, 0.3, (0, 0, 0.15), M['pot'], 32, r2=0.12, parent=pl2)
for k in range(7):
    a = k * 2.6
    sphere(f'Plant2_Leaf_{k}', 0.1, (0.09 * math.cos(a), 0.09 * math.sin(a), 0.42 + 0.06 * (k % 3)), M['plant'], (0.7, 0.45, 1.2), 12, parent=pl2)

# ---------------------------------------------------------------- imported characters / collectibles
def import_glb(path, name, target_h, loc, rot_z=0.0, drop=()):
    if not os.path.exists(path):
        print('MISSING', path); return None
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    for o in list(new):
        if any(o.name.startswith(dd) for dd in drop):
            bpy.data.objects.remove(o, do_unlink=True); new.remove(o)
    root = empty(name + '_Asset')
    for o in new:
        for c in o.users_collection: c.objects.unlink(o)
        col_room.objects.link(o)
        if o.parent is None: o.parent = root
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); pts = []
    for o in new:
        if o.type == 'MESH':
            ev = o.evaluated_get(dg); me = ev.to_mesh()
            pts += [o.matrix_world @ v.co for v in me.vertices]; ev.to_mesh_clear()
    mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
    s = target_h / (mx.z - mn.z); c = (mn + mx) / 2
    piv = empty(name, loc, rz=rot_z)
    root.parent = piv; root.scale = (s, s, s); root.location = (-c.x * s, -c.y * s, -mn.z * s)
    return piv

bobo = import_glb(BOBO_GLB, 'hub_bobo', 0.78, (0.25, -0.3, 0.09), rot_z=math.radians(55), drop=('Icosphere',))
arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE' and o.name.startswith('Armature')), None)
if arm and arm.animation_data is not None:
    act = bpy.data.actions.get(arg('--pose', 'Sit')) or bpy.data.actions.get('Chill')
    if act: arm.animation_data.action = act
scene.frame_set(int(arg('--frame', '12')))
key = import_glb(KEYCHAIN_GLB, 'hub_keychain', 0.84, (0, 0, 0))
if key:
    key.parent = case; key.location = (0, -0.04, -0.4); key.rotation_euler = (0, 0, 0)
cola = import_glb(COLA_GLB, 'hub_cola_collectible', 0.2, (0, 0, 0), drop=('Icosphere',))
if cola:
    cola.parent = shelf; cola.location = (0.32, 0, 0.97)

# ---------------------------------------------------------------- lights, world, cameras
def light(name, kind, loc, energy, color, size=0.2, rot=None, aim=None):
    ld = bpy.data.lights.new(name, kind); ld.energy = energy; ld.color = hexrgb(color)[:3]
    if kind == 'AREA': ld.size = size
    else: ld.shadow_soft_size = size
    o = bpy.data.objects.new(name, ld); o.location = loc; col_room.objects.link(o)
    if rot: o.rotation_euler = rot
    if aim: o.rotation_euler = (Vector(aim) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return o

light('Key_Warm', 'AREA', (4.2, -4.6, 5.4), 900, '#ffd7a8', 3.0, aim=(0, 0, 1.2))
light('Fill_Cool', 'AREA', (-3.5, -4.5, 2.2), 260, '#8fb4ff', 3.0, aim=(0, 0, 1.0))
light('Rim_Back', 'AREA', (-4.0, 4.0, 4.5), 600, '#dfe8ff', 3.0, aim=(0, 0, 1.5))
light('Inside_Bounce', 'AREA', (0, 0, H + 0.4), 160, '#ffe9cc', 2.5, aim=(0, 0, 0))
light('Lamp_Glow', 'POINT', P(168, 1.42, 0.95), 50, '#ff5fae', 0.1)
light('Monitor_Glow', 'AREA', P(135, R - 1.15, LOFT + 1.3), 70, '#7fd8ff', 1.0, aim=P(135, R, LOFT + 1.0))
light('Case_Spot', 'SPOT', P(CA, R - 0.9, 1.75), 70, '#fff1d6', 0.05, aim=P(CA, R, 0.9)).data.spot_size = math.radians(45)
light('Pad_Glow', 'POINT', (0, 0, -0.5), 60, '#36e3ff', 1.0)

world = bpy.data.worlds.new('World'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = hexrgb('#0a1028')
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6

cam_d = bpy.data.cameras.new('Camera')
cam = bpy.data.objects.new('Camera', cam_d); scene.collection.objects.link(cam); scene.camera = cam
def orbit_cam(az, el, dist, tgt_z):
    a, e = math.radians(az), math.radians(el)
    return (dist * math.cos(e) * math.cos(a), dist * math.cos(e) * math.sin(a), tgt_z + dist * math.sin(e)), (0, 0, tgt_z)
SHOTS = {  # name: (camera location, look-at target, lens)
    'hero': orbit_cam(OPEN - 8, 22, 12.2, 1.4) + (50,),
    'side': orbit_cam(15, 18, 12.5, 1.45) + (50,),
    'back': orbit_cam(150, 15, 12.5, 1.45) + (50,),
    'top': orbit_cam(OPEN, 58, 12.5, 1.0) + (50,)
    ,'portal': (P(PA + 25, 4.2, 0.6), P(PA, 2.2, 0.0), 35),
    'case': (P(OPEN + 20, 0.9, 1.25), P(CA, R, 0.95), 30),
    'loft': (P(OPEN, 1.2, LOFT + 1.6), P(135, R, LOFT + 0.9), 26),
    'lounge': (P(OPEN - 5, 2.6, 0.9), (-0.2, 0.4, 0.55), 30),
}
loc_, tgt_, lens_ = SHOTS[arg('--shot', 'hero')]
cam_d.lens = float(arg('--lens', lens_))
cam.location = loc_
cam.rotation_euler = (Vector(tgt_) - Vector(loc_)).to_track_quat('-Z', 'Y').to_euler()

# ---------------------------------------------------------------- output
r = scene.render
r.engine = 'CYCLES'; scene.cycles.device = 'CPU'
scene.cycles.samples = int(arg('--samples', '96')); scene.cycles.use_denoising = True
res = int(arg('--res', '1200')); r.resolution_x = res; r.resolution_y = int(res * float(arg('--aspect', '1.0')))
scene.view_settings.view_transform = 'AgX'
try: scene.view_settings.look = 'AgX - Medium High Contrast'
except Exception: pass

if arg('--blend'):
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(arg('--blend')))
if arg('--render'):
    r.filepath = os.path.abspath(arg('--render')); bpy.ops.render.render(write_still=True)
if arg('--glb'):
    for o in scene.objects: o.select_set(o.name in col_room.all_objects)
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(arg('--glb')), export_format='GLB', use_selection=True,
                              export_apply=True, export_lights=False, export_cameras=False, export_animations=True,
                              export_image_format='WEBP', export_image_quality=82)
print('BUILD_OK objects=', len(col_room.all_objects))
