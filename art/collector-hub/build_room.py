"""EVADE room for the MEDIALIFE Collector Hub, built entirely by script.

Run (any Blender 4.2+):
  blender -b --python art/collector-hub/build_room.py -- [--render out.png] [--glb out.glb] [--blend out.blend] [--samples N] [--res N]

Everything is procedural geometry plus EVADE's supplied art (posters, screen and sky are composited by
make_textures.py). No image-to-image or image-to-3D generation touches EVADE assets.
Units are metres, Z up in Blender (Y up after glTF export). The floor centre is the origin.
Object names that start with "hub_" are interaction targets the web room looks up by name.
"""
import bpy, bmesh, math, os, sys
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

ROOM = 4.2          # floor is ROOM x ROOM
HALF = ROOM / 2
WALL_H = 2.9
WALL_T = 0.16

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
col_room = bpy.data.collections.new('EVADE_Room'); scene.collection.children.link(col_room)

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
        b.inputs['Alpha'].default_value = alpha; m.blend_method = 'BLEND' if hasattr(m, 'blend_method') else None
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
    if coat: b.inputs['Coat Weight'].default_value = coat
    _mats[name] = m; return m

def img_mat(name, file, emit_str=0.0, rough=0.5, alpha=False):
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
    b.inputs['Roughness'].default_value = rough
    return m

M = dict(
    wall=mat('Wall_Navy', '#24356a', 0.85),
    wainscot=mat('Wall_Wainscot', '#17244c', 0.8),
    trim=mat('Neon_Cyan', '#36e3ff', 0.4, emit='#36e3ff', emit_str=6),
    pink=mat('Neon_Pink', '#ff4fa3', 0.4, emit='#ff4fa3', emit_str=6),
    gold=mat('Gold', '#ffc42e', 0.25, metal=1.0),
    rim=mat('Diorama_Rim', '#0d1430', 0.7),
    wood_a=mat('Wood_Light', '#b07a4f', 0.55), wood_b=mat('Wood_Mid', '#966541', 0.6), wood_dark=mat('Wood_Dark', '#5b3a26', 0.55),
    desk=mat('Desk_Black', '#151a2c', 0.35, coat=0.5),
    plastic=mat('Plastic_Dark', '#0f1322', 0.4),
    chair=mat('Chair_Blue', '#2753c9', 0.55), chair_dark=mat('Chair_Dark', '#121833', 0.6),
    metal=mat('Metal_Silver', '#d9dde6', 0.25, metal=1.0),
    glass=mat('Glass', '#ffffff', 0.05, trans=1.0),
    lamp_glass=mat('Lamp_Glass', '#ff8fc4', 0.08, trans=0.85),
    lamp_blob=mat('Lamp_Blob', '#ff4fa3', 0.3, emit='#ff4fa3', emit_str=9),
    lamp_blob2=mat('Lamp_Blob_Cyan', '#36e3ff', 0.3, emit='#36e3ff', emit_str=7),
    eclipse_red=mat('Eclipse_Red', '#9b1c45', 0.4), eclipse_white=mat('Eclipse_White', '#fbf6ee', 0.4),
    beanbag=mat('Beanbag_Purple', '#5b3fb0', 0.9),
    plant=mat('Leaf_Green', '#2f9e6a', 0.7), pot=mat('Pot_Cream', '#efe2cf', 0.6),
    rug_navy=mat('Rug_Navy', '#1b2a5e', 0.95), rug_cyan=mat('Rug_Cyan', '#2fd6f0', 0.9, emit='#2fd6f0', emit_str=0.6),
    rug_white=mat('Rug_White', '#e9f6ff', 0.95),
    felt=mat('Felt_Case', '#2a3f86', 0.95),
    bulb=mat('Bulb_Warm', '#ffd9a0', 0.4, emit='#ffcf8a', emit_str=12),
    ghost=mat('Hologram_Ghost', '#36e3ff', 0.2, emit='#36e3ff', emit_str=2.5, alpha=0.35),
    bed=mat('CatBed_Blue', '#3c6ee0', 0.9), bed_in=mat('CatBed_Cream', '#f3e6d0', 0.95),
    trophy=mat('Trophy_Gold', '#ffc42e', 0.2, metal=1.0, emit='#ffb300', emit_str=0.15),
)

# ---------------------------------------------------------------- geometry helpers
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

def torus(name, R, r, loc, m, rot=(0, 0, 0), parent=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=48, minor_segments=12, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name
    return finish(o, m, smooth=True, parent=parent)

def image_plane(name, w, h, loc, rot, m, parent=None):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name; o.scale = (w, h, 1); bpy.ops.object.transform_apply(scale=True)
    return finish(o, m, parent=parent)

def empty(name, loc=(0, 0, 0), parent=None):
    o = bpy.data.objects.new(name, None); o.location = loc; col_room.objects.link(o)
    if parent: o.parent = parent
    return o

ROT_BACK = (math.radians(90), 0, 0)                       # plane facing -Y (on the back wall)
ROT_LEFT = (math.radians(90), 0, math.radians(-90))        # plane facing +X (on the left wall)

# ---------------------------------------------------------------- room shell (diorama corner)
shell = empty('Room_Shell')
box('Floor_Base', (ROOM + WALL_T, ROOM + WALL_T, 0.22), (-WALL_T / 2, WALL_T / 2, -0.11), M['rim'], 0.02, parent=shell)
n = 14; pw = ROOM / n
for i in range(n):  # planks run front to back
    box(f'Floor_Plank_{i:02d}', (pw - 0.006, ROOM, 0.03), (-HALF + pw * (i + 0.5), 0, 0.015), M['wood_a'] if i % 2 else M['wood_b'], 0.004, parent=shell)
box('Wall_Back', (ROOM + WALL_T, WALL_T, WALL_H), (-WALL_T / 2, HALF + WALL_T / 2, WALL_H / 2), M['wall'], parent=shell)
box('Wall_Left', (WALL_T, ROOM, WALL_H), (-HALF - WALL_T / 2, 0, WALL_H / 2), M['wall'], parent=shell)
box('Wall_Back_Cap', (ROOM + WALL_T + 0.02, WALL_T + 0.02, 0.05), (-WALL_T / 2, HALF + WALL_T / 2, WALL_H), M['rim'], 0.01, parent=shell)
box('Wall_Left_Cap', (WALL_T + 0.02, ROOM + 0.02, 0.05), (-HALF - WALL_T / 2, 0, WALL_H), M['rim'], 0.01, parent=shell)
# wainscot + neon "Cola Run grid" trim line
box('Wainscot_Back', (ROOM, 0.03, 0.9), (0, HALF - 0.015, 0.45), M['wainscot'], parent=shell)
box('Wainscot_Left', (0.03, ROOM, 0.9), (-HALF + 0.015, 0, 0.45), M['wainscot'], parent=shell)
box('Neon_Trim_Back', (ROOM, 0.035, 0.022), (0, HALF - 0.03, 0.91), M['trim'], parent=shell)
box('Neon_Trim_Left', (0.035, ROOM, 0.022), (-HALF + 0.03, 0, 0.91), M['trim'], parent=shell)
for i in range(1, 7):  # vertical grid ticks on the wainscot
    box(f'Grid_Back_{i}', (0.012, 0.034, 0.9), (-HALF + i * ROOM / 7, HALF - 0.03, 0.45), M['trim'], parent=shell)
    box(f'Grid_Left_{i}', (0.034, 0.012, 0.9), (-HALF + 0.03, -HALF + i * ROOM / 7, 0.45), M['trim'], parent=shell)
box('Skirting_Back', (ROOM, 0.04, 0.08), (0, HALF - 0.02, 0.04), M['rim'], parent=shell)
box('Skirting_Left', (0.04, ROOM, 0.08), (-HALF + 0.02, 0, 0.04), M['rim'], parent=shell)

# ---------------------------------------------------------------- window (left wall) with eclipse-moon night sky
win = empty('hub_window', (-HALF + 0.02, -0.75, 1.75))
image_plane('Window_Sky', 1.05, 1.05, (0.0, 0, 0), ROT_LEFT, img_mat('Window_Sky', 'sky.png', emit_str=1.6), parent=win)
for nm, s, l in [('Window_Frame_T', (0.08, 1.25, 0.08), (0.02, 0, 0.56)), ('Window_Frame_B', (0.12, 1.3, 0.08), (0.04, 0, -0.56)),
                 ('Window_Frame_L', (0.08, 0.08, 1.2), (0.02, -0.56, 0)), ('Window_Frame_R', (0.08, 0.08, 1.2), (0.02, 0.56, 0)),
                 ('Window_Mullion_V', (0.04, 0.035, 1.05), (0.02, 0, 0)), ('Window_Mullion_H', (0.04, 1.05, 0.035), (0.02, 0, 0))]:
    box(nm, s, l, M['eclipse_white'], 0.01, parent=win)
box('Window_Sill', (0.22, 1.4, 0.05), (0.1, 0, -0.62), M['wood_dark'], 0.01, parent=win)
cyl('Sill_Plant_Pot', 0.07, 0.11, (0.11, 0.45, -0.54), M['pot'], parent=win)
for k in range(5):
    a = k * 1.25
    sphere(f'Sill_Plant_Leaf_{k}', 0.06, (0.11 + 0.05 * math.cos(a), 0.45 + 0.05 * math.sin(a), -0.43 + 0.02 * k), M['plant'], (1, 0.6, 1.3), 12, parent=win)
# curtains
for side, y in (('L', -0.72), ('R', 0.72)):
    o = box(f'Curtain_{side}', (0.06, 0.22, 1.5), (0.06, y, -0.02), M['chair'], 0.02, parent=win)

# ---------------------------------------------------------------- posters (EVADE's own art)
def poster(name, file, w, h, loc, rot, frame=M['rim'], glow=None):
    p = empty(name, loc)
    t = 0.035
    if rot == ROT_BACK:
        box(f'{name}_Frame', (w + 0.07, t, h + 0.07), (0, 0.0, 0), frame, 0.008, parent=p)
        image_plane(f'{name}_Art', w, h, (0, -t / 2 - 0.002, 0), rot, img_mat(f'{name}_Art', file, emit_str=0.35, rough=0.35), parent=p)
        if glow: box(f'{name}_Glow', (w + 0.11, 0.01, h + 0.11), (0, t / 2 + 0.004, 0), glow, parent=p)
    else:
        box(f'{name}_Frame', (t, w + 0.07, h + 0.07), (0, 0, 0), frame, 0.008, parent=p)
        image_plane(f'{name}_Art', w, h, (t / 2 + 0.002, 0, 0), rot, img_mat(f'{name}_Art', file, emit_str=0.35, rough=0.35), parent=p)
        if glow: box(f'{name}_Glow', (0.01, w + 0.11, h + 0.11), (-t / 2 - 0.004, 0, 0), glow, parent=p)
    return p

poster('hub_poster_colarun', 'poster_colarun.png', 0.62, 1.11, (-1.45, HALF - 0.03, 1.72), ROT_BACK, glow=M['trim'])
poster('hub_poster_bobo', 'poster_bobo.png', 0.62, 0.62, (-HALF + 0.03, -1.72, 1.6), ROT_LEFT, glow=M['pink'])

# EVADE sign above the desk (backlit logo)
sign = empty('hub_sign_evade', (1.05, HALF - 0.04, 2.42))
image_plane('Sign_EVADE_Logo', 1.1, 1.1 * 158 / 600, (0, -0.03, 0), ROT_BACK, img_mat('Sign_EVADE', 'sign_evade.png', emit_str=2.2, alpha=True), parent=sign)
box('Sign_Backplate', (1.22, 0.02, 0.38), (0, 0.0, 0), M['plastic'], 0.01, parent=sign)

# ---------------------------------------------------------------- keychain display case (the first collectible)
case = empty('hub_keychain_case', (-0.5, HALF - 0.06, 1.6))
CW, CH = 0.84, 1.08
box('Case_Back', (CW, 0.04, CH), (0, 0.02, 0), M['felt'], parent=case)
for nm, sz, l in [('Case_Frame_T', (CW + 0.08, 0.13, 0.05), (0, -0.045, CH / 2 + 0.015)), ('Case_Frame_B', (CW + 0.08, 0.13, 0.05), (0, -0.045, -CH / 2 - 0.015)),
                  ('Case_Frame_L', (0.05, 0.13, CH + 0.08), (-CW / 2 - 0.015, -0.045, 0)), ('Case_Frame_R', (0.05, 0.13, CH + 0.08), (CW / 2 + 0.015, -0.045, 0))]:
    box(nm, sz, l, M['gold'], 0.006, parent=case)
box('Case_Glass', (CW, 0.006, CH), (0, -0.105, 0), M['glass'], parent=case)
box('Case_Neon', (CW, 0.012, 0.012), (0, -0.09, CH / 2 - 0.02), M['pink'], parent=case)
cyl('Case_Hook', 0.008, 0.07, (0, -0.04, 0.44), M['metal'], 12, rot=(math.radians(90), 0, 0), parent=case)
box('Case_Plaque', (0.26, 0.012, 0.06), (0, -0.03, -0.47), M['gold'], 0.004, parent=case)
bpy.ops.object.text_add(location=(0, -0.037, -0.484), rotation=ROT_BACK)
tx = bpy.context.object; tx.name = 'Case_Plaque_Serial'; tx.data.body = '#00412'; tx.data.align_x = 'CENTER'; tx.data.size = 0.042
tx.data.materials.append(M['rim']); link(tx); tx.parent = case
bpy.ops.object.convert(target='MESH')

# ---------------------------------------------------------------- desk + gaming PC (the hub computer)
desk = empty('Desk', (1.05, HALF - 0.42, 0))
box('Desk_Top', (1.75, 0.72, 0.05), (0, 0, 0.76), M['desk'], 0.01, parent=desk)
box('Desk_LED', (1.7, 0.01, 0.012), (0, -0.362, 0.735), M['trim'], parent=desk)
for sx in (-0.82, 0.82):
    box(f'Desk_Leg_{sx:+.0f}', (0.06, 0.62, 0.74), (sx, 0, 0.37), M['plastic'], 0.01, parent=desk)
box('Desk_Mat', (1.2, 0.42, 0.006), (-0.08, -0.09, 0.788), M['rug_navy'], 0.003, parent=desk)
box('Desk_Mat_Edge', (1.21, 0.43, 0.004), (-0.08, -0.09, 0.786), M['trim'], parent=desk)
# ultrawide monitor = the hub's computer screen
pc = empty('hub_computer', (1.0, HALF - 0.28, 0.79))
box('Monitor_Body', (1.18, 0.05, 0.5), (0, 0.0, 0.5), M['plastic'], 0.012, parent=pc)
image_plane('Monitor_Screen', 1.12, 0.448, (0, -0.0265, 0.5), ROT_BACK, img_mat('Monitor_Screen', 'screen.png', emit_str=2.4, rough=0.2), parent=pc)
box('Monitor_Neck', (0.06, 0.05, 0.28), (0, 0.04, 0.17), M['metal'], 0.01, parent=pc)
box('Monitor_Foot', (0.32, 0.22, 0.02), (0, 0.0, 0.01), M['metal'], 0.008, parent=pc)
box('Monitor_Backglow', (1.24, 0.01, 0.56), (0, 0.035, 0.5), M['pink'], parent=pc)
sphere('hub_alert_light', 0.018, (0.56, -0.03, 0.27), M['pink'], parent=pc)
box('Keyboard', (0.46, 0.15, 0.022), (0.95, HALF - 0.6, 0.8), M['plastic'], 0.006)
box('Keyboard_Glow', (0.44, 0.13, 0.004), (0.95, HALF - 0.6, 0.812), M['trim'])
sphere('Mouse', 0.035, (1.3, HALF - 0.6, 0.8), M['plastic'], (0.8, 1.2, 0.5), 16)
# PC tower with glass side
tw = empty('PC_Tower', (1.68, HALF - 0.38, 0.79))
box('Tower_Case', (0.22, 0.46, 0.48), (0, 0, 0.24), M['plastic'], 0.01, parent=tw)
box('Tower_Glass', (0.005, 0.42, 0.42), (-0.112, 0, 0.24), M['glass'], parent=tw)
for k, z in enumerate((0.13, 0.27, 0.41)):
    torus(f'Tower_Fan_{k}', 0.06, 0.008, (-0.1, 0.12, z), M['pink'] if k == 1 else M['trim'], rot=(0, math.radians(90), 0), parent=tw)
# headphones stand
cyl('Headphone_Stand', 0.012, 0.3, (0.3, HALF - 0.25, 0.94), M['metal'], 12)
torus('Headphones', 0.09, 0.018, (0.3, HALF - 0.25, 1.06), M['chair'], rot=(math.radians(90), 0, 0))
# Eclipse cans on the desk
def mini_can(name, loc, s=1.0, tilt=0.0):
    c = empty(name, loc); c.rotation_euler = (0, tilt, 0)
    cyl(f'{name}_Body', 0.033 * s, 0.12 * s, (0, 0, 0.06 * s), M['eclipse_red'], 24, parent=c)
    cyl(f'{name}_Top', 0.03 * s, 0.01 * s, (0, 0, 0.125 * s), M['metal'], 24, parent=c)
    cyl(f'{name}_Band', 0.0335 * s, 0.03 * s, (0, 0, 0.085 * s), M['eclipse_white'], 24, parent=c)
    return c
mini_can('Desk_Can_1', (0.42, HALF - 0.55, 0.785))
mini_can('Desk_Can_2', (0.52, HALF - 0.5, 0.785))
# gaming chair
ch = empty('Gaming_Chair', (1.45, HALF - 1.2, 0)); ch.rotation_euler = (0, 0, math.radians(-38))
box('Chair_Seat', (0.52, 0.5, 0.1), (0, 0, 0.5), M['chair'], 0.04, parent=ch)
box('Chair_Back', (0.5, 0.1, 0.72), (0, -0.25, 0.9), M['chair'], 0.05, parent=ch)
box('Chair_Back_Stripe', (0.12, 0.105, 0.68), (0, -0.25, 0.9), M['chair_dark'], 0.03, parent=ch)
box('Chair_Pillow', (0.3, 0.08, 0.12), (0, -0.19, 1.12), M['eclipse_white'], 0.04, parent=ch)
cyl('Chair_Pole', 0.03, 0.36, (0, 0, 0.28), M['metal'], 16, parent=ch)
for k in range(5):
    a = k * 2 * math.pi / 5
    box(f'Chair_Leg_{k}', (0.3, 0.05, 0.04), (0.15 * math.cos(a), 0.15 * math.sin(a), 0.07), M['plastic'], 0.01, rot=(0, 0, a), parent=ch)
    sphere(f'Chair_Wheel_{k}', 0.03, (0.29 * math.cos(a), 0.29 * math.sin(a), 0.03), M['plastic'], seg=12, parent=ch)

# ---------------------------------------------------------------- Cola Run lamp (lava lamp shaped like an Eclipse can)
lamp_tbl = empty('Side_Table', (-1.65, 0.55, 0))
cyl('Side_Table_Top', 0.26, 0.05, (0, 0, 0.55), M['wood_dark'], 32, parent=lamp_tbl)
cyl('Side_Table_Stem', 0.04, 0.5, (0, 0, 0.27), M['wood_dark'], 16, parent=lamp_tbl)
cyl('Side_Table_Foot', 0.18, 0.03, (0, 0, 0.015), M['wood_dark'], 32, parent=lamp_tbl)
lamp = empty('hub_cola_lamp', (-1.65, 0.55, 0.575))
cyl('Lamp_Base', 0.1, 0.12, (0, 0, 0.06), M['metal'], 32, r2=0.085, parent=lamp)
cyl('Lamp_Glass', 0.085, 0.42, (0, 0, 0.33), M['lamp_glass'], 32, parent=lamp)
cyl('Lamp_Cap', 0.085, 0.06, (0, 0, 0.57), M['metal'], 32, r2=0.06, parent=lamp)
cyl('Lamp_Tab', 0.03, 0.01, (0.01, 0, 0.605), M['metal'], 16, parent=lamp)
cyl('Lamp_Label', 0.0865, 0.09, (0, 0, 0.27), M['eclipse_red'], 32, parent=lamp)
for k, (x, y, z, r) in enumerate([(0.01, 0.0, 0.18, 0.045), (-0.02, 0.01, 0.33, 0.035), (0.02, -0.01, 0.45, 0.03), (0.0, 0.02, 0.4, 0.022)]):
    sphere(f'Lamp_Blob_{k}', r, (x, y, z), M['lamp_blob'] if k != 2 else M['lamp_blob2'], (1, 1, 1.25), 16, parent=lamp)
# little eclipse emblem on the label
image_plane_m = None
cyl('Lamp_Emblem_Moon', 0.026, 0.004, (0.087, 0, 0.27), M['eclipse_white'], 24, rot=(0, math.radians(90), 0), parent=lamp)
cyl('Lamp_Emblem_Shadow', 0.02, 0.005, (0.089, 0.012, 0.28), M['eclipse_red'], 24, rot=(0, math.radians(90), 0), parent=lamp)

# ---------------------------------------------------------------- shelves (left wall) with trophies, snow globe, hologram slots
shelf = empty('hub_shelf', (-HALF + 0.14, 1.25, 0))
for z in (1.35, 1.85):
    box(f'Shelf_Board_{z}', (0.26, 1.15, 0.04), (0, 0, z), M['wood_dark'], 0.008, parent=shelf)
    box(f'Shelf_LED_{z}', (0.01, 1.1, 0.008), (0.125, 0, z - 0.024), M['trim'], parent=shelf)
# trophy
tr = empty('hub_trophy_colarun', (0, -0.35, 1.37), parent=shelf)
cyl('Trophy_Base', 0.06, 0.04, (0, 0, 0.02), M['rim'], 24, parent=tr)
cyl('Trophy_Stem', 0.015, 0.08, (0, 0, 0.08), M['trophy'], 16, parent=tr)
cyl('Trophy_Cup', 0.07, 0.11, (0, 0, 0.17), M['trophy'], 32, r2=0.035, rot=(math.radians(180), 0, 0), parent=tr)
for s in (-1, 1):
    torus(f'Trophy_Handle_{s}', 0.03, 0.007, (0, s * 0.075, 0.18), M['trophy'], rot=(0, math.radians(90), 0), parent=tr)
# snow globe (Where is Bobo? city souvenir)
sg = empty('hub_snowglobe_sf', (0, 0.0, 1.37), parent=shelf)
cyl('Globe_Base', 0.07, 0.05, (0, 0, 0.025), M['wood_dark'], 32, parent=sg)
sphere('Globe_Glass', 0.08, (0, 0, 0.12), M['glass'], parent=sg)
box('Globe_Bridge_Deck', (0.012, 0.1, 0.006), (0, 0, 0.09), mat('Bridge_Orange', '#e5512b', 0.5), parent=sg)
for yy in (-0.03, 0.03):
    box(f'Globe_Bridge_Tower_{yy}', (0.01, 0.01, 0.07), (0, yy, 0.115), _mats['Bridge_Orange'], parent=sg)
# hologram slots for merch that's coming (tee, plush): locked silhouettes
def holo_slot(name, loc, shape):
    h = empty(name, loc, parent=shelf)
    torus(f'{name}_Ring', 0.08, 0.006, (0, 0, 0.01), M['trim'], parent=h)
    if shape == 'tee':
        box(f'{name}_Tee_Body', (0.02, 0.12, 0.14), (0, 0, 0.12), M['ghost'], 0.01, parent=h)
        for s in (-1, 1):
            box(f'{name}_Tee_Sleeve_{s}', (0.02, 0.06, 0.05), (0, s * 0.085, 0.165), M['ghost'], 0.01, rot=(s * math.radians(30), 0, 0), parent=h)
    else:
        sphere(f'{name}_Plush_Body', 0.06, (0, 0, 0.08), M['ghost'], (1, 1, 0.9), 16, parent=h)
        sphere(f'{name}_Plush_Head', 0.05, (0, 0, 0.17), M['ghost'], seg=16, parent=h)
        for s in (-1, 1):
            cyl(f'{name}_Plush_Ear_{s}', 0.018, 0.04, (0, s * 0.03, 0.22), M['ghost'], 12, r2=0.0, parent=h)
    return h
holo_slot('hub_slot_tee', (0, -0.3, 1.87), 'tee')
holo_slot('hub_slot_plush', (0, 0.3, 1.87), 'plush')
# string lights along the top of the back wall
for k in range(18):
    x = -HALF + 0.15 + k * (ROOM - 0.3) / 17
    sag = 0.12 * math.sin(math.pi * ((k % 6) / 6))
    sphere(f'String_Bulb_{k:02d}', 0.022, (x, HALF - 0.05, 2.7 - sag), M['bulb'], seg=10)

# ---------------------------------------------------------------- floor: Cola Run spawn-pad rug, beanbag, cat bed, plant
rug = empty('hub_rug', (0.05, -0.35, 0.03))
cyl('Rug_Outer', 1.25, 0.012, (0, 0, 0.006), M['rug_navy'], 64, parent=rug)
torus('Rug_Ring_1', 1.12, 0.022, (0, 0, 0.012), M['rug_cyan'], parent=rug)
torus('Rug_Ring_2', 0.8, 0.016, (0, 0, 0.012), M['rug_cyan'], parent=rug)
cyl('Rug_Center', 0.45, 0.014, (0, 0, 0.008), M['rug_white'], 64, parent=rug)
torus('Rug_Ring_3', 0.45, 0.012, (0, 0, 0.014), M['rug_cyan'], parent=rug)
bean = empty('Beanbag', (-1.25, -1.15, 0))
sphere('Beanbag_Body', 0.45, (0, 0, 0.3), M['beanbag'], (1.0, 1.05, 0.7), 32, parent=bean)
sphere('Beanbag_Cushion', 0.25, (0.1, 0.1, 0.55), M['beanbag'], (1.0, 1.0, 0.5), 24, parent=bean)
bed = empty('hub_cat_bed', (0.05, -0.35, 0.03))
torus('CatBed_Rim', 0.3, 0.09, (0, 0, 0.09), M['bed'], parent=bed)
cyl('CatBed_Cushion', 0.3, 0.08, (0, 0, 0.04), M['bed_in'], 48, parent=bed)
pl = empty('Plant_Corner', (-1.75, 1.75, 0))
cyl('Plant_Pot', 0.2, 0.42, (0, 0, 0.21), M['pot'], 32, r2=0.16, parent=pl)
for k in range(9):
    a = k * 2.4; r = 0.12 + 0.03 * (k % 3)
    sphere(f'Plant_Leaf_{k}', 0.13, (r * math.cos(a), r * math.sin(a), 0.62 + 0.09 * (k % 4)), M['plant'], (0.7, 0.45, 1.25), 14, parent=pl)

# ---------------------------------------------------------------- imported characters / collectibles
def import_glb(path, name, target_h, loc, rot_z=0.0, keep=None, drop=()):
    if not os.path.exists(path):
        print('MISSING', path); return None
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    for o in list(new):
        if any(o.name.startswith(d) for d in drop):
            bpy.data.objects.remove(o, do_unlink=True); new.remove(o)
    root = empty(name)
    for o in new:
        for c in o.users_collection: c.objects.unlink(o)
        col_room.objects.link(o)
        if o.parent is None: o.parent = root
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in new:
        if o.type == 'MESH':
            ev = o.evaluated_get(dg); me = ev.to_mesh()
            pts += [o.matrix_world @ v.co for v in me.vertices]; ev.to_mesh_clear()
    mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)])
    s = target_h / (mx.z - mn.z)
    root.scale = (s, s, s)
    c = (mn + mx) / 2
    root.location = (loc[0] - c.x * s, loc[1] - c.y * s, loc[2] - mn.z * s)
    if rot_z:
        # rotate about the asset's own centre
        piv = empty(name + '_Pivot', loc); root.parent = piv
        root.location = (-c.x * s, -c.y * s, loc[2] - mn.z * s - loc[2])
        piv.rotation_euler = (0, 0, rot_z); return piv
    return root

bobo = import_glb(BOBO_GLB, 'hub_bobo', 0.78, (0.05, -0.35, 0.1), rot_z=math.radians(55), drop=('Icosphere',))
arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE' and o.name.startswith('Armature')), None)
if arm and arm.animation_data is not None:
    act = bpy.data.actions.get(arg('--pose', 'Sit')) or bpy.data.actions.get('Chill')
    if act: arm.animation_data.action = act
scene.frame_set(int(arg('--frame', '12')))

key = import_glb(KEYCHAIN_GLB, 'hub_keychain', 0.86, (-0.5, HALF - 0.1, 1.17))
cola = import_glb(COLA_GLB, 'hub_cola_collectible', 0.2, (-HALF + 0.14, 1.25 + 0.34, 1.37), drop=('Icosphere',))

# ---------------------------------------------------------------- lights, world, camera
def light(name, kind, loc, energy, color, size=0.2, rot=None):
    ld = bpy.data.lights.new(name, kind); ld.energy = energy; ld.color = hexrgb(color)[:3]
    if kind == 'AREA': ld.size = size
    else: ld.shadow_soft_size = size
    o = bpy.data.objects.new(name, ld); o.location = loc; col_room.objects.link(o)
    if rot: o.rotation_euler = rot
    return o

light('Key_Warm', 'AREA', (2.6, -2.4, 3.6), 520, '#ffd7a8', 2.6, (math.radians(50), 0, math.radians(45)))
light('Fill_Cool', 'AREA', (-0.5, -3.5, 2.4), 160, '#8fb4ff', 3.0, (math.radians(75), 0, 0))
light('Moonlight', 'AREA', (-1.7, -0.75, 1.8), 40, '#c9b6ff', 1.0, (0, math.radians(-90), 0))
light('Lamp_Glow', 'POINT', (-1.65, 0.55, 0.95), 55, '#ff5fae', 0.1)
light('Monitor_Glow', 'AREA', (1.0, HALF - 0.6, 1.3), 60, '#7fd8ff', 1.1, (math.radians(100), 0, 0))
light('Case_Spot', 'SPOT', (-0.5, HALF - 0.6, 2.4), 60, '#fff1d6', 0.05, (math.radians(35), 0, 0)).data.spot_size = math.radians(40)
light('Ceiling_Bounce', 'AREA', (0, 0, 3.6), 120, '#ffe9cc', 4.0)

world = bpy.data.worlds.new('World'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = hexrgb('#0a1028')
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6

cam_d = bpy.data.cameras.new('Camera'); cam_d.lens = float(arg('--lens', '46'))
cam = bpy.data.objects.new('Camera', cam_d); scene.collection.objects.link(cam); scene.camera = cam
SHOTS = {  # name: (camera location, look-at target, lens)
    'hero': ((6.3, -6.9, 4.9), (-0.25, 0.35, 1.0), None),
    'case': ((0.9, -1.2, 1.75), (-0.5, HALF, 1.55), 40),
    'desk': ((0.2, -0.9, 1.55), (1.1, HALF, 1.1), 32),
    'cozy': ((0.6, -1.6, 0.9), (-1.2, 0.9, 0.85), 30),
}
loc_, tgt_, lens_ = SHOTS[arg('--shot', 'hero')]
if lens_ and not arg('--lens'): cam_d.lens = lens_
cam.location = loc_
tgt = Vector(tgt_); cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()

# ---------------------------------------------------------------- output
r = scene.render
r.engine = 'CYCLES'; scene.cycles.device = 'CPU'
scene.cycles.samples = int(arg('--samples', '96')); scene.cycles.use_denoising = True
res = int(arg('--res', '1200')); r.resolution_x = res; r.resolution_y = int(res * 0.8)
scene.view_settings.view_transform = 'AgX'
try: scene.view_settings.look = 'AgX - Medium High Contrast'
except Exception: pass
r.film_transparent = False

if arg('--blend'):
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(arg('--blend')))
if arg('--render'):
    r.filepath = os.path.abspath(arg('--render')); bpy.ops.render.render(write_still=True)
if arg('--glb'):
    for o in scene.objects: o.select_set(o.name in col_room.all_objects)
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(arg('--glb')), export_format='GLB', use_selection=True,
                              export_apply=True, export_lights=False, export_cameras=False,
                              export_animations=True, export_image_format='WEBP' if 'WEBP' in str(bpy.ops.export_scene.gltf.get_rna_type().properties['export_image_format'].enum_items.keys()) else 'AUTO',
                              export_draco_mesh_compression_enable=False)
print('BUILD_OK objects=', len(col_room.all_objects))
