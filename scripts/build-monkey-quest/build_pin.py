# The Monkey Quest enamel pin in Blender, traced from Dapo's photo (pin_masks.py -> /tmp/mq/pin_shapes.json).
# Polished nickel base + raised metal lines, hard-enamel fills (red, peach, pink cheeks/ears), black bead eyes, post.
# Run: python build_pin.py -- out.glb out.blend
import sys, json, math, os, bpy
sys.path.insert(0, os.path.dirname(__file__))
from blender_common import reset, mat, extrude_polys, join, paint_atlas, shade_auto
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['/tmp/mq/pin.glb', '/tmp/mq/pin.blend']
D = json.load(open(os.environ.get('MQ_SHAPES', '/tmp/mq/pin_shapes.json')))
reset()
MET = mat('Nickel', (214, 216, 222), rough=0.18, metal=1.0)
RED = mat('EnamelRed', (172, 14, 26), rough=0.14, coat=0.6)
PEACH = mat('EnamelPeach', (230, 146, 110), rough=0.14, coat=0.6)
PINK = mat('EnamelPink', (242, 118, 128), rough=0.14, coat=0.6)
EYE = mat('EyeBead', (16, 16, 20), rough=0.12, metal=0.4)
Z_BASE, Z_ENAMEL, Z_LINE = 1.4, 2.0, 2.2
parts = []
parts.append(extrude_polys('base', D['sil'], 0.0, Z_BASE + 0.05, bevel=0.35, material=MET, bevel_res=2))
parts.append(extrude_polys('lines', D['lines'], Z_BASE - 0.05, Z_LINE, bevel=0.14, material=MET))
for k, m in (('red', RED), ('peach', PEACH), ('pink', PINK)):
    if D['regions'][k]: parts.append(extrude_polys('en_' + k, D['regions'][k], Z_BASE - 0.05, Z_ENAMEL, bevel=0.05, material=m, bevel_res=1))
for i, (x, y, r) in enumerate(D['eyes']):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=r * 1.05, location=(x, y, Z_ENAMEL - 0.1))
    e = bpy.context.active_object; e.scale.z = 0.55; e.data.materials.append(EYE)
    bpy.ops.object.transform_apply(scale=True); bpy.ops.object.shade_smooth(); parts.append(e)
# pin post + clutch on the back
bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.55, depth=8.0, location=(0, 0, -4.0)); post = bpy.context.active_object
post.data.materials.append(MET); parts.append(post)
bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=2.6, depth=0.5, location=(0, 0, -0.2)); pad = bpy.context.active_object
pad.data.materials.append(MET); parts.append(pad)
pin = join(parts, 'MonkeyPin')
shade_auto(pin, 28)
paint_atlas(pin)
# mm -> m, face +Z (three) after the glTF y-up swap: rotate +90 deg about X
pin.scale = (0.001, 0.001, 0.001); pin.rotation_euler = (math.radians(90), 0, 0)
bpy.ops.object.select_all(action='DESELECT'); pin.select_set(True); bpy.context.view_layer.objects.active = pin
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
print('tris', sum(len(p.vertices) - 2 for p in pin.data.polygons), 'dims', tuple(round(d, 4) for d in pin.dimensions))
bpy.ops.wm.save_as_mainfile(filepath=argv[1])
bpy.ops.export_scene.gltf(filepath=argv[0], export_format='GLB', use_selection=False, export_apply=True,
                          export_texcoords=True, export_normals=True, export_materials='EXPORT', export_yup=True)
print('wrote', argv[0])
