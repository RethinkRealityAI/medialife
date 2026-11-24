# 3D Hypergalactic Monkey Quest logo, traced from the card art in Dapo's pin photo (seg_logo3.py -> /tmp/mq/logo_shapes.json).
# Layers back to front: maroon brush ring, black brush plate, chunky bevelled MONKEY (red) and QUEST (gold), HYPERGALACTIC.
import sys, json, math, os, bpy
sys.path.insert(0, os.path.dirname(__file__))
from blender_common import reset, mat, extrude_polys, join, shade_auto
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['/tmp/mq/logo.glb', '/tmp/mq/logo.blend']
D = json.load(open('/tmp/mq/logo_shapes.json'))
reset()
RING = mat('Ring', (112, 20, 32), rough=0.5)
PLATE = mat('Brush', (14, 12, 14), rough=0.35)
RED = mat('MonkeyRed', (232, 36, 58), rough=0.28, coat=0.4)
GOLD = mat('QuestGold', (255, 190, 40), rough=0.25, metal=0.25, coat=0.4)
YEL = mat('HyperYellow', (246, 226, 80), rough=0.3)
parts = [
    extrude_polys('ring', D['ring'], -4.0, -0.5, bevel=0.8, material=RING, bevel_res=2),
    extrude_polys('plate', D['plate'], -1.0, 2.5, bevel=0.6, material=PLATE, bevel_res=2),
    extrude_polys('monkey', D['monkey'], 2.0, 8.5, bevel=0.85, material=RED, bevel_res=3),
    extrude_polys('quest', D['quest'], 2.0, 8.5, bevel=0.85, material=GOLD, bevel_res=3),
    extrude_polys('hyper', D['hyper'], 2.0, 4.6, bevel=0.12, material=YEL, bevel_res=2),
]
logo = join(parts, 'MonkeyQuestLogo')
shade_auto(logo, 30)
logo.scale = (0.001,) * 3; logo.rotation_euler = (math.radians(90), 0, 0)
bpy.ops.object.select_all(action='DESELECT'); logo.select_set(True); bpy.context.view_layer.objects.active = logo
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
print('tris', sum(len(p.vertices) - 2 for p in logo.data.polygons), 'dims', tuple(round(d, 4) for d in logo.dimensions))
bpy.ops.wm.save_as_mainfile(filepath=argv[1])
bpy.ops.export_scene.gltf(filepath=argv[0], export_format='GLB', export_apply=True, export_texcoords=False, export_normals=True, export_yup=True)
