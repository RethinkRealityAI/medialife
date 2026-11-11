# The earlier keychain design's Bobo (the blocky avatar with one arm up), built from boxes in Blender to
# match the print on the charm: every part is placed from points measured on a phone photo of the real
# charm (src/old-bobo.png, 3:4). No generative AI. Also writes the black silhouette of the print
# (public/evade/keychain/ar/silhouette-old.png) and builds it into the model as the 'Silhouette' node,
# covering the whole charm picture, exactly like the other two models.
# Clips carry the same names as the cat Bobo's so the page can drive either: PopOut, Sit, PawRaise,
# TailWag, ClassicWalk.
# Run: python build_old_bobo.py -- out.glb [out.blend]
import os, sys, math
import bpy, bmesh
from mathutils import Vector, Euler
from PIL import Image, ImageDraw, ImageFilter

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
AR = REPO + '/public/evade/keychain/ar/'
ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = ARGV[0] if ARGV else '/tmp/keychain-ar/old-bobo.glb'
OUT_BLEND = ARGV[1] if len(ARGV) > 1 else None

# ---- the print, measured on the charm picture at 540 x 720 (x right, y down)
PW, PH = 540, 720
OUTLINE = [(118, 74), (168, 36), (240, 62), (246, 165), (290, 140), (345, 160), (368, 200), (370, 235), (355, 255), (345, 275),
           (305, 293), (330, 300), (420, 420), (425, 440), (395, 490), (345, 470), (300, 432), (310, 445), (420, 580), (428, 625),
           (355, 655), (320, 640), (262, 580), (245, 640), (215, 655), (140, 625), (135, 600), (180, 440), (185, 420), (200, 290), (185, 280)]
TOP, FOOT = 36, 655                      # the print runs from y = 36 to y = 655
U = 1.0 / (FOOT - TOP)                   # model units per picture pixel: the model is 1 unit tall
def P(x, y, depth=0.0): return Vector(((x - PW / 2) * U, depth, (FOOT - y) * U))

# silhouette picture: same frame as the charm picture
S = 2
m = Image.new('L', (PW * S, PH * S), 0); ImageDraw.Draw(m).polygon([(x * S, y * S) for x, y in OUTLINE], fill=255)
m = m.filter(ImageFilter.GaussianBlur(1.2))
sil = Image.new('RGBA', m.size, (0, 0, 0, 0)); sil.putalpha(m); sil.save(AR + 'silhouette-old.png', optimize=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene; scene.render.fps = 30; FPS = 30

def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)
def mat(name, hexc, emis=0.25, rough=0.8):
    mt = bpy.data.materials.new(name); mt.use_nodes = True
    b = mt.node_tree.nodes['Principled BSDF']; c = srgb(hexc)
    b.inputs['Base Color'].default_value = (*c, 1); b.inputs['Roughness'].default_value = rough
    b.inputs['Emission Color'].default_value = (*c, 1); b.inputs['Emission Strength'].default_value = emis
    return mt
M_ARM, M_SKIN, M_SHIRT = mat('Old_Arm', '#e2574a'), mat('Old_Skin', '#f4c5b2'), mat('Old_Shirt', '#9dbbe6')
M_PANTS, M_CAP, M_BRIM = mat('Old_Pants', '#1f2a9a'), mat('Old_Cap', '#a9cbee'), mat('Old_Brim', '#d9483b')
M_INK, M_WHITE = mat('Old_Ink', '#3a2226', emis=0.1), mat('Old_White', '#ffffff', emis=0.4)

def box(name, w, d, z0, z1, material, parent=None, y=0.0, x=0.0, bevel=4.0):
    """a box in pixels: w wide (x), d deep (y), from z0 to z1 along the part's own axis; origin = the joint"""
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((x * U + v.co.x * w * U, y * U + v.co.y * d * U, ((z0 + z1) / 2 + v.co.z * (z1 - z0)) * U))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(material)
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob)
    if bevel:
        mod = ob.modifiers.new('Bevel', 'BEVEL'); mod.width = bevel * U; mod.segments = 2
    if parent: ob.parent = parent
    ob.rotation_mode = 'XYZ'
    return ob

root = bpy.data.objects.new('OldBobo', None); scene.collection.objects.link(root); root.rotation_mode = 'XYZ'
def joint(name, at, to, up, depth):
    """an empty at the joint `at`, turned so its own axis (up: +z, else -z) points at `to` in the picture"""
    e = bpy.data.objects.new(name, None); scene.collection.objects.link(e); e.parent = root; e.rotation_mode = 'XYZ'
    e.location = P(*at, depth)
    dx, dz = (to[0] - at[0]), -(to[1] - at[1])
    th = math.atan2(dx, dz) if up else math.atan2(-dx, -dz)
    e.rotation_euler = Euler((0, th, 0))
    return e, math.hypot(dx, dz)

# joints (picture points): the pose of the print
torso, Lt = joint('Torso', (250, 438), (252, 292), True, 0.0)
head, _ = joint('Head', (264, 296), (304, 226), True, -0.012)
arm_up, La = joint('ArmUp', (212, 298), (181, 52), False, 0.035)       # the raised arm (behind the head)
arm_dn, Lb = joint('ArmDown', (318, 302), (401, 470), False, -0.05)    # the other arm, in front of the body
leg_l, Ll = joint('LegL', (222, 438), (178, 642), False, 0.012)
leg_r, Lr = joint('LegR', (292, 438), (393, 622), False, -0.012)

box('TorsoMesh', 114, 62, -4, Lt + 4, M_SHIRT, torso)
box('ArmUpMesh', 72, 58, 0, -La * 0.86, M_ARM, arm_up); box('ArmUpHand', 72, 58, -La * 0.86, -La, M_SKIN, arm_up, bevel=3)
box('ArmDownMesh', 70, 58, 0, -Lb * 0.84, M_ARM, arm_dn); box('ArmDownHand', 70, 58, -Lb * 0.84, -Lb, M_SKIN, arm_dn, bevel=3)
box('LegLMesh', 84, 62, 6, -Ll, M_PANTS, leg_l); box('LegRMesh', 84, 62, 6, -Lr, M_PANTS, leg_r)
# head: skin block, cap on top with a red brim, closed eyes and a small smile, BOBO on the cap
HW, HH, HD, H0 = 100, 96, 92, 30
box('HeadMesh', HW, HD, H0, H0 + HH, M_SKIN, head, bevel=8)
box('Cap', HW + 6, HD + 6, H0 + HH * 0.60, H0 + HH + 4, M_CAP, head, bevel=8)
box('Brim', HW + 8, 40, H0 + HH * 0.52, H0 + HH * 0.62, M_BRIM, head, y=-(HD / 2 + 4), bevel=3)
for sx in (-1, 1):
    e = box('Eye', 20, 3, H0 + HH * 0.36, H0 + HH * 0.36 + 4.5, M_INK, head, y=-(HD / 2 + 1), x=sx * 22, bevel=0)
box('Smile', 16, 3, H0 + HH * 0.17, H0 + HH * 0.17 + 4, M_INK, head, y=-(HD / 2 + 1), bevel=0)
cu = bpy.data.curves.new('BoboText', 'FONT'); cu.body = 'BOBO'; cu.size = 24 * U; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'; cu.extrude = 1.2 * U
txt = bpy.data.objects.new('CapText', cu); scene.collection.objects.link(txt); cu.materials.append(M_WHITE)
txt.parent = head; txt.rotation_mode = 'XYZ'; txt.rotation_euler = Euler((math.pi / 2, 0, 0)); txt.location = Vector((0, -(HD / 2 + 4) * U, (H0 + HH * 0.82) * U))

PARTS = [root, torso, head, arm_up, arm_dn, leg_l, leg_r]
REST = {o: (o.location.copy(), o.rotation_euler.copy()) for o in PARTS}
def ease(x): x = min(max(x, 0.0), 1.0); return x * x * (3 - 2 * x)
def pose(root_loc=(0, 0, 0), root_rot=(0, 0, 0), root_scl=(1, 1, 1), **d):
    """d: part name -> (swing forward/back, turn in the picture plane), radians, added to the print pose"""
    st = {root: (Vector(root_loc), Euler(root_rot), Vector(root_scl))}
    for o in PARTS[1:]:
        sw, tn = d.get(o.name, (0.0, 0.0)); loc, rot = REST[o]
        st[o] = (loc.copy(), Euler((rot.x + sw, rot.y + tn, rot.z)), Vector((1, 1, 1)))
    return st
R = math.radians

def clip(name, L, fn):
    nfr = int(round(L * FPS)); acts = {}
    for o in PARTS:
        o.animation_data_create(); a = bpy.data.actions.new(f'{name}_{o.name}'); o.animation_data.action = a; acts[o] = a
    for f in range(0, nfr + 1):
        for o, (loc, rot, sca) in fn(f / FPS, L).items():
            o.location = loc; o.rotation_euler = rot; o.scale = sca
            o.keyframe_insert('location', frame=f); o.keyframe_insert('rotation_euler', frame=f); o.keyframe_insert('scale', frame=f)
    for o in PARTS:
        o.animation_data.action = None
        tr = o.animation_data.nla_tracks.new(); tr.name = name
        s = tr.strips.new(name, 0, acts[o]); s.name = name; acts[o].use_fake_user = True

def pop(t, L):
    # starts exactly like the print, springs up with a spin and lands back in the same pose
    wob = math.exp(-4.5 * t) * math.sin(3.0 * math.pi * t)
    hop = 0.20 * math.sin(min(t / 0.8, 1) * math.pi)
    spin = -2 * math.pi * (1 - ease(t / 1.05))
    k = math.sin(min(t / 1.1, 1) * math.pi)                           # limbs fling out in the air
    return pose((0, 0, hop), (0, 0, spin), (1 - 0.08 * wob, 1 - 0.08 * wob, 1 + 0.14 * wob),
                ArmUp=(0, R(-14) * k), ArmDown=(0, R(34) * k), LegL=(0, R(-16) * k), LegR=(0, R(14) * k), Head=(0, R(-12) * k))
def sit(t, L):                                                         # idle: a little bounce, the raised arm waves
    w = 2 * math.pi * t / L
    return pose((0, 0, 0.012 * (1 - math.cos(2 * w)) / 2), ArmUp=(0, R(9) * math.sin(2 * w)), Head=(0, R(4) * math.sin(w)),
                ArmDown=(0, R(4) * math.sin(w)), Torso=(0, R(1.5) * math.sin(w)))
def wave(t, L):
    env = math.sin(min(t / L, 1) * math.pi) ** 0.6
    return pose((0, 0, 0.02 * env), ArmUp=(0, R(24) * env * math.sin(6 * math.pi * t / L)), Head=(0, R(-8) * env))
def dance(t, L):
    env = math.sin(min(t / L, 1) * math.pi) ** 0.6; s = math.sin(4 * math.pi * t / L)
    return pose((0.03 * env * s, 0, 0.03 * env * abs(s)), (0, R(7) * env * s, 0), ArmUp=(0, R(-16) * env * s), ArmDown=(0, R(22) * env * s),
                LegL=(0, R(-9) * env * s), LegR=(0, R(-9) * env * s), Head=(0, R(-10) * env * s))
def walk(t, L):
    w = 2 * math.pi * t / L; s = math.sin(w)
    return pose((0, 0, 0.015 * abs(s)), LegL=(R(30) * s, R(8)), LegR=(R(-30) * s, R(-14)), ArmDown=(R(-26) * s, R(-14)), ArmUp=(R(10) * s, 0), Head=(0, R(-10)))
# PopOut goes last: the exporter drops channels that never change in a clip, and those then fall back to the
# file's rest pose, which is whatever the last clip ended on. PopOut ends on the print pose.
clip('Sit', 4.0, sit); clip('PawRaise', 1.6, wave); clip('TailWag', 1.8, dance); clip('ClassicWalk', 0.8, walk); clip('PopOut', 1.4, pop)
for o in PARTS:
    o.location, o.rotation_euler = REST[o][0].copy(), REST[o][1].copy(); o.scale = (1, 1, 1)

# ---- the silhouette quad: the whole charm picture, where the print is
me = bpy.data.meshes.new('Silhouette')
me.from_pydata([(-0.5, 0, -0.5), (0.5, 0, -0.5), (0.5, 0, 0.5), (-0.5, 0, 0.5)], [], [(0, 1, 2, 3)])
uv = me.uv_layers.new(name='UVMap')
for i, c in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)]): uv.data[i].uv = c
sm = bpy.data.materials.new('Silhouette'); sm.use_nodes = True
b = sm.node_tree.nodes['Principled BSDF']
b.inputs['Base Color'].default_value = (0, 0, 0, 1); b.inputs['Roughness'].default_value = 1.0; b.inputs['Specular IOR Level'].default_value = 0.0
t = sm.node_tree.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(AR + 'silhouette-old.png')
sm.node_tree.links.new(t.outputs['Alpha'], b.inputs['Alpha'])
try: sm.surface_render_method = 'BLENDED'
except Exception: pass
sm.use_backface_culling = False; me.materials.append(sm)
so = bpy.data.objects.new('Silhouette', me); scene.collection.objects.link(so)
so.location = P(PW / 2, PH / 2); so.scale = (PW * U, 1, PH * U)

for o in scene.objects: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=True,
                          export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_yup=True,
                          export_image_format='WEBP', export_image_quality=90, export_apply=True)
if OUT_BLEND:
    bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print('EXPORTED', OUT)
